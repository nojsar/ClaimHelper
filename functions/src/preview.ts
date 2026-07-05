import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { runStructured } from "./openai/client";
import { previewSchema } from "./openai/schemas";
import { PREVIEW_SYSTEM_PROMPT, buildPreviewUserPrompt } from "./openai/prompts";

/**
 * generateFreePreview
 * Free tier: short summary of the denial, amount at stake, likely appeal
 * path, and what's missing. Works from the stored extraction only — the
 * source files are not re-sent to OpenAI.
 */
export const generateFreePreview = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 120, invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);

    const extraction = snap.get("extraction");
    if (!extraction) {
      throw new HttpsError(
        "failed-precondition",
        "Run extraction before requesting a preview.",
      );
    }

    // The client may pass the user-edited extraction; prefer it when present
    // so corrections made on the review screen shape the preview.
    const effectiveExtraction = request.data?.extraction ?? extraction;

    try {
      const preview = await runStructured<Record<string, unknown>>({
        systemPrompt: PREVIEW_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildPreviewUserPrompt(JSON.stringify(effectiveExtraction)),
          },
        ],
        schemaName: "denial_preview",
        schema: previewSchema as unknown as Record<string, unknown>,
      });

      await snap.ref.update({
        preview,
        extraction: effectiveExtraction,
        status: "preview",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { preview };
    } catch (err) {
      await snap.ref.update({
        status: "error",
        lastError: err instanceof Error ? err.message : "Preview failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", "Preview generation failed. Please retry.");
    }
  },
);
