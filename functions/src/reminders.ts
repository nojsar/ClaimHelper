import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { config } from "./config";
import { requireUid, requireOwnedCase } from "./util";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const FEEDBACK_REQUEST_DELAY_DAYS = 14;
export const feedbackReminderId = (caseId: string) => `feedback_${caseId}`;
export const reviewInviteReminderId = (caseId: string) => `review_${caseId}`;

/**
 * One deterministic, case-scoped reminder due some days after a confirmed
 * initial purchase. Carries only a delivery address, case id, and owner
 * id—never denial facts, insurer, deadline, or document content.
 */
async function schedulePostPurchaseReminder(args: {
  caseId: string;
  ownerUid: string | null;
  email: string | null;
  reminderId: string;
  kind: string;
  delayDays: number;
}): Promise<void> {
  const email = args.email?.trim().toLowerCase();
  if (!args.ownerUid || !email || !EMAIL_RE.test(email)) return;
  const db = getFirestore();
  const reminderRef = db.collection("reminders").doc(args.reminderId);
  await db.runTransaction(async (transaction) => {
    // Stripe can redeliver a successful checkout long after the first webhook.
    // Keep the original due time rather than turning that retry into a second
    // or later message.
    if ((await transaction.get(reminderRef)).exists) return;
    const now = Timestamp.now();
    transaction.create(reminderRef, {
      caseId: args.caseId,
      ownerUid: args.ownerUid,
      email,
      sendAt: Timestamp.fromMillis(
        now.toMillis() + args.delayDays * 24 * 3600 * 1000,
      ),
      kind: args.kind,
      createdAt: now,
    });
  });
}

/**
 * Schedules one post-purchase product-feedback request for 14 days after a
 * confirmed initial purchase. Private and in-app: nothing it collects is
 * published.
 */
export async function scheduleFeedbackRequest(args: {
  caseId: string;
  ownerUid: string | null;
  email: string | null;
}): Promise<void> {
  await schedulePostPurchaseReminder({
    ...args,
    reminderId: feedbackReminderId(args.caseId),
    kind: "feedback_request",
    delayDays: FEEDBACK_REQUEST_DELAY_DAYS,
  });
}

/**
 * Schedules one public review invitation, by default 21 days after a confirmed
 * initial purchase — after the private feedback request, and late enough that
 * most customers have heard back from their insurer.
 *
 * Every paying customer is scheduled on identical terms. Nothing here or at
 * dispatch reads outcome, tracker state, or in-app feedback: choosing who to
 * invite by how satisfied they appear is review gating, which Trustpilot's
 * guidelines and the FTC's endorsement rules both prohibit. Skipped entirely
 * while no invitation address is configured, so no address is stored for a
 * feature that is switched off.
 */
export async function scheduleReviewInvite(args: {
  caseId: string;
  ownerUid: string | null;
  email: string | null;
}): Promise<void> {
  if (!config.trustpilotInviteEmail) return;
  await schedulePostPurchaseReminder({
    ...args,
    reminderId: reviewInviteReminderId(args.caseId),
    kind: "review_invite",
    delayDays: config.reviewInviteDelayDays,
  });
}

/**
 * A preview reminder is useful only if the customer can still reopen the
 * case. This retention extension is deliberately opt-in and case-scoped; it
 * does not affect visitors who did not request reminders.
 */
export function reminderOptInExpiry(now: Timestamp): Timestamp {
  return Timestamp.fromMillis(
    now.toMillis() + config.reminderOptInCaseTtlDays * 24 * 3600 * 1000,
  );
}

/**
 * saveReminderEmail
 * Opt-in deadline reminders for an unpaid case. Stores the email on the case
 * (consent timestamped), sends the preview recap immediately, and schedules
 * follow-up reminders in the `reminders` collection, dispatched by the
 * hourly cleanup job. Reminder docs deliberately carry only minimal snapshot
 * fields (no clinical detail) so they stay harmless after case cleanup.
 */
