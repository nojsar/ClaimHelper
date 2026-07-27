import assert from "node:assert/strict";
import test from "node:test";

import { hourlyRateLimitDecision } from "../rate_limit";

const now = 1_800_000_000_000;

test("hourly limit starts a new bounded window", () => {
  assert.deepEqual(
    hourlyRateLimitDecision({
      hourStart: null,
      count: null,
      now,
      limit: 5,
    }),
    {
      allowed: true,
      hourStart: now,
      count: 1,
      retryAfterMinutes: 0,
    },
  );
});

test("hourly limit increments inside the active window", () => {
  assert.deepEqual(
    hourlyRateLimitDecision({
      hourStart: now - 20 * 60_000,
      count: 3,
      now,
      limit: 5,
    }),
    {
      allowed: true,
      hourStart: now - 20 * 60_000,
      count: 4,
      retryAfterMinutes: 0,
    },
  );
});

test("hourly limit blocks at the cap with a useful retry delay", () => {
  assert.deepEqual(
    hourlyRateLimitDecision({
      hourStart: now - 20 * 60_000,
      count: 5,
      now,
      limit: 5,
    }),
    {
      allowed: false,
      hourStart: now - 20 * 60_000,
      count: 5,
      retryAfterMinutes: 40,
    },
  );
});

test("expired, malformed, and future windows recover safely", () => {
  for (const input of [
    { hourStart: now - 60 * 60_000, count: 5 },
    { hourStart: "bad", count: -1 },
    { hourStart: now + 1, count: 5 },
  ]) {
    const decision = hourlyRateLimitDecision({
      ...input,
      now,
      limit: 5,
    });
    assert.equal(decision.allowed, true);
    assert.equal(decision.hourStart, now);
    assert.equal(decision.count, 1);
  }
});

test("hourly limit rejects invalid configuration", () => {
  assert.throws(
    () =>
      hourlyRateLimitDecision({
        hourStart: 0,
        count: 0,
        now,
        limit: 0,
      }),
    /positive integer/,
  );
});
