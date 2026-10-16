import { stat, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { FORMATS, posterFile, sync, videoFile } from "../tool/social_video.mjs";
import { shortTimeline } from "./src/ad/shortTimeline.ts";

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
  const sources = (await readdir(srcDir, { recursive: true }))
    .filter((name) => name !== "queue.json" && /\.(tsx?|json)$/.test(name))
    .map((name) => path.join(srcDir, name));
  const times = await Promise.all(
    [
      ...sources,
      path.join(here, "render.mjs"),
      path.join(projectRoot, "tool", "social_video.mjs"),
      path.join(projectRoot, "marketing", "posts.json"),
      path.join(projectRoot, "web", "appeals", `${guide.slug}.html`),
      path.join(here, "library", "sfx.json"),
      path.join(here, "library", "guide-voice", `${guide.id}.mp3`),
      path.join(here, "library", "guide-voice", "lines.json"),
      guide.score ? path.join(here, "library", guide.score) : null,
    ]
      .filter(Boolean)
      .map(mtime),
  );
  return Math.max(...times.filter((value) => value !== null));
}

// `--film` renders the product film (both cuts and a poster) instead of the
// guide posts. Output lands in web/media/film/ so the site can embed it.
// /media is served immutable for a year, so a re-render must not reuse a file
// name: bump FILM_VERSION, then update the references in web/index.html.
const FILM_VERSION = "v2";

if (args.includes("--film")) {
  await sync();
  const filmRoot = path.join(projectRoot, "web", "media", "film");
  await mkdir(filmRoot, { recursive: true });
  const { readFile, writeFile } = await import("node:fs/promises");
  // Captions straight from the narration script, so they always match it.
  const voiceover = JSON.parse(await readFile(path.join(here, "library", "voiceover.json"), "utf8"));
  const stamp = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23);
  const vtt = ["WEBVTT", "", ...voiceover.lines.flatMap((line, i) => [String(i + 1), `${stamp(line.start)} --> ${stamp(line.end)}`, line.text, ""])].join("\n");
  await writeFile(path.join(filmRoot, `product-film-${FILM_VERSION}.vtt`), vtt);
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  if (!browserExecutable) await ensureBrowser();
  const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: path.join(here, "public") });
  const stillsOnly = args.includes("--stills-only");
  for (const cut of ["landscape", "vertical"]) {
    const composition = await selectComposition({ serveUrl, id: `product-film-${cut}`, browserExecutable });
    const suffix = cut === "landscape" ? "" : "-vertical";
    // Poster: the opening shot with its caption, shown on the site before play.
    // Cover: the settled end card, handed to networks that take a thumbnail.
    for (const [name, frame] of [["poster", Math.round(2.2 * composition.fps)], ["cover", composition.durationInFrames - 1]]) {
      await renderStill({ composition, serveUrl, browserExecutable, frame, imageFormat: "jpeg", jpegQuality: 88, output: path.join(filmRoot, `product-film-${FILM_VERSION}-${name}${suffix}.jpg`) });
    }
    if (stillsOnly) continue;
    const outputLocation = path.join(filmRoot, `product-film-${FILM_VERSION}-${cut}.mp4`);
    await renderMedia({
      composition, serveUrl, browserExecutable, codec: "h264", crf: 18, imageFormat: "png",
      enforceAudioTrack: true, audioCodec: "aac", audioBitrate: "192k", outputLocation,
      onProgress: ({ progress }) => { if (process.stdout.isTTY) process.stdout.write(`
[film] ${cut} ${Math.round(progress * 100)}%   `); },
    });
    console.log(`[film] ${cut} done`);
  }
  process.exit(0);
}

// `--dawn-ad` renders "Some letters arrive at night", the dawn-print ad (both
// cuts, a poster and a cover) into web/media/ad/. /media is immutable for a
// year: bump AD_VERSION on a re-render. `--review` renders eight frames per
// cut into video/out/ad-review for a contact sheet instead.
// The sky is WebGL, so the browser runs with ANGLE.
// v3 (2026-10-13): narration regenerated on the paid ElevenLabs plan, type
// below the Reels header, and the SAMPLE LETTER stamp.
const AD_VERSION = "v3";

