import process from "node:process";
import { jsonRequest } from "./social_core.mjs";

/**
 * Read-only check that the networks which used to fall back to link cards can
 * now post narrated video (the autopilot posts nothing else since 2026-10-14):
 * Bluesky needs a verified email, Mastodon a token with write:media. Posts
 * nothing and uploads nothing.
 *
 *   node tool/check_social_access.mjs
 */

const results = [];

if (process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD) {
  try {
    const service = (process.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");
    const session = await jsonRequest(`${service}/xrpc/com.atproto.server.createSession`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD }),
    });
    const me = await jsonRequest(`${service}/xrpc/com.atproto.server.getSession`, {
      headers: { Authorization: `Bearer ${session.accessJwt}` },
    });
    results.push(me.emailConfirmed
      ? `bluesky: OK, email verified (${me.handle}); videos will post`
      : `bluesky: NOT READY, email not verified (${me.handle}); Settings > Account > Email > Verify`);
  } catch (error) {
    results.push(`bluesky: FAILED (${error.message.slice(0, 200)})`);
  }
} else {
  results.push("bluesky: not configured");
}

if (process.env.MASTODON_SERVER && process.env.MASTODON_ACCESS_TOKEN) {
  try {
    const server = process.env.MASTODON_SERVER.replace(/\/$/, "");
    const app = await jsonRequest(`${server}/api/v1/apps/verify_credentials`, {
      headers: { Authorization: `Bearer ${process.env.MASTODON_ACCESS_TOKEN}` },
    });
    const scopes = Array.isArray(app.scopes) ? app.scopes : [];
    const can = (scope) => scopes.includes(scope) || scopes.includes(scope.split(":")[0]);
    if (!scopes.length) {
      results.push(`mastodon: token valid (app "${app.name}"), but the server did not report its scopes`);
    } else {
      const missing = ["write:statuses", "write:media"].filter((scope) => !can(scope));
      results.push(missing.length
        ? `mastodon: NOT READY, token lacks ${missing.join(", ")} (scopes: ${scopes.join(" ")})`
        : `mastodon: OK, token has write:statuses and write:media (app "${app.name}"); videos will post`);
    }
  } catch (error) {
    results.push(`mastodon: FAILED (${error.message.slice(0, 200)})`);
  }
} else {
  results.push("mastodon: not configured");
}

for (const line of results) console.log(`[access] ${line}`);
