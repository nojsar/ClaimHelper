import { getFirestore } from "firebase-admin/firestore";

const HOUR_MS = 60 * 60 * 1000;

export type HourlyRateLimitDecision = {
  allowed: boolean;
  hourStart: number;
  count: number;
  retryAfterMinutes: number;
};

/**
 * Pure rolling-window decision used by model-call abuse guards.
 *
 * Invalid or future persisted values are reset instead of leaving a customer
 * permanently locked out after clock skew or a malformed legacy record.
 */
export function hourlyRateLimitDecision(args: {
  hourStart: unknown;
  count: unknown;
  now: number;
  limit: number;
}): HourlyRateLimitDecision {
  if (!Number.isFinite(args.now) || args.now < 0) {
    throw new Error("now must be a non-negative finite number.");
  }
  if (!Number.isInteger(args.limit) || args.limit < 1) {
    throw new Error("limit must be a positive integer.");
  }

  const storedStart =
    typeof args.hourStart === "number" && Number.isFinite(args.hourStart)
      ? args.hourStart
      : 0;
  const storedCount =
    typeof args.count === "number" &&
    Number.isInteger(args.count) &&
    args.count >= 0
      ? args.count
      : 0;
  const invalidWindow =
    storedStart <= 0 ||
    storedStart > args.now ||
    args.now - storedStart >= HOUR_MS;

  if (invalidWindow) {
    return {
      allowed: true,
      hourStart: args.now,
      count: 1,
      retryAfterMinutes: 0,
    };
  }
  if (storedCount >= args.limit) {
    return {
      allowed: false,
      hourStart: storedStart,
      count: storedCount,
      retryAfterMinutes: Math.max(
        1,
        Math.ceil((storedStart + HOUR_MS - args.now) / 60_000),
      ),
    };
  }
  return {
    allowed: true,
    hourStart: storedStart,
    count: storedCount + 1,
    retryAfterMinutes: 0,
  };
}

/**
 * Atomically consumes a per-user model-call allowance. The legacy
 * `preview_<uid>` document is intentionally shared so account deletion already
 * removes every rate-limit field without a new user-linked record.
 */
export async function consumeUidHourlyRateLimit(args: {
  uid: string;
  key: string;
  limit: number;
  now?: number;
}): Promise<HourlyRateLimitDecision> {
  if (!/^[a-z][a-zA-Z0-9]{0,31}$/.test(args.key)) {
    throw new Error("Rate-limit key must be a bounded identifier.");
  }
  const now = args.now ?? Date.now();
  const startField = `${args.key}HourStart`;
  const countField = `${args.key}Count`;
  const ref = getFirestore().collection("rateLimits").doc(`preview_${args.uid}`);

  return getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const decision = hourlyRateLimitDecision({
      hourStart: snap.get(startField),
      count: snap.get(countField),
      now,
      limit: args.limit,
    });
    if (decision.allowed) {
      tx.set(
        ref,
        {
          [startField]: decision.hourStart,
          [countField]: decision.count,
        },
        { merge: true },
      );
    }
    return decision;
  });
}
