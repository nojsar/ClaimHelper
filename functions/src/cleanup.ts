import { onSchedule } from "firebase-functions/v2/scheduler";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { caseStorageOwnerUids, deleteCaseCompletely } from "./cases";
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
          caseStorageOwnerUids(doc),
        );
        console.log(`Cleaned up expired case ${doc.id}`);
      } catch (err) {
        console.error(`Failed to clean up case ${doc.id}`, err);
      }
    }

    // Guest-case ownership authorizations are intentionally short-lived and
    // contain only an email digest. Consumed claims remain briefly as replay
    // tombstones, then are removed here as part of data minimization.
    const expiredClaims = await db
      .collection("guestCaseClaims")
      .where("expiresAt", "<=", now)
      .limit(200)
      .get();
    for (const doc of expiredClaims.docs) {
      try {
        await doc.ref.delete();
      } catch (err) {
        console.error(`Failed to delete guest-case claim ${doc.id}`, err);
      }
    }

    // Opted-in reminders: dispatch every reminder that has come due. Preview
    // nudges stop after purchase; post-submission response reminders instead
    // verify the tracker is still pending and still names this exact date.
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
        const kind = doc.get("kind") as string | undefined;
        const isResponseDue = kind === "case_response_due";
        const tracker = caseSnap.exists
          ? caseSnap.get("caseTracker") as
              | {
                  expectedResponseDate?: string | null;
                  responseReminderEnabled?: boolean;
                  outcome?: string;
                }
              | undefined
          : undefined;
        const responseReminderWanted =
          isResponseDue &&
          caseSnap.exists &&
          caseSnap.get("ownerUid") === doc.get("ownerUid") &&
          tracker?.responseReminderEnabled === true &&
          tracker?.outcome === "pending" &&
          tracker?.expectedResponseDate === doc.get("expectedResponseDate");
        const previewReminderWanted =
          !isResponseDue &&
          caseSnap.exists &&
          caseSnap.get("paid") !== true &&
          (caseSnap.get("reminderEmail") as string | undefined) ===
            (doc.get("email") as string);
        if (responseReminderWanted) {
          const caseUrl =
            `${config.appBaseUrl}/#/case/${doc.get("caseId")}/packet`;
          await db.collection("mail").add({
            to: [doc.get("email")],
            message: {
              subject: "Time to check your appeal status",
              text:
                "You expected an insurer response around today. Check your " +
                "portal or contact the insurer, save the result in your case " +
                `tracker, and use a follow-up round if needed.\n\n${caseUrl}\n\n` +
                "GetMyYes is a document drafting assistant — not medical, " +
                "legal, or insurance advice. Confirm deadlines directly with " +
                "your insurer.",
              html:
                "<p>You expected an insurer response around today. Check your " +
                "portal or contact the insurer, then save the result in your " +
                "case tracker.</p>" +
                `<p><a href="${caseUrl}" style="background:#1C160C;color:#F3EDDF;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Open case tracker</a></p>` +
                "<p style=\"color:#64748B;font-size:12px\">GetMyYes is a " +
                "document drafting assistant — not medical, legal, or " +
                "insurance advice. Confirm deadlines directly with your " +
                "insurer.</p>",
            },
            createdAt: FieldValue.serverTimestamp(),
          });
        } else if (previewReminderWanted) {
          const deadline = (doc.get("deadline") as Timestamp | null)?.toDate() ?? null;
          const insurer = (doc.get("insurer") as string | null) ?? null;
          const isDeadline = kind === "deadline";
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
