import { copyFile, cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { guideMeta, oneOffs, posts, projectRoot } from "./social_core.mjs";

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
const libraryRoot = path.join(videoRoot, "library");
const mediaRoot = path.join(projectRoot, "web", "media", "social");

/**
 * Each guide's musical temperament, matched to what its reader is going
 * through: gentle where the denial is about a crisis or mental health,
 * steady for the procedural how-tos, hopeful (the default, so a new guide
 * needs no entry) for the rest. Moods come from video/library/music.json.
 */
export const MUSIC_MOOD = {
  "appeal-step-by-step": "steady",
  "appeal-letter-template": "steady",
  "prior-authorization": "steady",
  "step-therapy": "steady",
  "formulary-exclusion": "steady",
  "out-of-network": "steady",
  "experimental-denial": "gentle",
  "er-denial": "gentle",
  "mental-health-parity": "gentle",
};

/** FNV-1a: a stable, dependency-free spread for picking a starting track. */
function hash(text) {
  let value = 0x811c9dc5;
  for (const char of text) {
    value ^= char.codePointAt(0);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

/**
 * One track per guide, chosen once and then kept. assignments.json is
 * append-only, so a new guide never reshuffles (and silently re-scores) the
 * ones already published. Within the guide's mood the search starts at a hash
 * of its id, and a track no other guide uses wins over a repeat.
 */
async function assignMusic(guides) {
  const library = await readJson(path.join(libraryRoot, "music.json"), { tracks: [] });
  const file = path.join(libraryRoot, "assignments.json");
  const assigned = await readJson(file, {});
  const known = new Set(library.tracks.map((track) => track.id));
  const used = new Set(Object.values(assigned));
  let changed = false;
  for (const guide of guides) {
    if (known.has(assigned[guide.id])) continue;
    const mood = MUSIC_MOOD[guide.id] ?? "hopeful";
    const pool = library.tracks
      .filter((track) => track.mood === mood)
      .map((track) => track.id)
      .sort();
    if (!pool.length) continue;
    const start = hash(guide.id) % pool.length;
    const order = pool.map((_, index) => pool[(start + index) % pool.length]);
    assigned[guide.id] = order.find((id) => !used.has(id)) ?? order[0];
    used.add(assigned[guide.id]);
    changed = true;
  }
  if (changed) {
    const sorted = Object.fromEntries(Object.entries(assigned).sort(([a], [b]) => a.localeCompare(b)));
    await writeFile(file, `${JSON.stringify(sorted, null, 2)}\n`);
  }
  return assigned;
}

/**
 * Whether a guide's video carries its generated voice-over
 * (video/library/guide-voice/<id>.mp3, an ElevenLabs take; see takes.json).
 */
export async function narrated(id) {
  try {
    await stat(path.join(libraryRoot, "guide-voice", `${id}.mp3`));
    return true;
  } catch {
    return false;
  }
}

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

/**
 * A one-off (marketing/one-off.json) names its own already-deployed files under
 * web/; a guide's live in /media/social/ by naming convention. `format` is the
 * feed cut ("square") or the reel ("vertical"), whatever its real shape.
 */
function oneOffMedia(id, format) {
  return oneOffs.find((post) => post.id === id)?.media?.[format] ?? null;
}

export function videoFile(id, format) {
  const custom = oneOffMedia(id, format);
  if (custom) return path.join(projectRoot, "web", custom.video);
  return path.join(mediaRoot, `${id}-${format}.mp4`);
}

export function videoUrl(id, format) {
  const custom = oneOffMedia(id, format);
  if (custom) return `${siteOrigin}/${custom.video}`;
  return `${siteOrigin}/media/social/${id}-${format}.mp4`;
}

/** A guide has one square poster for both cuts; a one-off has one per cut. */
export function posterFile(id, format = "square") {
  const custom = oneOffMedia(id, format);
  if (custom) return path.join(projectRoot, "web", custom.poster);
  return path.join(mediaRoot, `${id}-poster.png`);
}

export function posterUrl(id, format = "square") {
  const custom = oneOffMedia(id, format);
  if (custom) return `${siteOrigin}/${custom.poster}`;
  return `${siteOrigin}/media/social/${id}-poster.png`;
}

/** Pixel size of a cut, for embeds that reserve space before the video loads. */
export function videoSize(id, format) {
  const custom = oneOffMedia(id, format);
  if (custom) return { width: custom.width, height: custom.height };
  return format === "vertical" ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 };
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

/**
 * The rendered poster, for networks whose upload can carry its own cover. Null
 * when it has not been rendered yet, which every caller treats as "let the
 * network choose" rather than as a failure.
 */
export async function readPoster(id, format = "square") {
  const file = posterFile(id, format);
  try {
    const bytes = await readFile(file);
    return { bytes, type: file.endsWith(".jpg") ? "image/jpeg" : "image/png", name: path.basename(file) };
  } catch {
    return null;
  }
}

/**
 * Alt text for the media: the same words as the post, plus what the wordless
 * animation shows, so a screen-reader user is not told less than a viewer.
 */
export function altText(title, summary, post) {
  // A one-off carries its own description, because it is not a guide post.
  if (post?.alt) return post.alt;
  return (
    `A narrated GetMyYes appeal guide: ${title}. ${summary} ` +
    "Animation in a woodblock-print style: at night a folded letter drifts down over a calm sea, " +
    "unfolds, and a glass lens prints the summary on it in plain English; then the letter folds " +
    "into a paper plane and flies into the sunrise, ending on: Read the free guide at getmyyes.com/appeals."
  );
}

/** One entry per queue post, or null for guides whose page has no OG tags. */
export async function videoModel() {
  const guides = [];
  const voiceLines = await readJson(path.join(libraryRoot, "guide-voice", "lines.json"), {});
  const { passages = [] } = await readJson(path.join(libraryRoot, "guide-voice", "score.json"), {});
  for (const post of posts) {
    const meta = await guideMeta(post);
    if (!meta) {
      console.warn(`[social-video] ${post.id}: no OG metadata on its guide page; skipping.`);
      continue;
    }
    // The narration (tool/guide_voice.mjs) and one of the score's passages;
    // a guide without its take yet renders with silent narration.
    const take = voiceLines[post.id];
    guides.push({
      id: post.id,
      slug: slugOf(post),
      title: meta.title,
      summary: post.text,
      voice: take ? { file: take.file, lines: take.lines } : null,
      score: passages.length ? passages[hash(post.id) % passages.length].file : null,
    });
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
  // The licensed audio lives in video/library (committed, never deployed) and
  // is copied into the bundle's public folder like the fonts.
  for (const kind of ["music", "sfx"]) {
    await cp(path.join(libraryRoot, kind), path.join(videoRoot, "public", "audio", kind), { recursive: true });
  }
  // The product film's stills, app captures and score, and the dawn ad's
  // narration and score.
  for (const kind of ["stills", "film", "dawn-ad", "guide-voice"]) {
    await cp(path.join(libraryRoot, kind), path.join(videoRoot, "public", kind), { recursive: true });
  }
  const music = await assignMusic(guides);
  for (const guide of guides) guide.music = music[guide.id] ?? null;
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
