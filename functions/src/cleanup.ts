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

    // Data minimization: queued transactional emails contain the buyer's
    // address and are only needed while the Trigger Email extension delivers
    // them — purge queue docs older than 30 days.
    const mailCutoff = Timestamp.fromMillis(
      now.toMillis() - 30 * 24 * 3600 * 1000,
    );
    const staleMail = await db
      .collection("mail")
      .where("createdAt", "<=", mailCutoff)
      .limit(200)
      .get();
    for (const doc of staleMail.docs) {
      try {
        await doc.ref.delete();
      } catch (err) {
        console.error(`Failed to delete mail doc ${doc.id}`, err);
      }
    }
  },
);
