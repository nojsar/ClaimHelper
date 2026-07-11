import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const posts = JSON.parse(
  await readFile(path.join(projectRoot, "marketing", "posts.json"), "utf8"),
);
const dryRun = process.argv.includes("--dry-run");
const service = (process.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");
const identifier = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
const marker = "#GetMyYesGuide";

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

function campaignUrl(post) {
  const url = new URL(post.path, "https://getmyyes.com");
  url.searchParams.set("utm_source", "bluesky");
  url.searchParams.set("utm_medium", "organic_social");
  url.searchParams.set("utm_campaign", "evergreen_guides");
  return url.toString();
}

function compose(post) {
  const url = campaignUrl(post);
  const text = `${post.text}\n\n${url}\n\n${marker}`;
  const graphemes = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].length
    : [...text].length;
  if (graphemes > 300) throw new Error(`${post.id} produces a ${graphemes}-character post (max 300).`);

  const facets = [];
  for (const [needle, feature] of [
    [url, { $type: "app.bsky.richtext.facet#link", uri: url }],
    [marker, { $type: "app.bsky.richtext.facet#tag", tag: marker.slice(1) }],
  ]) {
    const start = text.indexOf(needle);
    facets.push({
      index: {
        byteStart: Buffer.byteLength(text.slice(0, start), "utf8"),
        byteEnd: Buffer.byteLength(text.slice(0, start + needle.length), "utf8"),
      },
      features: [feature],
    });
  }
  return { text, facets };
}

function historyFrom(feed) {
  return (feed.feed || [])
    .map((entry) => entry?.post?.record)
    .filter((record) => typeof record?.text === "string" && record.text.includes(marker))
    .map((record) => {
      const found = record.text.match(/https:\/\/getmyyes\.com\/[^\s]+/);
      let id = null;
      try {
        if (found) {
          const pathname = new URL(found[0]).pathname.replace(/\/$/, "");
          id = posts.find((post) => post.path === pathname)?.id ?? null;
        }
      } catch {
        // Ignore an old malformed campaign URL.
      }
      return { id, createdAt: Date.parse(record.createdAt || 0) || 0 };
    });
}

function choosePost(history) {
  const mostRecent = Math.max(0, ...history.map((item) => item.createdAt));
  if (mostRecent && Date.now() - mostRecent < 36 * 60 * 60 * 1000) return null;
  const lastById = new Map();
  for (const item of history) {
    if (item.id) lastById.set(item.id, Math.max(lastById.get(item.id) || 0, item.createdAt));
  }
  return [...posts].sort(
    (a, b) => (lastById.get(a.id) || 0) - (lastById.get(b.id) || 0),
  )[0];
}

if (dryRun) {
  const previews = posts.map((post) => ({ id: post.id, ...compose(post) }));
  const longest = previews.reduce((a, b) =>
    [...a.text].length >= [...b.text].length ? a : b,
  );
  console.log(`[marketing] Validated ${previews.length} posts; longest is ${longest.id} (${[...longest.text].length} code points).`);
  console.log(`\nNext-post preview:\n\n${previews[0].text}`);
  process.exit(0);
}

if (!identifier || !password) {
  throw new Error("BLUESKY_HANDLE and BLUESKY_APP_PASSWORD are required.");
}

const session = await jsonRequest(`${service}/xrpc/com.atproto.server.createSession`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ identifier, password }),
});
const feedUrl = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed");
feedUrl.searchParams.set("actor", session.did);
feedUrl.searchParams.set("limit", "100");
feedUrl.searchParams.set("filter", "posts_no_replies");
const feed = await jsonRequest(feedUrl);
const selected = choosePost(historyFrom(feed));

if (!selected) {
  console.log("[marketing] A campaign post was published within 36 hours; skipping safely.");
  process.exit(0);
}

const composed = compose(selected);
const result = await jsonRequest(`${service}/xrpc/com.atproto.repo.createRecord`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${session.accessJwt}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    repo: session.did,
    collection: "app.bsky.feed.post",
    record: {
      $type: "app.bsky.feed.post",
      text: composed.text,
      facets: composed.facets,
      createdAt: new Date().toISOString(),
    },
  }),
});
console.log(`[marketing] Published ${selected.id}: ${result.uri}`);
