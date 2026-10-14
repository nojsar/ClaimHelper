import crypto from "node:crypto";
import process from "node:process";
import { jsonRequest, oneOffs, posts } from "./social_core.mjs";

/**
 * Lists — and with --delete, removes — the autopilot's own posts published
 * before a cutoff, on every network whose secrets are present. Built for the
 * 2026-10-14 cleanup: every post before then used the old design, a link card
 * without narration, or a voice generated on the free ElevenLabs plan (which
 * has no commercial licence).
 *
 *   node tool/cleanup_posts.mjs                       list only (default)
 *   node tool/cleanup_posts.mjs --delete              delete what it lists
 *   node tool/cleanup_posts.mjs --before 2026-10-14T00:00:00Z
 *
 * Only posts whose text carries the reviewed copy of a queue post or one-off
 * (marketing/posts.json, marketing/one-off.json) are touched, so anything the
 * owner posted by hand stays. Deletion is permanent; run the list first.
 */

const args = process.argv.slice(2);
const remove = args.includes("--delete");
const beforeArg = args[args.indexOf("--before") + 1];
const before = new Date(args.includes("--before") ? beforeArg : process.env.CLEANUP_BEFORE || "2026-10-14T00:00:00Z");
if (Number.isNaN(before.getTime())) throw new Error(`Unreadable --before date: ${beforeArg}`);

// The reviewed copy, normalised the way each network re-renders it (HTML
// entities, curly quotes, line breaks), cut to a prefix every post carries.
const normalise = (text) =>
  String(text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/[“”„]/g, '"').replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
const markers = [...posts, ...oneOffs].map((post) => normalise(post.text).slice(0, 50)).filter((m) => m.length >= 20);
const ours = (text) => {
  const body = normalise(text);
  return markers.some((marker) => body.includes(marker));
};
const old = (when) => new Date(when) < before;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const summary = [];

async function network(name, secrets, run) {
  const missing = secrets.filter((key) => !process.env[key]);
  if (missing.length) {
    summary.push(`${name}: not configured (missing ${missing.join(", ")})`);
    return;
  }
  try {
    const found = await run();
    summary.push(`${name}: ${found.matched} old autopilot post(s)${remove ? `, ${found.deleted} deleted, ${found.failed} failed` : ""}`);
  } catch (error) {
    summary.push(`${name}: FAILED (${error.message.slice(0, 300)})`);
  }
}

/** Shared loop: print each match, delete it when asked, count the outcome. */
async function sweep(name, items, destroy) {
  let deleted = 0;
  let failed = 0;
  for (const item of items) {
    console.log(`[cleanup] ${name} ${item.when.slice(0, 10)} ${item.id} | ${normalise(item.text).slice(0, 70)}`);
    if (!remove) continue;
    try {
      await destroy(item);
      deleted += 1;
    } catch (error) {
      failed += 1;
      console.log(`[cleanup]   could not delete: ${error.message.slice(0, 200)}`);
    }
    await pause(400);
  }
  return { matched: items.length, deleted, failed };
}

const GRAPH = "https://graph.facebook.com/v23.0";

async function graphPages(url) {
  const rows = [];
  let next = url.toString();
  while (next && rows.length < 1000) {
    const page = await jsonRequest(next);
    rows.push(...(page.data ?? []));
    next = page.paging?.next ?? null;
  }
  return rows;
}

await network("facebook", ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_TOKEN"], async () => {
  const pageId = process.env.FACEBOOK_PAGE_ID;
  // Writes must come from the Page itself (see post_facebook.mjs).
  const lookup = new URL(`${GRAPH}/${pageId}`);
  lookup.searchParams.set("fields", "access_token");
  lookup.searchParams.set("access_token", process.env.FACEBOOK_PAGE_TOKEN);
  const token = (await jsonRequest(lookup).catch(() => ({}))).access_token || process.env.FACEBOOK_PAGE_TOKEN;
  const url = new URL(`${GRAPH}/${pageId}/posts`);
  url.searchParams.set("fields", "id,message,created_time");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  const items = (await graphPages(url))
    .filter((row) => ours(row.message) && old(row.created_time))
    .map((row) => ({ id: row.id, when: row.created_time, text: row.message }));
  return sweep("facebook", items, (item) =>
    jsonRequest(`${GRAPH}/${item.id}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" }));
});

await network("instagram", ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"], async () => {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const host = token.startsWith("IGAA") ? "https://graph.instagram.com/v23.0" : GRAPH;
  const url = new URL(`${host}/${process.env.INSTAGRAM_USER_ID}/media`);
  url.searchParams.set("fields", "id,caption,timestamp,media_type");
  url.searchParams.set("limit", "100");
  url.searchParams.set("access_token", token);
  const items = (await graphPages(url))
    .filter((row) => ours(row.caption) && old(row.timestamp))
    .map((row) => ({ id: row.id, when: row.timestamp, text: row.caption }));
  // Meta added media deletion for accounts linked to a Facebook Page in
  // December 2025; if this token's route lacks it, the failures say so.
  return sweep("instagram", items, (item) =>
    jsonRequest(`${host}/${item.id}?access_token=${encodeURIComponent(token)}`, { method: "DELETE" }));
});

await network("mastodon", ["MASTODON_SERVER", "MASTODON_ACCESS_TOKEN"], async () => {
  const server = process.env.MASTODON_SERVER.replace(/\/$/, "");
  const handle = process.env.MASTODON_HANDLE || "getmyyes";
  const auth = { Authorization: `Bearer ${process.env.MASTODON_ACCESS_TOKEN}` };
  const me = await jsonRequest(`${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`);
  const rows = [];
  let maxId = "";
  while (rows.length < 1000) {
    const page = await jsonRequest(
      `${server}/api/v1/accounts/${me.id}/statuses?limit=40&exclude_reblogs=true${maxId ? `&max_id=${maxId}` : ""}`,
    );
    if (!page.length) break;
    rows.push(...page);
    maxId = page.at(-1).id;
  }
  const items = rows
    .filter((row) => ours(row.content) && old(row.created_at))
    .map((row) => ({ id: row.id, when: row.created_at, text: row.content }));
  return sweep("mastodon", items, (item) =>
    jsonRequest(`${server}/api/v1/statuses/${item.id}`, { method: "DELETE", headers: auth }));
});

await network("bluesky", ["BLUESKY_HANDLE", "BLUESKY_APP_PASSWORD"], async () => {
  const service = (process.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");
  const session = await jsonRequest(`${service}/xrpc/com.atproto.server.createSession`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD }),
  });
  const rows = [];
  let cursor = "";
  while (rows.length < 1000) {
    const url = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
    url.searchParams.set("actor", session.did);
    url.searchParams.set("limit", "100");
    url.searchParams.set("filter", "posts_no_replies");
    if (cursor) url.searchParams.set("cursor", cursor);
    const page = await jsonRequest(url);
    rows.push(...(page.feed ?? []).map((entry) => entry.post).filter((post) => post?.author?.did === session.did));
    if (!page.cursor || !(page.feed ?? []).length) break;
    cursor = page.cursor;
  }
  const items = rows
    .filter((post) => ours(post.record?.text) && old(post.record?.createdAt))
    .map((post) => ({ id: post.uri.split("/").pop(), when: post.record.createdAt, text: post.record.text }));
  return sweep("bluesky", items, (item) =>
    jsonRequest(`${service}/xrpc/com.atproto.repo.deleteRecord`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.accessJwt}` },
      body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", rkey: item.id }),
    }));
});

