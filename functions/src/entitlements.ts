import { config } from "./config";

/**
 * Read the remaining follow-up allowance without granting extra access for
 * normal packets. Older Full Case purchases predate `followUpCredits`; their
 * `fullCase` flag remains the authoritative entitlement and is reconstructed
 * from the capped lifetime allowance minus already-drafted rounds.
 */
export function remainingFollowUpCredits(args: {
  followUpCredits: unknown;
  fullCase: unknown;
  followUps: unknown;
}): number {
  if (typeof args.followUpCredits === "number" &&
      Number.isFinite(args.followUpCredits)) {
    return Math.max(0, Math.floor(args.followUpCredits));
  }
  if (args.fullCase === true) {
    const used = Array.isArray(args.followUps) ? args.followUps.length : 0;
    return Math.max(0, config.fullCaseRoundsCap - used);
  }
  return config.freeFollowUpRounds;
}
