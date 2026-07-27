import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { openaiApiKey } from "./config";
import { requireUid, requireOwnedCase } from "./util";
import {
  runStructured,
  toContentPart,
  ResponseContentPart,
  SUPPORTED_MIME_TYPES,
} from "./openai/client";
import { extractionSchema } from "./openai/schemas";
import { EXTRACTION_SYSTEM_PROMPT } from "./openai/prompts";
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
import { parseEditableExtraction } from "./input_validation";
import { consumeUidHourlyRateLimit } from "./rate_limit";

/** Responses API allows up to 50 MB combined per request. */
const MAX_TOTAL_BYTES = 45 * 1024 * 1024;
/** Matches the free-preview allowance while still permitting several cases. */
const MAX_EXTRACTIONS_PER_HOUR = 5;

function extractionErrorCategory(err: unknown) {
  if (err instanceof HttpsError) {
    if (err.code === "not-found") return "missing_prerequisite";
    if (err.code === "invalid-argument") return "validation";
  }
  return modelAnalyticsErrorCategory(err);
}

/**
 * extractDenialFromUploadedFile
 * Reads the case's uploaded source files from Storage, sends them to the
 * OpenAI Responses API as file/image inputs, and stores the structured
 * extraction on the case document.
 */
export const extractDenialFromUploadedFile = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300, memory: "1GiB", invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);
    const caseId = snap.id;

    const filePaths: string[] = request.data?.filePaths ?? [];
    const prefix = `tempCases/${uid}/${caseId}/source/`;
    if (
      !Array.isArray(filePaths) ||
      filePaths.length === 0 ||
      filePaths.length > 10 ||
      new Set(filePaths).size !== filePaths.length
    ) {
      await recordFirstCaseAnalyticsError(
        uid,
        snap.ref,
        "extraction",
        "validation",
      );
      throw new HttpsError(
        "invalid-argument",
        "Upload between 1 and 10 distinct files.",
      );
    }
    if (filePaths.some((p) =>
      typeof p !== "string" ||
      p.length > 1024 ||
      !p.startsWith(prefix) ||
      p.includes("..")
    )) {
      await recordFirstCaseAnalyticsError(
        uid,
        snap.ref,
        "extraction",
        "validation",
      );
      throw new HttpsError(
        "invalid-argument",
        "filePaths must all be inside this case's upload folder.",
      );
    }

    const acquired = await acquireGenerationLease(snap.ref, "extraction", {
      // Persist the resumable boundary before the model call. If the browser
      // is refreshed, the processing route can watch this case and retry from
      // the same Storage objects without asking for another upload.
      sourceFilePaths: filePaths,
      status: "extracting",
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    if (acquired.kind === "busy") {
      throw new HttpsError(
        "aborted",
        "This case is already being processed. Please wait for it to finish.",
      );
    }
    const lease = acquired.lease;

    try {
      const rateLimit = await consumeUidHourlyRateLimit({
        uid,
        key: "extraction",
        limit: MAX_EXTRACTIONS_PER_HOUR,
      });
      if (!rateLimit.allowed) {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "extraction",
          "rate_limit",
        );
        throw new HttpsError(
          "resource-exhausted",
          `Document-reading limit reached (${MAX_EXTRACTIONS_PER_HOUR} per hour). ` +
          `Try again in about ${rateLimit.retryAfterMinutes} min.`,
        );
      }
    } catch (err) {
      await releaseGenerationLease(snap.ref, lease, {
        status: "error",
        lastError:
          err instanceof HttpsError && err.code === "resource-exhausted"
            ? "rate_limit"
            : modelAnalyticsErrorCategory(err),
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw err;
    }

    await recordFirstCaseAnalyticsEvent(uid, snap.ref, "extraction_started");

    try {
      const bucket = getStorage().bucket();
      const parts: ResponseContentPart[] = [];
      let totalBytes = 0;

      for (const path of filePaths) {
        const file = bucket.file(path);
        const [exists] = await file.exists();
        if (!exists) {
          throw new HttpsError("not-found", `Uploaded file missing: ${path}`);
        }
        const [meta] = await file.getMetadata();
        const mime = (meta.contentType as string) || "application/octet-stream";
        if (!SUPPORTED_MIME_TYPES[mime]) {
          throw new HttpsError(
            "invalid-argument",
            `Unsupported file type ${mime}. Upload a PDF, JPG, PNG, or HEIC file.`,
          );
        }
        totalBytes += Number(meta.size ?? 0);
        if (totalBytes > MAX_TOTAL_BYTES) {
          throw new HttpsError(
            "invalid-argument",
            "Uploaded files exceed the 45 MB combined limit. Remove a file and try again.",
          );
        }
        const [bytes] = await file.download();
        const filename = path.split("/").pop() ?? "document";
        parts.push(toContentPart(filename, mime, bytes));
      }

      parts.push({
        type: "input_text",
        text: "Extract the denial facts from the attached document(s) into the required JSON shape.",
      });

      const modelExtraction = await runStructured<Record<string, unknown>>({
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userContent: parts,
        schemaName: "denial_extraction",
        schema: extractionSchema as unknown as Record<string, unknown>,
        operation: "extraction",
        maxOutputTokens: 12000,
        excludeUsageAnalytics: isAdminAnalyticsUid(uid),
      });
      const extraction = parseEditableExtraction(modelExtraction);
      const finalized = await finalizeGenerationLease(snap.ref, lease, {
        extraction,
        sourceFilePaths: filePaths,
        status: "extracted",
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (!finalized) {
        throw new HttpsError(
          "aborted",
          "This processing attempt was superseded. Reload the case to continue.",
        );
      }
      await recordFirstCaseAnalyticsEvent(
        uid,
        snap.ref,
        "extraction_completed",
      );
      return { extraction };
    } catch (err) {
      const errorCategory = extractionErrorCategory(err);
      const released = await releaseGenerationLease(snap.ref, lease, {
        status: "error",
        lastError: errorCategory,
        updatedAt: FieldValue.serverTimestamp(),
      });
      if (released) {
        await recordFirstCaseAnalyticsError(
          uid,
          snap.ref,
          "extraction",
          errorCategory,
        );
      }
      if (err instanceof HttpsError) throw err;
      throw new HttpsError(
        "internal",
        "We couldn't read that document. Try a clearer photo or the original PDF.",
      );
    }
  },
);
