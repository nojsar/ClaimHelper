import { randomUUID } from "node:crypto";
import {
  DocumentReference,
  FieldValue,
  Timestamp,
  getFirestore,
} from "firebase-admin/firestore";

/**
 * A short server-side lock around a model-backed case operation. It prevents
 * a refresh, double click, or retry from starting a second paid model request
 * while the first one is still in progress. The expiry is deliberately a bit
 * longer than the longest callable timeout, so a terminated invocation can be
 * recovered without leaving a case blocked indefinitely.
 */
export const GENERATION_LEASE_DURATION_MS = 6 * 60 * 1000;

export type GenerationOperation =
  | "extraction"
  | "preview"
  | "packet"
  | "followup";

export interface GenerationLease {
  operation: GenerationOperation;
  token: string;
  expiresAtMillis: number;
}

export type GenerationLeaseAcquireResult =
  | { kind: "acquired"; lease: GenerationLease }
  | { kind: "busy"; operation: GenerationOperation };

type StoredGenerationLease = GenerationLease;

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

/** Defensive parser for a lease read from Firestore. */
export function readGenerationLease(raw: unknown): StoredGenerationLease | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as {
    operation?: unknown;
    token?: unknown;
    expiresAt?: unknown;
  };
  const operation = candidate.operation;
  const validOperation =
    operation === "extraction" ||
    operation === "preview" ||
    operation === "packet" ||
    operation === "followup";
  const expiresAtMillis = timestampMillis(candidate.expiresAt);
  if (!validOperation || typeof candidate.token !== "string" || !candidate.token ||
      expiresAtMillis === null) {
    return null;
  }
  return { operation, token: candidate.token, expiresAtMillis };
}

/** Pure decision helper covered without needing a Firestore emulator. */
export function decideGenerationLease(args: {
  existing: StoredGenerationLease | null;
  requestedOperation: GenerationOperation;
  token: string;
  nowMillis: number;
}): GenerationLeaseAcquireResult {
  if (args.existing && args.existing.expiresAtMillis > args.nowMillis) {
    return { kind: "busy", operation: args.existing.operation };
  }
  return {
    kind: "acquired",
    lease: {
      operation: args.requestedOperation,
      token: args.token,
      expiresAtMillis: args.nowMillis + GENERATION_LEASE_DURATION_MS,
    },
  };
}

/** Atomically acquire a new lease or report the currently active operation. */
export async function acquireGenerationLease(
  caseRef: DocumentReference,
  operation: GenerationOperation,
  onAcquire: Record<string, unknown> = {},
): Promise<GenerationLeaseAcquireResult> {
  const db = getFirestore();
  const nowMillis = Date.now();
  const token = randomUUID();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(caseRef);
    if (!snap.exists) throw new Error("Case disappeared before generation started.");
    const decision = decideGenerationLease({
      existing: readGenerationLease(snap.get("generationLease")),
      requestedOperation: operation,
      token,
      nowMillis,
    });
    if (decision.kind === "busy") return decision;

    tx.update(caseRef, {
      ...onAcquire,
      generationLease: {
        operation: decision.lease.operation,
        token: decision.lease.token,
        acquiredAt: Timestamp.fromMillis(nowMillis),
        expiresAt: Timestamp.fromMillis(decision.lease.expiresAtMillis),
      },
    });
    return decision;
  });
}

/**
 * Commit a result or failure only if this invocation still owns the lease.
 * A stale request can never overwrite a recovery attempt that acquired a new
 * lease after the old invocation timed out.
 */
export async function finalizeGenerationLease(
  caseRef: DocumentReference,
  lease: GenerationLease,
  updates: Record<string, unknown>,
): Promise<boolean> {
  const db = getFirestore();
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(caseRef);
    const current = snap.exists
      ? readGenerationLease(snap.get("generationLease"))
      : null;
    if (!current || current.token !== lease.token || current.operation !== lease.operation) {
      return false;
    }
    tx.update(caseRef, {
      ...updates,
      generationLease: FieldValue.delete(),
    });
    return true;
  });
}

/** Release a failed lease while preserving a newer recovery lease, if any. */
export async function releaseGenerationLease(
  caseRef: DocumentReference,
  lease: GenerationLease,
  updates: Record<string, unknown> = {},
): Promise<boolean> {
  return finalizeGenerationLease(caseRef, lease, updates);
}
