import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
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
import { requireOwnedCase, requireUid } from "./util";

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
 * Aggregate OpenAI operational telemetry. This is intentionally separate from
 * customer traffic/product analytics: it has no case id, user id, prompt,
 * completion, or model-response field.
 */
export const ANALYTICS_MODEL_DAILY_COLLECTION = "analytics_model_daily";

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

type RequestHeader = string | string[] | undefined;

export interface AnalyticsProvenanceHeaders {
  origin?: RequestHeader;
  referer?: RequestHeader;
  "sec-fetch-site"?: RequestHeader;
}

/** Origins from which the first-party tracker is intentionally served. */
const FIRST_PARTY_ANALYTICS_ORIGINS = new Set([
  "https://getmyyes.com",
  "https://www.getmyyes.com",
  "https://claimhelper-38152.web.app",
  "https://claimhelper-38152.firebaseapp.com",
]);

interface ParsedHeader {
  present: boolean;
  value: string | null;
}

/** Reject duplicated security headers instead of choosing an attacker value. */
function parsedHeader(raw: RequestHeader): ParsedHeader {
  if (raw === undefined) return { present: false, value: null };
  if (Array.isArray(raw)) {
    if (raw.length !== 1) return { present: true, value: null };
    raw = raw[0];
  }
  const value = raw.trim();
  return { present: true, value: value.length > 0 ? value : null };
}

/** Whether a URL belongs to one of the site's fixed first-party origins. */
export function isFirstPartyAnalyticsUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return (
      (url.protocol === "https:" || url.protocol === "http:") &&
      FIRST_PARTY_ANALYTICS_ORIGINS.has(url.origin)
    );
  } catch {
    return false;
  }
}

function isFirstPartyAnalyticsOrigin(raw: string): boolean {
  try {
    const url = new URL(raw);
    return raw === url.origin && FIRST_PARTY_ANALYTICS_ORIGINS.has(url.origin);
  } catch {
    return false;
  }
}

/**
 * Enforce browser provenance for the browser-only analytics endpoints.
 *
 * Modern browsers supply Sec-Fetch-Site and/or Origin, so cross-site requests
 * are rejected even though sendBeacon uses a CORS-safelisted content type.
 * Older same-origin browsers can be validated by Referer. Requests with none
 * of these browser-provenance headers are dropped. These headers are not an
 * authentication mechanism, so the bounded taxonomies below remain the main
 * protection against forged server requests and unbounded database writes.
 */
export function isTrustedAnalyticsRequest(
  headers: AnalyticsProvenanceHeaders,
): boolean {
  const fetchSite = parsedHeader(headers["sec-fetch-site"]);
  if (
    fetchSite.present &&
    fetchSite.value !== "same-origin" &&
    fetchSite.value !== "same-site"
  ) {
    return false;
  }

  const origin = parsedHeader(headers.origin);
  if (
    origin.present &&
    (!origin.value || !isFirstPartyAnalyticsOrigin(origin.value))
  ) {
    return false;
  }

  const referer = parsedHeader(headers.referer);
  if (
    referer.present &&
    (!referer.value || !isFirstPartyAnalyticsUrl(referer.value))
  ) {
    return false;
  }
  return fetchSite.present || origin.present || referer.present;
}

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

/** A finite path taxonomy prevents arbitrary URLs becoming Firestore fields. */
const ANALYTICS_EXACT_PATH_CATEGORIES = new Set([
  "/",
  "/upload",
  "/processing",
  "/account",
  "/settings",
  "/privacy",
  "/terms",
  "/accessibility",
  "/editorial-policy",
  "/sample-packet",
  "/insurer-denial-rates",
  "/appeals",
  "/codes",
  "/insurers",
]);
const CASE_PATH_STAGES = new Set([
  "processing",
  "review",
  "questions",
  "preview",
  "purchase-success",
  "packet",
]);
const ANALYTICS_GROUPED_PATH_CATEGORIES = new Set([
  "/appeals/:article",
  "/codes/:code",
  "/insurers/:insurer",
  "/tools/:tool",
  ...Array.from(CASE_PATH_STAGES, (stage) => `/case/:id/${stage}`),
]);
export const ANALYTICS_OTHER_PATH = "/other";

/** Parse a browser route once, including encoded and hash-router variants. */
function analyticsRequestPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim().slice(0, 1024);
  if (!path) return null;
  try {
    const url = new URL(path);
    path = url.hash.startsWith("#/") ? url.hash.slice(1) : url.pathname;
  } catch {
    // Route values are normally relative paths, which URL intentionally rejects.
  }
  const hashRoute = path.indexOf("#/");
  if (hashRoute >= 0) path = path.slice(hashRoute + 1);
  path = path.replace(/[?&#].*$/, "");
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = path.replace(/\/{2,}/g, "/");
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "");
  path = path.replace(/\.html$/i, "").toLowerCase();
  return path || "/";
}

/**
 * The private dashboard is not customer traffic. Suppress it even on a fresh
 * browser before Firebase Auth has had time to establish the exclusion cookie.
 */
export function isExcludedAnalyticsPath(raw: unknown): boolean {
  const path = analyticsRequestPath(raw);
  return path === "/stats" || Boolean(path?.startsWith("/stats/"));
}

