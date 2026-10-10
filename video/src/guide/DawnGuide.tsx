import React from "react";
import { AbsoluteFill, Easing, Html5Audio, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, MONO, NAVY, NAVY_DARK, SANS, SERIF, TEAL } from "../brand";
import { clamp01, f, glide, mix, pop, settle } from "../motion";
import { CREAM, DawnSky, PAPER, Plane, Rise, Stars, Strip, bez } from "../ad/paper";
import "../fonts";

/**
 * A guide's social post in the dawn-print style of the homepage film. All of
 * it is drawn; every word comes from reviewed copy (the guide's og:title, its
 * one-line summary in marketing/posts.json) and the narration reads exactly
 * that, then one fixed closing line. Three scenes follow the three lines:
 *
 *   night   the title rises out of its mask; a folded letter drifts down
 *   read    the letter unfolds and the lens prints the summary on it
 *   send    the letter folds into a paper plane and flies into the sunrise,
 *           over "Read the free guide" and the address
 *
 * The score is quiet: cut level with the voice, then held 18 dB under it
 * while she speaks and 12 dB under in the gaps.
 */

export type GuideFormat = "square" | "vertical";
export type GuideVoice = { file: string; lines: { clipFrom: number; clipTo: number }[] } | null;
/** `cover` renders the poster: the risen title alone, with no letter crossing it. */
export type DawnGuideProps = { format: GuideFormat; title: string; summary: string; voice: GuideVoice; score: string; cover?: boolean };

const LEAD = 0.5;
const BREATH = [0.55, 0.5];
const HOLD = 1.9;
const FALLBACK = [3.0, 6.5, 3.0];

/** When each line starts and how long the post runs, from the narration. */
export function guideTiming(voice: GuideVoice) {
  const d = voice ? voice.lines.map((l) => l.clipTo - l.clipFrom) : FALLBACK;
  const t1 = LEAD;
  const t2 = t1 + d[0] + BREATH[0];
  const t3 = t2 + d[1] + BREATH[1];
  const end = t3 + d[2] + HOLD;
  return { t: [t1, t2, t3], d, end, frames: Math.ceil(end * FPS) };
}

