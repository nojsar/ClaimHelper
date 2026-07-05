import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { deleteCaseCompletely } from "./cases";

/**
 * scheduledCleanupExpiredFiles
 * Runs hourly. Deletes cases (doc + all Storage files) whose expiresAt has
 * passed. Paid or saved cases have expiresAt=null and are never touched.
 */
export const scheduledCleanupExpiredFiles = onSchedule(
  { schedule: "every 60 minutes", timeoutSeconds: 540 },
  async () => {
    const db = getFirestore();
    const now = Timestamp.now();
    const expired = await db
      .collection("cases")
      .where("expiresAt", "<=", now)
      .limit(100)
      .get();

    for (const doc of expired.docs) {
      try {
        await deleteCaseCompletely(
          doc.id,
          doc.get("ownerUid") as string | undefined,
        );
        console.log(`Cleaned up expired case ${doc.id}`);
      } catch (err) {
        console.error(`Failed to clean up case ${doc.id}`, err);
      }
    }
  },
);