/** Collapse every accepted route to a fixed category or `/other`. */
export function analyticsPathCategory(raw: unknown): string {
  const path = analyticsRequestPath(raw);
  if (!path || isExcludedAnalyticsPath(path)) return ANALYTICS_OTHER_PATH;
  if (ANALYTICS_EXACT_PATH_CATEGORIES.has(path)) return path;

  const caseMatch = /^\/case\/[^/]+\/([^/]+)$/.exec(path);
  if (caseMatch && CASE_PATH_STAGES.has(caseMatch[1])) {
    return `/case/:id/${caseMatch[1]}`;
  }
  if (/^\/appeals\/[^/]+$/.test(path)) return "/appeals/:article";
  if (/^\/codes\/[^/]+$/.test(path)) return "/codes/:code";
  if (/^\/insurers\/[^/]+$/.test(path)) return "/insurers/:insurer";
  if (/^\/tools\/[^/]+$/.test(path)) return "/tools/:tool";
  return ANALYTICS_OTHER_PATH;
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

export type SegmentType = "country" | "referrer" | "campaign" | "path";

export interface AnalyticsSegment {
  type: SegmentType;
  key: string;
}

export const MAX_ANALYTICS_SEGMENTS_PER_EVENT = 4;
export const MAX_TRAFFIC_COUNTER_FIELDS_PER_EVENT = 8;
const MAX_ANALYTICS_SEGMENT_KEY_LENGTH = 64;

/** ISO 3166-1 alpha-2 codes plus XK, which upstream geolocation may emit. */
const ANALYTICS_COUNTRY_CODES = new Set(
  (
    "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ " +
    "BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ " +
    "CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ " +
    "DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR " +
    "GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY " +
    "HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP " +
    "KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY " +
    "MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ " +
    "NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR " +
    "PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN " +
    "SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW " +
    "TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW"
  ).split(" "),
);

const SELF_HOSTS = new Set([
  "getmyyes.com",
  "www.getmyyes.com",
  "claimhelper-38152.web.app",
  "claimhelper-38152.firebaseapp.com",
  "localhost",
]);

const REFERRER_DOMAIN_RULES: ReadonlyArray<
  readonly [string, readonly string[]]
> = [
  ["chatgpt", ["chatgpt.com", "chat.openai.com"]],
  ["perplexity", ["perplexity.ai"]],
  ["gemini", ["gemini.google.com"]],
  ["copilot", ["copilot.microsoft.com"]],
  ["claude", ["claude.ai"]],
  [
    "google",
    [
      "google.com",
      "google.co.uk",
      "google.ca",
      "google.de",
      "google.fr",
      "google.lt",
      "google.com.au",
    ],
  ],
  ["bing", ["bing.com"]],
  ["duckduckgo", ["duckduckgo.com"]],
  ["yahoo", ["search.yahoo.com", "yahoo.com"]],
  ["facebook", ["facebook.com", "fb.com"]],
  ["instagram", ["instagram.com"]],
  ["linkedin", ["linkedin.com"]],
  ["reddit", ["reddit.com"]],
  ["x", ["x.com", "twitter.com", "t.co"]],
  ["tiktok", ["tiktok.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
];
const ANALYTICS_REFERRER_CATEGORIES = new Set([
  ...REFERRER_DOMAIN_RULES.map(([category]) => category),
  "other",
]);

const CAMPAIGN_SOURCE_CATEGORIES = new Set([
  "google",
  "bing",
  "duckduckgo",
  "yahoo",
  "meta",
  "linkedin",
  "reddit",
  "x",
  "tiktok",
  "youtube",
  "email",
  "partner",
  "affiliate",
  "other",
]);
const CAMPAIGN_MEDIUM_CATEGORIES = new Set([
  "paid_search",
  "paid_social",
  "organic",
  "social",
  "email",
  "referral",
  "affiliate",
  "display",
  "other",
]);
const CAMPAIGN_TAG_CATEGORIES = new Set(["tagged", "untagged"]);
const ANALYTICS_PATH_CATEGORIES = new Set([
  ...ANALYTICS_EXACT_PATH_CATEGORIES,
  ...ANALYTICS_GROUPED_PATH_CATEGORIES,
  ANALYTICS_OTHER_PATH,
]);

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

/** Whether a host equals or is a real subdomain of a fixed domain. */
function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function countryAnalyticsCategory(raw: RequestHeader): string | null {
  const parsed = parsedHeader(raw);
  if (!parsed.present || !parsed.value) return null;
  const country = parsed.value.toUpperCase();
  return ANALYTICS_COUNTRY_CODES.has(country) ? country : null;
}

/** Map an arbitrary referrer URL into a finite acquisition-source category. */
export function referrerAnalyticsCategory(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 2048) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const host = url.hostname.toLowerCase();
    if (SELF_HOSTS.has(host)) return null;
    for (const [category, domains] of REFERRER_DOMAIN_RULES) {
      if (domains.some((domain) => hostMatches(host, domain))) return category;
    }
    return "other";
  } catch {
    return null;
  }
}

function normalizedCampaignToken(raw: string | null): string | null {
  if (!raw) return null;
  const token = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  return token || null;
}

function campaignSourceCategory(raw: string | null): string {
  const token = normalizedCampaignToken(raw);
  if (!token) return "other";
  if (["facebook", "fb", "instagram", "ig", "meta"].includes(token)) {
    return "meta";
  }
  if (["twitter", "twitter_ads"].includes(token)) return "x";
  if (["newsletter", "mail", "email_newsletter"].includes(token)) {
    return "email";
  }
  return CAMPAIGN_SOURCE_CATEGORIES.has(token) ? token : "other";
}

function campaignMediumCategory(raw: string | null): string {
  const token = normalizedCampaignToken(raw);
  if (!token) return "other";
  if (["cpc", "ppc", "paidsearch", "search_ads"].includes(token)) {
    return "paid_search";
  }
  if (["paid_social", "paidsocial", "social_ads"].includes(token)) {
    return "paid_social";
  }
  if (["organic_search", "seo"].includes(token)) return "organic";
  if (["newsletter", "mail"].includes(token)) return "email";
  return CAMPAIGN_MEDIUM_CATEGORIES.has(token) ? token : "other";
}

/** Parse only a first-party landing-page Referer and retain fixed UTM buckets. */
export function campaignAnalyticsCategory(raw: RequestHeader): string | null {
  const parsed = parsedHeader(raw);
  if (!parsed.present || !parsed.value || !isFirstPartyAnalyticsUrl(parsed.value)) {
    return null;
  }
  try {
    const url = new URL(parsed.value);
    const sourceRaw = url.searchParams.get("utm_source");
    const mediumRaw = url.searchParams.get("utm_medium");
    const nameRaw = url.searchParams.get("utm_campaign");
    if (!sourceRaw && !mediumRaw && !nameRaw) return null;
    const source = campaignSourceCategory(sourceRaw);
    const medium = campaignMediumCategory(mediumRaw);
    const tag = normalizedCampaignToken(nameRaw) ? "tagged" : "untagged";
    return `${source}|${medium}|${tag}`;
  } catch {
    return null;
  }
}

function isAllowedCampaignCategory(key: string): boolean {
  const [source, medium, tag, extra] = key.split("|");
  return (
    extra === undefined &&
    CAMPAIGN_SOURCE_CATEGORIES.has(source) &&
    CAMPAIGN_MEDIUM_CATEGORIES.has(medium) &&
    CAMPAIGN_TAG_CATEGORIES.has(tag)
  );
}

function isAllowedSegment(segment: AnalyticsSegment): boolean {
  if (
    typeof segment?.key !== "string" ||
    segment.key.length === 0 ||
    segment.key.length > MAX_ANALYTICS_SEGMENT_KEY_LENGTH
  ) {
    return false;
  }
  switch (segment.type) {
    case "country":
      return ANALYTICS_COUNTRY_CODES.has(segment.key);
    case "referrer":
      return ANALYTICS_REFERRER_CATEGORIES.has(segment.key);
    case "campaign":
      return isAllowedCampaignCategory(segment.key);
    case "path":
      return ANALYTICS_PATH_CATEGORIES.has(segment.key);
    default:
      return false;
  }
}

/** Deduplicate and cap segment-document writes even if a future caller errs. */
export function boundedAnalyticsSegments(
  segments: readonly AnalyticsSegment[],
): AnalyticsSegment[] {
  const unique = new Map<string, AnalyticsSegment>();
  for (const segment of segments) {
    if (!isAllowedSegment(segment)) continue;
    unique.set(`${segment.type}\u0000${segment.key}`, { ...segment });
    if (unique.size >= MAX_ANALYTICS_SEGMENTS_PER_EVENT) break;
  }
  return [...unique.values()];
}

function isAllowedTrafficCounterPath(path: string): boolean {
  if (path === "visits" || path === "pageviews" || path === "boots") {
    return true;
  }
  if (
    path === "intent.start_appeal_clicked" ||
    path === "intent.document_added"
  ) {
    return true;
  }
  if (path.startsWith("performance.app_ready.")) {
    return appReadyBucketNames.has(path.slice("performance.app_ready.".length));
  }
  const separator = path.indexOf(".");
  if (separator < 1) return false;
  const root = path.slice(0, separator);
  const key = path.slice(separator + 1);
  if (root === "countries") return ANALYTICS_COUNTRY_CODES.has(key);
  if (root === "referrers") return ANALYTICS_REFERRER_CATEGORIES.has(key);
  if (root === "campaigns") return isAllowedCampaignCategory(key);
  if (root === "paths") return ANALYTICS_PATH_CATEGORIES.has(key);
  return false;
}

/** Keep only fixed one-count traffic fields and enforce the per-event cap. */
export function filterTrafficCounterFields(
  fields: Record<string, number>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [path, value] of Object.entries(fields)) {
    if (value !== 1 || !isAllowedTrafficCounterPath(path)) continue;
    result[path] = 1;
    if (Object.keys(result).length >= MAX_TRAFFIC_COUNTER_FIELDS_PER_EVENT) {
      break;
    }
  }
  return result;
}

