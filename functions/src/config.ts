import { defineSecret } from "firebase-functions/params";

/**
 * Secrets — bound at deploy time with `firebase functions:secrets:set`.
 * In the emulator, put values in functions/.env.local instead.
 * The OpenAI key lives ONLY here, server-side. It is never shipped to Flutter.
 */
export const openaiApiKey = defineSecret("OPENAI_API_KEY");
export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

/** Non-secret configuration, read from env with safe defaults. */
export const config = {
  /** Model is configurable — never hardcode a model name at call sites. */
  get openaiModel(): string {
    return process.env.OPENAI_MODEL || "gpt-5.5";
  },
  /**
   * Reasoning effort for reasoning-capable models (gpt-5.5): one of
   * none | low | medium | high | xhigh. Defaults to xhigh ("extra high").
   */
  get openaiReasoningEffort(): string {
    return process.env.OPENAI_REASONING_EFFORT || "xhigh";
  },
  /**
   * Processing speed tier: default (standard) | flex | priority | auto.
   * "default" = standard speed.
   */
  get openaiServiceTier(): string {
    return process.env.OPENAI_SERVICE_TIER || "default";
  },
  /** Base URL of the deployed web app, used for Stripe redirect URLs. */
  get appBaseUrl(): string {
    return process.env.APP_BASE_URL || "http://localhost:5000";
  },
  /** Full Appeal Packet price in USD cents. */
  get fullPacketPriceCents(): number {
    return Number(process.env.FULL_PACKET_PRICE_CENTS || 3900);
  },
  /** Hours before unsaved source uploads are deleted. */
  get tempFileTtlHours(): number {
    return Number(process.env.TEMP_FILE_TTL_HOURS || 24);
  },
} as const;

/** Case lifecycle states mirrored in the Flutter app's CaseStatus enum. */
export type CaseStatus =
  | "uploaded"
  | "extracted"
  | "preview"
  | "paid"
  | "generated"
  | "error";