// `--pulse-ad` renders fb6, the Deadline angle as a fast cut (src/ad/PulseAd.tsx),
// in 9:16 and 4:5 with an .srt and covers, into the folder the Ads Manager
// upload is made from. `--review` renders stills at each scene instead.
if (args.includes("--pulse-ad")) {
  await sync();
  const { readFile, writeFile } = await import("node:fs/promises");
  const outRoot = path.join(here, "out", "meta-ads", "15s", "fb6 - Deadline fast");
  const reviewRoot = path.join(here, "out", "pulse-review");
  const review = args.includes("--review");
  await mkdir(review ? reviewRoot : outRoot, { recursive: true });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  if (!browserExecutable) await ensureBrowser();
  const chromiumOptions = { gl: process.env.REMOTION_GL || "angle" };
  const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: path.join(here, "public") });
  const ad = JSON.parse(await readFile(path.join(here, "library", "pulse-ad", "pulse-ad.json"), "utf8"));
  // Captions: the read, grouped into the phrases the screen shows.
  const stamp = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23).replace(".", ",");
  const srt = ad.captions
    .map(([a, b], i) => `${i + 1}\n${stamp(ad.voice.words[a].from)} --> ${stamp(ad.voice.words[b].to)}\n${ad.voice.words.slice(a, b + 1).map((w) => w.text).join(" ")}\n`)
    .join("\n");
  if (!review) await writeFile(path.join(outRoot, "getmyyes-fb6-15s.en_US.srt"), srt);
  for (const format of ["vertical", "feed"]) {
    const composition = await selectComposition({ serveUrl, id: `pulse-ad-${format}`, browserExecutable, chromiumOptions });
    const tag = format === "feed" ? "4x5" : "9x16";
    const frames = review
      ? [0.6, 1.8, 3.1, 5.0, 6.2, 7.4, 9.3, 11.0, 12.8, 14.3, 15.7].map((t, i) => [`review-${i}-${t}`, Math.round(t * composition.fps)])
      : [["cover", Math.round(0.6 * composition.fps)]];
    for (const [name, frame] of frames) {
      await renderStill({ composition, serveUrl, browserExecutable, chromiumOptions, frame, imageFormat: "jpeg", jpegQuality: 90, output: path.join(review ? reviewRoot : outRoot, `getmyyes-fb6-15s-${tag}-${name}.jpg`) });
    }
    if (review) continue;
    await renderMedia({
      composition, serveUrl, browserExecutable, chromiumOptions, codec: "h264", crf: 16, imageFormat: "png",
      enforceAudioTrack: true, audioCodec: "aac", audioBitrate: "192k", outputLocation: path.join(outRoot, `getmyyes-fb6-15s-${tag}.raw.mp4`),
    });
    // Phones play ads loud; bring the mix to -16 LUFS (true peak -1.5 dB)
    // without touching the picture.
    const { spawnSync } = await import("node:child_process");
    const raw = path.join(outRoot, `getmyyes-fb6-15s-${tag}.raw.mp4`);
    const norm = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", raw, "-c:v", "copy", "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "48000", "-c:a", "aac", "-b:a", "192k", path.join(outRoot, `getmyyes-fb6-15s-${tag}.mp4`)], { stdio: "inherit" });
    if (norm.status !== 0) throw new Error("ffmpeg loudnorm failed");
    const { rm } = await import("node:fs/promises");
    await rm(raw);
    console.log(`[pulse-ad] ${format} done`);
  }
  process.exit(0);
}

