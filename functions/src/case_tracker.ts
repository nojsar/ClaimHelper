import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import {
  recordFirstCaseAnalyticsEvent,
  recordFirstCaseOutcome,
} from "./analytics";
import { requireOwnedCase, requireUid } from "./util";

export const SUBMISSION_METHODS = [
  "online_portal",
  "fax",
  "certified_mail",
  "standard_mail",
  "email",
  "phone",
  "in_person",
  "other",
] as const;
export const RESPONSE_STATUSES = [
  "no_response_yet",
  "acknowledged",
  "under_review",
  "information_requested",
  "decision_received",
  "closed",
] as const;
export const APPEAL_OUTCOMES = [
  "pending",
  "approved",
  "partially_approved",
  "denied",
  "withdrawn",
] as const;

type SubmissionMethod = (typeof SUBMISSION_METHODS)[number];
type ResponseStatus = (typeof RESPONSE_STATUSES)[number];
type AppealOutcome = (typeof APPEAL_OUTCOMES)[number];

export interface NormalizedCaseTracker {
  submittedDate: string;
  submissionMethod: SubmissionMethod;
  confirmationNumber: string | null;
  expectedResponseDate: string | null;
  responseDate: string | null;
  responseStatus: ResponseStatus;
  outcome: AppealOutcome;
  responseReminderEnabled: boolean;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value: unknown, field: string, required: true): string;
function dateOnly(
  value: unknown,
  field: string,
  required: false,
): string | null;
function dateOnly(
  value: unknown,
  field: string,
  required: boolean,
): string | null {
  if (value == null || value === "") {
    if (!required) return null;
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (typeof value !== "string" || !DATE_ONLY.test(value)) {
    throw new HttpsError(
      "invalid-argument",
      `${field} must use YYYY-MM-DD format.`,
    );
  }
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) {
    throw new HttpsError("invalid-argument", `${field} is not a valid date.`);
  }
  return value;
}

function boundedChoice<T extends string>(
  value: unknown,
  choices: readonly T[],
  field: string,
): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    throw new HttpsError("invalid-argument", `${field} is not supported.`);
  }
  return value as T;
}

/** Pure validation/data-minimization boundary for the callable and tests. */
export function normalizeCaseTrackerInput(
  value: unknown,
  now = new Date(),
): NormalizedCaseTracker {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpsError("invalid-argument", "caseTracker must be an object.");
  }
  const raw = value as Record<string, unknown>;
  const submittedDate = dateOnly(raw.submittedDate, "submittedDate", true);
  const expectedResponseDate = dateOnly(
    raw.expectedResponseDate,
    "expectedResponseDate",
    false,
  );
  const responseDate = dateOnly(raw.responseDate, "responseDate", false);
  const submittedMillis = Date.parse(`${submittedDate}T00:00:00.000Z`);
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  if (submittedMillis > today) {
    throw new HttpsError(
      "invalid-argument",
      "submittedDate cannot be in the future.",
    );
  }
  if (submittedMillis < today - 10 * 366 * DAY_MS) {
    throw new HttpsError(
      "invalid-argument",
      "submittedDate is outside the supported range.",
    );
  }
  if (expectedResponseDate) {
    const expected = Date.parse(`${expectedResponseDate}T00:00:00.000Z`);
    if (expected < submittedMillis || expected > submittedMillis + 3 * 366 * DAY_MS) {
      throw new HttpsError(
        "invalid-argument",
        "expectedResponseDate must be after submission and within three years.",
      );
    }
  }
  if (responseDate) {
    const response = Date.parse(`${responseDate}T00:00:00.000Z`);
    if (response < submittedMillis || response > today) {
      throw new HttpsError(
        "invalid-argument",
        "responseDate must be after submission and not in the future.",
      );
    }
  }

  let confirmationNumber: string | null = null;
  if (raw.confirmationNumber != null && raw.confirmationNumber !== "") {
    if (typeof raw.confirmationNumber !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "confirmationNumber must be text.",
      );
    }
    confirmationNumber = raw.confirmationNumber.trim();
    if (
      confirmationNumber.length > 120 ||
      /[\u0000-\u001f\u007f]/.test(confirmationNumber)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "confirmationNumber contains unsupported characters or is too long.",
      );
    }
    if (confirmationNumber.length === 0) confirmationNumber = null;
  }

  return {
    submittedDate,
    submissionMethod: boundedChoice(
      raw.submissionMethod,
      SUBMISSION_METHODS,
      "submissionMethod",
    ),
    confirmationNumber,
    expectedResponseDate,
    responseDate,
    responseStatus: boundedChoice(
      raw.responseStatus,
      RESPONSE_STATUSES,
      "responseStatus",
    ),
    outcome: boundedChoice(raw.outcome, APPEAL_OUTCOMES, "outcome"),
    responseReminderEnabled: raw.responseReminderEnabled === true,
  };
}

async function syncResponseReminder(args: {
  caseId: string;
  ownerUid: string;
  email: unknown;
  tracker: NormalizedCaseTracker;
}): Promise<boolean> {
  const db = getFirestore();
  const reminderRef = db
    .collection("reminders")
    .doc(`case_response_${args.caseId}`);
  const email = typeof args.email === "string"
    ? args.email.trim().toLowerCase()
    : "";
  const expected = args.tracker.expectedResponseDate;
  if (
    !args.tracker.responseReminderEnabled ||
    !expected ||
    !EMAIL_RE.test(email)
  ) {
    await reminderRef.delete().catch(() => undefined);
    return false;
  }

  // 14:00 UTC keeps a date-only reminder away from midnight boundaries and
  // lands during waking hours across the continental US.
  const sendAtMillis = Date.parse(`${expected}T14:00:00.000Z`);
  if (sendAtMillis <= Date.now()) {
    await reminderRef.delete().catch(() => undefined);
    return false;
  }
  await reminderRef.set({
    caseId: args.caseId,
    ownerUid: args.ownerUid,
    email,
    sendAt: Timestamp.fromMillis(sendAtMillis),
    kind: "case_response_due",
    expectedResponseDate: expected,
    createdAt: FieldValue.serverTimestamp(),
  });
  return true;
}

/**
 * Owner-only, paid-case tracker update. All values are bounded server-side;
 * confirmation data and dates stay only on the case and never enter analytics.
 */
export const updateCaseTracker = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);
  if (snap.get("paid") !== true) {
    throw new HttpsError(
      "permission-denied",
      "The case tracker is available with the full appeal packet.",
    );
  }
  const tracker = normalizeCaseTrackerInput(request.data?.caseTracker);
  await snap.ref.update({
    caseTracker: {
      ...tracker,
      updatedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });

  // These helpers write only fixed aggregate counters and atomically mark the
  // first case transition. They independently refuse the owner/admin uid.
  await recordFirstCaseAnalyticsEvent(uid, snap.ref, "submitted");
  if (tracker.outcome !== "pending") {
    await recordFirstCaseOutcome(uid, snap.ref, tracker.outcome);
  }

  const reminderScheduled = await syncResponseReminder({
    caseId: snap.id,
    ownerUid: uid,
    email: request.auth?.token.email,
    tracker,
  });
  return { saved: true, reminderScheduled, caseTracker: tracker };
});