export function filterSegmentableFields(
  fields: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(filterTrafficCounterFields(fields)).filter(
      ([path]) => !path.startsWith("performance."),
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

/** The only model operations that may become aggregate counter paths. */
export const MODEL_ANALYTICS_OPERATIONS = [
  "extraction",
  "preview",
  "packet",
  "followup",
] as const;
export type ModelAnalyticsOperation = (typeof MODEL_ANALYTICS_OPERATIONS)[number];

export function modelAnalyticsOperation(
  value: unknown,
): ModelAnalyticsOperation | null {
  return typeof value === "string" &&
    (MODEL_ANALYTICS_OPERATIONS as readonly string[]).includes(value)
    ? value as ModelAnalyticsOperation
    : null;
}

/** Fixed, non-identifying counters recorded for one model request. */
export interface ModelAnalyticsCounters {
  calls: number;
  errors?: number;
  inputTokens?: number;
  outputTokens?: number;
  totalDurationMs?: number;
}

const MODEL_ANALYTICS_COUNTERS = [
  "calls",
  "errors",
  "inputTokens",
  "outputTokens",
  "totalDurationMs",
] as const;
const MAX_MODEL_ANALYTICS_INCREMENT = 1_000_000_000;

function modelAnalyticsCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(MAX_MODEL_ANALYTICS_INCREMENT, Math.max(0, Math.floor(value)));
}

/**
 * Converts a fixed model-operation sample into aggregate-only Firestore paths.
 * Invalid or zero counters are omitted, so no caller-controlled path can be
 * written even if a future instrumentation call is malformed.
 */
export function modelAnalyticsCounterFields(
  operation: unknown,
  counters: Partial<ModelAnalyticsCounters>,
): Record<string, number> {
  const normalizedOperation = modelAnalyticsOperation(operation);
  if (!normalizedOperation || typeof counters !== "object" || counters === null) {
    return {};
  }
  const fields: Record<string, number> = {};
  for (const counter of MODEL_ANALYTICS_COUNTERS) {
    const value = modelAnalyticsCount(counters[counter]);
    if (value === 0) continue;
    fields[`operations.${normalizedOperation}.${counter}`] = value;
    fields[counter] = value;
  }
  return fields;
}

/**
 * Record operational model telemetry without retaining a customer, case, or
 * request/response payload. Callers must pass the owning uid so owner testing
 * is excluded from this collection just like every other customer statistic.
 */
export async function bumpModelDaily(
  uid: string | null | undefined,
  operation: unknown,
  counters: Partial<ModelAnalyticsCounters>,
): Promise<void> {
  if (!uid || isAdminAnalyticsUid(uid)) return;
  const fields = modelAnalyticsCounterFields(operation, counters);
  if (Object.keys(fields).length === 0) return;
  try {
    await getFirestore()
      .collection(ANALYTICS_MODEL_DAILY_COLLECTION)
      .doc(dayKey())
      .set({
        updatedAt: FieldValue.serverTimestamp(),
        ...incrementUpdate(fields),
      }, { merge: true });
  } catch {
    // Telemetry must never fail an OpenAI request or expose customer data.
    console.warn("model analytics bump failed (ignored)");
  }
}

/** Product stages whose first success/failure is useful in aggregate. */
export type ProductAnalyticsStage = "extraction" | "preview" | "packet";

/**
 * Optional, fixed acquisition categories. They deliberately contain no free
 * text, campaign name, URL, or visitor identifier. A customer may decline by
 * choosing `prefer_not_to_say`.
 */
export const ACQUISITION_SOURCES = [
  "google",
  "quora",
  "social",
  "friend_family",
  "advocate_provider",
  "other",
  "prefer_not_to_say",
] as const;
export type AcquisitionSource = (typeof ACQUISITION_SOURCES)[number];

export function acquisitionSourceCategory(value: unknown): AcquisitionSource | null {
  return typeof value === "string" &&
    (ACQUISITION_SOURCES as readonly string[]).includes(value)
    ? value as AcquisitionSource
    : null;
}

export const FEEDBACK_SATISFACTION_VALUES = [
  "very_dissatisfied",
  "dissatisfied",
  "neutral",
  "satisfied",
  "very_satisfied",
] as const;
export type FeedbackSatisfaction = (typeof FEEDBACK_SATISFACTION_VALUES)[number];

export const FEEDBACK_OUTCOME_VALUES = [
  "not_submitted_yet",
  "submitted_waiting",
  "approved",
  "partially_approved",
  "denied",
  "withdrawn",
] as const;
export type FeedbackOutcome = (typeof FEEDBACK_OUTCOME_VALUES)[number];

export function feedbackSatisfactionCategory(value: unknown): FeedbackSatisfaction | null {
  return typeof value === "string" &&
    (FEEDBACK_SATISFACTION_VALUES as readonly string[]).includes(value)
    ? value as FeedbackSatisfaction
    : null;
}

export function feedbackOutcomeCategory(value: unknown): FeedbackOutcome | null {
  return typeof value === "string" &&
    (FEEDBACK_OUTCOME_VALUES as readonly string[]).includes(value)
    ? value as FeedbackOutcome
    : null;
}

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
  | "tier_selected"
  | "account_gate_shown"
  | "account_completed"
  | "checkout_started"
  | "checkout_created"
  | "checkout_expired"
  | "checkout_recovered"
  | "checkout_duplicate"
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
  tier_selected: { "funnel.tier_selected": 1 },
  account_gate_shown: { "funnel.account_gate_shown": 1 },
  account_completed: { "funnel.account_completed": 1 },
  checkout_started: { "funnel.checkout_started": 1 },
  checkout_created: { "product.checkout.created": 1 },
  checkout_expired: { "product.checkout.expired": 1 },
  checkout_recovered: { "product.checkout.recovered": 1 },
  checkout_duplicate: { "product.checkout.duplicate": 1 },
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

/** Stripe purchase kinds are mapped to fixed, customer-safe product buckets. */
export type PaymentAnalyticsPurchaseKind =
  | "packet"
  | "packet_plus"
  | "followup_round"
  | "full_case";
export type PaymentAnalyticsProduct =
  | "packet"
  | "full_case"
  | "followup_round"
  | "full_case_upgrade";

export function paymentAnalyticsProduct(
  value: unknown,
): PaymentAnalyticsProduct | null {
  switch (value) {
    case "packet":
      return "packet";
    case "packet_plus":
      return "full_case";
    case "followup_round":
      return "followup_round";
    case "full_case":
      return "full_case_upgrade";
    default:
      return null;
  }
}

export type CaseMonetizationEvent =
  | "tier_selected"
  | "checkout_created"
  | "checkout_expired"
  | "checkout_recovered";
export type PurchaseMonetizationEvent = "paid" | "refunded";

function centsForAnalytics(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(10_000_000, Math.max(0, Math.floor(value)))
    : 0;
}

/**
 * Counter fields for a payment event. Product and event names are both closed
 * sets, and only server-confirmed cents can affect monetary fields.
 */
export function paymentAnalyticsCounterFields(
  kind: unknown,
  event: CaseMonetizationEvent | PurchaseMonetizationEvent,
  amountCents = 0,
): Record<string, number> | null {
  const product = paymentAnalyticsProduct(kind);
  if (!product) return null;
  const fields: Record<string, number> = {
    [`monetization.${product}.${event}`]: 1,
  };
  const cents = centsForAnalytics(amountCents);
  if (event === "paid") {
    fields[`monetization.${product}.revenueCents`] = cents;
    fields[`monetization.${product}.netRevenueCents`] = cents;
  } else if (event === "refunded") {
    fields[`monetization.${product}.refundCents`] = cents;
    fields[`monetization.${product}.netRevenueCents`] = -cents;
  }
  return fields;
}

/**
 * Record a checkout/tier event once per case and product bucket. This covers
 * selection and open-session lifecycle events, whose source of truth is the
 * case rather than a completed purchase document.
 */
export async function recordFirstCaseMonetizationEvent(
  uid: string | null | undefined,
  caseRef: DocumentReference,
  kind: unknown,
  event: CaseMonetizationEvent,
): Promise<boolean> {
  const product = paymentAnalyticsProduct(kind);
  const fields = paymentAnalyticsCounterFields(kind, event);
  if (!product || !fields) return false;
  return recordFirstCaseAnalyticsFields(
    uid,
    caseRef,
    `monetization_${product}_${event}` as CaseAnalyticsMilestone,
    fields,
  );
}

/**
 * Records a customer-selected initial tier. The callable accepts only the two
 * advertised initial products; add-ons can never be client-reported here.
 */
export const recordCaseTierSelection = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const caseRef = (await requireOwnedCase(request.data?.caseId, uid)).ref;
  const kind = request.data?.kind;
  if (kind !== "packet" && kind !== "packet_plus") {
    throw new HttpsError("invalid-argument", "Choose an advertised package only.");
  }
  return {
    recorded: await recordFirstCaseMonetizationEvent(
      uid,
      caseRef,
      kind,
      "tier_selected",
    ),
  };
});

