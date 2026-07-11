import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { config } from "./config";
import { requireUid, requireOwnedCase } from "./util";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * saveReminderEmail
 * Opt-in deadline reminders for an unpaid case. Stores the email on the case
 * (consent timestamped), sends the preview recap immediately, and schedules
 * follow-up reminders in the `reminders` collection, dispatched by the
 * hourly cleanup job. Reminder docs deliberately carry only minimal snapshot
 * fields (no clinical detail) so they stay harmless after case cleanup.
 */
export const saveReminderEmail = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);

  const email = String(request.data?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new HttpsError("invalid-argument", "Enter a valid email address.");
  }

  const db = getFirestore();
  const now = Timestamp.now();

  await snap.ref.update({
    reminderEmail: email,
    reminderOptInAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const preview = snap.get("preview") as
    | { amountAtStake?: string | null; recommendedPacketType?: string }
    | undefined;
  const extraction = snap.get("extraction") as
    | { appealDeadline?: string | null; insurerName?: string | null }
    | undefined;

  const amount = preview?.amountAtStake ?? null;
  const insurer = extraction?.insurerName ?? null;
  const deadline = parseDeadline(extraction?.appealDeadline);
  const caseUrl = `${config.appBaseUrl}/#/case/${snap.id}/preview`;

  // Immediate recap so the case link is one click away when they come back.
  await db.collection("mail").add({
    to: [email],
    message: buildReminderMessage({
      subject: "Your GetMyYes appeal preview — saved for you",
      intro:
        `Here's your appeal case${insurer ? ` against ${insurer}` : ""}, ready to pick ` +
        "back up whenever you are.",
      amount,
      deadline,
      caseUrl,
    }),
    createdAt: FieldValue.serverTimestamp(),
  });

  // Scheduled nudges: +3 days, and 7 days before the appeal deadline when we
  // know it. Dispatched (and dropped if the case was paid or deleted) by the
  // hourly job in cleanup.ts.
  const batch = db.batch();
  const nudge = db.collection("reminders").doc();
  batch.set(nudge, {
    caseId: snap.id,
    ownerUid: uid,
    email,
    sendAt: Timestamp.fromMillis(now.toMillis() + 3 * 24 * 3600 * 1000),
    kind: "nudge",
    insurer,
    amount,
    deadline: deadline ? Timestamp.fromDate(deadline) : null,
    createdAt: now,
  });
  if (deadline) {
    const sevenDaysBefore = deadline.getTime() - 7 * 24 * 3600 * 1000;
    if (sevenDaysBefore > now.toMillis()) {
      const dl = db.collection("reminders").doc();
      batch.set(dl, {
        caseId: snap.id,
        ownerUid: uid,
        email,
        sendAt: Timestamp.fromMillis(sevenDaysBefore),
        kind: "deadline",
        insurer,
        amount,
        deadline: Timestamp.fromDate(deadline),
        createdAt: now,
      });
    }
  }
  await batch.commit();

  return { saved: true };
});

function parseDeadline(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildReminderMessage(args: {
  subject: string;
  intro: string;
  amount: string | null;
  deadline: Date | null;
  caseUrl: string;
}): { subject: string; text: string; html: string } {
  const { subject, intro, amount, deadline, caseUrl } = args;
  const deadlineStr = deadline
    ? deadline.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const facts = [
    amount ? `At stake: ${amount}` : null,
    deadlineStr ? `Appeal deadline: ${deadlineStr}` : null,
  ].filter(Boolean);

  const optOut =
    "You're getting this because you asked for deadline reminders on this case. " +
    "To stop them, delete the case (or your account) in Settings, or reply STOP.";
  const disclaimer =
    "GetMyYes is a document drafting assistant — not medical, legal, or " +
    "insurance advice. Always confirm deadlines with your insurer.";

  return {
    subject,
    text:
      `${intro}\n\n${facts.join("\n")}\n\nOpen your case: ${caseUrl}\n\n` +
      `${optOut}\n\n${disclaimer}`,
    html:
      `<p>${intro}</p>` +
      (facts.length
        ? `<p>${facts.map((f) => `<strong>${f}</strong>`).join("<br>")}</p>`
        : "") +
      `<p><a href="${caseUrl}" style="background:#1C160C;color:#F3EDDF;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:700">Open my case</a></p>` +
      `<p style="color:#64748B;font-size:12px">${optOut}</p>` +
      `<p style="color:#64748B;font-size:12px">${disclaimer}</p>`,
  };
}
