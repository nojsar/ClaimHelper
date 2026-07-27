import assert from "node:assert/strict";
import test from "node:test";

import {
  selectPacketFulfillmentWork,
  shouldAttemptPaidPacketFulfillment,
  shouldStartPaidPacketFulfillment,
} from "../packet_fulfillment";
import { nextPacketFulfillmentRetryMillis } from "../packet_retry";

test("paid packet fulfillment starts only for paid, missing packets", () => {
  assert.equal(
    shouldStartPaidPacketFulfillment({
      paid: true,
      packet: null,
      fulfillmentStatus: "pending",
    }),
    true,
  );
  assert.equal(
    shouldStartPaidPacketFulfillment({
      paid: true,
      packet: null,
      fulfillmentStatus: "fulfilling",
    }),
    true,
  );
  assert.equal(
    shouldStartPaidPacketFulfillment({
      paid: true,
      packet: null,
      fulfillmentStatus: "retry_wait",
    }),
    true,
  );
  assert.equal(
    shouldStartPaidPacketFulfillment({
      paid: true,
      packet: { appealLetter: "ready" },
      fulfillmentStatus: "pending",
    }),
    false,
  );
  assert.equal(
    shouldStartPaidPacketFulfillment({
      paid: false,
      packet: null,
      fulfillmentStatus: "pending",
    }),
    false,
  );
  assert.equal(
    shouldStartPaidPacketFulfillment({
      paid: true,
      packet: null,
      fulfillmentStatus: "needs_attention",
    }),
    false,
  );
});

test("packet retries use capped exponential backoff", () => {
  const now = 1_700_000_000_000;
  assert.equal(nextPacketFulfillmentRetryMillis(1, now), now + 5 * 60_000);
  assert.equal(nextPacketFulfillmentRetryMillis(2, now), now + 10 * 60_000);
  assert.equal(nextPacketFulfillmentRetryMillis(99, now), now + 60 * 60_000);
});

test("retry-wait fulfillment cannot run before its scheduled retry", () => {
  const now = 1_700_000_000_000;
  const base = { paid: true, packet: null, fulfillmentStatus: "retry_wait" };
  assert.equal(
    shouldAttemptPaidPacketFulfillment({
      ...base,
      retryAtMillis: now + 1,
      generationLeaseExpiresAtMillis: null,
      nowMillis: now,
    }),
    false,
  );
  assert.equal(
    shouldAttemptPaidPacketFulfillment({
      ...base,
      retryAtMillis: now,
      generationLeaseExpiresAtMillis: null,
      nowMillis: now,
    }),
    true,
  );
});

test("fair watchdog selection preserves pending and due work", () => {
  const now = 1_700_000_000_000;
  const make = (id: string, fulfillmentStatus: string, retryAtMillis: number | null = null) => ({
    id,
    ownerUid: "owner",
    paid: true,
    packet: null,
    fulfillmentStatus,
    retryAtMillis,
    generationLeaseExpiresAtMillis: null,
  });
  const work = selectPacketFulfillmentWork({
    pending: [make("pending", "pending")],
    fulfilling: [make("active", "fulfilling")],
    dueRetries: [make("due", "retry_wait", now)],
    legacyRetries: [
      make("not-due", "retry_wait", now + 60_000),
      make("due", "retry_wait", now),
    ],
    nowMillis: now,
  });

  assert.deepEqual(work.map((item) => item.id), ["pending", "due", "active"]);
});

test("active generation leases are skipped before a watchdog model call", () => {
  const now = 1_700_000_000_000;
  assert.equal(
    shouldAttemptPaidPacketFulfillment({
      paid: true,
      packet: null,
      fulfillmentStatus: "fulfilling",
      retryAtMillis: null,
      generationLeaseExpiresAtMillis: now + 1,
      nowMillis: now,
    }),
    false,
  );
});
