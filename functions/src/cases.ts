import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import {
  DocumentSnapshot,
  getFirestore,
  FieldValue,
  Timestamp,
} from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "crypto";
import { config } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { recordFirstCaseAnalyticsEvent } from "./analytics";

const ACCOUNT_DELETION_PAGE_SIZE = 5;

export type OwnedCaseDeletionTarget = {
  id: string;
  storageOwnerUids: string[];
};

/**
 * Re-query a small page after every successful batch instead of loading an
 * account's entire case history into memory. If one deletion fails, the
 * callable stops before deleting Auth; a retry safely resumes from whatever
 * cases remain.
 */
export async function deleteOwnedCasePages(
  loadPage: (limit: number) => Promise<OwnedCaseDeletionTarget[]>,
  deleteOne: (target: OwnedCaseDeletionTarget) => Promise<void>,
  pageSize = ACCOUNT_DELETION_PAGE_SIZE,
): Promise<number> {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error("pageSize must be a positive integer.");
  }

  let deleted = 0;
  while (true) {
    const page = await loadPage(pageSize);
    if (page.length === 0) return deleted;
    await Promise.all(page.map(deleteOne));
    deleted += page.length;
  }
}

/**
 * createCaseUploadSession
 * Creates the case document and returns the Storage path prefix the client
 * may upload source files to. Files land in tempCases/{caseId}/source/ and
 * expire after 24h unless the case is saved or paid.
 */
export const createCaseUploadSession = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const consentConfirmed = request.data?.consentConfirmed === true;
  if (!consentConfirmed) {
    throw new HttpsError(
      "failed-precondition",
      "Consent to AI processing of sensitive documents is required before upload.",
    );
  }

  const caseId = randomUUID();
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + config.tempFileTtlHours * 3600 * 1000,
  );

  const caseRef = getFirestore().collection("cases").doc(caseId);
  await caseRef.set({
    ownerUid: uid,
    storageOwnerUids: [uid],
    guestSessionId: request.auth?.token.firebase.sign_in_provider === "anonymous" ? uid : null,
    status: "uploaded",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    saved: false,
    sourceFilePaths: [],
    extraction: null,
    guidedAnswers: null,
    preview: null,
    packet: null,
    paid: false,
    pricePaid: null,
    stripeSessionId: null,
    consentConfirmedAt: now,
  });

  // Aggregate funnel counter only — nothing about the case or user is logged.
  // The centralized writer refuses owner events.
  await recordFirstCaseAnalyticsEvent(uid, caseRef, "uploaded");

  return {
    caseId,
    // uid-scoped so the Storage rule can verify ownership from the path alone
    // (no fragile cross-service firestore.get()).
    uploadPathPrefix: `tempCases/${uid}/${caseId}/source/`,
    expiresAt: expiresAt.toDate().toISOString(),
  };
});

/**
 * deleteCaseAndFiles
 * Hard-deletes the Firestore case document and every file under both its
 * temp and permanent Storage prefixes. Powers the "Delete case and files"
 * button and the settings-page "delete all data" action.
 */
export const deleteCaseAndFiles = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);
  await deleteCaseCompletely(snap.id, caseStorageOwnerUids(snap));
  return { deleted: true };
});

/** Includes historic uid-scoped prefixes left by a secure account transfer. */
export function caseStorageOwnerUids(snap: DocumentSnapshot): string[] {
  const stored = (snap.get("storageOwnerUids") as unknown[] | undefined) ?? [];
  const candidates = [
    ...stored,
    snap.get("ownerUid"),
    snap.get("guestSessionId"),
  ];
  return [...new Set(candidates.filter(
    (value): value is string => typeof value === "string" && value.length > 0,
  ))];
}

export async function deleteCaseCompletely(
  caseId: string,
  ownerUids?: string | string[],
): Promise<void> {
  const bucket = getStorage().bucket();
  const scopedOwners = typeof ownerUids === "string" ? [ownerUids] : ownerUids ?? [];
  for (const ownerUid of new Set(scopedOwners)) {
    await bucket.deleteFiles({
      prefix: `tempCases/${ownerUid}/${caseId}/`,
      force: true,
    });
  }
  // Legacy (pre uid-scoping) path — harmless if nothing matches.
  await bucket.deleteFiles({ prefix: `tempCases/${caseId}/` });
  await bucket.deleteFiles({ prefix: `cases/${caseId}/` });
  const db = getFirestore();
  // Withdrawing the case withdraws its reminders too.
  const reminders = await db
    .collection("reminders")
    .where("caseId", "==", caseId)
    .get();
  for (const doc of reminders.docs) {
    await doc.ref.delete();
  }
  // The Trigger Email extension may not have delivered a queued transactional
  // message yet. Remove new case-tagged queue entries along with the case so
  // deletion and account erasure do not leave a delayed email behind.
  const queuedMail = await db
    .collection("mail")
    .where("caseId", "==", caseId)
    .get();
  for (const doc of queuedMail.docs) {
    await doc.ref.delete();
  }
  await db.collection("cases").doc(caseId).delete();
}

/**
 * deleteAccount
 * GDPR right-to-erasure: hard-deletes every case (docs + files) owned by the
 * caller, their profile doc and rate-limit bookkeeping, and finally the
 * Firebase Auth user itself. Purchase records in `purchases` are retained —
 * they are accounting/tax records we are legally required to keep
 * (GDPR art. 17(3)(b)); they hold no uploaded documents.
 */
export const deleteAccount = onCall(
  { invoker: "public", timeoutSeconds: 540 },
  async (request) => {
    const uid = requireUid(request);
    const db = getFirestore();

    await deleteOwnedCasePages(
      async (limit) => {
        const owned = await db
          .collection("cases")
          .where("ownerUid", "==", uid)
          .limit(limit)
          .get();
        return owned.docs.map((doc) => ({
          id: doc.id,
          storageOwnerUids: caseStorageOwnerUids(doc),
        }));
      },
      (target) => deleteCaseCompletely(target.id, target.storageOwnerUids),
    );

    await db.collection("users").doc(uid).delete();
    await db.collection("rateLimits").doc(`preview_${uid}`).delete();
    await getAuth().deleteUser(uid);
    return { deleted: true };
  },
);

/**
 * saveCase — marks a case as saved so cleanup will not remove it.
 * Requires a non-anonymous account per product policy; the client links
 * anonymous auth to email first, so we verify the token is not anonymous.
 */
export const saveCase = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);
  const provider = request.auth?.token.firebase.sign_in_provider;
  if (provider === "anonymous") {
    throw new HttpsError(
      "failed-precondition",
      "Create an account to save this case.",
    );
  }
  await snap.ref.update({
    saved: true,
    expiresAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { saved: true };
});
