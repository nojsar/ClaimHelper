import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { getAuth } from "firebase-admin/auth";
import {
  getFirestore,
  FieldValue,
  DocumentReference,
} from "firebase-admin/firestore";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { ADMIN_UID } from "./config";

/**
 * First-party, cookieless traffic analytics.
 *
 * Design constraints (GDPR posture of the site — no consent banner):
 *  - NO visitor analytics cookies, localStorage, fingerprinting, or per-visitor
 *    records. The owner may receive a signed, HttpOnly exclusion cookie and
 *    use a local browser kill switch whose sole purpose is to prevent owner
 *    traffic from entering these counters.
 *  - Nothing user-identifying is stored: only aggregate daily counters in
 *    `analytics_customer_daily/{YYYY-MM-DD}` (UTC) and aggregate,
 *    single-dimension slices in `analytics_customer_segment_daily`. IPs and
 *    user agents are not kept. Legacy analytics collections are preserved but
 *    never written by this module.
 *  - Product/funnel steps are counted server-side. Case generation milestones
 *    use atomic first-per-case writes; payment/upload counters use the existing
 *    aggregate writer. The client only reports visit/boot/pageview.
 */

export const ANALYTICS_DAILY_COLLECTION = "analytics_customer_daily";
export const ANALYTICS_SEGMENT_DAILY_COLLECTION =
  "analytics_customer_segment_daily";

/**
 * HyperLogLog precision used for aggregate unique-network estimates. 256
 * registers are small enough for one Firestore document while keeping the
 * expected standard error near 6.5%. Registers are aggregate state, never a
 * visitor identifier.
 */
const UNIQUE_VISITOR_PRECISION = 8;
export const UNIQUE_VISITOR_REGISTER_COUNT = 1 << UNIQUE_VISITOR_PRECISION;
/** Bump whenever the HMAC salt or sketch algorithm is intentionally changed. */
export const UNIQUE_VISITOR_SKETCH_VERSION = 1;
export const analyticsUniqueSalt = defineSecret("ANALYTICS_UNIQUE_SALT");

// Firebase Hosting forwards only the specially named __session cookie to
// rewritten Functions. It remains host-only because the response never sets a
// Domain attribute.
export const ADMIN_ANALYTICS_COOKIE = "__session";
const ADMIN_ANALYTICS_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
const ADMIN_ANALYTICS_SESSION_SECONDS = Math.floor(
  ADMIN_ANALYTICS_SESSION_MS / 1000,
);

/** UTC day key, e.g. "2026-07-11". */
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Select the client slot appended by Google Cloud Load Balancing.
 *
 * GCLB appends `client, load-balancer` to any caller-supplied prefix. Selecting
 * the penultimate raw slot prevents a spoofed prefix from becoming identity
 * input. Invalid raw slots are never filtered first because doing so could
 * shift an attacker-controlled value into the trusted position.
 */
export function clientNetworkAddress(
  header: string | string[] | undefined,
): string | null {
  const value = Array.isArray(header) ? header.join(",") : header;
  if (!value) return null;
  const rawSlots = value.split(",");
  const trustedSlot = rawSlots.length >= 2
    ? rawSlots[rawSlots.length - 2]
    : rawSlots[0];
  const address = trustedSlot.trim();
  return isIP(address) !== 0 ? address.toLowerCase() : null;
}

/** Coerce untrusted Firestore data into a fixed, bounded register array. */
export function normalizeUniqueVisitorRegisters(raw: unknown): number[] {
  const source = Array.isArray(raw) ? raw : [];
  return Array.from({ length: UNIQUE_VISITOR_REGISTER_COUNT }, (_, index) => {
    const value = source[index];
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(0, Math.min(64, Math.floor(value)))
      : 0;
  });
}

/**
 * Update an aggregate HyperLogLog sketch for one country/network pair.
 *
 * The secret-keyed HMAC-SHA256 digest exists only in this stack frame. Neither
 * the network address nor its digest is written to Firestore. The day is
 * deliberately not part of the input: sketches from daily documents must use
 * identical buckets so they can be merged into a true rolling-period estimate.
 */
