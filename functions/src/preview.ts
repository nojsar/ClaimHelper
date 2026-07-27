import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import {
  isAdminAnalyticsUid,
  modelAnalyticsErrorCategory,
  recordFirstCaseAnalyticsError,
  recordFirstCaseAnalyticsEvent,
} from "./analytics";
import {
  acquireGenerationLease,
  finalizeGenerationLease,
  releaseGenerationLease,
} from "./generation_lease";
import { runStructured } from "./openai/client";
import { previewSchema } from "./openai/schemas";
import { PREVIEW_SYSTEM_PROMPT, buildPreviewUserPrompt } from "./openai/prompts";
import {
  boundedUserAdditions,
  parseEditableExtraction,
  parseGuidedAnswers,
} from "./input_validation";
import { consumeUidHourlyRateLimit } from "./rate_limit";

const MAX_PREVIEWS_PER_HOUR = 5;

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
    // The client may pass an edited extraction. Rebuild it from the fixed
    // allowlist before it can be persisted or sent to the model.
    const effectiveExtraction = parseEditableExtraction(
      request.data?.extraction ?? extraction,
    );
    const guidedAnswers = parseGuidedAnswers(snap.get("guidedAnswers") ?? {});
    const additions = boundedUserAdditions(snap.get("userAdditions"));

    const acquired = await acquireGenerationLease(snap.ref, "preview");
    if (acquired.kind === "busy") {
      throw new HttpsError(
        "aborted",
        "This case is already being prepared. Please wait for it to finish.",
      );
    }
    const lease = acquired.lease;

    // Abuse guard: five previews per rolling hour per user, anonymous
    // included. The shared helper namespaces this counter beside extraction
    // usage so resetting one allowance cannot erase the other.
    try {
      const rateLimit = await consumeUidHourlyRateLimit({
        uid,
        key: "preview",
        limit: MAX_PREVIEWS_PER_HOUR,
      });
      if (!rateLimit.allowed) {
        throw new HttpsError(
          "resource-exhausted",
          `Preview limit reached (${MAX_PREVIEWS_PER_HOUR} per hour). ` +
          `Try again in about ${rateLimit.retryAfterMinutes} min.`,
        );
      }
    } catch (err) {
      if (err instanceof HttpsError && err.code === "resource-exhausted") {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "preview",
          "rate_limit",
        );
      }
      await releaseGenerationLease(snap.ref, lease);
      throw err;
    }

    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "preview_started");

    try {
      const preview = await runStructured<Record<string, unknown>>({
        systemPrompt: PREVIEW_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildPreviewUserPrompt(
              JSON.stringify(effectiveExtraction),
              JSON.stringify(guidedAnswers),
              additions,
            ),
          },
        ],
        schemaName: "denial_preview",
        schema: previewSchema as unknown as Record<string, unknown>,
        operation: "preview",
        maxOutputTokens: 8000,
        excludeUsageAnalytics: isAdminAnalyticsUid(uid),
      });
      const finalized = await finalizeGenerationLease(snap.ref, lease, {
        preview,
        extraction: effectiveExtraction,
        status: "preview",
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (!finalized) {
        throw new HttpsError(
          "aborted",
          "This preview attempt was superseded. Reload the case to continue.",
        );
      }
      // Atomic first-per-case aggregate only; the centralized writer excludes
      // owner traffic and never copies case or user data into analytics.
      await recordFirstCaseAnalyticsEvent(uid, snap.ref, "preview_completed");
      return { preview };
    } catch (err) {
      const released = await releaseGenerationLease(snap.ref, lease, {
        status: "error",
        lastError: modelAnalyticsErrorCategory(err),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (released) {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "preview",
          modelAnalyticsErrorCategory(err),
        );
      }
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", "Preview generation failed. Please retry.");
    }
  },
);
