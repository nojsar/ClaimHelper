import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { decodeEntities, oneOff, oneOffs } from "./social_core.mjs";
import { altText, readVideo, videoSize } from "./social_video.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const posts = JSON.parse(
  await readFile(path.join(projectRoot, "marketing", "posts.json"), "utf8"),
);
const dryRun = process.argv.includes("--dry-run");
const service = (process.env.BLUESKY_SERVICE || "https://bsky.social").replace(/\/$/, "");
const identifier = process.env.BLUESKY_HANDLE;
const password = process.env.BLUESKY_APP_PASSWORD;
const marker = "#GetMyYesGuide";
const videoService = "https://video.bsky.app";

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
  url.searchParams.set("utm_campaign", post.campaign ?? "evergreen_guides");
  return url.toString();
}

function compose(post) {
  const url = campaignUrl(post);
  // A one-off carries its own tag, which also keeps it out of historyFrom()
  // and so out of the guide rotation's spacing.
  const tag = post.tag ?? marker;
  const text = `${post.text}\n\n${url}\n\n${tag}`;
  const graphemes = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].length
    : [...text].length;
  if (graphemes > 300) throw new Error(`${post.id} produces a ${graphemes}-character post (max 300).`);

  const facets = [];
  for (const [needle, feature] of [
    [url, { $type: "app.bsky.richtext.facet#link", uri: url }],
    [tag, { $type: "app.bsky.richtext.facet#tag", tag: tag.slice(1) }],
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
    if (oneOffs.includes(post) && post.path === "/") {
      // The homepage's own OG card, for a one-off whose video cannot be used.
      const html = await readFile(path.join(projectRoot, "web", "index.html"), "utf8");
      const title = meta(html, "og:title");
      const description = meta(html, "og:description");
      const image = await readFile(path.join(projectRoot, "web", "og-image.png"));
      if (!title || !description || image.byteLength > 950_000) return null;
      return { title, description, image };
    }
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

/**
 * The guide's Remotion square video as an app.bsky.embed.video, processed by
 * Bluesky's video service BEFORE the post exists. Uploading straight to the
 * PDS would publish first and process after, so followers would see a broken
 * player for the first seconds. Returns null whenever video cannot be used
 * (no render, an unverified account email, a refused or failed job), and the
 * caller falls back to the link card. A video embed replaces the card; the
 * link stays a clickable facet in the text.
 */
async function videoFor(post, session, title) {
  const video = await readVideo(post.id, "square", 50_000_000);
  if (!video) return null;
  const auth = { Authorization: `Bearer ${session.accessJwt}` };

  // Bluesky-hosted accounts must verify their email before uploading video.
  const me = await jsonRequest(`${service}/xrpc/com.atproto.server.getSession`, { headers: auth });
  if (me.emailConfirmed === false) {
    console.log("[marketing] bluesky: account email is not verified, which video upload requires; using the link card.");
    return null;
  }

  // The service token's audience is the account's own PDS, named in its DID
  // document. The video service stores the processed file there on our behalf.
  const pds = (session.didDoc?.service || []).find((entry) => entry.id?.endsWith("#atproto_pds"))?.serviceEndpoint;
  if (!pds) throw new Error("no PDS endpoint in the session's DID document");
  const serviceAuth = new URL(`${pds.replace(/\/$/, "")}/xrpc/com.atproto.server.getServiceAuth`);
  serviceAuth.searchParams.set("aud", `did:web:${new URL(pds).host}`);
  serviceAuth.searchParams.set("lxm", "com.atproto.repo.uploadBlob");
  serviceAuth.searchParams.set("exp", String(Math.floor(Date.now() / 1000) + 30 * 60));
  const { token } = await jsonRequest(serviceAuth, { headers: auth });

  const upload = new URL(`${videoService}/xrpc/app.bsky.video.uploadVideo`);
  upload.searchParams.set("did", session.did);
  upload.searchParams.set("name", `${post.id}-square.mp4`);
  const response = await fetch(upload, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "video/mp4" },
    body: video,
  });
  const body = await response.json().catch(() => ({}));
  // A file the service has processed before comes back as an error that still
  // carries its blob (or a job to read it from), so look for those first.
  let job = body.jobStatus ?? body;
  let blob = job.blob;
  for (let polls = 0; !blob; polls += 1) {
    if (!job.jobId) throw new Error(`upload refused: ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
    if (polls >= 90) throw new Error("processing did not finish within the time allowed");
    await sleep(2000);
    const status = await jsonRequest(
      `${videoService}/xrpc/app.bsky.video.getJobStatus?jobId=${encodeURIComponent(job.jobId)}`,
    );
    job = status.jobStatus ?? {};
    blob = job.blob;
    if (!blob && job.state === "JOB_STATE_FAILED") {
      throw new Error(`processing failed: ${job.error ?? job.message ?? "no reason given"}`);
    }
  }

  return {
    $type: "app.bsky.embed.video",
    video: blob,
    alt: altText(title ?? post.text, post.text, post),
    aspectRatio: videoSize(post.id, "square"),
  };
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
  // compose() throws on an over-long post, so this validates the one-offs too.
  for (const post of oneOffs) compose(post);
  if (oneOff) {
    console.log(`[marketing] One-off preview:\n\n${compose(oneOff).text}`);
    process.exit(0);
  }
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
  const videos = [];
  for (const post of posts) {
    if (!(await readVideo(post.id, "square", 50_000_000))) videos.push(post.id);
  }
  console.log(
    videos.length
      ? `[marketing] Missing videos (would post with the link card): ${videos.join(", ")}`
      : "[marketing] Every post has its video ready.",
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

// A one-off skips the rotation's 36-hour spacing (it may share a day with a
// guide) but goes out only once, so any earlier copy of its text stops it.
if (
  oneOff &&
  (feed.feed || []).some((entry) => entry?.post?.record?.text?.includes(oneOff.text.slice(0, 60)))
) {
  console.log(`[marketing] ${oneOff.id} is already posted; skipping safely.`);
  process.exit(0);
}
const selected = oneOff ?? choosePost(historyFrom(feed));

if (!selected) {
  console.log("[marketing] A campaign post was published within 36 hours; skipping safely.");
  process.exit(0);
}

const composed = compose(selected);

// Prefer the video; then the link card when the guide's OG assets are
// available; then plain text. Each failure downgrades one step rather than
// skipping the slot.
let embed;
const card = await cardFor(selected);
try {
  embed = (await videoFor(selected, session, card?.title)) ?? undefined;
} catch (error) {
  console.warn(`[marketing] Video unavailable, using the link card: ${error.message}`);
}
if (!embed && card) {
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
const attached = embed?.$type === "app.bsky.embed.video" ? " with video" : embed ? " with link card" : "";
console.log(`[marketing] Published ${selected.id}${attached}: ${result.uri}`);
