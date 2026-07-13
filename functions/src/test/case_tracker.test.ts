import assert from "node:assert/strict";
import test from "node:test";

import { HttpsError } from "firebase-functions/v2/https";

import { normalizeCaseTrackerInput } from "../case_tracker";

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