export const saveReminderEmail = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);

  // Paid cases have their own owner-controlled response reminders. Do not
  // attach pre-purchase recovery mail or alter retention for them here.
  if (snap.get("paid") === true) {
    throw new HttpsError(
      "failed-precondition",
      "Preview reminders are available before purchase only.",
    );
  }

  const email = String(request.data?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }

  const db = getFirestore();
  const now = Timestamp.now();
  const requestedExpiry = reminderOptInExpiry(now);
  const existingExpiry = snap.get("expiresAt") as Timestamp | null | undefined;
  // A saved case has null expiry and must remain saved. For a temporary case,
  // keep the later of its existing expiry and the explicit 14-day opt-in.
  const expiryUpdate = existingExpiry === null
    ? null
    : existingExpiry instanceof Timestamp && existingExpiry.toMillis() > requestedExpiry.toMillis()
      ? existingExpiry
      : requestedExpiry;

  await snap.ref.update({
    reminderEmail: email,
    reminderOptInAt: now,
    expiresAt: expiryUpdate,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const preview = snap.get("preview") as
    | { amountAtStake?: string | null; recommendedPacketType?: string }
    | undefined;
  const extraction = snap.get("extraction") as
    | { appealDeadline?: string | null; insurerName?: string | null }
    | undefined;

  const amount = preview?.amountAtStake ?? null;
  const insurer = extraction?.insurerName ?? null;
  const deadline = parseDeadline(extraction?.appealDeadline);
  const caseUrl = `${config.appBaseUrl}/#/case/${snap.id}/preview`;

  // Immediate recap so the case link is one click away when they come back.
  await db.collection("mail").add({
    caseId: snap.id,
    ownerUid: uid,
    to: [email],
    message: buildReminderMessage({
      subject: "Your GetMyYes appeal preview — saved for you",
      intro:
        `Here's your appeal case${insurer ? ` against ${insurer}` : ""}, ready to pick ` +
        "back up whenever you are.",
      amount,
      deadline,
      caseUrl,
    }),
    createdAt: FieldValue.serverTimestamp(),
  });

  // Scheduled nudges: +3 days, and 7 days before the appeal deadline when we
  // know it. Dispatched (and dropped if the case was paid or deleted) by the
  // hourly job in cleanup.ts.
  const batch = db.batch();
  const nudge = db.collection("reminders").doc();
  batch.set(nudge, {
    caseId: snap.id,
    ownerUid: uid,
    email,
    sendAt: Timestamp.fromMillis(now.toMillis() + 3 * 24 * 3600 * 1000),
    kind: "nudge",
    insurer,
    amount,
    deadline: deadline ? Timestamp.fromDate(deadline) : null,
    createdAt: now,
  });
  if (deadline) {
    const sevenDaysBefore = deadline.getTime() - 7 * 24 * 3600 * 1000;
    if (sevenDaysBefore > now.toMillis()) {
      const dl = db.collection("reminders").doc();
      batch.set(dl, {
        caseId: snap.id,
        ownerUid: uid,
        email,
        sendAt: Timestamp.fromMillis(sevenDaysBefore),
        kind: "deadline",
        insurer,
        amount,
        deadline: Timestamp.fromDate(deadline),
        createdAt: now,
      });
    }
  }
  await batch.commit();

  return { saved: true };
});

function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The customer-facing half of a Trustpilot invitation. Their BCC method
 * generates the invitation from a genuine email we send the customer, so this
 * has to stand on its own as a useful message.
 *
 * Two deliberate properties: it names Trustpilot, so the invitation arriving
 * from a third party is expected rather than a surprise; and it carries no
 * case facts, because everything in here is blind-copied outside our
 * processors. Insurer, amount, deadline, and document content stay out.
 */
export function buildReviewInviteMessage(args: {
  caseUrl: string;
}): { subject: string; text: string; html: string } {
  const { caseUrl } = args;
  const intro =
    "It has been a few weeks since you built your appeal packet. Your case, " +
    "your documents, and any follow-up rounds you still have are waiting in " +
    "your account.";
  const invite =
    "We have also asked Trustpilot to send you an invitation to review " +
    "GetMyYes. It is optional and it is public — and every customer gets the " +
    "same invitation, whatever they would say. If the appeal did not go your " +
    "way, that is worth writing too.";
  const optOut =
    "One-time invitation — we will not ask again. To stop all email about " +
    "this case, delete the case (or your account) in Settings, or reply STOP.";
  const disclaimer =
    "GetMyYes is a document drafting assistant — not medical, legal, or " +
    "insurance advice.";

  return {
    subject: "How did your appeal go?",
    text:
      `${intro}\n\nOpen your case: ${caseUrl}\n\n${invite}\n\n` +
      `${optOut}\n\n${disclaimer}`,
    html:
      `<p>${intro}</p>` +
      `<p><a href="${caseUrl}" style="background:#1C160C;color:#F3EDDF;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Open my case</a></p>` +
      `<p>${invite}</p>` +
      `<p style="color:#64748B;font-size:12px">${optOut}</p>` +
      `<p style="color:#64748B;font-size:12px">${disclaimer}</p>`,
  };
}

export function buildReminderMessage(args: {
  subject: string;
  intro: string;
  amount: string | null;
  deadline: Date | null;
  caseUrl: string;
}): { subject: string; text: string; html: string } {
  const { subject, intro, amount, deadline, caseUrl } = args;
  const deadlineStr = deadline
    ? deadline.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const facts = [
    amount ? `At stake: ${amount}` : null,
    deadlineStr ? `Appeal deadline: ${deadlineStr}` : null,
  ].filter(Boolean);

  const optOut =
    "You're getting this because you asked for deadline reminders on this case. " +
    "To stop them, delete the case (or your account) in Settings, or reply STOP.";
  const disclaimer =
    "GetMyYes is a document drafting assistant — not medical, legal, or " +
    "insurance advice. Always confirm deadlines with your insurer.";

  return {
    subject,
    text:
      `${intro}\n\n${facts.join("\n")}\n\nOpen your case: ${caseUrl}\n\n` +
      `${optOut}\n\n${disclaimer}`,
    html:
      `<p>${intro}</p>` +
      (facts.length
        ? `<p>${facts.map((f) => `<strong>${f}</strong>`).join("<br>")}</p>`
        : "") +
      `<p><a href="${caseUrl}" style="background:#1C160C;color:#F3EDDF;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Open my case</a></p>` +
      `<p style="color:#64748B;font-size:12px">${optOut}</p>` +
      `<p style="color:#64748B;font-size:12px">${disclaimer}</p>`,
  };
}
