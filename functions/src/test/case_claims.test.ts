import assert from "node:assert/strict";
import test from "node:test";

import { HttpsError } from "firebase-functions/v2/https";

import {
  claimEmailHash,
  decideCaseClaim,
  normalizeClaimEmail,
} from "../case_claims";

const now = 1_700_000_000_000;
const targetEmailHash = claimEmailHash("person@example.com");
const activeClaim = {
  guestUid: "guest-uid",
  targetEmailHash,
  targetUid: null,
  expiresAtMillis: now + 60_000,
};

function expectCode(code: string, action: () => unknown): void {
  assert.throws(action, (error: unknown) => {
    assert.ok(error instanceof HttpsError);
    assert.equal(error.code, code);
    return true;
  });
}

test("claim email normalization is stable without retaining raw variants", () => {
  assert.equal(normalizeClaimEmail(" Person@Example.COM "), "person@example.com");
  assert.equal(
    claimEmailHash(normalizeClaimEmail(" Person@Example.COM ")),
    targetEmailHash,
  );
  expectCode("invalid-argument", () => normalizeClaimEmail("not-an-email"));
});

test("an active prepared claim authorizes only its exact target", () => {
  assert.equal(
    decideCaseClaim({
      caseOwnerUid: "guest-uid",
      requestUid: "account-uid",
      requestEmailHash: targetEmailHash,
      preparedClaim: activeClaim,
      nowMillis: now,
    }),
    "transfer",
  );

  expectCode("permission-denied", () =>
    decideCaseClaim({
      caseOwnerUid: "guest-uid",
      requestUid: "attacker-uid",
      requestEmailHash: claimEmailHash("attacker@example.com"),
      preparedClaim: activeClaim,
      nowMillis: now,
    }),
  );
});

test("expired and owner-mismatched authorizations cannot move a case", () => {
  expectCode("deadline-exceeded", () =>
    decideCaseClaim({
      caseOwnerUid: "guest-uid",
      requestUid: "account-uid",
      requestEmailHash: targetEmailHash,
      preparedClaim: { ...activeClaim, expiresAtMillis: now },
      nowMillis: now,
    }),
  );
  expectCode("failed-precondition", () =>
    decideCaseClaim({
      caseOwnerUid: "other-owner",
      requestUid: "account-uid",
      requestEmailHash: targetEmailHash,
      preparedClaim: activeClaim,
      nowMillis: now,
    }),
  );
});

test("replay is idempotent for the destination and denied to everyone else", () => {
  assert.equal(
    decideCaseClaim({
      caseOwnerUid: "account-uid",
      requestUid: "account-uid",
      requestEmailHash: targetEmailHash,
      preparedClaim: { ...activeClaim, targetUid: "account-uid" },
      nowMillis: now,
    }),
    "already-owned",
  );

  expectCode("permission-denied", () =>
    decideCaseClaim({
      caseOwnerUid: "guest-uid",
      requestUid: "second-account",
      requestEmailHash: targetEmailHash,
      preparedClaim: { ...activeClaim, targetUid: "account-uid" },
      nowMillis: now,
    }),
  );
  expectCode("permission-denied", () =>
    decideCaseClaim({
      caseOwnerUid: "guest-uid",
      requestUid: "account-uid",
      requestEmailHash: targetEmailHash,
      nowMillis: now,
    }),
  );
});
