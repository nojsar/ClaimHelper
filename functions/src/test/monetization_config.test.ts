import assert from "node:assert/strict";
import test from "node:test";

import { config } from "../config";
import { reminderOptInExpiry } from "../reminders";
import { Timestamp } from "firebase-admin/firestore";

test("default Full Case economics are capped and the upgrade is a $20 delta", () => {
  assert.equal(config.fullPacketPriceCents, 3900);
  assert.equal(config.fullCasePriceCents, 5900);
  assert.equal(config.fullCaseUpgradePriceCents, 2000);
  assert.equal(config.fullCaseRoundsCap, 10);
  assert.equal(config.freeFollowUpRounds, 2);
});

test("default AI quality configuration uses GPT-5.6 Terra with high reasoning", () => {
  assert.equal(config.openaiModel, "gpt-5.6-terra");
  assert.equal(config.openaiReasoningEffort, "high");
  assert.equal(config.openaiServiceTier, "default");
});

test("reminder opt-in gives a case fourteen days of recoverable access", () => {
  const now = Timestamp.fromMillis(1_700_000_000_000);
  assert.equal(
    reminderOptInExpiry(now).toMillis(),
    now.toMillis() + 14 * 24 * 60 * 60 * 1000,
  );
});
