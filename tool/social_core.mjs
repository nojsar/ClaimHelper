import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Shared plumbing for the per-network posters (tool/post_*.mjs). Every poster
// rotates the same reviewed queue in marketing/posts.json — the automation
// never invents copy at runtime, it only reformats approved text per network.

export const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
export const posts = JSON.parse(
  await readFile(path.join(projectRoot, "marketing", "posts.json"), "utf8"),
);
export const dryRun = process.argv.includes("--dry-run");

export function campaignUrl(post, source) {
  const url = new URL(post.path, "https://getmyyes.com");
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "organic_social");
  url.searchParams.set("utm_campaign", "evergreen_guides");
  return url.toString();
}

/**
 * Deterministic, stateless rotation: pick by UTC day number so a re-run on
 * the same day picks the same guide (idempotent), while each network's
 * offset staggers WHICH guide it posts so the networks don't mirror each
 * other. The Mon/Wed/Fri cadence steps the day number by 2,2,3 — coprime
 * with any queue size not divisible by 7 — so every guide still cycles.
 */
export function postForDay(offset = 0) {
  const day = Math.floor(Date.now() / 86_400_000);
  return posts[(day + offset) % posts.length];
}

/** Log-and-skip when a network's secrets are absent, so one workflow can
 * carry every network and each activates the moment its secrets exist. */
export function configured(platform, names) {
  const missing = names.filter((name) => !process.env[name]);
  if (!missing.length) return true;
  console.log(`[marketing] ${platform}: not configured (missing ${missing.join(", ")}); skipping.`);
  return false;
}

export async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

export function graphemes(text) {
  return typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(text)].length
    : [...text].length;
}

/** Networks that shorten links (X, Mastodon) count any URL as 23 characters. */
export function weightedLength(text) {
  return graphemes(text.replace(/https?:\/\/[^\s]+/g, "x".repeat(23)));
}

/** Meta content is HTML-escaped on the page; every consumer wants the text. */
export function decodeEntities(value) {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function meta(html, property) {
  const tag = html.match(
    new RegExp(`<meta\\s+(?:property|name)="${property}"\\s+content="([^"]+)"`, "i"),
  );
  return tag?.[1] ? decodeEntities(tag[1]) : null;
}

/** OG title/description/image for a guide, read from its own page so posts
 * always match the reviewed copy. Returns null when anything is missing. */
export async function guideMeta(post) {
  try {
    const slug = post.path.replace(/\/$/, "").split("/").pop();
    const html = await readFile(
      path.join(projectRoot, "web", "appeals", `${slug}.html`),
      "utf8",
    );
    const title = meta(html, "og:title");
    const description = meta(html, "og:description") ?? meta(html, "description");
    let image = meta(html, "og:image");
    if (image && !image.startsWith("http")) image = new URL(image, "https://getmyyes.com").toString();
    if (!title || !description) return null;
    return { title, description, image };
  } catch {
    return null;
  }
}

/** Validate every queue entry against a per-network composer + length cap,
 * print the next post, and exit — the shared --dry-run implementation. */
export function previewAndExit(platform, composeText, limit, { offset = 0, lengthOf = graphemes } = {}) {
  const previews = posts.map((post) => ({ id: post.id, text: composeText(post) }));
  for (const preview of previews) {
    const length = lengthOf(preview.text);
    if (length > limit) {
      throw new Error(`${preview.id} produces a ${length}-character ${platform} post (max ${limit}).`);
    }
  }
  console.log(`[marketing] ${platform}: validated ${previews.length} posts within the ${limit}-character limit.`);
  console.log(`\n${platform} next-post preview:\n\n${composeText(postForDay(offset))}`);
  process.exit(0);
}
