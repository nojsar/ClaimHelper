import React, { useLayoutEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  Sequence,
  continueRender,
  delayRender,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { MONO, NAVY, NAVY_DARK, SANS, SERIF, TEAL } from "../brand";
import { clamp01, f, glide, mix, pop, settle } from "../motion";
import data from "../../library/dawn-ad/dawn-ad.json";
import { DAWN_FRAG, DAWN_VERT } from "./dawnShader";
import "../fonts";

/**
 * "Some letters arrive at night": the dawn-print ad. Nothing here is a
 * photograph made to look alive. The sky and sea are the homepage's own
 * shader, drawn every frame, and the night turns to morning over the 25
 * seconds; the letter, the sheets and the paper plane are vector paper,
 * folded in 3-D. New script, new narration (dawn-ad.json).
 *
 *   0.0  night        a folded letter drifts down onto the sea
 *   3.9  read         it unfolds; the lens turns it into plain English
 *  10.6  build        it folds; the appeal's pages fan out of it
 *  14.6  fold         the pages fold into a paper plane
 *  16.0  send         the plane flies into the sunrise
 *  20.2  morning      end card
 */

export type DawnAdFormat = "vertical" | "landscape";
export const DAWN_AD_SECONDS = 25.5;

const D = { land: 3.4, unfold: 3.9, lens: 5.1, free: 8.4, build: 10.6, sheets: 11.2, gather: 13.9, fold: 14.5, launch: 16.0, end: 20.2 };

const CREAM = "#FFF7EA";
const PAPER = "#FFFDF7";
const MINT = "#A9DED2";

const ROWS = [
  { jargon: "Service not certified. Prior authorization was not obtained per Section 4.2.", plain: "The plan says approval was needed first." },
  { jargon: "Member may request an internal appeal within 180 calendar days of receipt.", plain: "You can appeal. You have 180 days." },
  { jargon: "A letter of medical necessity from the treating provider may be submitted.", plain: "A letter from your doctor can help." },
];

const SHEETS = ["Appeal letter", "Evidence checklist", "Deadline tracker"];

const SFX: { at: number; sfx: string; volume: number }[] = [
  { at: D.land - 0.15, sfx: "paper-slide", volume: 0.34 },
  { at: D.unfold, sfx: "card-swoosh", volume: 0.26 },
  ...ROWS.map((_, i) => ({ at: D.lens + 0.55 + i * 1.0, sfx: "tick", volume: 0.24 })),
  { at: D.free, sfx: "check", volume: 0.36 },
  ...SHEETS.map((_, i) => ({ at: D.sheets + 0.2 + i * 0.25, sfx: "node-pop", volume: 0.22 })),
  { at: D.fold, sfx: "regroup-swoosh", volume: 0.3 },
  { at: D.launch + 0.1, sfx: "fly-swoosh", volume: 0.3 },
  { at: D.end + 0.3, sfx: "done-chime", volume: 0.32 },
];

/* ------------------------------------------------------------ the mix */

// The score is cut level with the narration (dawn-ad.json), then sits 18 dB
// under the voice while she speaks and 12 dB under in the gaps, easing
// between the two over a quarter of a second.
const UNDER = 10 ** (-18 / 20);
const GAP = 10 ** (-12 / 20);
const RAMP = 0.25;
const SPEECH = data.voice.lines.map((line) => [line.at, line.at + line.clipTo - line.clipFrom] as const);
const duck = (t: number): number => {
  let near = Infinity;
  for (const [a, b] of SPEECH) {
    if (t >= a && t <= b) return UNDER;
    near = Math.min(near, t < a ? a - t : t - b);
  }
  return mix(UNDER, GAP, clamp01(near / RAMP));
};

/* ------------------------------------------------------------- the sky */

type Uniforms = Record<string, WebGLUniformLocation | null>;

/** The homepage's dawn print, drawn once per frame at the video's size. */
const DawnSky: React.FC<{ night: number; rise: number; hz: number; sunX: number; px: number }> = ({ night, rise, hz, sunX, px }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{ ctx: WebGLRenderingContext; u: Uniforms } | null>(null);
  const [handle] = useState(() => delayRender("Compiling the dawn sky"));

  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, alpha: false }) ?? null;
    if (ctx) {
      const shader = (type: number, src: string) => {
        const s = ctx.createShader(type)!;
        ctx.shaderSource(s, src);
        ctx.compileShader(s);
        return s;
      };
      const prog = ctx.createProgram()!;
      ctx.attachShader(prog, shader(ctx.VERTEX_SHADER, DAWN_VERT));
      ctx.attachShader(prog, shader(ctx.FRAGMENT_SHADER, DAWN_FRAG));
      ctx.linkProgram(prog);
      ctx.useProgram(prog);
      const buf = ctx.createBuffer();
      ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
      ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
      const loc = ctx.getAttribLocation(prog, "p");
      ctx.enableVertexAttribArray(loc);
      ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
      const u: Uniforms = {};
      for (const name of ["uRes", "uPx", "uVH", "uTime", "uRise", "uNight", "uHz", "uSunX"]) u[name] = ctx.getUniformLocation(prog, name);
      gl.current = { ctx, u };
    }
    continueRender(handle);
  }, [handle]);

  useLayoutEffect(() => {
    if (!gl.current) return;
    const { ctx, u } = gl.current;
    ctx.viewport(0, 0, width, height);
    ctx.uniform2f(u.uRes, width, height);
    ctx.uniform1f(u.uPx, px);
    ctx.uniform1f(u.uVH, height / px);
    ctx.uniform1f(u.uTime, 30 + frame / fps);
    ctx.uniform1f(u.uRise, rise);
    ctx.uniform1f(u.uNight, night);
    ctx.uniform1f(u.uHz, hz);
    ctx.uniform1f(u.uSunX, sunX);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    ctx.finish();
  });

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "linear-gradient(180deg, #0D1726, #2E3349 70%, #091420)" }}
    />
  );
};