/**
 * Record a settled payment/refund once on its purchase document. Keeping the
 * idempotency marker beside the Stripe purchase means repeat $19 follow-up
 * purchases remain countable while webhook retries cannot inflate revenue.
 * Unlike non-financial product analytics, a storage failure deliberately
 * propagates: the entitlement transaction has already committed, and Stripe's
 * webhook retry or the Checkout reconciliation watchdog can safely repair the
 * missing revenue entry.
 */
export async function recordFirstPurchaseMonetizationEvent(
  uid: string | null | undefined,
  purchaseRef: DocumentReference,
  kind: unknown,
  event: PurchaseMonetizationEvent,
  amountCents: number,
): Promise<boolean> {
  if (!uid || isAdminAnalyticsUid(uid)) return false;
  const product = paymentAnalyticsProduct(kind);
  const fields = paymentAnalyticsCounterFields(kind, event, amountCents);
  if (!product || !fields) return false;
  const firestore = getFirestore();
  const dailyRef = firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(dayKey());
  return firestore.runTransaction(async (transaction) => {
    const purchase = await transaction.get(purchaseRef);
    if (!purchase.exists || purchase.get("uid") !== uid) return false;
    const milestones = purchase.get("analyticsMilestones");
    const milestone = `monetization_${event}`;
    if (
      typeof milestones === "object" &&
      milestones !== null &&
      (milestones as Record<string, unknown>)[milestone] === true
    ) {
      return false;
    }
    transaction.set(purchaseRef, {
      [`analyticsMilestones.${milestone}`]: true,
    }, { merge: true });
    transaction.set(dailyRef, {
      updatedAt: FieldValue.serverTimestamp(),
      ...incrementUpdate(fields),
    }, { merge: true });
    return true;
  });
}

