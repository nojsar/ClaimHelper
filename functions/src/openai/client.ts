import OpenAI from "openai";

import { config, openaiApiKey } from "../config";
import { ModelOperation, recordModelUsage } from "../model_usage";

/**
 * Server-side OpenAI access. The API key never leaves Cloud Functions.
 * Uses the Responses API with strict Structured Outputs and store:false.
 */
export interface StructuredRequest {
  /** Fixed operation name used only for aggregate cost/latency reporting. */
  operation: ModelOperation;
  /** Upper bound includes reasoning tokens and the structured answer. */
  maxOutputTokens: number;
  /** Owner/admin test generations must never enter customer analytics. */
  excludeUsageAnalytics?: boolean;
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
 * Run one structured-output request and return parsed JSON. Usage data is
 * written only as aggregate counters and can never make generation fail.
 */
export async function runStructured<T>(req: StructuredRequest): Promise<T> {
  const openai = client();
  const startedAt = Date.now();
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let outputTokens = 0;
  let succeeded = false;

  try {
    const response = await openai.responses.create({
      model: config.openaiModel,
      store: false,
      max_output_tokens: req.maxOutputTokens,
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: req.systemPrompt }],
        },
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
      ...({
        reasoning: { effort: config.openaiReasoningEffort },
        service_tier: config.openaiServiceTier,
      } as Record<string, unknown>),
    });

    const usage = response.usage as unknown as
      | {
          input_tokens?: number;
          output_tokens?: number;
          input_tokens_details?: { cached_tokens?: number };
        }
      | undefined;
    inputTokens = usage?.input_tokens ?? 0;
    cachedInputTokens = usage?.input_tokens_details?.cached_tokens ?? 0;
    outputTokens = usage?.output_tokens ?? 0;

    const text = response.output_text;
    if (!text) {
      throw new Error("OpenAI returned an empty response.");
    }
    const parsed = JSON.parse(text) as T;
    succeeded = true;
    return parsed;
  } finally {
    if (!req.excludeUsageAnalytics) {
      await recordModelUsage({
        operation: req.operation,
        succeeded,
        durationMs: Date.now() - startedAt,
        inputTokens,
        cachedInputTokens,
        outputTokens,
      });
    }
  }
}