/** A few stars over the night sky, fading as the dawn comes. */
const Stars: React.FC<{ night: number }> = ({ night }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const stars = [
    [0.12, 0.08], [0.24, 0.16], [0.4, 0.05], [0.58, 0.12], [0.71, 0.07], [0.86, 0.15], [0.33, 0.26], [0.92, 0.3], [0.07, 0.34], [0.64, 0.22], [0.5, 0.31], [0.18, 0.45],
  ];
  return (
    <AbsoluteFill style={{ opacity: clamp01((night - 0.35) / 0.5) }}>
      {stars.map(([x, y], i) => {
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(frame / 60 * (1.1 + i * 0.29) + i * 1.7));
        const r = (i % 3 === 0 ? 2.6 : 1.8) * (height / 1080);
        return <div key={i} style={{ position: "absolute", left: x * width, top: y * height * 0.62, width: r * 2, height: r * 2, borderRadius: 99, background: "#FFF3D6", opacity: tw, boxShadow: `0 0 ${r * 4}px rgba(255,236,200,0.7)` }} />;
      })}
    </AbsoluteFill>
  );
};

/* ----------------------------------------------------------- the paper */

/** Lines of type that rise out of their own masks, as on the homepage. */
const Rise: React.FC<{ lines: string[]; at: number; out?: number; size: number; color: string; font?: string; weight?: number; style?: React.CSSProperties; align?: "left" | "center" }> = ({
  lines,
  at,
  out,
  size,
  color,
  font = SERIF,
  weight = 700,
  style,
  align = "left",
}) => {
  const frame = useCurrentFrame();
  const fade = out ? 1 - glide(frame, out - 0.35, out) : 1;
  if (fade <= 0) return null;
  return (
    <div style={{ position: "absolute", textAlign: align, opacity: fade, ...style }}>
      {lines.map((line, i) => {
        const p = settle(frame, at + i * 0.14, 0.9);
        return (
          <div
            key={line}
            style={{
              fontFamily: font,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1.08,
              letterSpacing: font === SERIF ? "-0.015em" : undefined,
              color,
              clipPath: `inset(-20% -5% ${(1 - p) * 100}% -5%)`,
              transform: `translateY(${(1 - p) * size * 0.55}px)`,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

/** A label printed on a strip of paper: readable on any part of the sky. */
const Strip: React.FC<{ text: string; at: number; out?: number; size: number; style?: React.CSSProperties }> = ({ text, at, out, size, style }) => {
  const frame = useCurrentFrame();
  const p = settle(frame, at, 0.8);
  const fade = out ? 1 - glide(frame, out - 0.3, out) : 1;
  if (p <= 0.001 || fade <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        padding: `${size * 0.32}px ${size * 0.62}px`,
        background: PAPER,
        color: NAVY_DARK,
        fontFamily: SERIF,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.1,
        boxShadow: "0 18px 40px -22px rgba(0,0,0,0.65)",
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        transform: `rotate(-1.2deg)`,
        opacity: fade,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** The denial letter: three panels that fold, and rows the lens translates. */
const Letter: React.FC<{ w: number; unfold: number; plain: number[]; lensAt: number; lensOn: number }> = ({ w, unfold, plain, lensAt, lensOn }) => {
  const h = w * 1.34;
  const third = h / 3;
  const pad = w * 0.085;
  const rowTop = h * 0.3;
  const rowH = h * 0.17;
  const fs = w * 0.047;
  const content = (
    <div style={{ position: "absolute", left: 0, top: 0, width: w, height: h, background: PAPER }}>
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(180deg, transparent 0 ${w * 0.06}px, rgba(160,140,110,0.10) ${w * 0.06}px ${w * 0.06 + 1}px)` }} />
      <div style={{ position: "absolute", left: pad, right: pad, top: pad, fontFamily: MONO, fontWeight: 600, fontSize: w * 0.025, letterSpacing: "0.08em", color: "#5F6E78", whiteSpace: "nowrap" }}>
        NOTICE OF ADVERSE BENEFIT DETERMINATION
      </div>
      <div style={{ position: "absolute", left: pad, top: pad + w * 0.05, fontFamily: MONO, fontSize: w * 0.024, color: "#93A2AC" }}>Claim A-20418-77 · DOS 03/14</div>
      <div style={{ position: "absolute", left: pad, right: pad, top: h * 0.22, height: 1.5, background: "rgba(23,50,77,0.14)" }} />
      {ROWS.map((row, i) => {
        const k = plain[i];
        return (
          <div key={row.jargon} style={{ position: "absolute", left: pad, right: pad, top: rowTop + i * rowH, height: rowH * 0.86 }}>
            <div style={{ position: "absolute", inset: 0, fontFamily: SERIF, fontSize: fs, lineHeight: 1.32, color: "#4A5865", opacity: 1 - k, filter: `blur(${k * 4}px)` }}>{row.jargon}</div>
            <div
              style={{
                position: "absolute",
                inset: `${-w * 0.012}px ${-w * 0.02}px`,
                padding: `${w * 0.012}px ${w * 0.02}px`,
                borderRadius: w * 0.02,
                background: `rgba(234,243,241,${k})`,
                fontFamily: SANS,
                fontWeight: 650,
                fontSize: fs * 1.02,
                lineHeight: 1.32,
                color: NAVY_DARK,
                opacity: k,
                transform: `translateY(${(1 - k) * 8}px)`,
              }}
            >
              {row.plain}
            </div>
          </div>
        );
      })}
      {[0.86, 0.78, 0.54].map((k2, i) => (
        <div key={k2} style={{ position: "absolute", left: pad, top: h * 0.83 + i * w * 0.045, width: (w - pad * 2) * k2, height: w * 0.018, borderRadius: 99, background: "rgba(31,43,55,0.09)" }} />
      ))}
      {/* The glass lens: a bar of light that turns the line beneath it. */}
      {lensOn > 0.001 && (
        <div
          style={{
            position: "absolute",
            left: pad * 0.6,
            right: pad * 0.6,
            top: rowTop + lensAt * rowH - w * 0.02,
            height: rowH * 0.86 + w * 0.04,
            borderRadius: w * 0.025,
            opacity: lensOn,
            background: "linear-gradient(180deg, rgba(255,255,255,0.4), rgba(255,255,255,0) 40%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 1.5px rgba(47,111,98,0.5), 0 14px 30px -14px rgba(16,38,59,0.55), 0 0 30px -6px rgba(143,211,194,0.8)",
          }}
        >
          <span style={{ position: "absolute", top: -w * 0.03, right: w * 0.03, padding: `${w * 0.006}px ${w * 0.018}px`, borderRadius: 99, background: TEAL, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: w * 0.024 }}>
            Plain English
          </span>
        </div>
      )}
    </div>
  );
  // Three panels; the top and bottom fold over the middle when closed.
  const panel = (i: number, angle: number, origin: string) => (
    <div
      key={i}
      style={{
        position: "absolute",
        left: 0,
        top: i * third,
        width: w,
        height: third,
        transformOrigin: origin,
        transform: `rotateX(${angle}deg)`,
        transformStyle: "preserve-3d",
      }}
    >
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", backfaceVisibility: "hidden" }}>
        <div style={{ position: "absolute", left: 0, top: -i * third }}>{content}</div>
      </div>
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, #F4ECDD, #E9DFCC)", transform: "rotateX(180deg)", backfaceVisibility: "hidden", boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.05)", overflow: "hidden" }}>
        {i !== 1 && (
          <>
            <div style={{ position: "absolute", left: pad, top: third * 0.2, fontFamily: MONO, fontWeight: 600, fontSize: w * 0.026, letterSpacing: "0.1em", color: "rgba(31,43,55,0.55)" }}>SAMPLE HEALTH PLAN · MEMBER SERVICES</div>
            <div style={{ position: "absolute", left: pad, top: third * 0.42, width: w * 0.5, padding: w * 0.02, border: "1.5px solid rgba(31,43,55,0.22)", borderRadius: w * 0.012 }}>
              {[0.7, 0.9, 0.55].map((k) => <div key={k} style={{ height: w * 0.014, width: `${k * 100}%`, margin: `${w * 0.008}px 0`, borderRadius: 99, background: "rgba(31,43,55,0.22)" }} />)}
            </div>
          </>
        )}
        {[0.2, 0.36, 0.52, 0.68, 0.84].map((y) => <div key={y} style={{ position: "absolute", right: pad, top: third * y, width: w * 0.3, height: w * 0.012, borderRadius: 99, background: "rgba(31,43,55,0.05)" }} />)}
      </div>
    </div>
  );
  const top = mix(-179, 0, Easing.inOut(Easing.cubic)(clamp01(unfold * 2 - 1)));
  const bottom = mix(178, 0, Easing.inOut(Easing.cubic)(clamp01(unfold * 2)));
  return (
    <div style={{ position: "relative", width: w, height: h, transformStyle: "preserve-3d", filter: "drop-shadow(0 40px 60px rgba(0,0,0,0.45))" }}>
      {panel(0, top, "50% 100%")}
      {panel(1, 0, "50% 50%")}
      {panel(2, bottom, "50% 0%")}
    </div>
  );
};

/** One page of the packet, small. */
const Sheet: React.FC<{ title: string; w: number; lit: number }> = ({ title, w, lit }) => (
  <div
    style={{
      width: w,
      height: w * 1.3,
      padding: w * 0.09,
      borderRadius: w * 0.035,
      background: PAPER,
      boxShadow: `0 30px 60px -28px rgba(0,0,0,0.6), 0 0 0 ${2 * lit}px ${MINT}`,
      display: "flex",
      flexDirection: "column",
      gap: w * 0.05,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: w * 0.04 }}>
      <div style={{ width: w * 0.09, height: w * 0.09, borderRadius: w * 0.025, background: TEAL }} />
      <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: w * 0.085, color: NAVY, lineHeight: 1.1 }}>{title}</div>
    </div>
    <div style={{ height: 1.5, background: "rgba(16,38,59,0.12)" }} />
    {[0.94, 0.82, 0.9, 0.62, 0.86, 0.5].map((k) => (
      <div key={k} style={{ height: w * 0.03, width: `${k * 100}%`, borderRadius: 99, background: "rgba(31,43,55,0.10)" }} />
    ))}
  </div>
);

/** The paper plane, folded from the same paper (three facets). */
const Plane: React.FC<{ w: number }> = ({ w }) => (
  <svg width={w} height={w * (200 / 300)} viewBox="0 0 300 200" style={{ overflow: "visible", filter: "drop-shadow(0 20px 26px rgba(0,0,0,0.45))" }}>
    <path d="M138 118 L292 18 L196 150 Z" fill="#E7DCC8" />
    <path d="M138 118 L292 18 L176 128 Z" fill={PAPER} />
    <path d="M176 128 L292 18 L206 176 L190 140 Z" fill="#F2E8D6" />
    <path d="M190 140 L206 176 L176 128 Z" fill="#CDBD9F" />
    <path d="M138 118 L176 128 L292 18" fill="none" stroke="#DCCDB4" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

/* ------------------------------------------------------------------ ad */

const bez = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;

export const DawnAd: React.FC<{ format: DawnAdFormat }> = ({ format }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const wide = format === "landscape";
  const u = wide ? height / 1080 : width / 1080;
  const s = frame / 60;

  // The night lifts into morning over the ad; the sun climbs with it.
  const night = interpolate(s, [0, D.build, D.launch + 0.5, D.end], [1, 0.92, 0.45, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) });
  const rise = interpolate(s, [0, D.build + 0.4, D.launch, D.end, DAWN_AD_SECONDS], [0, 0.02, 0.38, 0.85, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.sin) });
  const hz = wide ? 0.27 : 0.25;
  const sunX = wide ? 0.62 : 0.5;

  // The letter: falls, lands, unfolds, is read, folds back up.
  const letterW = (wide ? 500 : 640) * u;
  const homeX = wide ? width * 0.66 : width * 0.5;
  const homeY = wide ? height * 0.47 : height * 0.5;
  const fall = settle(frame, 0.1, D.land - 0.1);
  const sway = 1 - fall;
  const letterX = homeX + Math.sin(s * 2.2) * 70 * u * sway;
  const letterY = mix(-height * 0.25, homeY, fall);
  const unfold = clamp01(glide(frame, D.unfold, D.unfold + 1.0)) * (1 - glide(frame, D.build, D.build + 0.8));
  const lensP = clamp01((s - D.lens) / 3.0);
  const lensAt = Math.min(2, lensP * 3 - 0.5);
  const lensOn = glide(frame, D.lens - 0.2, D.lens + 0.2) * (1 - glide(frame, D.free - 0.2, D.free + 0.3));
  const plain = ROWS.map((_, i) => settle(frame, D.lens + 0.55 + i * 1.0, 0.5));
  const toBuild = settle(frame, D.build, 1.0);
  const letterScale = mix(1, 0.55, toBuild);
  const letterGone = glide(frame, D.sheets + 0.1, D.sheets + 0.7);
  const letterLift = toBuild * (wide ? 0 : -height * 0.05);

  // The pages fan out of the letter, gather back, and fold into the plane.
  const sheetW = (wide ? 250 : 300) * u;
  const gather = settle(frame, D.gather, 0.6);
  const folded = settle(frame, D.fold, 0.7);

  // The flight: from the letter to the sun, banking, leaving a trail.
  const fl = clamp01(glide(frame, D.launch, D.launch + 3.6, Easing.inOut(Easing.cubic)));
  const sunPx = sunX * width;
  const sunPy = height * (1 - hz) - height * 0.035 * rise;
  const path = {
    x: [homeX, homeX + (wide ? 300 : 260) * u, sunPx + (wide ? 180 : 160) * u, sunPx],
    y: [homeY, homeY - (wide ? 260 : 420) * u, sunPy - 220 * u, sunPy - 12 * u],
  };
  const px = bez(fl, path.x[0], path.x[1], path.x[2], path.x[3]);
  const py = bez(fl, path.y[0], path.y[1], path.y[2], path.y[3]);
  const ahead = Math.min(1, fl + 0.01);
  const ang = Math.atan2(bez(ahead, path.y[0], path.y[1], path.y[2], path.y[3]) - py, bez(ahead, path.x[0], path.x[1], path.x[2], path.x[3]) - px);
  const planeW = (wide ? 300 : 360) * u * mix(1, 0.14, fl);
  const planeIn = pop(frame, D.fold + 0.35);
  const trail = Array.from({ length: 48 }, (_, i) => i / 47).filter((t) => t <= fl);

  const cream = (k: number) => `rgba(255,247,234,${k})`;
  const capSize = (wide ? 96 : 104) * u;
  const capLeft: React.CSSProperties = wide ? { left: 120 * u, top: height * 0.3, maxWidth: width * 0.42 } : { left: 80 * u, right: 80 * u, top: 210 * u };

  return (
    <AbsoluteFill style={{ background: "#0D1726", overflow: "hidden" }}>
      <Html5Audio
        src={staticFile("dawn-ad/score.mp3")}
        volume={(fr) => duck(fr / 60) * interpolate(fr, [0, f(0.6), durationInFrames - f(1.2), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
      {data.voice.lines.map((line) => (
        <Sequence key={line.text} from={f(line.at)} durationInFrames={f(line.clipTo - line.clipFrom) + 1} layout="none">
          <Html5Audio src={staticFile("dawn-ad/voice.mp3")} trimBefore={f(line.clipFrom)} trimAfter={f(line.clipTo)} volume={1} />
        </Sequence>
      ))}
      {SFX.map((cue, i) => (
        <Sequence key={`${cue.sfx}-${i}`} from={f(cue.at)} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${cue.sfx}.mp3`)} volume={cue.volume * 0.8} />
        </Sequence>
      ))}

      <DawnSky night={night} rise={rise} hz={hz} sunX={sunX} px={1.5 * u} />
      <Stars night={night} />

      {/* Words. Night lines are set straight on the sky; from the dawn on,
          they are printed on strips of paper. */}
      <Rise lines={["Some letters", "arrive at night."]} at={0.7} out={D.unfold + 0.6} size={capSize} color={CREAM} style={capLeft} />
      <Rise lines={["Read it in", "plain English."]} at={D.unfold + 0.5} out={D.build + 0.2} size={capSize * 0.86} color={CREAM} style={capLeft} />
      <Strip text="Free summary · No card" at={D.free} out={D.build + 0.2} size={40 * u} style={wide ? { left: 124 * u, top: height * 0.3 + capSize * 2.1 } : { left: 84 * u, top: 210 * u + capSize * 1.95 }} />
      <Rise lines={["Build the appeal."]} at={D.build + 0.35} out={D.fold + 0.4} size={capSize * 0.86} color={CREAM} style={capLeft} />
      {["The letter.", "The evidence.", "The deadline."].map((t, i) => (
        <Strip
          key={t}
          text={t}
          at={11.9 + i * 0.62}
          out={D.fold + 0.4}
          size={38 * u}
          style={wide ? { left: 124 * u, top: height * 0.3 + capSize * 1.15 + i * 70 * u } : { left: 84 * u + i * 26 * u, top: 210 * u + capSize * 1.1 + i * 68 * u }}
        />
      ))}
      <Strip text="You check every page." at={D.launch + 0.15} out={D.end - 0.1} size={46 * u} style={wide ? { left: 124 * u, top: height * 0.24 } : { left: 84 * u, top: 220 * u }} />
      <Strip text="You send it yourself." at={D.launch + 1.65} out={D.end - 0.1} size={46 * u} style={wide ? { left: 124 * u, top: height * 0.24 + 84 * u } : { left: 110 * u, top: 300 * u }} />

      {/* The sheets, behind the letter. */}
      {s >= D.sheets && s < D.fold + 0.6 &&
        SHEETS.map((title, i) => {
          const p = settle(frame, D.sheets + i * 0.25, 0.8);
          const spread = p * (1 - gather);
          const angle = [-13, 0, 13][i] * spread;
          const dx = [-1, 0, 1][i] * (wide ? 290 : 300) * u * spread;
          const dy = (wide ? 40 : 160) * u * spread + (i === 1 ? -30 * u * spread : 0);
          const lit = pop(frame, 11.9 + i * 0.62) * (1 - gather);
          return (
            <div
              key={title}
              style={{
                position: "absolute",
                left: homeX - sheetW / 2 + dx,
                top: homeY - (sheetW * 1.3) / 2 + dy + letterLift,
                transform: `rotate(${angle}deg) scale(${mix(0.6, 1, p) * (1 - folded * 0.7)})`,
                opacity: clamp01(p * 3) * (1 - clamp01(folded * 2)),
              }}
            >
              <Sheet title={title} w={sheetW} lit={lit} />
            </div>
          );
        })}

      {/* The letter. */}
      {letterGone < 0.999 && (
        <div
          style={{
            position: "absolute",
            opacity: 1 - letterGone,
            left: letterX - letterW / 2,
            top: letterY - (letterW * 1.34) / 2 + letterLift,
            perspective: 2200 * u,
            transform: `scale(${letterScale}) rotate(${Math.sin(s * 2.2 + 0.5) * 12 * sway}deg)`,
          }}
        >
          <div style={{ transform: `rotateX(${Math.sin(s * 1.7) * 28 * sway}deg)`, transformStyle: "preserve-3d" }}>
            <Letter w={letterW} unfold={unfold} plain={plain} lensAt={Math.max(0, lensAt)} lensOn={lensOn} />
          </div>
        </div>
      )}

      {/* The trail and the plane. */}
      {s >= D.launch && (
        <svg width={width} height={height} style={{ position: "absolute", inset: 0 }}>
          {trail.map((t, i) => (
            <circle
              key={i}
              cx={bez(t, path.x[0], path.x[1], path.x[2], path.x[3])}
              cy={bez(t, path.y[0], path.y[1], path.y[2], path.y[3])}
              r={mix(4.5, 1.4, t) * u}
              fill={cream(0.75 * (1 - glide(frame, D.end - 0.5, D.end + 0.3)))}
            />
          ))}
        </svg>
      )}
      {s >= D.fold + 0.3 && fl < 1 && (
        <div
          style={{
            position: "absolute",
            left: px - planeW * 0.62,
            top: py - planeW * 0.36,
            transform: `scale(${s < D.launch ? 0.6 + 0.4 * planeIn : 1}) rotate(${(ang * 180) / Math.PI + 34 + Math.sin(s * 3) * 6 * (1 - fl)}deg)`,
            transformOrigin: "62% 36%",
            opacity: clamp01(planeIn * 2),
          }}
        >
          <Plane w={planeW} />
        </div>
      )}

      {/* Morning: the end card, set in navy on the risen sky. */}
      {s >= D.end - 0.2 && (
        <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 * u, gap: 30 * u, textAlign: "center", ...(wide ? {} : { justifyContent: "flex-start", paddingTop: 300 * u }) }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 * u, opacity: settle(frame, D.end, 0.6) }}>
            <svg width={64 * u} height={64 * u} viewBox="0 0 100 100">
              <rect width="100" height="100" rx="24" fill={TEAL} />
              <path d="M27 52 L44 68 L75 34" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 50 * u, color: NAVY_DARK }}>GetMyYes</span>
          </div>
          <Rise lines={["Understand the denial."]} at={D.end + 0.4} size={(wide ? 92 : 100) * u} color={NAVY_DARK} align="center" style={{ position: "relative" }} />
          <Rise lines={["Build the appeal."]} at={D.end + 0.65} size={(wide ? 92 : 100) * u} color={TEAL} align="center" style={{ position: "relative", marginTop: -14 * u }} />
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 * u, marginTop: 6 * u }}>
            {["Free preview", "No card", "You send it yourself"].map((c, i) => {
              const p = pop(frame, D.end + 1.2 + i * 0.15);
              return (
                <span key={c} style={{ padding: `${12 * u}px ${22 * u}px`, borderRadius: 999, background: "rgba(255,253,247,0.86)", color: NAVY_DARK, fontFamily: SANS, fontWeight: 650, fontSize: 30 * u, opacity: clamp01(p * 2), transform: `scale(${0.85 + 0.15 * p})`, boxShadow: "0 10px 26px -18px rgba(16,38,59,0.6)" }}>
                  {c}
                </span>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 22 * u, marginTop: 12 * u, opacity: settle(frame, D.end + 1.8, 0.6) }}>
            <span style={{ padding: `${20 * u}px ${36 * u}px`, borderRadius: 999, background: NAVY, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: 34 * u }}>See my free denial summary</span>
            {wide && <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 32 * u, color: NAVY_DARK }}>getmyyes.com</span>}
          </div>
          {!wide && <span style={{ fontFamily: SANS, fontWeight: 700, fontSize: 34 * u, color: NAVY_DARK, opacity: settle(frame, D.end + 2.0, 0.6) }}>getmyyes.com</span>}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
