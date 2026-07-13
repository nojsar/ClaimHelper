import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { runStructured } from "./openai/client";
import { packetSchema } from "./openai/schemas";
import { PACKET_SYSTEM_PROMPT, buildPacketUserPrompt } from "./openai/prompts";
import {
  modelAnalyticsErrorCategory,
  recordFirstCaseAnalyticsError,
  recordFirstCaseAnalyticsEvent,
} from "./analytics";

/**
 * generateAppealPacket
 * Paid tier. Entitlement is enforced server-side: the case must be marked
 * paid by the Stripe webhook before generation runs. The packet is stored on
 * the case document; the client renders tabs and exports the PDF locally.
 */
export const generateAppealPacket = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300, invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);

    if (snap.get("paid") !== true) {
      await recordFirstCaseAnalyticsError(
        uid,
        snap.ref,
        "packet",
        "missing_prerequisite",
      );
      throw new HttpsError(
        "permission-denied",
        "The full appeal packet is available after purchase.",
      );
    }
    const extraction = snap.get("extraction");
    if (!extraction) {
      await recordFirstCaseAnalyticsError(
        uid,
        snap.ref,
        "packet",
        "missing_prerequisite",
      );
      throw new HttpsError("failed-precondition", "Extraction missing for this case.");
    }
    const guidedAnswers = snap.get("guidedAnswers") ?? {};

    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "packet_started");

    // Idempotent: if a packet already exists, return it instead of paying
    // for another generation (e.g. user refreshed the success page).
    const existing = snap.get("packet");
    if (existing && request.data?.regenerate !== true) {
      await recordFirstCaseAnalyticsEvent(uid, snap.ref, "packet_completed");
      return { packet: existing };
    }

    // Staged progress written to the case doc so the client can render a real
    // progress bar while the model works. The ticker advances through labeled
    // stages and parks at the cap until the model returns.
    const stages: Array<{ p: number; label: string }> = [
      { p: 0.06, label: "Confirming your purchase" },
      { p: 0.14, label: "Re-reading your denial letter" },
      { p: 0.24, label: "Analyzing the insurer's denial reason" },
      { p: 0.34, label: "Mapping your strongest appeal arguments" },
      { p: 0.46, label: "Drafting your appeal letter" },
      { p: 0.58, label: "Building your evidence checklist" },
      { p: 0.68, label: "Writing the doctor letter request" },
      { p: 0.76, label: "Preparing your insurer call script" },
      { p: 0.83, label: "Double-checking deadlines" },
    ];
    let stageIdx = 0;
    let lastWrite: Promise<unknown> = Promise.resolve();
    const writeProgress = (p: number, label: string) => {
      lastWrite = snap.ref
        .update({
          generation: {
            progress: p,
            stage: label,
            updatedAt: FieldValue.serverTimestamp(),
          },
        })
        .catch(() => undefined);
      return lastWrite;
    };
    await writeProgress(stages[0].p, stages[0].label);
    const ticker = setInterval(() => {
      if (stageIdx < stages.length - 1) {
        stageIdx += 1;
        void writeProgress(stages[stageIdx].p, stages[stageIdx].label);
      }
    }, 6000);

    let modelReturned = false;
    try {
      const packet = await runStructured<Record<string, unknown>>({
        systemPrompt: PACKET_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildPacketUserPrompt(
              JSON.stringify(extraction),
              JSON.stringify(guidedAnswers),
              (snap.get("userAdditions") as string | undefined) ?? null,
            ),
          },
        ],
        schemaName: "appeal_packet",
        schema: packetSchema as unknown as Record<string, unknown>,
      });
      modelReturned = true;

      clearInterval(ticker);
      await lastWrite;
      await writeProgress(0.94, "Formatting your packet");
      await snap.ref.update({
        packet,
        status: "generated",
        generation: {
          progress: 1,
          stage: "Ready",
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      });
      await recordFirstCaseAnalyticsEvent(uid, snap.ref, "packet_completed");
      return { packet };
    } catch (err) {
      clearInterval(ticker);
      await lastWrite;
      if (!modelReturned) {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "packet",
          modelAnalyticsErrorCategory(err),
        );
      }
      await snap.ref.update({
        status: "error",
        generation: null,
        lastError: err instanceof Error ? err.message : "Packet generation failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError(
        "internal",
        "Packet generation failed. Your purchase is safe — please retry.",
      );
    }
  },
);

/**
 * saveGuidedAnswers
 * Persists the guided-question answers before preview/packet generation.
 * Kept as a callable (rather than a raw client write) so validation lives
 * in one place.
 */
export const saveGuidedAnswers = onCall(async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);
  const answers = request.data?.guidedAnswers;
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    throw new HttpsError("invalid-argument", "guidedAnswers must be an object.");
  }
  const update: Record<string, unknown> = {
    guidedAnswers: answers,
    updatedAt: FieldValue.serverTimestamp(),
  };
  // A return visit to the questions screen must not keep showing a preview
  // generated from older answers. Paid cases keep their completed artifacts.
  if (snap.get("paid") !== true) {
    update.preview = null;
    update.status = "extracted";
  }
  await snap.ref.update(update);
  return { saved: true };
});