if (args.includes("--dawn-ad")) {
  await sync();
  const adRoot = path.join(projectRoot, "web", "media", "ad");
  const reviewRoot = path.join(here, "out", "ad-review");
  await mkdir(adRoot, { recursive: true });
  await mkdir(reviewRoot, { recursive: true });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  if (!browserExecutable) await ensureBrowser();
  const chromiumOptions = { gl: process.env.REMOTION_GL || "angle" };
  const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: path.join(here, "public") });
  const review = args.includes("--review");
  // Captions straight from the narration script, so they always match it.
  const { readFile, writeFile } = await import("node:fs/promises");
  const ad = JSON.parse(await readFile(path.join(here, "library", "dawn-ad", "dawn-ad.json"), "utf8"));
  const stamp = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23);
  const vtt = ["WEBVTT", "", ...ad.voice.lines.flatMap((line, i) => [String(i + 1), `${stamp(line.at)} --> ${stamp(line.at + line.clipTo - line.clipFrom)}`, line.text, ""])].join("\n");
  if (!review) await writeFile(path.join(adRoot, `dawn-ad-${AD_VERSION}.vtt`), vtt);
  for (const cut of ["vertical", "landscape"]) {
    const composition = await selectComposition({ serveUrl, id: `dawn-ad-${cut}`, browserExecutable, chromiumOptions });
    const base = `dawn-ad-${AD_VERSION}`;
    const suffix = cut === "vertical" ? "-vertical" : "";
    const frames = review
      ? [1.8, 5.2, 8.9, 12.6, 15.0, 17.6, 21.2, 25.0].map((s, i) => [`review-${i}`, Math.round(s * composition.fps)])
      : [["poster", Math.round(2.2 * composition.fps)], ["cover", composition.durationInFrames - 1]];
    for (const [name, frame] of frames) {
      await renderStill({ composition, serveUrl, browserExecutable, chromiumOptions, frame, imageFormat: "jpeg", jpegQuality: 88, output: path.join(review ? reviewRoot : adRoot, `${base}-${name}${suffix}.jpg`) });
    }
    if (review) continue;
    await renderMedia({
      composition, serveUrl, browserExecutable, chromiumOptions, codec: "h264", crf: 18, imageFormat: "png",
      enforceAudioTrack: true, audioCodec: "aac", audioBitrate: "192k", outputLocation: path.join(adRoot, `${base}-${cut}.mp4`),
    });
    console.log(`[dawn-ad] ${cut} done`);
  }
  process.exit(0);
}

