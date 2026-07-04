import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { runStructured } from "./openai/client";
import { packetSchema } from "./openai/schemas";
import { PACKET_SYSTEM_PROMPT, buildPacketUserPrompt } from "./openai/prompts";

/**
 * generateAppealPacket
 * Paid tier. Entitlement is enforced server-side: the case must be marked
 * paid by the Stripe webhook before generation runs. The packet is stored on
 * the case document; the client renders tabs and exports the PDF locally.
 */
export const generateAppealPacket = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300 },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);

    if (snap.get("paid") !== true) {
      throw new HttpsError(
        "permission-denied",
        "The full appeal packet is available after purchase.",
      );
    }
    const extraction = snap.get("extraction");
    if (!extraction) {
      throw new HttpsError("failed-precondition", "Extraction missing for this case.");
    }
    const guidedAnswers = snap.get("guidedAnswers") ?? {};

    // Idempotent: if a packet already exists, return it instead of paying
    // for another generation (e.g. user refreshed the success page).
    const existing = snap.get("packet");
    if (existing && request.data?.regenerate !== true) {
      return { packet: existing };
    }

    try {
      const packet = await runStructured<Record<string, unknown>>({
        systemPrompt: PACKET_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildPacketUserPrompt(
              JSON.stringify(extraction),
              JSON.stringify(guidedAnswers),
            ),
          },
        ],
        schemaName: "appeal_packet",
        schema: packetSchema as unknown as Record<string, unknown>,
      });

      await snap.ref.update({
        packet,
        status: "generated",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { packet };
    } catch (err) {
      await snap.ref.update({
        status: "error",
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
  await snap.ref.update({
    guidedAnswers: answers,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { saved: true };
});
