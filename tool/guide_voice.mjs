import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Guide-post narration: one ElevenLabs take per guide in
// video/library/guide-voice/<id>.mp3, read from scripts.json (title, the
// reviewed one-line summary, one fixed closing line). This cuts each take
// into its three lines at the two longest pauses, which is where the script's
// paragraph breaks fall, and records the cuts in lines.json for the renderer.
//
//   node tool/guide_voice.mjs           cut any take that is new or changed
//   node tool/guide_voice.mjs --check   list queue guides that have no take yet
//
// A guide without a take still renders (silent narration, default timing),
// so a new guide never blocks a posting slot; --check says what is missing.

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const voiceRoot = path.join(projectRoot, "video", "library", "guide-voice");
const linesFile = path.join(voiceRoot, "lines.json");

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Remotion ships an ffmpeg next to its compositor; use that one. */
async function findFfmpeg() {
  const base = path.join(projectRoot, "video", "node_modules", "@remotion");
  for (const dir of await readdir(base)) {
    if (!dir.startsWith("compositor-")) continue;
    for (const name of ["ffmpeg.exe", "ffmpeg"]) {
      const candidate = path.join(base, dir, name);
      try {
        await stat(candidate);
        return candidate;
      } catch {
        // try the next
      }
    }
  }
  throw new Error("No ffmpeg found under video/node_modules/@remotion; run npm ci in video/.");
}

/** Mono 16-bit samples at 16 kHz, through a temporary WAV (this ffmpeg has no raw PCM output). */
async function decode(ffmpeg, file) {
  const tmp = path.join(os.tmpdir(), `gmy-voice-${process.pid}.wav`);
  const run = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", file, "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", tmp]);
  if (run.status !== 0) throw new Error(`ffmpeg could not decode ${file}: ${run.stderr}`);
  const wav = await readFile(tmp);
  const dataAt = wav.indexOf("data") + 8;
  const samples = new Int16Array(wav.buffer, wav.byteOffset + dataAt, Math.floor((wav.length - dataAt) / 2));
  return { samples, rate: 16000 };
}

/**
 * The three lines. A question inside a summary can pause longer than the
 * paragraph break, so the longest pauses are not enough: each break is
 * expected where its share of the script's characters says it should fall,
 * and the pause that is long and closest to that point wins.
 */
function cut({ samples, rate }, script) {
  const step = Math.round(rate * 0.02);
  const quiet = [];
  for (let i = 0; i + step <= samples.length; i += step) {
    let sum = 0;
    for (let j = i; j < i + step; j += 1) sum += (samples[j] / 32768) ** 2;
    quiet.push(20 * Math.log10(Math.sqrt(sum / step) + 1e-9) < -45);
  }
  const first = quiet.indexOf(false);
  const last = quiet.lastIndexOf(false);
  const gaps = [];
  for (let i = first; i <= last; i += 1) {
    if (!quiet[i]) continue;
    let j = i;
    while (j <= last && quiet[j]) j += 1;
    gaps.push({ from: i * 0.02, to: j * 0.02 });
    i = j;
  }
  if (gaps.length < 2) throw new Error("expected two pauses between the three lines");
  const end = (last + 1) * 0.02;
  const start = first * 0.02;
  const parts = (script ?? "").split(/\n\s*\n/).map((p) => p.trim().length);
  const total = parts.length === 3 ? parts[0] + parts[1] + parts[2] : 0;
  const expect = total
    ? [start + (end - start) * (parts[0] / total), start + (end - start) * ((parts[0] + parts[1]) / total)]
    : null;
  const pick = (at, after) => {
    const pool = gaps.filter((g) => g.from > after);
    return pool.reduce((best, g) => {
      const score = Math.abs((g.from + g.to) / 2 - at) / (end - start) * 12 - (g.to - g.from);
      return !best || score < best.score ? { g, score } : best;
    }, null).g;
  };
  let a;
  let b;
  if (expect) {
    a = pick(expect[0], 0);
    b = pick(expect[1], a.to);
  } else {
    [a, b] = gaps.sort((x, y) => (y.to - y.from) - (x.to - x.from)).slice(0, 2).sort((x, y) => x.from - y.from);
  }
  const round = (n) => Math.round(n * 100) / 100;
  return [
    { clipFrom: round(Math.max(0, first * 0.02 - 0.05)), clipTo: round(a.from + 0.12) },
    { clipFrom: round(a.to - 0.12), clipTo: round(b.from + 0.12) },
    { clipFrom: round(b.to - 0.12), clipTo: round(end + 0.15) },
  ];
}

const scripts = await readJson(path.join(voiceRoot, "scripts.json"), { guides: {} });
const posts = await readJson(path.join(projectRoot, "marketing", "posts.json"), []);

if (process.argv.includes("--check")) {
  const missing = [];
  for (const post of posts) {
    try {
      await stat(path.join(voiceRoot, `${post.id}.mp3`));
    } catch {
      missing.push(post.id);
    }
  }
  console.log(
    missing.length
      ? `[guide-voice] No narration yet for: ${missing.join(", ")}. Add the script to scripts.json, generate the take, save it as video/library/guide-voice/<id>.mp3.`
      : "[guide-voice] Every queue guide has its narration.",
  );
  process.exit(0);
}

const ffmpeg = await findFfmpeg();
const lines = await readJson(linesFile, {});
let changed = 0;
for (const name of (await readdir(voiceRoot)).filter((n) => n.endsWith(".mp3") && !n.startsWith("score-"))) {
  const id = name.slice(0, -4);
  const file = path.join(voiceRoot, name);
  const mtimeMs = Math.round((await stat(file)).mtimeMs);
  if (lines[id]?.mtimeMs === mtimeMs) continue;
  const script = scripts.guides[id]?.script ?? null;
  lines[id] = { file: `guide-voice/${name}`, mtimeMs, script, lines: cut(await decode(ffmpeg, file), script) };
  changed += 1;
  console.log(`[guide-voice] ${id}: ${lines[id].lines.map((l) => `${l.clipFrom}-${l.clipTo}`).join(" | ")}`);
}
if (changed) await writeFile(linesFile, `${JSON.stringify(lines, null, 2)}\n`);
console.log(`[guide-voice] ${changed} take(s) cut, ${Object.keys(lines).length} in all.`);
