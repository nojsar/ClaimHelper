/** Packet fulfillment retry timing shared by manual and background failures. */
export const INITIAL_PACKET_RETRY_DELAY_MS = 5 * 60 * 1000;
export const MAX_PACKET_RETRY_DELAY_MS = 60 * 60 * 1000;

/** Fixed, capped backoff prevents an outage from creating a model-call storm. */
export function nextPacketFulfillmentRetryMillis(
  attempts: number,
  nowMillis: number,
): number {
  const normalizedAttempts = Math.max(1, Math.floor(attempts));
  const delay = Math.min(
    INITIAL_PACKET_RETRY_DELAY_MS * (2 ** (normalizedAttempts - 1)),
    MAX_PACKET_RETRY_DELAY_MS,
  );
  return nowMillis + delay;
}
