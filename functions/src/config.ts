import { defineSecret } from "firebase-functions/params";

/**
 * Secrets — bound at deploy time with `firebase functions:secrets:set`.
 * In the emulator, put values in functions/.env.local instead.
 * The OpenAI key lives ONLY here, server-side. It is never shipped to Flutter.
 */
export const openaiApiKey = defineSecret("OPENAI_API_KEY");
export const stripeSecretKey = defineSecret("STRIPE_SECRET_KEY");
export const stripeWebhookSecret = defineSecret("STRIPE_WEBHOOK_SECRET");

/**
 * Owner account (dunojus10@gmail.com). Gets comped checkout (no Stripe) and
 * is excluded from funnel/revenue counters so live testing never skews stats.
 * Analytics reads are gated to this uid in firestore.rules; the matching
 * client constant is kAdminUid in lib/core/constants.dart.
 */
export const ADMIN_UID = "6ZETq21uHIartXQlCCrZnZiQhb83";

/** Non-secret configuration, read from env with safe defaults. */
export const config = {
  /** Model is configurable — never hardcode a model name at call sites. */
  get openaiModel(): string {
    return process.env.OPENAI_MODEL || "gpt-5.6-terra";
  },
  /**
   * Reasoning effort for GPT-5.6: none | low | medium | high | xhigh | max.
   * High is the production quality/latency balance selected for this workflow.
   */
  get openaiReasoningEffort(): string {
    return process.env.OPENAI_REASONING_EFFORT || "high";
  },
  /**
   * Processing speed tier: default (standard) | flex | priority | auto.
   * "default" = standard speed.
   */
  get openaiServiceTier(): string {
    return process.env.OPENAI_SERVICE_TIER || "default";
  },
  /** GPT-5.6 Terra input price, USD per million tokens. */
  get openaiInputCostPerMillion(): number {
    return Number(process.env.OPENAI_INPUT_COST_PER_MILLION || 2.5);
  },
  /** GPT-5.6 Terra cached-input price, USD per million tokens. */
  get openaiCachedInputCostPerMillion(): number {
    return Number(process.env.OPENAI_CACHED_INPUT_COST_PER_MILLION || 0.25);
  },
  /** GPT-5.6 Terra output price, USD per million tokens. */
  get openaiOutputCostPerMillion(): number {
    return Number(process.env.OPENAI_OUTPUT_COST_PER_MILLION || 15);
  },
  /** Base URL of the deployed web app, used for Stripe redirect URLs. */
  get appBaseUrl(): string {
    return process.env.APP_BASE_URL || "http://localhost:5000";
  },
  /** Full Appeal Packet price in USD cents. */
  get fullPacketPriceCents(): number {
    return Number(process.env.FULL_PACKET_PRICE_CENTS || 3900);
  },
  /** One additional follow-up round, USD cents. */
  get followUpRoundPriceCents(): number {
    return Number(process.env.FOLLOWUP_ROUND_PRICE_CENTS || 500);
  },
  /** Full Case upgrade (capped follow-up bundle), USD cents. */
  get fullCasePriceCents(): number {
    return Number(process.env.FULL_CASE_PRICE_CENTS || 5900);
  },
  /** Difference between the $39 packet and the $59 Full Case bundle. */
  get fullCaseUpgradePriceCents(): number {
    return Number(process.env.FULL_CASE_UPGRADE_PRICE_CENTS || 2000);
  },
  /** Follow-up rounds included with every packet purchase. */
  get freeFollowUpRounds(): number {
    return Number(process.env.FREE_FOLLOWUP_ROUNDS || 2);
  },
  /** Hard cap of drafting rounds granted by Full Case — never unlimited. */
  get fullCaseRoundsCap(): number {
    return Number(process.env.FULL_CASE_ROUNDS_CAP || 10);
  },
  /** Retention window granted only after a customer opts into preview reminders. */
  get reminderOptInCaseTtlDays(): number {
    return Number(process.env.REMINDER_OPT_IN_CASE_TTL_DAYS || 14);
  },
  /** Hours before unsaved source uploads are deleted. */
  get tempFileTtlHours(): number {
    return Number(process.env.TEMP_FILE_TTL_HOURS || 24);
  },
  /**
   * Trustpilot's BCC invitation address (`<domain>+<token>@invite.trustpilot.com`).
   * Deployment config, never committed: anyone holding it can trigger review
   * invitations against our business profile. Empty disables review
   * invitations end to end — none are scheduled and none are sent.
   */
  get trustpilotInviteEmail(): string {
    return (process.env.TRUSTPILOT_INVITE_EMAIL || "").trim();
  },
  /** Days after a confirmed first purchase before the review invitation. */
  get reviewInviteDelayDays(): number {
    return Number(process.env.REVIEW_INVITE_DELAY_DAYS || 21);
  },
} as const;

/** Case lifecycle states mirrored in the Flutter app's CaseStatus enum. */
export type CaseStatus =
  | "uploaded"
  | "extracting"
  | "extracted"
  | "preview"
  | "paid"
  | "generated"
  | "error";
