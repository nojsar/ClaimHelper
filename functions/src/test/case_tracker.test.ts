import assert from "node:assert/strict";
import test from "node:test";

import { HttpsError } from "firebase-functions/v2/https";

import {
  normalizeCaseTrackerInput,
  responseReminderIsPending,
} from "../case_tracker";

const now = new Date("2026-07-13T12:00:00.000Z");

function expectCode(code: string, action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    return true;
  });
}

test("case tracker accepts only bounded operational fields", () => {
  assert.deepEqual(
    normalizeCaseTrackerInput(
      {
        submittedDate: "2026-07-10",
        submissionMethod: "certified_mail",
        confirmationNumber: "  REF-123  ",
        expectedResponseDate: "2026-08-10",
        responseDate: null,
        responseStatus: "under_review",
        outcome: "pending",
        responseReminderEnabled: true,
        ignoredHealthNotes: "must never be persisted",
      },
      now,
    ),
    {
      submittedDate: "2026-07-10",
      submissionMethod: "certified_mail",
      confirmationNumber: "REF-123",
      expectedResponseDate: "2026-08-10",
      responseDate: null,
      responseStatus: "under_review",
      outcome: "pending",
      responseReminderEnabled: true,
    },
  );
});

test("case tracker rejects unbounded categories and invalid date order", () => {
  const valid = {
    submittedDate: "2026-07-10",
    submissionMethod: "fax",
    confirmationNumber: null,
    expectedResponseDate: null,
    responseDate: null,
    responseStatus: "no_response_yet",
    outcome: "pending",
    responseReminderEnabled: false,
  };
  expectCode("invalid-argument", () =>
    normalizeCaseTrackerInput(
      { ...valid, submissionMethod: "carrier_pigeon" },
      now,
    ),
  );
  expectCode("invalid-argument", () =>
    normalizeCaseTrackerInput(
      { ...valid, expectedResponseDate: "2026-07-09" },
      now,
    ),
  );
  expectCode("invalid-argument", () =>
    normalizeCaseTrackerInput(
      { ...valid, responseDate: "2026-07-09" },
      now,
    ),
  );
});

test("confirmation numbers are length and control-character bounded", () => {
  const base = {
    submittedDate: "2026-07-10",
    submissionMethod: "online_portal",
    expectedResponseDate: null,
    responseDate: null,
    responseStatus: "acknowledged",
    outcome: "approved",
    responseReminderEnabled: false,
  };
  expectCode("invalid-argument", () =>
    normalizeCaseTrackerInput(
      { ...base, confirmationNumber: "x".repeat(121) },
      now,
    ),
  );
  expectCode("invalid-argument", () =>
    normalizeCaseTrackerInput(
      { ...base, confirmationNumber: "REF\nINJECT" },
      now,
    ),
  );
});

test("response reminders stop as soon as a response or outcome is recorded", () => {
  const pending = {
    expectedResponseDate: "2026-08-10",
    responseDate: null,
    responseStatus: "under_review" as const,
    outcome: "pending" as const,
    responseReminderEnabled: true,
  };
  assert.equal(responseReminderIsPending(pending), true);

  assert.equal(
    responseReminderIsPending({
      ...pending,
      responseReminderEnabled: false,
    }),
    false,
  );
  assert.equal(
    responseReminderIsPending({
      ...pending,
      expectedResponseDate: null,
    }),
    false,
  );
  assert.equal(
    responseReminderIsPending({
      ...pending,
      responseDate: "2026-07-20",
    }),
    false,
  );
  assert.equal(
    responseReminderIsPending({
      ...pending,
      responseStatus: "decision_received",
    }),
    false,
  );
  assert.equal(
    responseReminderIsPending({
      ...pending,
      responseStatus: "closed",
    }),
    false,
  );
  for (const outcome of [
    "approved",
    "partially_approved",
    "denied",
    "withdrawn",
  ] as const) {
    assert.equal(
      responseReminderIsPending({ ...pending, outcome }),
      false,
      `final outcome ${outcome} must cancel the queued reminder`,
    );
  }
});
