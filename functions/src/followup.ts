import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { runStructured } from "./openai/client";
import { followUpSchema } from "./openai/schemas";
import { FOLLOWUP_SYSTEM_PROMPT, buildFollowUpUserPrompt } from "./openai/prompts";
import { isAdminAnalyticsUid, modelAnalyticsErrorCategory } from "./analytics";
import {
  acquireGenerationLease,
  readGenerationLease,
  releaseGenerationLease,
} from "./generation_lease";
import {
  parseEditableExtraction,
  parseGuidedAnswers,
} from "./input_validation";
import { remainingFollowUpCredits } from "./entitlements";

const MAX_PRIOR_ROUND_CONTEXT_CHARS = 30_000;
const FOLLOW_UP_OUTCOMES = new Set([
  "Denied again",
  "Approved / partially approved",
  "They asked for more information",
  "No response yet",
  "Other",
]);

function text(value: unknown, maximum: number): string | null {
  if (typeof value !== "string") return null;
  // Keep the JSON prompt-size cap meaningful even if a note is made mostly
  // of quote/backslash/control characters, which otherwise expand when JSON
  // encoded. Those characters do not carry useful appeal context here.
  const trimmed = value.trim().replace(/["\\\u0000-\u001f]/g, " ");
  return trimmed ? trimmed.slice(0, maximum) : null;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function fullRoundContext(value: unknown): Record<string, unknown> {
  const round = object(value);
  return {
    createdAt: text(round.createdAt, 80),
    outcome: text(round.outcome, 80),
    userNotes: text(round.userNotes, 1_200),
    situationSummary: text(round.situationSummary, 1_200),
    recommendedNextSteps: text(round.recommendedNextSteps, 1_600),
    responseLetter: text(round.responseLetter, 4_500),
    callScript: text(round.callScript, 1_600),
    deadlineNotes: text(round.deadlineNotes, 800),
    warnings: text(round.warnings, 800),
    disclaimer: text(round.disclaimer, 400),
  };
}

function olderRoundSummary(value: unknown): Record<string, unknown> {
  const round = object(value);
  return {
    createdAt: text(round.createdAt, 80),
    outcome: text(round.outcome, 80),
    situationSummary: text(round.situationSummary, 500),
    nextSteps: text(round.recommendedNextSteps, 500),
  };
}

/**
 * Keep all rounds in Firestore, but bound the material sent to the model:
 * deterministic summaries for older history plus at most two complete recent
 * rounds. This prevents a long paid case from growing linearly in latency and
 * cost while retaining the context most likely to affect the next response.
 */
export function boundedPriorRoundsContext(rounds: unknown[]): string {
  const recent = rounds.slice(-2).map(fullRoundContext);
  const older = rounds.slice(0, -2).map(olderRoundSummary);
  const context = {
    olderRoundCount: older.length,
    olderRoundSummaries: older,
    recentFullRounds: recent,
  };
  let encoded = JSON.stringify(context);
  while (encoded.length > MAX_PRIOR_ROUND_CONTEXT_CHARS &&
      context.olderRoundSummaries.length > 0) {
    context.olderRoundSummaries.shift();
    encoded = JSON.stringify(context);
  }
  // The two recent rounds are already field-capped. This final guard keeps a
  // hard bound even if a future stored field is unexpectedly large.
  return encoded.length <= MAX_PRIOR_ROUND_CONTEXT_CHARS
    ? encoded
    : JSON.stringify({
        olderRoundCount: older.length,
        olderRoundSummaries: [],
        recentFullRounds: recent.map(fullRoundContext),
      });
}

/**
 * Continues a paid case after the insurer responds (or doesn't). Every packet
 * purchase includes config.freeFollowUpRounds rounds; extra rounds come from
 * the $19 round purchase or the Full Case upgrade (capped, not unlimited).
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
    const outcome =
      typeof request.data?.outcome === "string"
        ? request.data.outcome.trim()
        : "";
    const notes =
      typeof request.data?.notes === "string"
        ? request.data.notes.replaceAll("\u0000", "").trim()
        : "";
    if (!FOLLOW_UP_OUTCOMES.has(outcome) || !notes || notes.length > 20_000) {
      throw new HttpsError(
        "invalid-argument",
        "Choose an outcome and include up to 20,000 characters of details.",
      );
    }

    const credits = remainingFollowUpCredits({
      followUpCredits: snap.get("followUpCredits"),
      fullCase: snap.get("fullCase"),
      followUps: snap.get("followUps"),
    });
    if (credits <= 0) {
      throw new HttpsError(
        "resource-exhausted",
        "No follow-up rounds left on this case. Add a round or upgrade to Full Case.",
      );
    }

    const priorRounds = (snap.get("followUps") as unknown[] | undefined) ?? [];
    const packet = snap.get("packet") as Record<string, unknown> | null;
    const guidedAnswers = parseGuidedAnswers(snap.get("guidedAnswers") ?? {});
    const extraction = parseEditableExtraction(snap.get("extraction"));
    const acquired = await acquireGenerationLease(snap.ref, "followup");
    if (acquired.kind === "busy") {
      throw new HttpsError(
        "aborted",
        "Another case task is already being prepared. Please wait for it to finish.",
      );
    }
    const lease = acquired.lease;

    try {
      const round = await runStructured<Record<string, unknown>>({
        systemPrompt: FOLLOWUP_SYSTEM_PROMPT,
        userContent: [
          {
            type: "input_text",
            text: buildFollowUpUserPrompt({
              extractionJson: JSON.stringify(extraction),
              guidedAnswersJson: JSON.stringify(guidedAnswers),
              appealLetter: (packet?.appealLetter as string | undefined) ?? null,
              priorRoundsJson: boundedPriorRoundsContext(priorRounds),
              outcome,
              notes,
            }),
          },
        ],
        schemaName: "appeal_follow_up",
        schema: followUpSchema as unknown as Record<string, unknown>,
        operation: "followup",
        maxOutputTokens: 18000,
        excludeUsageAnalytics: isAdminAnalyticsUid(uid),
      });

      const stored = {
        ...round,
        outcome,
        userNotes: notes,
        createdAt: new Date().toISOString(),
      };
      // Read credits and rounds again while finalizing. A separately purchased
      // credit can settle while the model is working and must never be erased
      // by the stale pre-generation snapshot.
      const finalized = await getFirestore().runTransaction(async (transaction) => {
        const current = await transaction.get(snap.ref);
        const currentLease = current.exists
          ? readGenerationLease(current.get("generationLease"))
          : null;
        if (
          !currentLease ||
          currentLease.token !== lease.token ||
          currentLease.operation !== lease.operation
        ) {
          return false;
        }
        const currentRounds =
          (current.get("followUps") as unknown[] | undefined) ?? [];
        const currentCredits = remainingFollowUpCredits({
          followUpCredits: current.get("followUpCredits"),
          fullCase: current.get("fullCase"),
          followUps: currentRounds,
        });
        if (currentCredits <= 0) return false;
        transaction.update(snap.ref, {
          followUps: [...currentRounds, stored],
          followUpCredits: currentCredits - 1,
          generationLease: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return true;
      });
      if (!finalized) {
        throw new HttpsError(
          "aborted",
          "This follow-up attempt was superseded. Reload the case to continue.",
        );
      }
      return { followUp: stored, remaining: credits - 1 };
    } catch (err) {
      const released = await releaseGenerationLease(snap.ref, lease, {
        lastError: modelAnalyticsErrorCategory(err),
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (err instanceof HttpsError) throw err;
      // Only the current lease writes the fixed error category. A stale
      // invocation cannot overwrite a later recovery attempt.
      if (!released) {
        throw new HttpsError("aborted", "A newer follow-up attempt is in progress.");
      }
      throw new HttpsError(
        "internal",
        "Follow-up generation failed. Your round was NOT used — please retry.",
      );
    }
  },
);
