import { getFirestore, DocumentSnapshot } from "firebase-admin/firestore";
import { HttpsError, CallableRequest } from "firebase-functions/v2/https";

/** Every callable requires auth — anonymous Firebase Auth counts. */
export function requireUid(request: CallableRequest): string {
  const uid = request.auth?.uid;
  if (!uid) {
    throw new HttpsError(
      "unauthenticated",
      "Sign-in required (anonymous sessions are created automatically by the app).",
    );
  }
  return uid;
}

/** Load a case and verify the caller owns it. */
export async function requireOwnedCase(
  caseId: unknown,
  uid: string,
): Promise<DocumentSnapshot> {
  if (typeof caseId !== "string" || caseId.length === 0) {
    throw new HttpsError("invalid-argument", "caseId is required.");
  }
  const snap = await getFirestore().collection("cases").doc(caseId).get();
  if (!snap.exists) {
    throw new HttpsError("not-found", "Case not found.");
  }
  const ownerUid = snap.get("ownerUid");
  if (ownerUid !== uid) {
    throw new HttpsError("permission-denied", "You do not have access to this case.");
  }
  return snap;
}
