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

/** Responses API allows up to 50 MB combined per request. */
const MAX_TOTAL_BYTES = 45 * 1024 * 1024;

/**
 * extractDenialFromUploadedFile
 * Reads the case's uploaded source files from Storage, sends them to the
 * OpenAI Responses API as file/image inputs, and stores the structured
 * extraction on the case document.
 */
export const extractDenialFromUploadedFile = onCall(
  { secrets: [openaiApiKey], timeoutSeconds: 300, memory: "1GiB" },
  async (request) => {
    const uid = requireUid(request);
    const snap = await requireOwnedCase(request.data?.caseId, uid);
    const caseId = snap.id;

    const filePaths: string[] = request.data?.filePaths ?? [];
    const prefix = `tempCases/${caseId}/source/`;
    if (!Array.isArray(filePaths) || filePaths.length === 0) {
      throw new HttpsError("invalid-argument", "filePaths is required.");
    }
    if (filePaths.some((p) => typeof p !== "string" || !p.startsWith(prefix) || p.includes(".."))) {
      throw new HttpsError(
        "invalid-argument",
        "filePaths must all be inside this case's upload folder.",
      );
    }

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

    try {
      const extraction = await runStructured<Record<string, unknown>>({
        systemPrompt: EXTRACTION_SYSTEM_PROMPT,
        userContent: parts,
        schemaName: "denial_extraction",
        schema: extractionSchema as unknown as Record<string, unknown>,
      });

      await snap.ref.update({
        extraction,
        sourceFilePaths: filePaths,
        status: "extracted",
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { extraction };
    } catch (err) {
      await snap.ref.update({
        status: "error",
        lastError: err instanceof Error ? err.message : "Extraction failed",
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError(
        "internal",
        "We couldn't read that document. Try a clearer photo or the original PDF.",
      );
    }
  },
);
