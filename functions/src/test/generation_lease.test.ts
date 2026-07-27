import assert from "node:assert/strict";
import test from "node:test";

import {
  GENERATION_LEASE_DURATION_MS,
  decideGenerationLease,
} from "../generation_lease";
import { boundedPriorRoundsContext } from "../followup";

const now = 1_700_000_000_000;

test("an active lease prevents duplicate model work", () => {
  const result = decideGenerationLease({
    existing: {
      operation: "packet",
      token: "current-operation",
      expiresAtMillis: now + 1,
    },
    requestedOperation: "packet",
    token: "new-operation",
    nowMillis: now,
  });

  assert.deepEqual(result, { kind: "busy", operation: "packet" });
});

test("an expired lease is recoverable by a fresh operation", () => {
  const result = decideGenerationLease({
    existing: {
      operation: "extraction",
      token: "stale-operation",
      expiresAtMillis: now,
    },
    requestedOperation: "preview",
    token: "recovery-operation",
    nowMillis: now,
  });

  assert.equal(result.kind, "acquired");
  if (result.kind !== "acquired") return;
  assert.equal(result.lease.operation, "preview");
  assert.equal(result.lease.token, "recovery-operation");
  assert.equal(
    result.lease.expiresAtMillis,
    now + GENERATION_LEASE_DURATION_MS,
  );
});

test("a different operation is also blocked while a lease is active", () => {
  const result = decideGenerationLease({
    existing: {
      operation: "followup",
      token: "current-operation",
      expiresAtMillis: now + 10_000,
    },
    requestedOperation: "packet",
    token: "new-operation",
    nowMillis: now,
  });

  assert.deepEqual(result, { kind: "busy", operation: "followup" });
});

test("follow-up context keeps complete recent rounds and bounds older history", () => {
  const rounds = Array.from({ length: 12 }, (_, index) => ({
    createdAt: `2026-01-${String(index + 1).padStart(2, "0")}`,
    outcome: "denied",
    situationSummary: `summary-${index}-${"s".repeat(2_000)}`,
    recommendedNextSteps: `steps-${index}-${"n".repeat(2_000)}`,
    responseLetter: `letter-${index}-${"l".repeat(10_000)}`,
    callScript: `script-${index}-${"c".repeat(4_000)}`,
  }));
  const context = JSON.parse(boundedPriorRoundsContext(rounds)) as {
    olderRoundCount: number;
    olderRoundSummaries: unknown[];
    recentFullRounds: Array<Record<string, string | null>>;
  };

  assert.ok(boundedPriorRoundsContext(rounds).length <= 30_000);
  assert.equal(context.olderRoundCount, 10);
  assert.equal(context.olderRoundSummaries.length, 10);
  assert.equal(context.recentFullRounds.length, 2);
  assert.match(context.recentFullRounds[1].responseLetter ?? "", /letter-11/);
});

test("follow-up context remains bounded for JSON-escaping-heavy notes", () => {
  const rounds = Array.from({ length: 2 }, () => ({
    responseLetter: '"\\'.repeat(8_000),
    callScript: '"\\'.repeat(3_000),
  }));

  assert.ok(boundedPriorRoundsContext(rounds).length <= 30_000);
});