/**
 * Record one Stripe refund exactly once. Refunds are deliberately keyed below
 * their purchase rather than using one purchase-level boolean: Stripe permits
 * multiple partial refunds, and each one must reduce net revenue by its own
 * settled amount without a webhook retry counting it twice.
 */
export async function recordPurchaseRefundMonetizationEvent(
  uid: string | null | undefined,
  purchaseRef: DocumentReference,
  kind: unknown,
  refundId: unknown,
  amountCents: number,
): Promise<boolean> {
  if (!uid || isAdminAnalyticsUid(uid)) return false;
  if (typeof refundId !== "string" || !/^[A-Za-z0-9_]{3,255}$/.test(refundId)) {
    return false;
  }
  const product = paymentAnalyticsProduct(kind);
  const fields = paymentAnalyticsCounterFields(kind, "refunded", amountCents);
  if (!product || !fields || centsForAnalytics(amountCents) <= 0) return false;
  try {
    const firestore = getFirestore();
    const dailyRef = firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(dayKey());
    const refundRef = purchaseRef.collection("refunds").doc(refundId);
    return await firestore.runTransaction(async (transaction) => {
      const [purchase, refund] = await Promise.all([
        transaction.get(purchaseRef),
        transaction.get(refundRef),
      ]);
      if (!purchase.exists || purchase.get("uid") !== uid) return false;
      const milestones = purchase.get("analyticsMilestones");
      // Never subtract a refund from the aggregate unless the matching charge
      // was first counted there. This keeps orphaned/deleted-case refunds and
      // pre-monetization records from making net revenue go negative.
      if (
        typeof milestones !== "object" ||
        milestones === null ||
        (milestones as Record<string, unknown>).monetization_paid !== true
      ) {
        return false;
      }
      if (refund.get("analyticsRecorded") === true) return false;
      transaction.set(refundRef, {
        analyticsRecorded: true,
        analyticsRecordedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      transaction.set(dailyRef, {
        updatedAt: FieldValue.serverTimestamp(),
        ...incrementUpdate(fields),
      }, { merge: true });
      return true;
    });
  } catch {
    console.warn("purchase refund monetization analytics failed (ignored)");
    return false;
  }
}

const CLIENT_CASE_FUNNEL_EVENTS = new Set<CaseAnalyticsEvent>([
  "tier_selected",
  "account_gate_shown",
  "account_completed",
]);

/**
 * Records a small, fixed UI milestone for a case. The browser can request
 * only the three allowlisted milestones above; it can never create an
 * analytics key from a route, email address, document field, or free text.
 */
export const recordCaseFunnelEvent = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const caseRef = (await requireOwnedCase(request.data?.caseId, uid)).ref;
  const event = request.data?.event;
  if (typeof event !== "string" || !CLIENT_CASE_FUNNEL_EVENTS.has(event as CaseAnalyticsEvent)) {
    throw new HttpsError("invalid-argument", "Unknown funnel event.");
  }
  return {
    recorded: await recordFirstCaseAnalyticsEvent(
      uid,
      caseRef,
      event as CaseAnalyticsEvent,
    ),
  };
});

