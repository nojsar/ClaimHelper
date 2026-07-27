import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import { runStructured } from "./openai/client";
import { packetSchema } from "./openai/schemas";
import { PACKET_SYSTEM_PROMPT, buildPacketUserPrompt } from "./openai/prompts";
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
import {
  boundedUserAdditions,
  parseEditableExtraction,
  parseGuidedAnswers,
} from "./input_validation";
import { nextPacketFulfillmentRetryMillis } from "./packet_retry";

export type PaidPacketGenerationResult =
  | { kind: "generated"; packet: Record<string, unknown> }
  | { kind: "alreadyExists"; packet: Record<string, unknown> }
  | { kind: "busy" };

export type PaidPacketGenerationDecision =
  | { kind: "generate" }
  | { kind: "alreadyExists"; packet: Record<string, unknown> };

/**
 * A settled packet is immutable for this purchase. Public callers must never
 * be able to force another paid model request by adding an undocumented flag
 * to the callable payload; retries simply reuse the stored result.
 */
export function decidePaidPacketGeneration(
  existing: unknown,
): PaidPacketGenerationDecision {
  if (existing && typeof existing === "object" && !Array.isArray(existing)) {
    return {
      kind: "alreadyExists",
      packet: existing as Record<string, unknown>,
    };
  }
  return { kind: "generate" };
}

/**
 * Generates a paid packet after entitlement is settled. It is intentionally
 * callable by both the authenticated UI and the payment webhook. Webhook
 * retries get a deterministic alreadyExists/busy result instead of creating a
 * duplicate model request.
 */
export async function generatePaidPacketForCase(args: {
  caseId: string;
  ownerUid: string;
}): Promise<PaidPacketGenerationResult> {
  const caseRef = getFirestore().collection("cases").doc(args.caseId);
  const snap = await caseRef.get();
  if (!snap.exists || snap.get("ownerUid") !== args.ownerUid) {
    throw new HttpsError("permission-denied", "You do not have access to this case.");
  }
  const uid = args.ownerUid;

  if (snap.get("paid") !== true) {
    await recordFirstCaseAnalyticsError(uid, snap.ref, "packet", "missing_prerequisite");
    throw new HttpsError(
      "permission-denied",
      "The full appeal packet is available after purchase.",
    );
  }
  const storedExtraction = snap.get("extraction");
  if (!storedExtraction) {
    await recordFirstCaseAnalyticsError(uid, snap.ref, "packet", "missing_prerequisite");
    throw new HttpsError("failed-precondition", "Extraction missing for this case.");
  }
  const extraction = parseEditableExtraction(storedExtraction);
  const generationDecision = decidePaidPacketGeneration(snap.get("packet"));
  if (generationDecision.kind === "alreadyExists") {
    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "packet_completed");
    return generationDecision;
  }
  const guidedAnswers = parseGuidedAnswers(snap.get("guidedAnswers") ?? {});

  const acquired = await acquireGenerationLease(snap.ref, "packet", {
    packetFulfillmentStatus: "fulfilling",
    packetFulfillmentNextAttemptAt: FieldValue.delete(),
  });
  if (acquired.kind === "busy") return { kind: "busy" };
  const lease = acquired.lease;
  await recordFirstCaseAnalyticsEvent(uid, snap.ref, "packet_started");

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
    lastWrite = snap.ref.update({
      generation: {
        progress: p,
        stage: label,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }).catch(() => undefined);
    return lastWrite;
  };
  await writeProgress(stages[0].p, stages[0].label);
  const ticker = setInterval(() => {
    if (stageIdx < stages.length - 1) {
      stageIdx += 1;
      void writeProgress(stages[stageIdx].p, stages[stageIdx].label);
    }
  }, 6000);

  try {
    const packet = await runStructured<Record<string, unknown>>({
      systemPrompt: PACKET_SYSTEM_PROMPT,
      userContent: [{
        type: "input_text",
        text: buildPacketUserPrompt(
          JSON.stringify(extraction),
          JSON.stringify(guidedAnswers),
          boundedUserAdditions(snap.get("userAdditions")),
        ),
      }],
      schemaName: "appeal_packet",
      schema: packetSchema as unknown as Record<string, unknown>,
      operation: "packet",
      maxOutputTokens: 30000,
      excludeUsageAnalytics: isAdminAnalyticsUid(uid),
    });

    clearInterval(ticker);
    await lastWrite;
    const finalized = await finalizeGenerationLease(snap.ref, lease, {
      packet,
      status: "generated",
      packetFulfillmentStatus: "completed",
      packetFulfillmentLastError: FieldValue.delete(),
      packetFulfillmentNextAttemptAt: FieldValue.delete(),
      generation: {
        progress: 1,
        stage: "Ready",
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (!finalized) return { kind: "busy" };
    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "packet_completed");
    return { kind: "generated", packet };
  } catch (err) {
    clearInterval(ticker);
    await lastWrite;
    const released = await releaseGenerationLease(snap.ref, lease, {
      status: "error",
      packetFulfillmentStatus: "retry_wait",
      packetFulfillmentNextAttemptAt: Timestamp.fromMillis(
        nextPacketFulfillmentRetryMillis(1, Date.now()),
      ),
      generation: null,
      lastError: modelAnalyticsErrorCategory(err),
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (released) {
      await recordFirstCaseAnalyticsError(
        uid,
        snap.ref,
        "packet",
        modelAnalyticsErrorCategory(err),
      );
    }
    if (err instanceof HttpsError) throw err;
    throw new HttpsError(
      "internal",
      "Packet generation failed. Your purchase is safe — please retry.",
    );
  }
}

/** Authenticated UI wrapper around the webhook-safe packet helper. */
export const generateAppealPacket = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300, invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);
    const result = await generatePaidPacketForCase({
      caseId: snap.id,
      ownerUid: uid,
    });
    if (result.kind === "busy") {
      throw new HttpsError(
        "aborted",
        "Your appeal packet is already being prepared. Please wait for it to finish.",
      );
    }
    return { packet: result.packet };
  },
);

/** Persist only the bounded guided-answer shape used by model prompts. */
export const saveGuidedAnswers = onCall(async (request) => {
  const uid = requireUid(request);
  const snap = await requireOwnedCase(request.data?.caseId, uid);
  const answers = parseGuidedAnswers(request.data?.guidedAnswers);
  const update: Record<string, unknown> = {
    guidedAnswers: answers,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (snap.get("paid") !== true) {
    update.preview = null;
    update.status = "extracted";
  }
  await snap.ref.update(update);
  return { saved: true };
});
