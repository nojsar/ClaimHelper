import assert from "node:assert/strict";
import test from "node:test";

import { estimatedModelCostMicros } from "../model_usage";

test("model cost estimate accounts for cached and output tokens", () => {
  // 900 uncached * $5/M + 100 cached * $0.50/M + 200 output * $25/M (GPT-6.1 Sol)
  assert.equal(
    estimatedModelCostMicros({
      inputTokens: 1_000,
      cachedInputTokens: 100,
      outputTokens: 200,
    }),
    9_550,
  );
});

test("model cost estimate clamps malformed counters", () => {
  assert.equal(
    estimatedModelCostMicros({
      inputTokens: -5,
      cachedInputTokens: Number.NaN,
      outputTokens: "100",
    }),
    0,
  );
});