/**
 * Saves one optional, fixed acquisition source before checkout. This is not a
 * campaign tracker: no UTM values, referrer URL, email, or free-form answer is
 * retained. The one category lets a later paid event be counted by source.
 */
export const saveCaseAcquisitionAttribution = onCall(
  { invoker: "public" },
  async (request) => {
    const uid = requireUid(request);
    const caseRef = (await requireOwnedCase(request.data?.caseId, uid)).ref;
    const source = acquisitionSourceCategory(request.data?.source);
    if (!source) {
      throw new HttpsError("invalid-argument", "Choose a listed source only.");
    }
    if (isAdminAnalyticsUid(uid)) return { saved: false };

    const firestore = getFirestore();
    const dailyRef = firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(dayKey());
    const saved = await firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(caseRef);
      if (!snapshot.exists || snapshot.get("ownerUid") !== uid) {
        throw new HttpsError("permission-denied", "Case access was lost.");
      }
      const existing = acquisitionSourceCategory(snapshot.get("acquisitionSource"));
      // First-touch only: changing a source later would make aggregate totals
      // impossible to correct without retaining a customer-level history.
      if (existing) return existing === source;

      transaction.update(caseRef, {
        acquisitionSource: source,
        "analyticsMilestones.acquisition_source_selected": true,
      });
      transaction.set(
        dailyRef,
        {
          updatedAt: FieldValue.serverTimestamp(),
          ...incrementUpdate({
            "funnel.acquisition_source_selected": 1,
            [`acquisition.${source}.selected`]: 1,
          }),
        },
        { merge: true },
      );
      return true;
    });
    return { saved };
  },
);

