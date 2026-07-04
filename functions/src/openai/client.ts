import OpenAI from "openai";
import { config, openaiApiKey } from "../config";

/**
 * Server-side OpenAI access. The API key never leaves Cloud Functions.
 * Uses the Responses API (not Chat Completions) per OpenAI's current guidance,
 * with Structured Outputs (json_schema, strict) and store:false so requests
 * are not retained by OpenAI.
 */

export interface StructuredRequest {
  systemPrompt: string;
  /** Content parts for the user turn: text plus optional file/image parts. */
  userContent: ResponseContentPart[];
  schemaName: string;
  schema: Record<string, unknown>;
}

export type ResponseContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_file"; filename: string; file_data: string }
  | { type: "input_image"; image_url: string; detail: "auto" };

function client(): OpenAI {
  const key = openaiApiKey.value() || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not configured. Set it as a Functions secret or in functions/.env.local for the emulator.",
    );
  }
  return new OpenAI({ apiKey: key });
}

/** MIME types we accept for upload and how they map to Responses API parts. */
export const SUPPORTED_MIME_TYPES: Record<string, "file" | "image"> = {
  "application/pdf": "file",
  "image/jpeg": "image",
  "image/png": "image",
  "image/heic": "image",
  "image/heif": "image",
  "image/webp": "image",
};

/** Build an input_file / input_image part from raw bytes fetched from Storage. */
export function toContentPart(
  filename: string,
  mimeType: string,
  bytes: Buffer,
): ResponseContentPart {
  const kind = SUPPORTED_MIME_TYPES[mimeType];
  if (!kind) {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
  const dataUrl = `data:${mimeType};base64,${bytes.toString("base64")}`;
  if (kind === "image") {
    return { type: "input_image", image_url: dataUrl, detail: "auto" };
  }
  return { type: "input_file", filename, file_data: dataUrl };
}

/**
 * Run one structured-output request and return the parsed JSON object.
 * Throws if the model refuses or returns non-JSON (callers surface a
 * user-facing error and mark the case status "error").
 */
export async function runStructured<T>(req: StructuredRequest): Promise<T> {
  const openai = client();
  const response = await openai.responses.create({
    model: config.openaiModel,
    store: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: req.systemPrompt }] },
      { role: "user", content: req.userContent as never },
    ],
    text: {
      format: {
        type: "json_schema",
        name: req.schemaName,
        schema: req.schema,
        strict: true,
      },
    },
    // Reasoning effort + processing speed. Spread with a loose cast so the
    // request compiles across OpenAI SDK versions that predate the "xhigh"
    // effort literal / service_tier param — the API accepts them at runtime.
    ...({
      reasoning: { effort: config.openaiReasoningEffort },
      service_tier: config.openaiServiceTier,
    } as Record<string, unknown>),
  });

  const text = response.output_text;
  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }
  return JSON.parse(text) as T;
}
