import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import {
  modelAnalyticsErrorCategory,
  recordFirstCaseAnalyticsError,
  recordFirstCaseAnalyticsEvent,
} from "./analytics";
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

    // Abuse guard: 5 previews per rolling hour per user, anonymous included.
    const db = getFirestore();
    const rlRef = db.collection("rateLimits").doc(`preview_${uid}`);
    try {
      await db.runTransaction(async (tx) => {
        const rl = await tx.get(rlRef);
        const now = Date.now();
        const hourStart = rl.exists ? ((rl.get("hourStart") as number) ?? 0) : 0;
        const count = rl.exists ? ((rl.get("count") as number) ?? 0) : 0;
        if (now - hourStart > 3_600_000) {
          tx.set(rlRef, { hourStart: now, count: 1 });
        } else if (count >= 5) {
          const mins = Math.max(
            1,
            Math.ceil((hourStart + 3_600_000 - now) / 60_000),
          );
          throw new HttpsError(
            "resource-exhausted",
            `Preview limit reached (5 per hour). Try again in about ${mins} min.`,
          );
        } else {
          tx.update(rlRef, { count: count + 1 });
        }
      });
    } catch (err) {
      if (err instanceof HttpsError && err.code === "resource-exhausted") {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "preview",
          "rate_limit",
        );
      }
      throw err;
    }

    const extraction = snap.get("extraction");
    if (!extraction) {
      await recordFirstCaseAnalyticsError(
        uid,
        snap.ref,
        "preview",
        "missing_prerequisite",
      );
      throw new HttpsError(
        "failed-precondition",
        "Run extraction before requesting a preview.",
      );
    }

    // The client may pass the user-edited extraction; prefer it when present
    // so corrections made on the review screen shape the preview.
    const effectiveExtraction = request.data?.extraction ?? extraction;

    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "preview_started");

    let modelReturned = false;
    try {
      const preview = await runStructured<Record<string, unknown>>({
        systemPrompt: PREVIEW_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildPreviewUserPrompt(
              JSON.stringify(effectiveExtraction),
              JSON.stringify(snap.get("guidedAnswers") ?? {}),
              (snap.get("userAdditions") as string | undefined) ?? null,
            ),
          },
        ],
        schemaName: "denial_preview",
        schema: previewSchema as unknown as Record<string, unknown>,
      });
      modelReturned = true;

      await snap.ref.update({
        preview,
        extraction: effectiveExtraction,
        status: "preview",
        updatedAt: FieldValue.serverTimestamp(),
      });
      // Atomic first-per-case aggregate only; the centralized writer excludes
      // owner traffic and never copies case or user data into analytics.
      await recordFirstCaseAnalyticsEvent(uid, snap.ref, "preview_completed");
      return { preview };
    } catch (err) {
      if (!modelReturned) {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "preview",
          modelAnalyticsErrorCategory(err),
        );
      }
      if (err instanceof HttpsError) throw err;
      await snap.ref.update({
        status: "error",
        lastError: err instanceof Error ? err.message : "Preview failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", "Preview generation failed. Please retry.");
    }
  },
);
