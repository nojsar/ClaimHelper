import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { remainingFollowUpCredits } from "../entitlements";

test("legacy Full Case records reconstruct their capped remaining credits", () => {
  assert.equal(remainingFollowUpCredits({
    fullCase: true,
    followUpCredits: undefined,
    followUps: Array.from({ length: 3 }),
  }), 7);
  assert.equal(remainingFollowUpCredits({
    fullCase: true,
    followUpCredits: undefined,
    followUps: Array.from({ length: 12 }),
  }), 0);
});

test("stored credits remain authoritative and normal packets keep their allowance", () => {
  assert.equal(remainingFollowUpCredits({
    fullCase: true,
    followUpCredits: 4.8,
    followUps: [],
  }), 4);
  assert.equal(remainingFollowUpCredits({
    fullCase: false,
    followUpCredits: undefined,
    followUps: [],
  }), 2);
});

test("follow-up generation and paid add-ons share the legacy entitlement reader", () => {
  const source = (name: string) =>
    readFileSync(resolve(__dirname, "..", "..", "src", name), "utf8");
  const followup = source("followup.ts");
  const payments = source("payments.ts");
  assert.match(followup, /remainingFollowUpCredits\(\{[\s\S]*fullCase: snap\.get\("fullCase"\)/);
  assert.match(followup, /remainingFollowUpCredits\(\{[\s\S]*fullCase: current\.get\("fullCase"\)/);
  assert.match(payments, /remainingFollowUpCredits\(\{[\s\S]*fullCase: caseSnap\.get\("fullCase"\)/);
});