/**
 * After the Stripe webhook has confirmed payment, copy only its fixed source
 * and server-set amount into a daily aggregate. This avoids linking
 * referrer/UTM data to an individual health-document case.
 */
export async function recordFirstPaidAcquisitionAttribution(
  uid: string | null | undefined,
  caseRef: DocumentReference,
): Promise<boolean> {
  if (!uid || isAdminAnalyticsUid(uid)) return false;
  const firestore = getFirestore();
  const dailyRef = firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(dayKey());
  return firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(caseRef);
    if (!snapshot.exists || snapshot.get("ownerUid") !== uid || snapshot.get("paid") !== true) {
      return false;
    }
    const source = acquisitionSourceCategory(snapshot.get("acquisitionSource"));
    if (!source || snapshot.get("analyticsMilestones.paid_attribution") === true) {
      return false;
    }
    const price = snapshot.get("pricePaid");
    const cents = typeof price === "number" && Number.isFinite(price)
      ? Math.max(0, Math.round(price * 100))
      : 0;
    // The category has served its sole purpose. Removing it prevents a
    // durable source label from sitting beside a health-document case.
    transaction.update(caseRef, {
      "analyticsMilestones.paid_attribution": true,
      acquisitionSource: FieldValue.delete(),
    });
    transaction.set(
      dailyRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
        ...incrementUpdate({
          [`acquisition.${source}.paid`]: 1,
          [`acquisition.${source}.revenueCents`]: cents,
        }),
      },
      { merge: true },
    );
    return true;
  });
}

/**
 * Stores one voluntary, fixed-choice feedback form on a paid case and copies
 * its bounded values to aggregate counters. No free text, document content,
 * diagnosis, insurer, or quote is accepted. Testimonial permission is only a
 * consent flag; nothing is published automatically.
 */
export const saveCaseFeedback = onCall({ invoker: "public" }, async (request) => {
  const uid = requireUid(request);
  const caseRef = (await requireOwnedCase(request.data?.caseId, uid)).ref;
  const satisfaction = feedbackSatisfactionCategory(request.data?.satisfaction);
  const outcome = feedbackOutcomeCategory(request.data?.outcome);
  const testimonialPermission = request.data?.testimonialPermission;
  if (!satisfaction || !outcome || typeof testimonialPermission !== "boolean") {
    throw new HttpsError("invalid-argument", "Feedback must use the listed choices.");
  }
  if (isAdminAnalyticsUid(uid)) return { saved: false };

  const firestore = getFirestore();
  const dailyRef = firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(dayKey());
  const saved = await firestore.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(caseRef);
    if (!snapshot.exists || snapshot.get("ownerUid") !== uid) {
      throw new HttpsError("permission-denied", "Case access was lost.");
    }
    if (snapshot.get("paid") !== true) {
      throw new HttpsError("failed-precondition", "Feedback is available after purchase.");
    }
    if (snapshot.get("feedback") !== undefined) return false;
    transaction.update(caseRef, {
      feedback: {
        satisfaction,
        outcome,
        testimonialPermission,
        submittedAt: FieldValue.serverTimestamp(),
      },
      "analyticsMilestones.feedback_submitted": true,
    });
    // The only scheduled feedback request has a deterministic id. Removing it
    // atomically prevents a later survey email after an in-app response.
    transaction.delete(firestore.collection("reminders").doc(`feedback_${caseRef.id}`));
    transaction.set(
      dailyRef,
      {
        updatedAt: FieldValue.serverTimestamp(),
        ...incrementUpdate({
          "product.feedback.submitted": 1,
          [`product.feedback.satisfaction.${satisfaction}`]: 1,
          [`product.feedback.outcome.${outcome}`]: 1,
          [`product.feedback.testimonial_permission.${testimonialPermission ? "yes" : "no"}`]: 1,
        }),
      },
      { merge: true },
    );
    return true;
  });
  return { saved };
});

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
    const trafficFields = filterTrafficCounterFields(fields);
    if (Object.keys(trafficFields).length === 0) return;
    const firestore = getFirestore();
    const batch = firestore.batch();
    const day = dayKey();
    const updatedAt = FieldValue.serverTimestamp();

    batch.set(
      firestore.collection(ANALYTICS_DAILY_COLLECTION).doc(day),
      { updatedAt, ...incrementUpdate(trafficFields) },
      { merge: true },
    );

    const segmentFields = filterSegmentableFields(trafficFields);
    for (const segment of boundedAnalyticsSegments(segments)) {
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
const appReadyBucketNames = new Set<string>([
  "under_1s",
  "1_to_2s",
  "2_to_4s",
  "4_to_8s",
  "over_8s",
]);

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

export type PublicTrafficEventType =
  | "visit"
  | "boot"
  | "pageview"
  | "app_ready"
  | "start_appeal_clicked"
  | "document_added";

export interface NormalizedTrafficEvent {
  type: PublicTrafficEventType;
  country: string | null;
  fields: Record<string, number>;
  segments: AnalyticsSegment[];
}

export interface TrafficEventHeaders {
  referer?: RequestHeader;
  "x-country-code"?: RequestHeader;
}

/**
 * Turn a public payload into the complete, finite write plan for one event.
 * No string supplied by the caller can survive as a Firestore key or doc id.
 */
export function normalizeTrafficEvent(
  body: unknown,
  headers: TrafficEventHeaders,
): NormalizedTrafficEvent | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }
  const value = body as Record<string, unknown>;
  const type = value.t;
  if (
    type !== "visit" &&
    type !== "boot" &&
    type !== "pageview" &&
    type !== "app_ready" &&
    type !== "start_appeal_clicked" &&
    type !== "document_added"
  ) {
    return null;
  }
  if (isExcludedAnalyticsPath(value.path)) return null;

  const readyBucket = type === "app_ready" ? appReadyBucket(value.ms) : null;
  if (type === "app_ready" && !readyBucket) return null;

  const country = type === "app_ready"
    ? null
    : countryAnalyticsCategory(headers["x-country-code"]);
  const path = analyticsPathCategory(value.path);
  const campaign = type === "app_ready"
    ? null
    : campaignAnalyticsCategory(headers.referer);
  const referrer = type === "app_ready"
    ? null
    : referrerAnalyticsCategory(value.ref);

  const fields: Record<string, number> = {};
  const segments: AnalyticsSegment[] = type === "app_ready"
    ? []
    : [{ type: "path", key: path }];
  if (country) segments.push({ type: "country", key: country });
  if (campaign) segments.push({ type: "campaign", key: campaign });
  if (referrer) segments.push({ type: "referrer", key: referrer });

  if (type === "visit") {
    fields.visits = 1;
    fields.pageviews = 1;
    fields[`paths.${path}`] = 1;
    if (country) fields[`countries.${country}`] = 1;
    if (campaign) fields[`campaigns.${campaign}`] = 1;
    if (referrer) fields[`referrers.${referrer}`] = 1;
  } else if (type === "boot") {
    fields.boots = 1;
  } else if (type === "pageview") {
    fields.pageviews = 1;
    fields[`paths.${path}`] = 1;
  } else if (type === "start_appeal_clicked") {
    fields["intent.start_appeal_clicked"] = 1;
  } else if (type === "document_added") {
    fields["intent.document_added"] = 1;
  } else if (readyBucket) {
    fields[`performance.app_ready.${readyBucket}`] = 1;
  }

  return {
    type,
    country,
    fields: filterTrafficCounterFields(fields),
    segments: boundedAnalyticsSegments(segments),
  };
}

