import { onRequest } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

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
 *  - Funnel steps (upload/preview/checkout/paid) are counted server-side in
 *    the existing functions via bumpUserDaily() — tamper-proof and zero extra
 *    client requests. The client only reports visit/boot/pageview.
 */

export const ANALYTICS_DAILY_COLLECTION = "analytics_customer_daily";
export const ANALYTICS_SEGMENT_DAILY_COLLECTION =
  "analytics_customer_segment_daily";

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
 * Accepts {t: "visit"|"boot"|"pageview", path?, ref?}. Anything else is
 * dropped. Responds 204 always — the client never reads the response.
 */
export const trackEvent = onRequest(
  { invoker: "public", cors: true },
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
      if (t !== "visit" && t !== "boot" && t !== "pageview") {
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

      const fields: Record<string, number> = {};
      const segments: AnalyticsSegment[] = [{ type: "path", key: path }];
      if (country) segments.push({ type: "country", key: country });
      const campaign = campaignFromRequest(req);
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
      if (referrer) segments.push({ type: "referrer", key: referrer });

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
      }

      if (Object.keys(fields).length > 0) {
        await bumpTrafficDaily(fields, segments);
      }
    } catch {
      /* malformed payload — drop silently */
    }
    res.status(204).send("");
  },
);
