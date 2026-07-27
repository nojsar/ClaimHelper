import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";

import { openaiApiKey } from "./config";
import { generatePaidPacketForCase } from "./packet";
import { nextPacketFulfillmentRetryMillis } from "./packet_retry";

const MAX_AUTOMATIC_ATTEMPTS = 5;
const WATCHDOG_WORK_LIMIT = 10;
const PENDING_WORK_LIMIT = 3;
const FULFILLING_WORK_LIMIT = 2;
const DUE_RETRY_WORK_LIMIT = 3;
const LEGACY_RETRY_WORK_LIMIT = 2;

function timestampMillis(value: unknown): number | null {
  if (value instanceof Timestamp) return value.toMillis();
  if (value && typeof value === "object" && "toMillis" in value) {
    const toMillis = (value as { toMillis?: unknown }).toMillis;
    if (typeof toMillis === "function") {
      const millis = toMillis.call(value);
      return typeof millis === "number" && Number.isFinite(millis)
        ? millis
        : null;
    }
  }
  return null;
}

export function shouldStartPaidPacketFulfillment(args: {
  paid: unknown;
  packet: unknown;
  fulfillmentStatus: unknown;
}): boolean {
  return (
    args.paid === true &&
    !args.packet &&
    (args.fulfillmentStatus === "pending" ||
      args.fulfillmentStatus === "fulfilling" ||
      args.fulfillmentStatus === "retry_wait")
  );
}

/** Retry-wait jobs may be inspected by the watchdog but cannot run early. */
export function shouldAttemptPaidPacketFulfillment(args: {
  paid: unknown;
  packet: unknown;
  fulfillmentStatus: unknown;
  retryAtMillis: number | null;
  generationLeaseExpiresAtMillis: number | null;
  nowMillis: number;
}): boolean {
  if (!shouldStartPaidPacketFulfillment(args)) return false;
  if (args.generationLeaseExpiresAtMillis !== null &&
      args.generationLeaseExpiresAtMillis > args.nowMillis) {
    return false;
  }
  return args.fulfillmentStatus !== "retry_wait" ||
    args.retryAtMillis === null || args.retryAtMillis <= args.nowMillis;
}

export interface PacketFulfillmentCandidate {
  id: string;
  ownerUid: unknown;
  paid: unknown;
  packet: unknown;
  fulfillmentStatus: unknown;
  retryAtMillis: number | null;
  generationLeaseExpiresAtMillis: number | null;
}

/**
 * Preserve fair progress across fixed fulfillment states. Queries are capped
 * by state, and duplicate legacy/due retries are processed at most once.
 */
export function selectPacketFulfillmentWork(args: {
  pending: PacketFulfillmentCandidate[];
  fulfilling: PacketFulfillmentCandidate[];
  dueRetries: PacketFulfillmentCandidate[];
  legacyRetries: PacketFulfillmentCandidate[];
  nowMillis: number;
}): PacketFulfillmentCandidate[] {
  const selected: PacketFulfillmentCandidate[] = [];
  const seen = new Set<string>();
  for (const candidates of [
    args.pending,
    args.dueRetries,
    args.legacyRetries,
    args.fulfilling,
  ]) {
    for (const candidate of candidates) {
      if (selected.length >= WATCHDOG_WORK_LIMIT || seen.has(candidate.id)) continue;
      if (!shouldAttemptPaidPacketFulfillment({
        paid: candidate.paid,
        packet: candidate.packet,
        fulfillmentStatus: candidate.fulfillmentStatus,
        retryAtMillis: candidate.retryAtMillis,
        generationLeaseExpiresAtMillis: candidate.generationLeaseExpiresAtMillis,
        nowMillis: args.nowMillis,
      })) continue;
      seen.add(candidate.id);
      selected.push(candidate);
    }
  }
  return selected;
}

async function markAttemptFailure(caseId: string): Promise<boolean> {
  const ref = getFirestore().collection("cases").doc(caseId);
  return getFirestore().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("packet")) return false;
    const current = snapshot.get("packetFulfillmentAttempts");
    const attempts =
      (typeof current === "number" && Number.isFinite(current)
        ? Math.max(0, Math.floor(current))
        : 0) + 1;
    const retry = attempts < MAX_AUTOMATIC_ATTEMPTS;
    const nowMillis = Date.now();
    transaction.update(ref, {
      packetFulfillmentAttempts: attempts,
      packetFulfillmentStatus: retry ? "retry_wait" : "needs_attention",
      packetFulfillmentLastError: "generation_failed",
      ...(retry
        ? {
            packetFulfillmentNextAttemptAt: Timestamp.fromMillis(
              nextPacketFulfillmentRetryMillis(attempts, nowMillis),
            ),
          }
        : { packetFulfillmentNextAttemptAt: FieldValue.delete() }),
      packetFulfillmentLastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return retry;
  });
}