export function updateUniqueVisitorRegisters(
  current: unknown,
  country: string,
  networkAddress: string,
  salt: string,
): number[] {
  if (salt.length === 0) {
    throw new Error("Unique visitor aggregation requires a secret salt.");
  }
  const registers = normalizeUniqueVisitorRegisters(current);
  const digest = createHmac("sha256", salt)
    .update(`${country}|${networkAddress}`)
    .digest();
  const registerIndex = digest[0];

  let rank = 1;
  for (let byteIndex = 1; byteIndex < digest.length; byteIndex++) {
    const byte = digest[byteIndex];
    if (byte === 0) {
      rank += 8;
      continue;
    }
    rank += Math.clz32(byte) - 24;
    break;
  }
  registers[registerIndex] = Math.max(
    registers[registerIndex],
    Math.min(64, rank),
  );
  return registers;
}

export interface UniqueVisitorSketchUpdate {
  registers: number[];
  changed: boolean;
  reset: boolean;
}

/**
 * Prepare one sketch mutation without touching Firestore. An absent or stale
 * version starts from empty aggregate state, preventing registers produced by
 * a previous salt/algorithm from being merged into the current estimate.
 */
export function prepareUniqueVisitorSketchUpdate(
  current: unknown,
  storedVersion: unknown,
  country: string,
  networkAddress: string,
  salt: string,
): UniqueVisitorSketchUpdate {
  const reset = storedVersion !== UNIQUE_VISITOR_SKETCH_VERSION;
  const before = normalizeUniqueVisitorRegisters(reset ? null : current);
  const registers = updateUniqueVisitorRegisters(
    before,
    country,
    networkAddress,
    salt,
  );
  return {
    registers,
    reset,
    changed:
      reset || registers.some((value, index) => value !== before[index]),
  };
}

/** Estimate cardinality from a 256-register HyperLogLog sketch. */
export function estimateUniqueVisitors(raw: unknown): number {
  const registers = normalizeUniqueVisitorRegisters(raw);
  const m = UNIQUE_VISITOR_REGISTER_COUNT;
  const alpha = 0.7213 / (1 + 1.079 / m);
  const harmonic = registers.reduce(
    (sum, register) => sum + Math.pow(2, -register),
    0,
  );
  const rawEstimate = (alpha * m * m) / harmonic;
  const empty = registers.filter((register) => register === 0).length;
  const corrected =
    rawEstimate <= 2.5 * m && empty > 0
      ? m * Math.log(m / empty)
      : rawEstimate;
  return Math.max(0, Math.round(corrected));
}

/** One source of truth for owner exclusion across every analytics writer. */
export function isAdminAnalyticsUid(
  uid: string | null | undefined,
): boolean {
  return uid === ADMIN_UID;
}

/**
 * The private dashboard is not customer traffic. Suppress it even on a fresh
 * browser before Firebase Auth has had time to establish the exclusion cookie.
 */