/** Greedy word wrap by an average glyph width; good enough for display type. */
function wrap(text: string, perLine: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    if (line && (line + " " + word).length > perLine) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

const UNDER = 10 ** (-18 / 20);
const GAP = 10 ** (-12 / 20);

export const DawnGuide: React.FC<DawnGuideProps> = ({ format, title, summary, voice, score, cover = false }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const s = frame / FPS;
  const tall = format === "vertical";
  const u = width / 1080;
  const { t, d, end } = guideTiming(voice);
  const [t1, t2, t3] = t;
  const speech = t.map((at, i) => [at, at + d[i]] as const);
  const duck = (time: number) => {
    let near = Infinity;
    for (const [a, b] of speech) {
      if (time >= a && time <= b) return UNDER;
      near = Math.min(near, time < a ? a - time : time - b);
    }
    return mix(UNDER, GAP, clamp01(near / 0.25));
  };

  // Night lifts into morning; the sun climbs.
  const night = interpolate(s, [0, t2, t3 + 0.4, end - 0.6], [1, 0.9, 0.45, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) });
  const rise = interpolate(s, [0, t2, t3, end], [0, 0.05, 0.45, 0.95], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) });
  const hz = 0.22;
  const sunX = 0.5;

  // Type.
  const titleSize = (tall ? 92 : 78) * u;
  const titleLines = wrap(title, tall ? 19 : 22);
  const pad = (tall ? 84 : 72) * u;
  const titleTop = (tall ? 250 : 130) * u;
  const shrink = settle(frame, t2 - 0.25, 0.9);
  const titleOut = glide(frame, t3 + 0.1, t3 + 0.5);

  // The letter: falls, lands, unfolds; the lens prints the summary.
  const cardW = (tall ? 860 : 700) * u;
  const bodySize = (tall ? 54 : 44) * u;
  const bodyLines = wrap(summary, tall ? 25 : 25);
  const lineH = bodySize * 1.3;
  const bodyTop = cardW * 0.2;
  // The sheet fits its text, with a little paper below the last line.
  const cardH = Math.max(cardW * 0.62, bodyTop + bodyLines.length * lineH + cardW * 0.12);
  const homeX = width / 2;
  const homeY = tall ? height * 0.56 : height * 0.6;
  // It drifts in once the title has been read, and passes behind it.
  const fall = settle(frame, t1 + d[0] * 0.45, t2 - 0.35 - (t1 + d[0] * 0.45));
  const sway = 1 - fall;
  const cardX = homeX + Math.sin(s * 2.1) * 60 * u * sway;
  const cardY = mix(-height * 0.3, homeY, fall);
  const unfold = clamp01(glide(frame, t2, t2 + 0.9));
  const lensP = clamp01((s - (t2 + 0.6)) / Math.max(1.2, d[1] * 0.8));
  const lensRow = lensP * bodyLines.length;
  const lensOn = glide(frame, t2 + 0.5, t2 + 0.8) * (1 - glide(frame, t3 - 0.3, t3));
  const foldUp = glide(frame, t3, t3 + 0.55);

  // The flight.
  const fl = clamp01(glide(frame, t3 + 0.45, t3 + 0.45 + Math.max(2.4, d[2] + 0.4), Easing.inOut(Easing.cubic)));
  const sunPy = height * (1 - hz) - height * 0.03 * rise;
  const path = {
    x: [homeX, homeX + 300 * u, width * sunX + 170 * u, width * sunX],
    y: [homeY, homeY - (tall ? 160 : 110) * u, sunPy - (tall ? 160 : 110) * u, sunPy - 10 * u],
  };
  const px = bez(fl, path.x[0], path.x[1], path.x[2], path.x[3]);
  const py = bez(fl, path.y[0], path.y[1], path.y[2], path.y[3]);
  const ahead = Math.min(1, fl + 0.01);
  const ang = Math.atan2(bez(ahead, path.y[0], path.y[1], path.y[2], path.y[3]) - py, bez(ahead, path.x[0], path.x[1], path.x[2], path.x[3]) - px);
  const planeW = (tall ? 360 : 300) * u * mix(1, 0.14, fl);
  const planeIn = pop(frame, t3 + 0.3);
  const trail = Array.from({ length: 44 }, (_, i) => i / 43).filter((x) => x <= fl);
  const endAt = t3 + 0.9;

  const third = cardH / 3;
  const body = (
    <div style={{ position: "absolute", left: 0, top: 0, width: cardW, height: cardH, background: PAPER }}>
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(180deg, transparent 0 ${lineH - 1}px, rgba(160,140,110,0.12) ${lineH - 1}px ${lineH}px)`, backgroundPosition: `0 ${bodyTop + lineH * 0.18}px` }} />
      <div style={{ position: "absolute", left: cardW * 0.08, top: cardW * 0.07, fontFamily: MONO, fontWeight: 600, fontSize: cardW * 0.026, letterSpacing: "0.12em", color: "#5F6E78" }}>
        GETMYYES · FREE APPEAL GUIDE
      </div>
      <div style={{ position: "absolute", left: cardW * 0.08, right: cardW * 0.08, top: cardW * 0.13, height: 1.5, background: "rgba(23,50,77,0.14)" }} />
      {bodyLines.map((line, i) => {
        const k = clamp01(lensRow - i);
        return (
          <div
            key={`${i}-${line}`}
            style={{
              position: "absolute",
              left: cardW * 0.08,
              top: bodyTop + i * lineH,
              fontFamily: SERIF,
              fontWeight: 700,
              fontSize: bodySize,
              lineHeight: `${lineH}px`,
              color: NAVY_DARK,
              whiteSpace: "nowrap",
              clipPath: `inset(-10% ${(1 - k) * 100}% -10% 0)`,
            }}
          >
            {line}
          </div>
        );
      })}
      {lensOn > 0.001 && (
        <div
          style={{
            position: "absolute",
            left: cardW * 0.05,
            right: cardW * 0.05,
            top: bodyTop + Math.min(Math.max(lensRow - 0.5, 0), bodyLines.length - 1) * lineH - lineH * 0.1,
            height: lineH * 1.2,
            borderRadius: cardW * 0.025,
            opacity: lensOn,
            background: "linear-gradient(180deg, rgba(255,255,255,0.45), rgba(255,255,255,0) 45%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1.5px rgba(47,111,98,0.5), 0 14px 30px -14px rgba(16,38,59,0.55), 0 0 30px -6px rgba(143,211,194,0.8)",
          }}
        >
          <span style={{ position: "absolute", top: -cardW * 0.03, right: cardW * 0.03, padding: `${cardW * 0.006}px ${cardW * 0.018}px`, borderRadius: 99, background: TEAL, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: cardW * 0.026 }}>
            Plain English
          </span>
        </div>
      )}
    </div>
  );
  const panel = (i: number, angle: number, origin: string) => (
    <div key={i} style={{ position: "absolute", left: 0, top: i * third, width: cardW, height: third, transformOrigin: origin, transform: `rotateX(${angle}deg)`, transformStyle: "preserve-3d" }}>
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", backfaceVisibility: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: -i * third }}>{body}</div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #F4ECDD, #E9DFCC)", transform: "rotateX(180deg)", backfaceVisibility: "hidden", overflow: "hidden" }}>
        {[0.22, 0.4, 0.58, 0.76].map((y) => <div key={y} style={{ position: "absolute", left: cardW * 0.08, top: third * y, width: cardW * 0.5, height: cardW * 0.012, borderRadius: 99, background: "rgba(31,43,55,0.06)" }} />)}
        {i !== 1 && <div style={{ position: "absolute", right: cardW * 0.08, top: third * 0.2, fontFamily: MONO, fontWeight: 600, fontSize: cardW * 0.024, letterSpacing: "0.1em", color: "rgba(31,43,55,0.5)" }}>GETMYYES</div>}
      </div>
    </div>
  );
  const ease = Easing.inOut(Easing.cubic);
  const topA = mix(-179, 0, ease(clamp01(unfold * 2 - 1))) + mix(0, -179, ease(clamp01(foldUp * 2)));
  const botA = mix(178, 0, ease(clamp01(unfold * 2))) + mix(0, 178, ease(clamp01(foldUp * 2 - 1)));

  return (
    <AbsoluteFill style={{ background: "#0D1726", overflow: "hidden" }}>
      <Html5Audio
        src={staticFile(score)}
        volume={(fr) => duck(fr / FPS) * interpolate(fr, [0, f(0.6), durationInFrames - f(1.2), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
      {voice &&
        voice.lines.map((line, i) => (
          <Sequence key={i} from={f(t[i])} durationInFrames={f(line.clipTo - line.clipFrom) + 1} layout="none">
            <Html5Audio src={staticFile(voice.file)} trimBefore={f(line.clipFrom)} trimAfter={f(line.clipTo)} volume={1} />
          </Sequence>
        ))}
      {[
        { at: t2 - 0.4, sfx: "paper-slide", volume: 0.28 },
        { at: t2, sfx: "card-swoosh", volume: 0.22 },
        { at: t3 + 0.45, sfx: "fly-swoosh", volume: 0.26 },
        { at: endAt + 0.3, sfx: "done-chime", volume: 0.26 },
      ].map((cue) => (
        <Sequence key={cue.sfx} from={f(cue.at)} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${cue.sfx}.mp3`)} volume={cue.volume * 0.8} />
        </Sequence>
      ))}

      <DawnSky night={night} rise={rise} hz={hz} sunX={sunX} px={1.5 * u} />
      <Stars night={night} />

      {/* The letter. */}
      {!cover && foldUp < 0.999 && (
        <div style={{ position: "absolute", left: cardX - cardW / 2, top: cardY - cardH / 2, perspective: 2400 * u, transform: `scale(${1 - foldUp * 0.45}) rotate(${Math.sin(s * 2.1 + 0.5) * 11 * sway}deg)`, opacity: 1 - clamp01((foldUp - 0.6) / 0.4) }}>
          <div style={{ transform: `rotateX(${Math.sin(s * 1.6) * 26 * sway}deg)`, transformStyle: "preserve-3d", position: "relative", width: cardW, height: cardH, filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.45))" }}>
            {panel(0, topA, "50% 100%")}
            {panel(1, 0, "50% 50%")}
            {panel(2, botA, "50% 0%")}
          </div>
        </div>
      )}

      {/* The title, then smaller above the letter while it is read. */}
      {titleOut < 1 && (
        <div style={{ position: "absolute", left: pad, right: pad, top: titleTop, transformOrigin: "0 0", transform: `translateY(${-shrink * (tall ? 110 : 70) * u}px) scale(${mix(1, tall ? 0.6 : 0.56, shrink)})`, opacity: 1 - titleOut }}>
          <Strip text="Free appeal guide" at={0.25} size={(tall ? 36 : 32) * u} style={{ position: "relative", display: "inline-block", fontFamily: MONO, fontSize: (tall ? 28 : 24) * u, letterSpacing: "0.12em", textTransform: "uppercase" }} />
          {/* The shadow keeps the title readable while the letter passes behind it. */}
          <Rise lines={titleLines} at={t1 - 0.05} size={titleSize} color={CREAM} style={{ position: "relative", marginTop: 22 * u, textShadow: `0 ${2 * u}px ${4 * u}px rgba(13,23,38,0.55), 0 ${6 * u}px ${22 * u}px rgba(13,23,38,0.5)` }} />
        </div>
      )}

      {/* Trail and plane. */}
      {s >= t3 + 0.45 && (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {trail.map((x, i) => (
            <circle key={i} cx={bez(x, path.x[0], path.x[1], path.x[2], path.x[3])} cy={bez(x, path.y[0], path.y[1], path.y[2], path.y[3])} r={mix(4.5, 1.4, x) * u} fill={`rgba(255,247,234,${0.75 * (1 - glide(frame, end - 1.2, end - 0.4))})`} />
          ))}
        </svg>
      )}
      {s >= t3 + 0.3 && fl < 1 && (
        <div style={{ position: "absolute", left: px - planeW * 0.62, top: py - planeW * 0.36, transform: `scale(${s < t3 + 0.45 ? 0.6 + 0.4 * planeIn : 1}) rotate(${(ang * 180) / Math.PI + 34 + Math.sin(s * 3) * 6 * (1 - fl)}deg)`, transformOrigin: "62% 36%", opacity: clamp01(planeIn * 2) }}>
          <Plane w={planeW} />
        </div>
      )}

      {/* Morning: where to read it. */}
      {s >= endAt - 0.2 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: (tall ? 330 : 170) * u, gap: 26 * u, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 * u, opacity: settle(frame, endAt, 0.6) }}>
            <svg width={58 * u} height={58 * u} viewBox="0 0 100 100">
              <rect width="100" height="100" rx="24" fill={TEAL} />
              <path d="M27 52 L44 68 L75 34" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 46 * u, color: NAVY_DARK }}>GetMyYes</span>
          </div>
          <Rise lines={["Read the free guide."]} at={endAt + 0.3} size={(tall ? 96 : 82) * u} color={NAVY_DARK} align="center" style={{ position: "relative" }} />
          <div style={{ marginTop: 8 * u, padding: `${16 * u}px ${32 * u}px`, borderRadius: 999, background: NAVY, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: (tall ? 38 : 34) * u, opacity: settle(frame, endAt + 0.8, 0.6), transform: `scale(${0.9 + 0.1 * pop(frame, endAt + 0.8)})` }}>
            getmyyes.com/appeals
          </div>
          <span style={{ padding: `${10 * u}px ${20 * u}px`, borderRadius: 999, background: "rgba(255,253,247,0.86)", color: NAVY_DARK, fontFamily: SANS, fontWeight: 650, fontSize: 28 * u, opacity: settle(frame, endAt + 1.1, 0.6), boxShadow: "0 10px 26px -18px rgba(16,38,59,0.6)" }}>
            Free · No sign-up · <span style={{ color: TEAL }}>In plain English</span>
          </span>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
