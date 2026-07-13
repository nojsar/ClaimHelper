import { createHash } from "crypto";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";

import { requireUid } from "./util";

const CLAIM_WINDOW_MS = 15 * 60 * 1000;
const CLAIM_TOMBSTONE_MS = 24 * 60 * 60 * 1000;

type PreparedClaim = {
  guestUid: string;
  targetEmailHash: string;
  targetUid?: string | null;
  expiresAtMillis: number;
};

export type CaseClaimDecision = "transfer" | "already-owned";

/** Firebase email identities are case-insensitive for this comparison. */
export function normalizeClaimEmail(value: unknown): string {
  if (typeof value !== "string") {
    throw new HttpsError("invalid-argument", "A valid account email is required.");
  }
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new HttpsError("invalid-argument", "A valid account email is required.");
  }
  return email;
}

export function claimEmailHash(email: string): string {
  return createHash("sha256").update(email, "utf8").digest("hex");
}

/**
 * Pure authorization decision used by the callable and focused unit tests.
 * No case moves unless the current owner prepared an unexpired claim for the
 * exact Firebase email that is now authenticated.
 */
export function decideCaseClaim(args: {
  caseOwnerUid: string;
  requestUid: string;
  requestEmailHash: string;
  preparedClaim?: PreparedClaim;
  nowMillis: number;
}): CaseClaimDecision {
  if (args.caseOwnerUid === args.requestUid) return "already-owned";

  const claim = args.preparedClaim;
  if (!claim) {
    throw new HttpsError(
      "permission-denied",
      "No guest-case transfer was prepared for this account.",
    );
  }
  if (claim.targetEmailHash !== args.requestEmailHash) {
    throw new HttpsError(
      "permission-denied",
      "This case was prepared for a different account.",
    );
  }
  if (claim.targetUid && claim.targetUid !== args.requestUid) {
    throw new HttpsError(
      "permission-denied",
      "This guest-case transfer has already been claimed.",
    );
  }
  if (claim.expiresAtMillis <= args.nowMillis) {
    throw new HttpsError(
      "deadline-exceeded",
      "The guest-case transfer expired. Please try signing in again.",
    );
  }
  if (args.caseOwnerUid !== claim.guestUid) {
    throw new HttpsError(
      "failed-precondition",
      "The case owner changed before the transfer completed.",
    );
  }
  return "transfer";
}

/**
 * Called while the browser still holds the anonymous Firebase identity.
 * The authorization contains only a SHA-256 email digest and expires quickly;
 * clients cannot read or write the backing collection through Firestore rules.
 */
export const prepareGuestCaseClaim = onCall(
  { invoker: "public" },
  async (request) => {
    const guestUid = requireUid(request);
    if (request.auth?.token.firebase.sign_in_provider !== "anonymous") {
      throw new HttpsError(
        "failed-precondition",
        "Guest-case transfer must be prepared before signing in.",
      );
    }
    const caseId = request.data?.caseId;
    if (typeof caseId !== "string" || caseId.length === 0) {
      throw new HttpsError("invalid-argument", "caseId is required.");
    }
    const targetEmail = normalizeClaimEmail(request.data?.targetEmail);
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const claimRef = db.collection("guestCaseClaims").doc(caseId);
    const now = Timestamp.now();
    const expiresAt = Timestamp.fromMillis(now.toMillis() + CLAIM_WINDOW_MS);

    await db.runTransaction(async (tx) => {
      const caseSnap = await tx.get(caseRef);
      if (!caseSnap.exists) {
        throw new HttpsError("not-found", "Case not found.");
      }
      if (caseSnap.get("ownerUid") !== guestUid) {
        throw new HttpsError(
          "permission-denied",
          "You do not have access to this case.",
        );
      }
      tx.set(claimRef, {
        caseId,
        guestUid,
        targetEmailHash: claimEmailHash(targetEmail),
        targetUid: null,
        createdAt: now,
        consumedAt: null,
        expiresAt,
      });
    });

    return { prepared: true, expiresAt: expiresAt.toDate().toISOString() };
  },
);

