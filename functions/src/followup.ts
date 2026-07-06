import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { config, openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { runStructured } from "./openai/client";
import { followUpSchema } from "./openai/schemas";
import { FOLLOWUP_SYSTEM_PROMPT, buildFollowUpUserPrompt } from "./openai/prompts";

/**
 * generateFollowUp
 * Continues a paid case after the insurer responds (or doesn't). Every packet
 * purchase includes config.freeFollowUpRounds rounds; extra rounds come from
 * the $19 round purchase or the Full Case upgrade (capped, not unlimited).
 * One round is consumed per successful generation — the client warns the user
 * to include everything they have before submitting.
 */
export const generateFollowUp = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300, invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);

    if (snap.get("paid") !== true) {
      throw new HttpsError(
        "permission-denied",
        "Follow-up rounds are part of the paid appeal packet.",
      );
    }
    const outcome = String(request.data?.outcome ?? "").slice(0, 80).trim();
    const notes = String(request.data?.notes ?? "").slice(0, 20000).trim();
    if (!outcome || !notes) {
      throw new HttpsError(
        "invalid-argument",
        "Tell us what happened and include the details you have.",
      );
    }

    // Cases paid before this feature launched have no counter yet — they get
    // the standard included rounds.
    const credits =
      (snap.get("followUpCredits") as number | undefined) ??
      config.freeFollowUpRounds;
    if (credits <= 0) {
      throw new HttpsError(
        "resource-exhausted",
        "No follow-up rounds left on this case. Add a round or upgrade to Full Case.",
      );
    }

    const priorRounds = (snap.get("followUps") as unknown[] | undefined) ?? [];
    const packet = snap.get("packet") as Record<string, unknown> | null;

    try {
      const round = await runStructured<Record<string, unknown>>({
        systemPrompt: FOLLOWUP_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildFollowUpUserPrompt({
              extractionJson: JSON.stringify(snap.get("extraction") ?? {}),
              guidedAnswersJson: JSON.stringify(snap.get("guidedAnswers") ?? {}),
              appealLetter: (packet?.appealLetter as string | undefined) ?? null,
              priorRoundsJson: JSON.stringify(priorRounds),
              outcome,
              notes,
            }),
          },
        ],
        schemaName: "appeal_follow_up",
        schema: followUpSchema as unknown as Record<string, unknown>,
      });

      // serverTimestamp() is not allowed inside array values — use ISO string.
      const stored = {
        ...round,
        outcome,
        userNotes: notes,
        createdAt: new Date().toISOString(),
      };
      await snap.ref.update({
        followUps: [...priorRounds, stored],
        followUpCredits: credits - 1,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { followUp: stored, remaining: credits - 1 };
    } catch (err) {
      if (err instanceof HttpsError) throw err;
      await snap.ref.update({
        lastError:
          err instanceof Error ? err.message : "Follow-up generation failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError(
        "internal",
        "Follow-up generation failed. Your round was NOT used — please retry.",
      );
    }
  },
);
