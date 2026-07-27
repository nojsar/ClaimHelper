import { FieldValue, getFirestore } from "firebase-admin/firestore";

import { config } from "./config";

export type ModelOperation = "extraction" | "preview" | "packet" | "followup";

type ModelUsageSample = {
  operation: ModelOperation;
  succeeded: boolean;
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
};

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function latencyBucket(durationMs: number): string {
  if (durationMs < 5_000) return "under_5s";
  if (durationMs < 15_000) return "5_to_15s";
  if (durationMs < 30_000) return "15_to_30s";
  if (durationMs < 60_000) return "30_to_60s";
  if (durationMs < 120_000) return "60_to_120s";
  return "over_120s";
}

/** Estimate spend from configurable per-million-token rates, in USD micros. */
export function estimatedModelCostMicros(sample: {
  inputTokens: unknown;
  cachedInputTokens: unknown;
  outputTokens: unknown;
}): number {
  const input = safeCount(sample.inputTokens);
  const cached = Math.min(input, safeCount(sample.cachedInputTokens));
  const uncached = input - cached;
  const output = safeCount(sample.outputTokens);
  const dollars =
    (uncached * config.openaiInputCostPerMillion +
      cached * config.openaiCachedInputCostPerMillion +
      output * config.openaiOutputCostPerMillion) /
    1_000_000;
  return Math.max(0, Math.round(dollars * 1_000_000));
}

/**
 * Write aggregate-only model economics. There is deliberately no uid, case id,
 * prompt, schema output, error text, IP, or user agent in this collection.
 * Analytics failure can never break document generation.
 */
export async function recordModelUsage(sample: ModelUsageSample): Promise<void> {
  const inputTokens = safeCount(sample.inputTokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    safeCount(sample.cachedInputTokens),
  );
  const outputTokens = safeCount(sample.outputTokens);
  const durationMs = safeCount(sample.durationMs);
  const estimatedCostMicros = estimatedModelCostMicros({
    inputTokens,
    cachedInputTokens,
    outputTokens,
  });
  const calls = FieldValue.increment(1);
  const successes = FieldValue.increment(sample.succeeded ? 1 : 0);
  const errors = FieldValue.increment(sample.succeeded ? 0 : 1);
  const input = FieldValue.increment(inputTokens);
  const cached = FieldValue.increment(cachedInputTokens);
  const output = FieldValue.increment(outputTokens);
  const duration = FieldValue.increment(durationMs);
  const cost = FieldValue.increment(estimatedCostMicros);
  const latency = latencyBucket(durationMs);
  const day = new Date().toISOString().slice(0, 10);

  try {
    await getFirestore()
      .collection("analytics_model_daily")
      .doc(day)
      .set(
        {
          model: config.openaiModel,
          reasoningEffort: config.openaiReasoningEffort,
          calls,
          successes,
          errors,
          inputTokens: input,
          cachedInputTokens: cached,
          outputTokens: output,
          totalDurationMs: duration,
          estimatedCostMicros: cost,
          latencyBuckets: { [latency]: calls },
          operations: {
            [sample.operation]: {
              calls,
              successes,
              errors,
              inputTokens: input,
              cachedInputTokens: cached,
              outputTokens: output,
              totalDurationMs: duration,
              estimatedCostMicros: cost,
              latencyBuckets: { [latency]: calls },
            },
          },
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
  } catch {
    console.warn("Aggregate model-usage write failed (ignored).");
  }
}