async function moveGuestSourceFiles(
  caseId: string,
  guestUid: string,
  targetUid: string,
): Promise<void> {
  if (guestUid === targetUid) return;
  const db = getFirestore();
  const caseRef = db.collection("cases").doc(caseId);
  const caseSnap = await caseRef.get();
  if (!caseSnap.exists || caseSnap.get("ownerUid") !== targetUid) {
    throw new HttpsError(
      "failed-precondition",
      "Case ownership changed while its source files were being secured.",
    );
  }

  const oldPrefix = `tempCases/${guestUid}/${caseId}/`;
  const newPrefix = `tempCases/${targetUid}/${caseId}/`;
  const paths = (caseSnap.get("sourceFilePaths") as unknown[] | undefined) ?? [];
  const oldPaths = paths.filter(
    (path): path is string => typeof path === "string" && path.startsWith(oldPrefix),
  );
  const bucket = getStorage().bucket();
  const replacements = new Map<string, string>();

  for (const oldPath of oldPaths) {
    const newPath = `${newPrefix}${oldPath.slice(oldPrefix.length)}`;
    await bucket.file(oldPath).copy(bucket.file(newPath));
    replacements.set(oldPath, newPath);
  }

  if (replacements.size > 0) {
    await db.runTransaction(async (tx) => {
      const fresh = await tx.get(caseRef);
      if (!fresh.exists || fresh.get("ownerUid") !== targetUid) {
        throw new HttpsError(
          "failed-precondition",
          "Case ownership changed while its source files were being secured.",
        );
      }
      const freshPaths =
        (fresh.get("sourceFilePaths") as unknown[] | undefined) ?? [];
      tx.update(caseRef, {
        sourceFilePaths: freshPaths.map((path) =>
          typeof path === "string" ? (replacements.get(path) ?? path) : path,
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }

  // Idempotent: retries see no old paths, and deleting an empty prefix is safe.
  await bucket.deleteFiles({ prefix: oldPrefix, force: true });
}

async function reassignCaseReminders(
  caseId: string,
  guestUid: string,
  targetUid: string,
): Promise<void> {
  const db = getFirestore();
  const reminders = await db
    .collection("reminders")
    .where("caseId", "==", caseId)
    .get();
  if (reminders.empty) return;
  const batch = db.batch();
  for (const reminder of reminders.docs) {
    if (reminder.get("ownerUid") === guestUid) {
      batch.update(reminder.ref, { ownerUid: targetUid });
    }
  }
  await batch.commit();
}

/**
 * Called after Firebase authenticates the existing account. The transaction
 * is replay-safe: retries by the same account succeed, while another account
 * can never consume or replay the prepared authorization.
 */
export const claimPreparedGuestCase = onCall(
  { invoker: "public", timeoutSeconds: 120 },
  async (request) => {
    const targetUid = requireUid(request);
    if (request.auth?.token.firebase.sign_in_provider === "anonymous") {
      throw new HttpsError(
        "failed-precondition",
        "Sign in to the destination account before claiming this case.",
      );
    }
    const caseId = request.data?.caseId;
    if (typeof caseId !== "string" || caseId.length === 0) {
      throw new HttpsError("invalid-argument", "caseId is required.");
    }
    const targetEmail = normalizeClaimEmail(request.auth?.token.email);
    const targetEmailHash = claimEmailHash(targetEmail);
    const db = getFirestore();
    const caseRef = db.collection("cases").doc(caseId);
    const claimRef = db.collection("guestCaseClaims").doc(caseId);
    const userRef = db.collection("users").doc(targetUid);
    const now = Timestamp.now();

    const result = await db.runTransaction(async (tx) => {
      const [caseSnap, claimSnap] = await Promise.all([
        tx.get(caseRef),
        tx.get(claimRef),
      ]);
      if (!caseSnap.exists) {
        throw new HttpsError("not-found", "Case not found.");
      }
      const claim = claimSnap.exists
        ? {
            guestUid: claimSnap.get("guestUid") as string,
            targetEmailHash: claimSnap.get("targetEmailHash") as string,
            targetUid: claimSnap.get("targetUid") as string | null,
            expiresAtMillis: (claimSnap.get("expiresAt") as Timestamp).toMillis(),
          }
        : undefined;
      const decision = decideCaseClaim({
        caseOwnerUid: caseSnap.get("ownerUid") as string,
        requestUid: targetUid,
        requestEmailHash: targetEmailHash,
        preparedClaim: claim,
        nowMillis: now.toMillis(),
      });
      const historicStorageOwners =
        (caseSnap.get("storageOwnerUids") as unknown[] | undefined) ?? [];
      const historicGuestUid = historicStorageOwners.find(
        (value): value is string =>
          typeof value === "string" && value.length > 0 && value !== targetUid,
      );
      const guestUid = claim?.guestUid ?? historicGuestUid ?? targetUid;

      if (decision === "transfer") {
        tx.update(caseRef, {
          ownerUid: targetUid,
          guestSessionId: null,
          storageOwnerUids: FieldValue.arrayUnion(guestUid, targetUid),
          ownershipTransferredAt: now,
          updatedAt: FieldValue.serverTimestamp(),
        });
        tx.update(claimRef, {
          targetUid,
          consumedAt: now,
          // Retain a short tombstone so retries are deterministic, then the
          // hourly cleanup removes it.
          expiresAt: Timestamp.fromMillis(now.toMillis() + CLAIM_TOMBSTONE_MS),
        });
      }
      tx.set(
        userRef,
        { email: targetEmail, updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      return { guestUid, transferred: decision === "transfer" };
    });

    // Storage is not transactional with Firestore. These operations are
    // deliberately idempotent and execute on every replay, so a transient
    // copy/delete failure is repaired by the user's next attempt.
    await moveGuestSourceFiles(caseId, result.guestUid, targetUid);
    await reassignCaseReminders(caseId, result.guestUid, targetUid);

    return { claimed: true, transferred: result.transferred };
  },
);
