import { onRequest } from "firebase-functions/v2/https";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/**
 * First-party, cookieless traffic analytics.
 *
 * Design constraints (GDPR posture of the site — no consent banner):
 *  - NO cookies, NO localStorage, NO fingerprinting, NO per-visitor records.
 *  - Nothing user-identifying is stored: only aggregate daily counters in
 *    `analytics_daily/{YYYY-MM-DD}` (UTC). IPs and user agents are not kept.
 *  - Funnel steps (upload/preview/checkout/paid) are counted server-side in
 *    the existing functions via bumpDaily() — tamper-proof and zero extra
 *    client requests. The client only reports visit/boot/pageview.
 */

/** UTC day key, e.g. "2026-07-11". */
function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
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
 * Increment counters on today's aggregate doc. Fire-and-forget safe: never
 * throws, so analytics can never break a payment or generation flow.
 */
export async function bumpDaily(
  fields: Record<string, number>,
): Promise<void> {
  try {
    const update: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
    };
    for (const [path, n] of Object.entries(fields)) {
      // Dotted names ("funnel.paid") become nested maps for set-merge.
      const segs = path.split(".");
      let node = update;
      for (let i = 0; i < segs.length - 1; i++) {
        node = (node[segs[i]] as Record<string, unknown>) ??= {};
      }
      node[segs[segs.length - 1]] = FieldValue.increment(n);
    }
    await getFirestore()
      .collection("analytics_daily")
      .doc(dayKey())
      .set(update, { merge: true });
  } catch (err) {
    console.warn("analytics bumpDaily failed (ignored):", err);
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
      const path = keyify(body?.path) ?? "/";

      const fields: Record<string, number> = {};
      if (t === "visit") {
        fields["visits"] = 1;
        fields["pageviews"] = 1;
        fields[`paths.${path}`] = 1;
        if (country) fields[`countries.${country}`] = 1;
        if (typeof body?.ref === "string" && body.ref) {
          try {
            const host = new URL(body.ref).hostname.toLowerCase();
            if (!SELF_HOSTS.has(host)) {
              const key = keyify(host);
              if (key) fields[`referrers.${key}`] = 1;
            }
          } catch {
            /* unparseable referrer — skip */
          }
        }
      } else if (t === "boot") {
        fields["boots"] = 1;
      } else if (t === "pageview") {
        fields["pageviews"] = 1;
        fields[`paths.${path}`] = 1;
      }

      if (Object.keys(fields).length > 0) await bumpDaily(fields);
    } catch {
      /* malformed payload — drop silently */
    }
    res.status(204).send("");
  },
);