async function fulfillCase(caseId: string, ownerUid: string): Promise<void> {
  const current = await getFirestore().collection("cases").doc(caseId).get();
  if (
    !current.exists ||
    current.get("ownerUid") !== ownerUid ||
    !shouldAttemptPaidPacketFulfillment({
      paid: current.get("paid"),
      packet: current.get("packet"),
      fulfillmentStatus: current.get("packetFulfillmentStatus"),
      retryAtMillis: timestampMillis(current.get("packetFulfillmentNextAttemptAt")),
      generationLeaseExpiresAtMillis: timestampMillis(
        (current.get("generationLease") as { expiresAt?: unknown } | null)?.expiresAt,
      ),
      nowMillis: Date.now(),
    })
  ) {
    return;
  }

  try {
    const result = await generatePaidPacketForCase({ caseId, ownerUid });
    if (result.kind === "alreadyExists") {
      await current.ref.update({
        packetFulfillmentStatus: "completed",
        packetFulfillmentLastError: FieldValue.delete(),
        packetFulfillmentNextAttemptAt: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    // busy means another invocation owns the lease; its finalize step updates
    // fulfillment status. The watchdog repairs an abandoned/expired lease.
  } catch {
    // The watchdog retries after a bounded delay. Avoid recursively triggering
    // immediate model calls when a provider or prerequisite error persists.
    await markAttemptFailure(caseId);
  }
}

/**
 * Payment entitlement and fulfillment are decoupled: Stripe only needs to
 * commit paid=true/pending. This retryable background trigger generates the
 * packet even when the customer closes Checkout before returning to the app.
 */
export const fulfillPaidPacket = onDocumentUpdated(
  {
    document: "cases/{caseId}",
    secrets: [openaiApiKey],
    retry: true,
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async (event) => {
    const before = event.data?.before;
    const after = event.data?.after;
    if (!after?.exists) return;
    const enteredInitialPending =
      after.get("packetFulfillmentStatus") === "pending" &&
      after.get("paid") === true &&
      before?.get("paid") !== true;
    if (!enteredInitialPending) return;
    const ownerUid = after.get("ownerUid");
    if (typeof ownerUid !== "string" || ownerUid.length === 0) return;
    await fulfillCase(after.id, ownerUid);
  },
);

/**
 * Repair safety net for a terminated background invocation. Only fixed
 * fulfillment states are queried; no case content is logged or copied.
 */
export const repairPaidPacketFulfillment = onSchedule(
  {
    schedule: "every 15 minutes",
    secrets: [openaiApiKey],
    retryCount: 1,
    timeoutSeconds: 540,
    memory: "1GiB",
  },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    // Every query uses one indexed field. Due retries filter on the retry
    // timestamp alone because only retry_wait cases retain that field; this
    // avoids a new composite index and stops future retry_wait jobs from
    // occupying the pending/fulfilling work allocation.
    const [pending, fulfilling, dueRetries, legacyRetries] = await Promise.all([
      db.collection("cases")
        .where("packetFulfillmentStatus", "==", "pending")
        .limit(PENDING_WORK_LIMIT)
        .get(),
      db.collection("cases")
        .where("packetFulfillmentStatus", "==", "fulfilling")
        .limit(FULFILLING_WORK_LIMIT)
        .get(),
      db.collection("cases")
        .where("packetFulfillmentNextAttemptAt", "<=", now)
        .limit(DUE_RETRY_WORK_LIMIT)
        .get(),
      // Transitional repair for retry_wait cases written before retryAt
      // existed. New retries are selected through the due-retry query above.
      db.collection("cases")
        .where("packetFulfillmentStatus", "==", "retry_wait")
        .limit(LEGACY_RETRY_WORK_LIMIT)
        .get(),
    ]);
    const candidate = (doc: FirebaseFirestore.QueryDocumentSnapshot) => ({
      id: doc.id,
      ownerUid: doc.get("ownerUid"),
      paid: doc.get("paid"),
      packet: doc.get("packet"),
      fulfillmentStatus: doc.get("packetFulfillmentStatus"),
      retryAtMillis: timestampMillis(doc.get("packetFulfillmentNextAttemptAt")),
      generationLeaseExpiresAtMillis: timestampMillis(
        (doc.get("generationLease") as { expiresAt?: unknown } | null)?.expiresAt,
      ),
    });
    const work = selectPacketFulfillmentWork({
      pending: pending.docs.map(candidate),
      fulfilling: fulfilling.docs.map(candidate),
      dueRetries: dueRetries.docs.map(candidate),
      legacyRetries: legacyRetries.docs.map(candidate),
      nowMillis: now.toMillis(),
    });
    for (const item of work) {
      const ownerUid = item.ownerUid;
      if (typeof ownerUid !== "string" || ownerUid.length === 0) continue;
      await fulfillCase(item.id, ownerUid);
    }
    console.log(`Packet fulfillment watchdog selected ${work.length}/${WATCHDOG_WORK_LIMIT} case(s).`);
  },
);
