import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { guideMeta, posts, projectRoot } from "./social_core.mjs";

/**
 * The bridge between the reviewed guide library and the Remotion project in
 * video/. Every string a social video shows comes from here: the guide's own
 * og:title, the approved one-liner in marketing/posts.json, and the four
 * static lines below — the renderer never invents copy, exactly like the
 * per-network posters (see social_core.mjs).
 *
 *   node tool/social_video.mjs --sync     regenerate video/src/queue.json + fonts
 *   node tool/social_video.mjs --check    fail if any queue post is unrendered
 *   node tool/social_video.mjs            print the model as JSON
 *
 * Rendering itself lives in tool/render_social_video.mjs.
 */

export const FORMATS = ["square", "vertical"];

/** Reviewed static copy, matching the home OG card in tools/og-image.py. */
export const STATIC_COPY = {
  kicker: "APPEAL GUIDE - PLAIN ENGLISH",
  url: "getmyyes.com/appeals",
  chip: "FREE GUIDE",
  steps: ["Add your denial", "Review the free summary", "Choose what to do next"],
};

const videoRoot = path.join(projectRoot, "video");
const mediaRoot = path.join(projectRoot, "web", "media", "social");
const siteOrigin = "https://getmyyes.com";

/**
 * Faces the compositions set type in. Inter comes from web/fonts rather than
 * assets/fonts on purpose: it is the exact file the site serves, so a post and
 * the page it links to are rendered by the same bytes.
 */
const FONT_FILES = [
  { file: "Tinos-Bold.ttf", from: ["assets", "fonts"] },
  { file: "inter-var.woff2", from: ["web", "fonts"] },
  { file: "IBMPlexMono-SemiBold.ttf", from: ["assets", "fonts"] },
];
export function slugOf(post) {
  return post.path.replace(/\/$/, "").split("/").pop();
}

export function videoFile(id, format) {
  return path.join(mediaRoot, `${id}-${format}.mp4`);
}

export function videoUrl(id, format) {
  return `${siteOrigin}/media/social/${id}-${format}.mp4`;
}

export function posterFile(id) {
  return path.join(mediaRoot, `${id}-poster.png`);
}

export function posterUrl(id) {
  return `${siteOrigin}/media/social/${id}-poster.png`;
}

/**
 * A network only gets the video once the file is actually being served — the
 * Meta APIs fetch it themselves, so a queue entry rendered but not yet
 * deployed must fall back rather than fail the publishing slot.
 */
export async function reachable(url) {
  // Falling back on a network blip would quietly cost a slot its video, so a
  // single failure is retried before we believe it.
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, { method: "HEAD", redirect: "follow" });
      return response.ok;
    } catch {
      if (attempt === 2) return false;
    }
  }
  return false;
}

/**
 * The rendered file itself, for networks that upload bytes rather than fetch a
 * URL. Returns null when it has not been rendered yet or is over the network's
 * limit, which every caller treats as "post without it".
 */
export async function readVideo(id, format, maxBytes = Number.POSITIVE_INFINITY) {
  let buffer;
  try {
    buffer = await readFile(videoFile(id, format));
  } catch {
    return null;
  }
  if (buffer.byteLength > maxBytes) {
    console.log(
      `[marketing] ${id}-${format}.mp4 is ${(buffer.byteLength / 1e6).toFixed(1)}MB, over this network's limit; posting without it.`,
    );
    return null;
  }
  return buffer;
}

/** Alt text for the media, so the video carries the same words as the post. */
export function altText(title, summary) {
  return `A GetMyYes appeal guide card: ${title}. ${summary}`;
}

/** One entry per queue post, or null for guides whose page has no OG tags. */
export async function videoModel() {
  const guides = [];
  for (const post of posts) {
    const meta = await guideMeta(post);
    if (!meta) {
      console.warn(`[social-video] ${post.id}: no OG metadata on its guide page; skipping.`);
      continue;
    }
    guides.push({ id: post.id, slug: slugOf(post), title: meta.title, summary: post.text });
  }
  return guides;
}

/**
 * Regenerate everything the Remotion bundle imports. Both the studio and the
 * renderer run this first, so a new guide shows up without hand-editing
 * anything inside video/.
 */
export async function sync() {
  const guides = await videoModel();
  await mkdir(path.join(videoRoot, "public", "fonts"), { recursive: true });
  for (const entry of FONT_FILES) {
    await copyFile(
      path.join(projectRoot, ...entry.from, entry.file),
      path.join(videoRoot, "public", "fonts", entry.file),
    );
  }
  await writeFile(
    path.join(videoRoot, "src", "queue.json"),
    `${JSON.stringify({ ...STATIC_COPY, guides }, null, 2)}\n`,
  );
  return guides;
}

/**
 * Every queue post must have its media rendered and committed, because the
 * posters only fall back so far. Run in CI so a guide added without a render
 * is caught before its posting slot rather than in the feed.
 */
export async function check() {
  const missing = [];
  for (const guide of await videoModel()) {
    for (const file of [...FORMATS.map((format) => videoFile(guide.id, format)), posterFile(guide.id)]) {
      if (!(await stat(file).then(() => true).catch(() => false))) {
        missing.push(path.relative(projectRoot, file));
      }
    }
  }
  return missing;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) {
    const missing = await check();
    if (missing.length) {
      console.error(`[social-video] Missing rendered media:\n  ${missing.join("\n  ")}`);
      console.error("[social-video] Run: node tool/render_social_video.mjs");
      process.exit(1);
    }
    console.log("[social-video] Every queue post has its video, reel, and poster rendered.");
  } else if (process.argv.includes("--sync")) {
    const guides = await sync();
    console.log(`[social-video] Synced ${guides.length} guides and ${FONT_FILES.length} fonts into video/.`);
  } else {
    console.log(JSON.stringify({ ...STATIC_COPY, guides: await videoModel() }, null, 2));
  }
}