const X_SECRETS = ["X_API_KEY", "X_API_KEY_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
await network("x", X_SECRETS, async () => {
  const rfc3986 = (value) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  // OAuth 1.0a user context, as in post_x.mjs.
  const sign = (method, url, query = {}) => {
    const oauth = {
      oauth_consumer_key: process.env.X_API_KEY,
      oauth_nonce: crypto.randomBytes(16).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: process.env.X_ACCESS_TOKEN,
      oauth_version: "1.0",
    };
    const params = Object.entries({ ...oauth, ...query })
      .map(([key, value]) => [rfc3986(key), rfc3986(value)])
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, value]) => `${key}=${value}`)
      .join("&");
    const base = [method, rfc3986(url), rfc3986(params)].join("&");
    const key = `${rfc3986(process.env.X_API_KEY_SECRET)}&${rfc3986(process.env.X_ACCESS_TOKEN_SECRET)}`;
    oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
    return `OAuth ${Object.keys(oauth).sort().map((k) => `${rfc3986(k)}="${rfc3986(oauth[k])}"`).join(", ")}`;
  };
  const get = (url, query = {}) => {
    const full = new URL(url);
    for (const [key, value] of Object.entries(query)) full.searchParams.set(key, value);
    return jsonRequest(full, { headers: { Authorization: sign("GET", url, query) } });
  };
  const me = await get("https://api.x.com/2/users/me");
  const rows = [];
  let token = "";
  while (rows.length < 1000) {
    const query = { max_results: "100", "tweet.fields": "created_at" };
    if (token) query.pagination_token = token;
    const page = await get(`https://api.x.com/2/users/${me.data.id}/tweets`, query);
    rows.push(...(page.data ?? []));
    token = page.meta?.next_token ?? "";
    if (!token) break;
  }
  const items = rows
    .filter((row) => ours(row.text) && old(row.created_at))
    .map((row) => ({ id: row.id, when: row.created_at, text: row.text }));
  return sweep("x", items, (item) => {
    const url = `https://api.x.com/2/tweets/${item.id}`;
    return jsonRequest(url, { method: "DELETE", headers: { Authorization: sign("DELETE", url) } });
  });
});

await network("youtube", ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"], async () => {
  const API = "https://www.googleapis.com/youtube/v3";
  const tokens = await jsonRequest("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET,
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const auth = { Authorization: `Bearer ${tokens.access_token}` };
  const channels = await jsonRequest(`${API}/channels?part=contentDetails&mine=true`, { headers: auth });
  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  const rows = [];
  let pageToken = "";
  while (uploads && rows.length < 1000) {
    const page = await jsonRequest(
      `${API}/playlistItems?part=snippet&maxResults=50&playlistId=${encodeURIComponent(uploads)}${pageToken ? `&pageToken=${pageToken}` : ""}`,
      { headers: auth },
    );
    rows.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? "";
    if (!pageToken) break;
  }
  const items = rows
    .filter((row) => ours(row.snippet?.description) && old(row.snippet?.publishedAt))
    .map((row) => ({ id: row.snippet.resourceId.videoId, when: row.snippet.publishedAt, text: row.snippet.description }));
  return sweep("youtube", items, async (item) => {
    const response = await fetch(`${API}/videos?id=${item.id}`, { method: "DELETE", headers: auth });
    if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  });
});

console.log(`\n[cleanup] ${remove ? "DELETE" : "LIST"} run, autopilot posts before ${before.toISOString()}:`);
for (const line of summary) console.log(`[cleanup]   ${line}`);
