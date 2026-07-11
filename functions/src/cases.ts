import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { randomUUID } from "crypto";
import { config } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { bumpDaily } from "./analytics";

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

  await getFirestore().collection("cases").doc(caseId).set({
    ownerUid: uid,
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
  await bumpDaily({ "funnel.upload": 1 });

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
  await deleteCaseCompletely(snap.id, uid);
  return { deleted: true };
});

export async function deleteCaseCompletely(
  caseId: string,
  ownerUid?: string,
): Promise<void> {
  const bucket = getStorage().bucket();
  if (ownerUid) {
    await bucket.deleteFiles({ prefix: `tempCases/${ownerUid}/${caseId}/` });
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
export const deleteAccount = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const db = getFirestore();

  const owned = await db.collection("cases").where("ownerUid", "==", uid).get();
  for (const doc of owned.docs) {
    await deleteCaseCompletely(doc.id, uid);
  }

  await db.collection("users").doc(uid).delete();
  await db.collection("rateLimits").doc(`preview_${uid}`).delete();
  await getAuth().deleteUser(uid);
  return { deleted: true };
});

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
