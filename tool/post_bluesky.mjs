import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { decodeEntities } from "./social_core.mjs";

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

function meta(html, property) {
  const tag = html.match(
    new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]+)"`, "i"),
  );
  return tag?.[1] ? decodeEntities(tag[1]) : null;
}

/**
 * Link card for a post: Bluesky does NOT unfurl URLs posted via the API, so
 * we attach an app.bsky.embed.external ourselves — title/description from the
 * guide's own OG tags, thumbnail from its generated card in web/appeals/og/
 * (see tools/og-image.py). Returns null when anything is missing, in which
 * case the post goes out as plain text + link, exactly like before.
 */
async function cardFor(post) {
  try {
    const slug = post.path.replace(/\/$/, "").split("/").pop();
    const html = await readFile(
      path.join(projectRoot, "web", "appeals", `${slug}.html`),
      "utf8",
    );
    const title = meta(html, "og:title");
    const description = meta(html, "og:description") ?? meta(html, "description");
    const imageUrl = meta(html, "og:image");
    if (!title || !description || !imageUrl?.includes("/appeals/og/")) return null;
    const image = await readFile(
      path.join(projectRoot, "web", "appeals", "og", `${slug}.png`),
    );
    if (image.byteLength > 950_000) return null; // Bluesky blob limit is ~1MB
    return { title, description, image };
  } catch {
    return null;
  }
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
  const cards = [];
  for (const post of posts) {
    if (!(await cardFor(post))) cards.push(post.id);
  }
  console.log(
    cards.length
      ? `[marketing] Missing link cards (would post as plain text): ${cards.join(", ")}`
      : "[marketing] Every post has a link card ready.",
  );
  console.log(`\nNext-post preview:\n\n${previews[0].text}`);
  process.exit(0);
}

if (!identifier || !password) {
  // Align with the other tool/post_*.mjs posters: a missing network skips
  // (visibly, in the post_all.mjs summary) instead of failing the whole run.
  console.log("[marketing] bluesky: not configured (missing BLUESKY_HANDLE/BLUESKY_APP_PASSWORD); skipping.");
  process.exit(0);
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

// Attach the link card when the guide's OG assets are available; a failed
// upload downgrades to a plain-text post rather than skipping the slot.
let embed;
const card = await cardFor(selected);
if (card) {
  try {
    const uploaded = await jsonRequest(`${service}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": "image/png",
      },
      body: card.image,
    });
    embed = {
      $type: "app.bsky.embed.external",
      external: {
        uri: campaignUrl(selected),
        title: card.title,
        description: card.description,
        thumb: uploaded.blob,
      },
    };
  } catch (error) {
    console.warn(`[marketing] Thumbnail upload failed, posting without a card: ${error.message}`);
  }
}

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
      ...(embed ? { embed } : {}),
      createdAt: new Date().toISOString(),
    },
  }),
});
console.log(`[marketing] Published ${selected.id}${embed ? " with link card" : ""}: ${result.uri}`);
