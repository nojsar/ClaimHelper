import { stat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { FORMATS, posterFile, sync, videoFile } from "../tool/social_video.mjs";

/**
 * Renders the marketing autopilot's social media with Remotion.
 *
 *   node video/render.mjs                 render everything that is out of date
 *   node video/render.mjs --only er-denial
 *   node video/render.mjs --format vertical
 *   node video/render.mjs --force
 *
 * Output lands in web/media/social/ so it ships with the site: the Meta APIs
 * fetch video by URL, so the file has to be publicly served before Instagram
 * or Facebook can attach it. Everything is committed, like the OG cards, so
 * publishing never depends on a render succeeding at post time.
 *
 * Usually invoked through `node tool/render_social_video.mjs`, which is the
 * same thing from the directory the rest of the tooling runs in.
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");
const mediaRoot = path.join(projectRoot, "web", "media", "social");

const args = process.argv.slice(2);
const flag = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? null : args[index + 1];
};
const only = flag("--only");
const wantedFormat = flag("--format");
const force = args.includes("--force");

if (wantedFormat && !FORMATS.includes(wantedFormat)) {
  throw new Error(`Unknown format ${wantedFormat} (expected ${FORMATS.join(" or ")}).`);
}

async function mtime(file) {
  try {
    return (await stat(file)).mtimeMs;
  } catch {
    return null;
  }
}

/** Newest mtime across everything a rendered file is derived from. */
async function inputsChangedAt(guide) {
  const srcDir = path.join(here, "src");
  // queue.json is regenerated on every run, so its mtime always looks newer;
  // what it is derived FROM (posts.json and the guide page) is checked instead.
  const sources = (await readdir(srcDir))
    .filter((name) => name !== "queue.json")
    .map((name) => path.join(srcDir, name));
  const times = await Promise.all(
    [
      ...sources,
      path.join(here, "render.mjs"),
      path.join(projectRoot, "tool", "social_video.mjs"),
      path.join(projectRoot, "marketing", "posts.json"),
      path.join(projectRoot, "web", "appeals", `${guide.slug}.html`),
    ].map(mtime),
  );
  return Math.max(...times.filter((value) => value !== null));
}

const guides = (await sync()).filter((guide) => !only || guide.id === only);
if (!guides.length) throw new Error(only ? `No queue entry with id ${only}.` : "The post queue is empty.");
await mkdir(mediaRoot, { recursive: true });

// Work out what is actually out of date before touching a browser: the common
// case is one new guide, and a no-op run should cost nothing.
const formats = wantedFormat ? [wantedFormat] : FORMATS;
const jobs = [];
let upToDate = 0;

for (const guide of guides) {
  const changedAt = await inputsChangedAt(guide);
  const isStale = async (file) => {
    if (force) return true;
    const existing = await mtime(file);
    return existing === null || existing < changedAt;
  };

  for (const format of formats) {
    const output = videoFile(guide.id, format);
    if (await isStale(output)) jobs.push({ guide, format, output });
    else upToDate += 1;
  }

  // A still from the last frame: the fully settled card. It stands in wherever
  // a network takes an image but not a video. It is cut from the square
  // composition, so --format vertical leaves it alone.
  if (formats.includes("square")) {
    const poster = posterFile(guide.id);
    if (await isStale(poster)) jobs.push({ guide, format: "square", output: poster, still: true });
    else upToDate += 1;
  }
}

if (!jobs.length) {
  console.log(`[social-video] Nothing to render; ${upToDate} file(s) already up to date.`);
  process.exit(0);
}

// Remotion downloads its own headless shell into video/node_modules/.remotion.
// Where that download is blocked or throttled, point at an existing binary:
//   REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell node video/render.mjs
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
if (!browserExecutable) await ensureBrowser();

console.log(`[social-video] Bundling the Remotion project for ${jobs.length} file(s)...`);
const serveUrl = await bundle({
  entryPoint: path.join(here, "src", "index.ts"),
  publicDir: path.join(here, "public"),
});

// Carriage-return progress is for a terminal; in the workflow log it would be
// hundreds of near-identical lines.
const live = process.stdout.isTTY;

for (const job of jobs) {
  const label = `${job.guide.id} ${job.still ? "poster" : job.format}`;
  const composition = await selectComposition({
    serveUrl,
    id: `${job.guide.id}-${job.format}`,
    browserExecutable,
  });

  if (job.still) {
    await renderStill({
      composition,
      serveUrl,
      browserExecutable,
      frame: composition.durationInFrames - 1,
      imageFormat: "png",
      output: job.output,
    });
    console.log(`[social-video] ${label} done`);
    continue;
  }

  if (live) process.stdout.write(`[social-video] ${label} `);
  await renderMedia({
    composition,
    serveUrl,
    browserExecutable,
    codec: "h264",
    crf: 23,
    imageFormat: "jpeg",
    // Instagram and Facebook reject some silent files outright; a muted track
    // is cheaper than debugging a rejected upload.
    enforceAudioTrack: true,
    outputLocation: job.output,
    onProgress: ({ progress }) => {
      if (!live) return;
      process.stdout.write(`\r[social-video] ${label} ${Math.round(progress * 100)}%   `);
    },
  });
  console.log(`${live ? "\r" : ""}[social-video] ${label} done          `);
}

console.log(`[social-video] Rendered ${jobs.length} file(s), ${upToDate} already up to date.`);
console.log("[social-video] Deploy hosting before the next posting slot: the Meta APIs fetch these by URL.");