// `--meta-ads` renders the Facebook angle test: each voiced hook in
// library/dawn-ad/hooks.json, then the ad, as 9:16 (Reels, Stories) and 4:5
// (Feed), with an .srt and a cover per ad. They are uploaded to Ads Manager
// by hand, so they land in video/out/meta-ads/ rather than on the site.
// `--only fb3` renders one hook; `--review` renders stills instead.
if (args.includes("--meta-ads")) {
  await sync();
  const outRoot = path.join(here, "out", "meta-ads");
  await mkdir(outRoot, { recursive: true });
  const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
  if (!browserExecutable) await ensureBrowser();
  const chromiumOptions = { gl: process.env.REMOTION_GL || "angle" };
  const serveUrl = await bundle({ entryPoint: path.join(here, "src", "index.ts"), publicDir: path.join(here, "public") });
  const review = args.includes("--review");
  const short = args.includes("--short");
  const { readFile, writeFile } = await import("node:fs/promises");
  const hooks = JSON.parse(await readFile(path.join(here, "library", "dawn-ad", "hooks.json"), "utf8"));
  const ad = JSON.parse(await readFile(path.join(here, "library", "dawn-ad", "dawn-ad.json"), "utf8"));
  const { voiceAt, tail } = hooks.timing;
  const stamp = (seconds) => new Date(seconds * 1000).toISOString().slice(11, 23).replace(".", ",");
  for (const hook of hooks.hooks.filter((h) => !only || h.id === only)) {
    // Same rounding as hookFrames() in DawnHook.tsx.
    const lead = Math.round((voiceAt + (short ? hook.short.to + hooks.timing.short.tail : hook.seconds + tail)) * 60) / 60;
    // The 15-second cut: whole hook sentences, the read line, the end card;
    // the same shortTimeline() the composition uses.
    const t = short
      ? shortTimeline({
          hookSeconds: lead,
          target: hooks.timing.short.seconds,
          read: hooks.timing.short.read.lines,
          readGap: hooks.timing.short.read.gap,
          end: hooks.timing.short.end.lines,
          endGap: hooks.timing.short.end.gap,
        })
      : null;
    const cues = short
      ? [
          ...hook.lines.filter((line) => line.to <= hook.short.to + 0.01).map((line) => [voiceAt + line.from, voiceAt + line.to, line.text]),
          ...[...t.read, ...t.end].map((clip) => [clip.at, clip.at + clip.to - clip.from, clip.text]),
        ]
      : [
          ...hook.lines.map((line) => [voiceAt + line.from, voiceAt + line.to, line.text]),
          ...ad.voice.lines.map((line) => [lead + line.at, lead + line.at + line.clipTo - line.clipFrom, line.text]),
        ];
    const srt = cues.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`).join("\n");
    const tag = short ? `${hook.id}-15s` : hook.id;
    if (!review) await writeFile(path.join(outRoot, `getmyyes-${tag}.en_US.srt`), srt);
    for (const format of ["vertical", "feed"]) {
      const composition = await selectComposition({ serveUrl, id: `${short ? "dawn-short" : "dawn-ad"}-${hook.id}-${format}`, browserExecutable, chromiumOptions });
      const base = path.join(outRoot, `getmyyes-${tag}-${format === "feed" ? "4x5" : "9x16"}`);
      // The cover is the hook with all its words up: what the thumb stops on.
      const frames = review
        ? (t
            ? [0.45, lead - 0.4, t.rows[0] + 0.4, t.rows[1] + 0.5, t.rows[2] + 0.2, t.endAt + 1.2, t.total - 0.1]
            : [0.45, lead - 0.4, lead + 2.2, lead + 7.5, lead + 12.6, lead + 17.6, lead + 24.6]
          ).map((s, i) => [`review-${i}`, Math.round(s * 60)])
        : [["cover", Math.round((lead - 0.4) * 60)]];
      for (const [name, frame] of frames) {
        await renderStill({ composition, serveUrl, browserExecutable, chromiumOptions, frame, imageFormat: "jpeg", jpegQuality: 90, output: `${base}-${name}.jpg` });
      }
      if (review) continue;
      await renderMedia({
        composition, serveUrl, browserExecutable, chromiumOptions, codec: "h264", crf: 18, imageFormat: "png",
        enforceAudioTrack: true, audioCodec: "aac", audioBitrate: "192k", outputLocation: `${base}.mp4`,
      });
      console.log(`[meta-ads] ${hook.id} ${format} done`);
    }
  }
  process.exit(0);
}

// New narration takes are cut into their lines before the model is built.
{
  const { spawnSync } = await import("node:child_process");
  const cutVoice = spawnSync(process.execPath, [path.join(projectRoot, "tool", "guide_voice.mjs")], { stdio: "inherit" });
  if (cutVoice.status !== 0) throw new Error("tool/guide_voice.mjs failed");
}
const queued = (await sync()).filter((guide) => !only || guide.id === only);
if (!queued.length) throw new Error(only ? `No queue entry with id ${only}.` : "The post queue is empty.");
// Posts go out only as narrated videos: a guide without a paid-plan take is
// not rendered, so no voiceless video can reach a network.
const guides = queued.filter((guide) => {
  if (!guide.voice) console.warn(`[social-video] ${guide.id}: no paid-plan narration yet; not rendered (the networks skip it until it has one).`);
  return Boolean(guide.voice);
});
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

  // A still of the risen title: the cover networks show, and the image wherever
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

// The posts draw the homepage's dawn shader, so the browser needs WebGL.
const chromiumOptions = { gl: process.env.REMOTION_GL || "angle" };
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
  // The poster is drawn without the falling letter, which would otherwise be
  // crossing the title at that moment.
  const inputProps = job.still ? { cover: true } : {};
  const composition = await selectComposition({
    serveUrl,
    id: `${job.guide.id}-${job.format}`,
    browserExecutable,
    chromiumOptions,
    inputProps,
  });

  if (job.still) {
    // The hook: the guide's title risen over the night sea. Networks show it
    // as the cover, so it should be the frame that makes someone stop.
    await renderStill({
      composition,
      serveUrl,
      browserExecutable,
      chromiumOptions,
      inputProps,
      frame: Math.round(2.2 * composition.fps),
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
    chromiumOptions,
    codec: "h264",
    crf: 16,
    imageFormat: "png",
    // The score is licensed music plus timed sound effects. The track stays
    // enforced so a guide without a music assignment still uploads cleanly:
    // Instagram and Facebook reject some silent files outright.
    enforceAudioTrack: true,
    audioCodec: "aac",
    audioBitrate: "192k",
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
