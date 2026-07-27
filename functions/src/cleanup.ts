import { onSchedule } from "firebase-functions/v2/scheduler";
import {
  DocumentData,
  FieldValue,
  getFirestore,
  Query,
  QueryDocumentSnapshot,
  Timestamp,
} from "firebase-admin/firestore";
import { caseStorageOwnerUids, deleteCaseCompletely } from "./cases";
import { responseReminderIsPending } from "./case_tracker";
import { buildReminderMessage, buildReviewInviteMessage } from "./reminders";
import { config } from "./config";

const CLEANUP_DEADLINE_MS = 8 * 60 * 1000;

/**
 * Drain more than one query page while retaining a hard work/time ceiling.
 * A failed document does not pin the next page because the cursor always
 * advances to the last snapshot returned by Firestore.
 */
export async function forEachCleanupPage(
  baseQuery: Query<DocumentData>,
  pageSize: number,
  maxDocuments: number,
  deadlineMillis: number,
  handler: (doc: QueryDocumentSnapshot<DocumentData>) => Promise<void>,
): Promise<{ processed: number; capped: boolean }> {
  let processed = 0;
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;

  while (processed < maxDocuments && Date.now() < deadlineMillis) {
    let query = baseQuery.limit(Math.min(pageSize, maxDocuments - processed));
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    if (page.empty) return { processed, capped: false };
    for (const doc of page.docs) {
      await handler(doc);
      processed += 1;
      if (processed >= maxDocuments || Date.now() >= deadlineMillis) break;
    }
    cursor = page.docs[page.docs.length - 1];
    if (processed >= maxDocuments || Date.now() >= deadlineMillis) {
      return { processed, capped: true };
    }
    if (page.size < pageSize) return { processed, capped: false };
  }
  return { processed, capped: true };
}

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
    const globalDeadline = Date.now() + CLEANUP_DEADLINE_MS;
    const sectionDeadline = (budgetMs: number) =>
      Math.min(globalDeadline, Date.now() + budgetMs);
    const expired = await forEachCleanupPage(
      db.collection("cases").where("expiresAt", "<=", now),
      100,
      1_000,
      sectionDeadline(120_000),
      async (doc) => {
        try {
          await deleteCaseCompletely(doc.id, caseStorageOwnerUids(doc));
        } catch {
          console.warn("One expired case cleanup failed; continuing.");
        }
      },
    );
    console.log(
      `Expired case cleanup processed ${expired.processed}` +
        (expired.capped ? " (bounded backlog remains)" : ""),
    );

    // Guest-case ownership authorizations are intentionally short-lived and
    // contain only an email digest. Consumed claims remain briefly as replay
    // tombstones, then are removed here as part of data minimization.
    const expiredClaims = await forEachCleanupPage(
      db.collection("guestCaseClaims").where("expiresAt", "<=", now),
      200,
      2_000,
      sectionDeadline(60_000),
      async (doc) => {
        try {
          await doc.ref.delete();
        } catch {
          console.warn("One expired guest-case claim cleanup failed; continuing.");
        }
      },
    );
    console.log(
      `Guest-claim cleanup processed ${expiredClaims.processed}` +
        (expiredClaims.capped ? " (bounded backlog remains)" : ""),
    );

    // Opted-in reminders: dispatch every reminder that has come due. Preview
    // nudges stop after purchase; post-submission response reminders instead
    // verify the tracker is still pending and still names this exact date.
    const due = await forEachCleanupPage(
      db.collection("reminders").where("sendAt", "<=", now),
      100,
      1_000,
      sectionDeadline(180_000),
      async (doc) => {
        try {
        const caseSnap = await db
          .collection("cases")
          .doc(doc.get("caseId") as string)
          .get();
        const kind = doc.get("kind") as string | undefined;
        const isResponseDue = kind === "case_response_due";
        const isFeedbackRequest = kind === "feedback_request";
        const isReviewInvite = kind === "review_invite";
        const tracker = caseSnap.exists
          ? caseSnap.get("caseTracker") as
              | {
                  expectedResponseDate?: string | null;
                  responseDate?: string | null;
                  responseReminderEnabled?: boolean;
                  responseStatus?: string;
                  outcome?: string;
                }
              | undefined
          : undefined;
        const responseReminderWanted =
          isResponseDue &&
          caseSnap.exists &&
          caseSnap.get("ownerUid") === doc.get("ownerUid") &&
          responseReminderIsPending(tracker) &&
          tracker?.expectedResponseDate === doc.get("expectedResponseDate");
        const previewReminderWanted =
          !isResponseDue &&
          caseSnap.exists &&
          caseSnap.get("paid") !== true &&
          (caseSnap.get("reminderEmail") as string | undefined) ===
            (doc.get("email") as string);
        const feedbackRequestWanted =
          isFeedbackRequest &&
          caseSnap.exists &&
          caseSnap.get("ownerUid") === doc.get("ownerUid") &&
          caseSnap.get("paid") === true &&
          caseSnap.get("feedback") === undefined;
        // Deliberately blind to outcome, tracker state, and in-app feedback:
        // a customer who told us the appeal failed is invited on exactly the
        // same terms as one who told us nothing. Filtering by sentiment here
        // would be review gating. A refund clears `paid` and so cancels this.
        const reviewInviteWanted =
          isReviewInvite &&
          caseSnap.exists &&
          caseSnap.get("ownerUid") === doc.get("ownerUid") &&
          caseSnap.get("paid") === true &&
          config.trustpilotInviteEmail !== "";
        if (responseReminderWanted) {
          const caseUrl =
            `${config.appBaseUrl}/#/case/${doc.get("caseId")}/packet`;
          await db.collection("mail").add({
            caseId: doc.get("caseId"),
            ownerUid: doc.get("ownerUid"),
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
        } else if (feedbackRequestWanted) {
          const feedbackUrl =
            `${config.appBaseUrl}/#/case/${doc.get("caseId")}/packet?tab=feedback`;
          // Claim and enqueue in one transaction. If an in-app response wins
          // the race, its feedback write makes this transaction retry and the
          // reminder is cancelled rather than emailed.
          await db.runTransaction(async (transaction) => {
            const [currentReminder, currentCase] = await Promise.all([
              transaction.get(doc.ref),
              transaction.get(caseSnap.ref),
            ]);
            if (!currentReminder.exists ||
                !currentCase.exists ||
                currentCase.get("ownerUid") !== doc.get("ownerUid") ||
                currentCase.get("paid") !== true ||
                currentCase.get("feedback") !== undefined) {
              if (currentReminder.exists) transaction.delete(doc.ref);
              return;
            }
            transaction.create(db.collection("mail").doc(), {
              caseId: doc.get("caseId"),
              ownerUid: doc.get("ownerUid"),
              to: [doc.get("email")],
              message: {
                subject: "How was your GetMyYes packet?",
                text:
                  "It has been about two weeks since your purchase. If you have a " +
                  "moment, share a fixed-choice product rating and your current appeal " +
                  `status. We do not ask for medical or insurance details.\n\n${feedbackUrl}\n\n` +
                  "This is a one-time product-feedback request, not marketing. Nothing " +
                  "is published automatically.",
                html:
                  "<p>It has been about two weeks since your purchase. If you have a " +
                  "moment, share a fixed-choice product rating and your current appeal " +
                  "status. We do not ask for medical or insurance details.</p>" +
                  `<p><a href="${feedbackUrl}" style="background:#1C160C;color:#F3EDDF;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Leave private feedback</a></p>` +
                  "<p style=\"color:#64748B;font-size:12px\">This is a one-time product-feedback request, not marketing. Nothing is published automatically.</p>",
              },
              createdAt: FieldValue.serverTimestamp(),
            });
            transaction.delete(doc.ref);
          });
        } else if (reviewInviteWanted) {
          await db.collection("mail").add({
            caseId: doc.get("caseId"),
            ownerUid: doc.get("ownerUid"),
            to: [doc.get("email")],
            // Trustpilot builds its invitation from this blind copy, so it
            // receives the address and this body — and nothing else. The
            // message is intentionally free of case facts.
            bcc: [config.trustpilotInviteEmail],
            message: buildReviewInviteMessage({
              caseUrl: `${config.appBaseUrl}/#/case/${doc.get("caseId")}/packet`,
            }),
            createdAt: FieldValue.serverTimestamp(),
          });
        } else if (previewReminderWanted) {
          const deadline = (doc.get("deadline") as Timestamp | null)?.toDate() ?? null;
          const insurer = (doc.get("insurer") as string | null) ?? null;
          const isDeadline = kind === "deadline";
          await db.collection("mail").add({
            caseId: doc.get("caseId"),
            ownerUid: doc.get("ownerUid"),
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
        } catch {
          console.warn("One due reminder dispatch failed; continuing.");
        }
      },
    );
    console.log(
      `Reminder cleanup processed ${due.processed}` +
        (due.capped ? " (bounded backlog remains)" : ""),
    );

    // Data minimization: queued transactional emails contain the buyer's
    // address and are only needed while the Trigger Email extension delivers
    // them — purge queue docs older than 30 days.
    const mailCutoff = Timestamp.fromMillis(
      now.toMillis() - 30 * 24 * 3600 * 1000,
    );
    const staleMail = await forEachCleanupPage(
      db.collection("mail").where("createdAt", "<=", mailCutoff),
      200,
      2_000,
      sectionDeadline(60_000),
      async (doc) => {
        try {
          await doc.ref.delete();
        } catch {
          console.warn("One stale mail cleanup failed; continuing.");
        }
      },
    );
    console.log(
      `Mail cleanup processed ${staleMail.processed}` +
        (staleMail.capped ? " (bounded backlog remains)" : ""),
    );
  },
);