const FUNCTION_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'self'",
  "form-action 'self' https://checkout.stripe.com",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' https://www.gstatic.com 'unsafe-inline' 'wasm-unsafe-eval'",
  "connect-src 'self' https://*.googleapis.com https://us-central1-claimhelper-38152.cloudfunctions.net",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "upgrade-insecure-requests",
].join("; ");

/** Hosting headers are not guaranteed on rewritten Function error responses. */
function setAnalyticsSecurityHeaders(res: {
  setHeader(name: string, value: string): unknown;
}): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
  res.setHeader("Content-Security-Policy", FUNCTION_CONTENT_SECURITY_POLICY);
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  res.setHeader("Cache-Control", "no-store");
}

/**
 * Exchanges the signed-in owner's Firebase ID token for a signed, HttpOnly
 * session cookie. Hosting exposes this as POST /api/admin-analytics-exclusion.
 * Normal users cannot mint the cookie, and trackEvent never trusts a plain
 * client-side opt-out flag.
 */
export const setAdminAnalyticsExclusion = onRequest(
  { invoker: "public" },
  async (req, res) => {
    setAnalyticsSecurityHeaders(res);
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      res.status(405).send("");
      return;
    }
    if (!isTrustedAnalyticsRequest(req.headers)) {
      res.status(403).send("");
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
  { invoker: "public", secrets: [analyticsUniqueSalt] },
  async (req, res) => {
    setAnalyticsSecurityHeaders(res);
    if (req.method !== "POST") {
      res.status(204).send("");
      return;
    }
    if (!isTrustedAnalyticsRequest(req.headers)) {
      res.status(204).send("");
      return;
    }
    // Country of the visit, resolved by Firebase Hosting for requests routed
    // through the /api/track rewrite (x-country-code). Aggregate-only, like
    // everything else here — the IP it derives from is never stored.
    const country = countryAnalyticsCategory(req.headers["x-country-code"]);
    if (req.query.echo === "1") {
      // Debug aid: echoes the requester's own resolved country, nothing else.
      res.status(200).json({ ok: true, country });
      return;
    }
    try {
      // sendBeacon posts as text/plain, so parse rawBody ourselves.
      const body = JSON.parse(req.rawBody.toString("utf8").slice(0, 2048));
      const event = normalizeTrafficEvent(body, req.headers);
      if (!event) {
        res.status(204).send("");
        return;
      }
      if (await hasSignedAdminExclusion(req)) {
        res.status(204).send("");
        return;
      }
      if (Object.keys(event.fields).length > 0) {
        await bumpTrafficDaily(event.fields, event.segments);
        if (event.type === "visit" && event.country) {
          const networkAddress = clientNetworkAddress(
            req.headers["x-forwarded-for"],
          );
          if (networkAddress) {
            await bumpCountryUniqueDaily(
              event.country,
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
