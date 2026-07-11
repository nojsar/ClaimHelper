import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { deleteCaseCompletely } from "./cases";
import { buildReminderMessage } from "./reminders";
import { config } from "./config";

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

    // Opted-in deadline reminders: dispatch every reminder that has come due.
    // A reminder is dropped without sending when its case was paid (nothing
    // to nudge) or the user withdrew (case deleted / email cleared).
    const due = await db
      .collection("reminders")
      .where("sendAt", "<=", now)
      .limit(100)
      .get();
    for (const doc of due.docs) {
      try {
        const caseSnap = await db
          .collection("cases")
          .doc(doc.get("caseId") as string)
          .get();
        const stillWanted =
          caseSnap.exists &&
          caseSnap.get("paid") !== true &&
          (caseSnap.get("reminderEmail") as string | undefined) ===
            (doc.get("email") as string);
        if (stillWanted) {
          const deadline = (doc.get("deadline") as Timestamp | null)?.toDate() ?? null;
          const insurer = (doc.get("insurer") as string | null) ?? null;
          const isDeadline = doc.get("kind") === "deadline";
          await db.collection("mail").add({
            to: [doc.get("email")],
            message: buildReminderMessage({
              subject: isDeadline
                ? "Your appeal deadline is about a week away"
                : "Your appeal packet is still ready to finish",
              intro: isDeadline
                ? `The appeal window for your case${insurer ? ` with ${insurer}` : ""} is closing soon — filing on time keeps every option open.`
                : `Your denial preview${insurer ? ` for ${insurer}` : ""} is still saved. Most people finish their packet in about 15 minutes.`,
              amount: (doc.get("amount") as string | null) ?? null,
              deadline,
              caseUrl: `${config.appBaseUrl}/#/case/${doc.get("caseId")}/preview`,
            }),
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        await doc.ref.delete();
      } catch (err) {
        console.error(`Failed to dispatch reminder ${doc.id}`, err);
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