export function isExcludedAnalyticsPath(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  let path = raw.trim();
  try {
    const url = new URL(path);
    path = url.hash.startsWith("#/") ? url.hash.slice(1) : url.pathname;
  } catch {
    // Route values are normally relative paths, which URL intentionally rejects.
  }
  const hashRoute = path.indexOf("#/");
  if (hashRoute >= 0) path = path.slice(hashRoute + 1);
  path = path.replace(/[?&#].*$/, "");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path === "/stats" || path.startsWith("/stats/");
}

/** Read one cookie without trusting any client-provided exclusion flag. */
export function cookieValue(
  header: string | string[] | undefined,
  name: string,
): string | null {
  const joined = Array.isArray(header) ? header.join(";") : header;
  if (!joined) return null;
  for (const part of joined.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    const encoded = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(encoded);
    } catch {
      return null;
    }
  }
  return null;
}

/** Parse the Firebase ID token used to establish the signed exclusion cookie. */
export function bearerToken(
  header: string | string[] | undefined,
): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

/** Build the only analytics-related cookie ever issued by this service. */
export function adminAnalyticsCookieHeader(sessionCookie: string): string {
  return [
    `${ADMIN_ANALYTICS_COOKIE}=${encodeURIComponent(sessionCookie)}`,
    `Max-Age=${ADMIN_ANALYTICS_SESSION_SECONDS}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
  ].join("; ");
}

type SegmentType = "country" | "referrer" | "campaign" | "path";

interface AnalyticsSegment {
  type: SegmentType;
  key: string;
}

/**
 * Stable, URL-safe ids prevent a segment key from becoming a Firestore path.
 * The plain key also lives in the document, so clients never need to decode it.
 */
export function analyticsSegmentDocumentId(
  day: string,
  type: SegmentType,
  key: string,
): string {
  return `${day}__${type}__${Buffer.from(key, "utf8").toString("base64url")}`;
}

/** Funnel and revenue are not segmentable without visitor/session tracking. */
const SEGMENTABLE_FIELD_ROOTS = new Set([
  "visits",
  "pageviews",
  "boots",
  "countries",
  "referrers",
  "campaigns",
  "paths",
]);

export function filterSegmentableFields(
  fields: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(fields).filter(([path]) =>
      SEGMENTABLE_FIELD_ROOTS.has(path.split(".", 1)[0]),
    ),
  );
}

/** Convert dotted counter names into nested maps with increment sentinels. */
function incrementUpdate(
  fields: Record<string, number>,
): Record<string, unknown> {
  const update = Object.create(null) as Record<string, unknown>;
  for (const [path, n] of Object.entries(fields)) {
    const segs = path.split(".");
    let node = update;
    for (let i = 0; i < segs.length - 1; i++) {
      if (!Object.prototype.hasOwnProperty.call(node, segs[i])) {
        node[segs[i]] = Object.create(null) as Record<string, unknown>;
      }
      node = node[segs[i]] as Record<string, unknown>;
    }
    node[segs[segs.length - 1]] = FieldValue.increment(n);
  }
  return update;
}

/**
 * Sanitize a dynamic map key: collapse case ids so path cardinality stays
 * bounded, replace dots (display-only; keeps Firestore field names tidy),
 * and cap length. Returns null for junk.
 */
function keyify(raw: unknown, max = 64): string | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const cleaned = raw
    .replace(/\/case\/[^/]+/g, "/case/:id")
    .replace(/[?&#].*$/, "")
    .replace(/\./g, "_")
    .replace(/[^\w:/\- ]/g, "")
    .slice(0, max);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Increment authenticated customer counters on today's clean aggregate doc.
 * The uid is mandatory at every call site so new product events cannot forget
 * owner exclusion. Fire-and-forget safe: never throws, so analytics can never
 * break a payment or generation flow.
 */
export async function bumpUserDaily(
  uid: string | null | undefined,
  fields: Record<string, number>,
): Promise<void> {
  if (isAdminAnalyticsUid(uid)) return;
  try {
    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      ...incrementUpdate(fields),
    };
    await getFirestore()
      .collection(ANALYTICS_DAILY_COLLECTION)
      .doc(dayKey())
      .set(update, { merge: true });
  } catch (err) {
    console.warn("analytics bumpUserDaily failed (ignored):", err);
  }
}

/** Product stages whose first success/failure is useful in aggregate. */
export type ProductAnalyticsStage = "extraction" | "preview" | "packet";

/**
 * Intentionally small error taxonomy. Raw exception messages, model output,
 * validation values, and other case data must never become analytics keys.
 */
export type ProductAnalyticsErrorCategory =
  | "validation"
  | "rate_limit"
  | "missing_prerequisite"
  | "model_failure";

/**
 * Fixed events accepted by the first-per-case analytics writer. Keeping this
 * as a closed union prevents callers from constructing arbitrary counter
 * paths from request data.
 */
export type CaseAnalyticsEvent =
  | "uploaded"
  | "extraction_started"
  | "extraction_completed"
  | "preview_started"
  | "preview_completed"
  | "checkout_started"
  | "paid"
  | "packet_started"
  | "packet_completed"
  | "extraction_error_validation"
  | "extraction_error_rate_limit"
  | "extraction_error_missing_prerequisite"
  | "extraction_error_model_failure"
  | "preview_error_validation"
  | "preview_error_rate_limit"
  | "preview_error_missing_prerequisite"
  | "preview_error_model_failure"
  | "packet_error_validation"
  | "packet_error_rate_limit"
  | "packet_error_missing_prerequisite"
  | "packet_error_model_failure"
  | "submitted";

export type CaseOutcomeAnalyticsCategory =
  | "approved"
  | "partially_approved"
  | "denied"
  | "withdrawn";

const CASE_ANALYTICS_EVENT_FIELDS: Readonly<
  Record<CaseAnalyticsEvent, Readonly<Record<string, number>>>
> = {
  uploaded: { "funnel.upload": 1 },
  extraction_started: { "product.extraction.started": 1 },
  extraction_completed: { "product.extraction.completed": 1 },
  preview_started: { "product.preview.started": 1 },
  // Preserve the existing funnel field, but make it first-per-case.
  preview_completed: {
    "product.preview.completed": 1,
    "funnel.preview": 1,
  },
  checkout_started: { "funnel.checkout_started": 1 },
  paid: { "funnel.paid": 1 },
  packet_started: { "product.packet.started": 1 },
  packet_completed: { "product.packet.completed": 1 },
  extraction_error_validation: {
    "product.extraction.errors.validation": 1,
  },
  extraction_error_rate_limit: {
    "product.extraction.errors.rate_limit": 1,
  },
  extraction_error_missing_prerequisite: {
    "product.extraction.errors.missing_prerequisite": 1,
  },
  extraction_error_model_failure: {
    "product.extraction.errors.model_failure": 1,
  },
  preview_error_validation: { "product.preview.errors.validation": 1 },
  preview_error_rate_limit: { "product.preview.errors.rate_limit": 1 },
  preview_error_missing_prerequisite: {
    "product.preview.errors.missing_prerequisite": 1,
  },
  preview_error_model_failure: {
    "product.preview.errors.model_failure": 1,
  },
  packet_error_validation: { "product.packet.errors.validation": 1 },
  packet_error_rate_limit: { "product.packet.errors.rate_limit": 1 },
  packet_error_missing_prerequisite: {
    "product.packet.errors.missing_prerequisite": 1,
  },
  packet_error_model_failure: {
    "product.packet.errors.model_failure": 1,
  },
  submitted: { "product.case.submitted": 1 },
};

const CASE_ANALYTICS_ERROR_EVENTS: Readonly<
  Record<
    ProductAnalyticsStage,
    Readonly<Record<ProductAnalyticsErrorCategory, CaseAnalyticsEvent>>
  >
> = {
  extraction: {
    validation: "extraction_error_validation",
    rate_limit: "extraction_error_rate_limit",
    missing_prerequisite: "extraction_error_missing_prerequisite",
    model_failure: "extraction_error_model_failure",
  },
  preview: {
    validation: "preview_error_validation",
    rate_limit: "preview_error_rate_limit",
    missing_prerequisite: "preview_error_missing_prerequisite",
    model_failure: "preview_error_model_failure",
  },
  packet: {
    validation: "packet_error_validation",
    rate_limit: "packet_error_rate_limit",
    missing_prerequisite: "packet_error_missing_prerequisite",
    model_failure: "packet_error_model_failure",
  },
};

const CASE_OUTCOME_FIELDS: Readonly<
  Record<CaseOutcomeAnalyticsCategory, Readonly<Record<string, number>>>
> = {
  approved: { "product.outcomes.approved": 1 },
  partially_approved: { "product.outcomes.partially_approved": 1 },
  denied: { "product.outcomes.denied": 1 },
  withdrawn: { "product.outcomes.withdrawn": 1 },
};

/** Return a defensive copy of the fixed fields for a known event. */
export function caseAnalyticsCounterFields(
  event: unknown,
): Record<string, number> | null {
  if (
    typeof event !== "string" ||
    !Object.prototype.hasOwnProperty.call(CASE_ANALYTICS_EVENT_FIELDS, event)
  ) {
    return null;
  }
  return { ...CASE_ANALYTICS_EVENT_FIELDS[event as CaseAnalyticsEvent] };
}

/** Resolve a stage/category pair without ever deriving a Firestore path. */
export function caseAnalyticsErrorEvent(
  stage: ProductAnalyticsStage,
  category: ProductAnalyticsErrorCategory,
): CaseAnalyticsEvent | null {
  const stageEvents = CASE_ANALYTICS_ERROR_EVENTS[stage];
  return stageEvents?.[category] ?? null;
}

/** Return fixed aggregate fields for a final outcome; pending is rejected. */
export function caseOutcomeAnalyticsCounterFields(
  outcome: unknown,
): Record<string, number> | null {
  if (
    typeof outcome !== "string" ||
    !Object.prototype.hasOwnProperty.call(CASE_OUTCOME_FIELDS, outcome)
  ) {
    return null;
  }
  return {
    ...CASE_OUTCOME_FIELDS[outcome as CaseOutcomeAnalyticsCategory],
  };
}

/**
 * OpenAI errors expose a numeric status/code, but neither field is retained.
 * The return value remains one of the four bounded aggregate categories.
 */
export function modelAnalyticsErrorCategory(
  error: unknown,
): ProductAnalyticsErrorCategory {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { status?: unknown; code?: unknown };
    if (
      candidate.status === 429 ||
      candidate.code === "rate_limit_exceeded" ||
      candidate.code === "resource-exhausted"
    ) {
      return "rate_limit";
    }
  }
  return "model_failure";
}

type CaseAnalyticsMilestone = CaseAnalyticsEvent | "outcome_recorded";

/**
 * Atomically mark a fixed milestone on the existing case and increment only
 * today's shared customer aggregate. The case stores booleans only: no UID,
 * dates, notes, model output, or other case data is copied into analytics.
 */
async function recordFirstCaseAnalyticsFields(
  uid: string | null | undefined,
  caseRef: DocumentReference,
  milestone: CaseAnalyticsMilestone,
  fields: Readonly<Record<string, number>>,
): Promise<boolean> {
  if (!uid || isAdminAnalyticsUid(uid)) return false;

  try {
    const firestore = getFirestore();
    const dailyRef = firestore
      .collection(ANALYTICS_DAILY_COLLECTION)
      .doc(dayKey());
    return await firestore.runTransaction(async (transaction) => {
      const caseSnapshot = await transaction.get(caseRef);
      if (!caseSnapshot.exists || caseSnapshot.get("ownerUid") !== uid) {
        return false;
      }

      const milestones = caseSnapshot.get("analyticsMilestones");
      if (
        typeof milestones === "object" &&
        milestones !== null &&
        (milestones as Record<string, unknown>)[milestone] === true
      ) {
        return false;
      }

      transaction.update(caseRef, {
        [`analyticsMilestones.${milestone}`]: true,
      });
      transaction.set(
        dailyRef,
        {
          updatedAt: FieldValue.serverTimestamp(),
          ...incrementUpdate({ ...fields }),
        },
        { merge: true },
      );
      return true;
    });
  } catch {
    // Analytics must never break a user flow. Do not log the uid/case/error.
    console.warn(`case analytics milestone failed (ignored): ${milestone}`);
    return false;
  }
}

/**
 * Record a fixed event at most once for this case. Safe for retries and
 * concurrent callable invocations; invalid runtime values are ignored.
 */
export async function recordFirstCaseAnalyticsEvent(
  uid: string | null | undefined,
  caseRef: DocumentReference,
  event: CaseAnalyticsEvent,
): Promise<boolean> {
  const fields = caseAnalyticsCounterFields(event);
  if (!fields) return false;
  return recordFirstCaseAnalyticsFields(uid, caseRef, event, fields);
}

/** Record one bounded error category at most once per case and stage. */
export async function recordFirstCaseAnalyticsError(
  uid: string | null | undefined,
  caseRef: DocumentReference,
  stage: ProductAnalyticsStage,
  category: ProductAnalyticsErrorCategory,
): Promise<boolean> {
  const event = caseAnalyticsErrorEvent(stage, category);
  if (!event) return false;
  return recordFirstCaseAnalyticsEvent(uid, caseRef, event);
}

/**
 * Record only the first non-pending outcome for a case. All final categories
 * share one marker, so later edits cannot increment a second outcome bucket.
 */
export async function recordFirstCaseOutcome(
  uid: string | null | undefined,
  caseRef: DocumentReference,
  outcome: CaseOutcomeAnalyticsCategory,
): Promise<boolean> {
  const fields = caseOutcomeAnalyticsCounterFields(outcome);
  if (!fields) return false;
  return recordFirstCaseAnalyticsFields(
    uid,
    caseRef,
    "outcome_recorded",
    fields,
  );
}

/**
 * Atomically write a traffic event to the overall daily aggregate and to one
 * document for every dimension present on this request. Each destination is
 * still an aggregate shared by all matching traffic, never a visitor record.
 */
async function bumpTrafficDaily(
  fields: Record<string, number>,
  segments: AnalyticsSegment[],
): Promise<void> {
  try {
    const firestore = getFirestore();
    const batch = firestore.batch();
    const day = dayKey();
    const updatedAt = FieldValue.serverTimestamp();

    batch.set(
      firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(day),
      { updatedAt, ...incrementUpdate(fields) },
      { merge: true },
    );

    const segmentFields = filterSegmentableFields(fields);
    const unique = new Map<string, AnalyticsSegment>();
    for (const segment of segments) {
      unique.set(`${segment.type}\u0000${segment.key}`, segment);
    }
    for (const segment of unique.values()) {
      const id = analyticsSegmentDocumentId(day, segment.type, segment.key);
      batch.set(
        firestore.collection(ANALYTICS_SEGMENT_DAILY_COLLECTION).doc(id),
        {
          day,
          type: segment.type,
          key: segment.key,
          updatedAt,
          ...incrementUpdate(segmentFields),
        },
        { merge: true },
      );
    }

    await batch.commit();
  } catch (err) {
    console.warn("analytics bumpTrafficDaily failed (ignored):", err);
  }
}

/**
 * Update only fixed-size aggregate state in the existing daily country
 * segment document. A transaction prevents concurrent visits from losing
 * register maxima. Identity material is never written to Firestore.
 */
async function bumpCountryUniqueDaily(
  country: string,
  networkAddress: string,
  salt: string,
): Promise<void> {
  try {
    const firestore = getFirestore();
    const day = dayKey();
    const ref = firestore
      .collection(ANALYTICS_SEGMENT_DAILY_COLLECTION)
      .doc(analyticsSegmentDocumentId(day, "country", country));
    await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(ref);
      const data = snapshot.data();
      const update = prepareUniqueVisitorSketchUpdate(
        data?.uniqueRegisters,
        data?.uniqueSketchVersion,
        country,
        networkAddress,
        salt,
      );
      if (!update.changed) return;
      transaction.set(
        ref,
        {
          day,
          type: "country",
          key: country,
          updatedAt: FieldValue.serverTimestamp(),
          uniqueSketchVersion: UNIQUE_VISITOR_SKETCH_VERSION,
          uniqueRegisters: update.registers,
          uniqueVisitors: estimateUniqueVisitors(update.registers),
        },
        { merge: true },
      );
    });
  } catch (err) {
    console.warn("analytics unique-country bump failed (ignored):", err);
  }
}

/** Referrer hosts that are ourselves — not interesting as acquisition. */
const SELF_HOSTS = new Set([
  "getmyyes.com",
  "www.getmyyes.com",
  "claimhelper-38152.web.app",
  "claimhelper-38152.firebaseapp.com",
  "localhost",
]);

/** A bounded, aggregate campaign label parsed from standard UTM parameters. */
function campaignFromRequest(req: {
  headers: { referer?: string | string[] };
}): string | null {
  const raw = req.headers.referer;
  const referer = Array.isArray(raw) ? raw[0] : String(raw ?? "");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    const source = keyify(url.searchParams.get("utm_source"), 28);
    const medium = keyify(url.searchParams.get("utm_medium"), 28);
    const name = keyify(url.searchParams.get("utm_campaign"), 36);
    if (!source && !medium && !name) return null;
    return [source || "unknown", medium || "unknown", name || "untagged"].join(" | ");
  } catch {
    return null;
  }
}

async function hasSignedAdminExclusion(req: {
  headers: { cookie?: string | string[] };
}): Promise<boolean> {
  const sessionCookie = cookieValue(
    req.headers.cookie,
    ADMIN_ANALYTICS_COOKIE,
  );
  if (!sessionCookie) return false;
  try {
    const decoded = await getAuth().verifySessionCookie(sessionCookie);
    return isAdminAnalyticsUid(decoded.uid);
  } catch {
    // A missing, malformed, expired, or forged cookie must never suppress a
    // real customer's event.
    return false;
  }
}

export type AppReadyBucket =
  | "under_1s"
  | "1_to_2s"
  | "2_to_4s"
  | "4_to_8s"
  | "over_8s";

/**
 * Convert an untrusted client timing into one fixed aggregate bucket. The
 * exact timing and page are never retained, and implausible values are
 * discarded instead of becoming dynamic analytics keys.
 */
export function appReadyBucket(value: unknown): AppReadyBucket | null {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 120_000
  ) {
    return null;
  }
  if (value < 1_000) return "under_1s";
  if (value < 2_000) return "1_to_2s";
  if (value < 4_000) return "2_to_4s";
  if (value < 8_000) return "4_to_8s";
  return "over_8s";
}

/**
 * Exchanges the signed-in owner's Firebase ID token for a signed, HttpOnly
 * session cookie. Hosting exposes this as POST /api/admin-analytics-exclusion.
 * Normal users cannot mint the cookie, and trackEvent never trusts a plain
 * client-side opt-out flag.
 */
export const setAdminAnalyticsExclusion = onRequest(
  { invoker: "public", cors: true },
  async (req, res) => {
    // Firebase Hosting does not consistently append configured Hosting
    // headers to non-2xx responses from a rewritten Function, so protect this
    // endpoint at the source as well.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "geolocation=(), microphone=()");
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
    res.setHeader("Cache-Control", "no-store");
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).send("");
      return;
    }

    const idToken = bearerToken(req.headers.authorization);
    if (!idToken) {
      res.status(401).send("");
      return;
    }

    let uid: string;
    try {
      uid = (await getAuth().verifyIdToken(idToken, true)).uid;
    } catch {
      res.status(401).send("");
      return;
    }
    if (!isAdminAnalyticsUid(uid)) {
      res.status(403).send("");
      return;
    }

    try {
      const sessionCookie = await getAuth().createSessionCookie(idToken, {
        expiresIn: ADMIN_ANALYTICS_SESSION_MS,
      });
      res.setHeader("Set-Cookie", adminAnalyticsCookieHeader(sessionCookie));
      res.status(204).send("");
    } catch (err) {
      console.error("Could not establish admin analytics exclusion:", err);
      res.status(500).send("");
    }
  },
);

/**
 * trackEvent
 * Public HTTP endpoint the web client pings with navigator.sendBeacon.
 * Accepts {t: "visit"|"boot"|"pageview"|"app_ready", path?, ref?, ms?}.
 * Exact app timings are collapsed into fixed buckets; anything else is
 * dropped. Responds 204 always — the client never reads the response.
 */
export const trackEvent = onRequest(
  { invoker: "public", cors: true, secrets: [analyticsUniqueSalt] },
  async (req, res) => {
    if (req.method !== "POST") {
      res.status(204).send("");
      return;
    }
    // Country of the visit, resolved by Firebase Hosting for requests routed
    // through the /api/track rewrite (x-country-code). Aggregate-only, like
    // everything else here — the IP it derives from is never stored.
    const rawCountry = String(req.headers["x-country-code"] ?? "").toUpperCase();
    const country = /^[A-Z]{2}$/.test(rawCountry) ? rawCountry : null;
    if (req.query.echo === "1") {
      // Debug aid: echoes the requester's own resolved country, nothing else.
      res.status(200).json({ ok: true, country });
      return;
    }
    try {
      // sendBeacon posts as text/plain, so parse rawBody ourselves.
      const body = JSON.parse(req.rawBody.toString("utf8").slice(0, 2048));
      const t = body?.t as string;
      if (
        t !== "visit" &&
        t !== "boot" &&
        t !== "pageview" &&
        t !== "app_ready"
      ) {
        res.status(204).send("");
        return;
      }
      if (isExcludedAnalyticsPath(body?.path)) {
        res.status(204).send("");
        return;
      }
      if (await hasSignedAdminExclusion(req)) {
        res.status(204).send("");
        return;
      }
      const path = keyify(body?.path) ?? "/";
      const readyBucket = t === "app_ready" ? appReadyBucket(body?.ms) : null;
      if (t === "app_ready" && !readyBucket) {
        res.status(204).send("");
        return;
      }

      const fields: Record<string, number> = {};
      const segments: AnalyticsSegment[] =
        t === "app_ready" ? [] : [{ type: "path", key: path }];
      if (country && t !== "app_ready") {
        segments.push({ type: "country", key: country });
      }
      const campaign = t === "app_ready" ? null : campaignFromRequest(req);
      if (campaign) segments.push({ type: "campaign", key: campaign });
      let referrer: string | null = null;
      if (typeof body?.ref === "string" && body.ref) {
        try {
          const host = new URL(body.ref).hostname.toLowerCase();
          if (!SELF_HOSTS.has(host)) referrer = keyify(host);
        } catch {
          /* unparseable referrer — skip */
        }
      }
      if (referrer && t !== "app_ready") {
        segments.push({ type: "referrer", key: referrer });
      }

      if (t === "visit") {
        fields["visits"] = 1;
        fields["pageviews"] = 1;
        fields[`paths.${path}`] = 1;
        if (country) fields[`countries.${country}`] = 1;
        if (campaign) {
          fields[`campaigns.${campaign}`] = 1;
        }
        if (referrer) fields[`referrers.${referrer}`] = 1;
      } else if (t === "boot") {
        fields["boots"] = 1;
      } else if (t === "pageview") {
        fields["pageviews"] = 1;
        fields[`paths.${path}`] = 1;
      } else if (t === "app_ready" && readyBucket) {
        fields[`performance.app_ready.${readyBucket}`] = 1;
      }

      if (Object.keys(fields).length > 0) {
        await bumpTrafficDaily(fields, segments);
        if (t === "visit" && country) {
          const networkAddress = clientNetworkAddress(
            req.headers["x-forwarded-for"],
          );
          if (networkAddress) {
            await bumpCountryUniqueDaily(
              country,
              networkAddress,
              analyticsUniqueSalt.value(),
            );
          }
        }
      }
    } catch {
      /* malformed payload — drop silently */
    }
    res.status(204).send("");
  },
);
