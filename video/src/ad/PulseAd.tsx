import React from "react";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FPS, MONO, NAVY, NAVY_DARK, SANS, SERIF, TEAL } from "../brand";
import { clamp01, f, glide, mix, pop, settle } from "../motion";
import data from "../../library/pulse-ad/pulse-ad.json";
import { CREAM, DawnSky, MINT, PAPER, Strip } from "./paper";
import { BrandMark } from "./DawnAd";
import "../fonts";

/**
 * fb6, "Deadline, fast cut": the angle that won the first week (fb2), rebuilt
 * for a thumb that is already scrolling. A new, quicker read (pulse-ad.json),
 * real AI-shot scenes from Higgsfield for the night and the morning, and
 * motion graphics for every claim, cut on the words and on a 0.46 s beat.
 * Voice and a few sound effects only: the owner found a music bed too loud.
 *
 *   0.00  hook     hands open the letter        "A denial letter"
 *   1.10  clock    a ring starts, 180 ticks     "starts a clock."
 *   2.02  sand     the hourglass                "Many plans give you about"
 *   3.34  180      the number slams in          "180 days to appeal."
 *   5.41  miss     the ring drains to zero      "Miss it —"
 *   6.14  stick    a NO note sticks on it       "and the "no" can stick."
 *   7.72  find     the lens finds the deadline  "GetMyYes finds the deadline in your letter"
 *  10.15  plain    the line turns plain         "and explains it in plain English."
 *  12.16  free     end card                     "The summary is free."
 *
 * Nobody on screen is presented as a customer: the people are hands only,
 * and every product scene is the drawn SAMPLE LETTER.
 */

export type PulseFormat = "vertical" | "feed";
export const PULSE_SECONDS = data.seconds;

const W = data.voice.words;
const at = (i: number): number => W[i].from;
/** Snap a time to the nearest frame, so a cut never lands between two. */
const q = (s: number): number => Math.round(s * FPS) / FPS;

const C = {
  clock: q(at(3)),
  sand: q(at(6)),
  big: q(at(11)),
  miss: q(at(15)),
  stick: q(at(17)),
  find: q(at(22)),
  close: 9.2,
  plain: q(at(29)),
  cards: 11.04,
  end: q(W[34].to),
};
const CUTS = [C.clock, C.sand, C.big, C.miss, C.stick, C.find, C.close, C.plain, C.cards, C.end];

const ROWS = [
  { jargon: "Service not certified. Prior authorization was not obtained per Section 4.2.", plain: "The plan says approval was needed first." },
  { jargon: "Member may request an internal appeal within 180 calendar days of receipt.", plain: "You can appeal. You have 180 days." },
  { jargon: "A letter of medical necessity from the treating provider may be submitted.", plain: "A letter from your doctor can help." },
];

const SFX: { at: number; sfx: string; volume: number }[] = [
  { at: 0.02, sfx: "paper-slide", volume: 0.32 },
  { at: C.clock, sfx: "card-swoosh", volume: 0.3 },
  { at: 1.38, sfx: "tick", volume: 0.42 },
  { at: 1.84, sfx: "tick", volume: 0.38 },
  { at: C.sand, sfx: "card-swoosh", volume: 0.24 },
  { at: C.big, sfx: "shutter", volume: 0.36 },
  { at: at(12), sfx: "card-swoosh", volume: 0.22 },
  { at: C.miss, sfx: "scan-sweep", volume: 0.34 },
  { at: at(19), sfx: "paper-slide", volume: 0.4 },
  { at: at(21), sfx: "tick", volume: 0.38 },
  { at: C.find, sfx: "card-swoosh", volume: 0.3 },
  { at: at(23), sfx: "scan-sweep", volume: 0.24 },
  { at: at(25) + 0.3, sfx: "node-pop", volume: 0.24 },
  { at: at(30), sfx: "check", volume: 0.3 },
  ...[32, 33, 34].map((i) => ({ at: at(i), sfx: "node-pop", volume: 0.24 })),
  { at: C.end, sfx: "fly-swoosh", volume: 0.28 },
  { at: at(38), sfx: "done-chime", volume: 0.24 },
];

/* --------------------------------------------------------- the pieces */

type Word = { t: string; at: number; accent?: boolean };

/**
 * Captions that land word by word on the voice: each word arrives a hair
 * early, big and blurred, and snaps into place. Lines break where `lines`
 * says, never mid-phrase.
 */
const Kinetic: React.FC<{ lines: Word[][]; size: number; top?: number; out?: number; color?: string; accent?: string; align?: "center" | "left"; left?: number; right?: number; relative?: boolean; plate?: boolean }> = ({
  lines,
  size,
  top = 0,
  out,
  color = "#FFFFFF",
  accent = MINT,
  align = "center",
  left = 0,
  right = 0,
  relative = false,
  plate = false,
}) => {
  const frame = useCurrentFrame();
  const fade = out ? 1 - glide(frame, out - 0.12, out) : 1;
  if (fade <= 0) return null;
  const place: React.CSSProperties = relative ? { position: "relative" } : { position: "absolute", left, right, top };
  return (
    <div style={{ ...place, display: "flex", flexDirection: "column", alignItems: align === "center" ? "center" : "flex-start", gap: size * (plate ? 0.12 : 0.02), opacity: fade }}>
      {lines.map((line, li) => (
        <div
          key={li}
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: align === "center" ? "center" : "flex-start",
            columnGap: size * 0.26,
            ...(plate ? { padding: `${size * 0.1}px ${size * 0.3}px`, borderRadius: size * 0.22, background: "rgba(8,18,28,0.78)", boxShadow: "0 20px 40px -24px rgba(0,0,0,0.8)" } : {}),
          }}
        >
          {line.map((w) => {
            // A word timed at zero is already there on the first frame: the thumb-stop.
            const p = w.at <= 0 ? 1 : spring({ frame, fps: FPS, delay: f(Math.max(0, w.at - 0.05)), durationInFrames: f(0.22), config: { damping: 14, stiffness: 260, mass: 0.5 } });
            if (p <= 0.001) return <span key={w.t + w.at} style={{ visibility: "hidden", fontSize: size, fontFamily: SANS, fontWeight: 900 }}>{w.t}</span>;
            return (
              <span
                key={w.t + w.at}
                style={{
                  display: "inline-block",
                  fontFamily: SANS,
                  fontWeight: 900,
                  fontSize: size,
                  lineHeight: 1.02,
                  letterSpacing: "-0.025em",
                  textTransform: "uppercase",
                  color: w.accent ? accent : color,
                  opacity: clamp01(p * 2.2),
                  transform: `translateY(${(1 - p) * size * 0.28}px) scale(${mix(1.32, 1, p)})`,
                  filter: `blur(${(1 - clamp01(p)) * 9}px)`,
                  textShadow: "0 6px 28px rgba(5,14,24,0.55), 0 2px 6px rgba(5,14,24,0.45)",
                }}
              >
                {w.t}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/** Words i..j of the read, as kinetic words (with optional accents). */
const words = (from: number, to: number, accents: number[] = [], rename: Record<number, string> = {}): Word[] =>
  W.slice(from, to + 1).map((w, k) => ({
    t: (rename[from + k] ?? w.text).replace(/[.,—]/g, ""),
    at: w.from,
    accent: accents.includes(from + k),
  }));

/**
 * A Higgsfield shot, full bleed, entering with a punch: a quick zoom that
 * settles in a quarter second, then a slow drift so it never sits still.
 */
const Shot: React.FC<{ src: string; cut: number; until: number; clipFrom: number; origin?: string; base?: number; drift?: number; dim?: number }> = ({
  src,
  cut,
  until,
  clipFrom,
  origin = "50% 50%",
  base = 1.06,
  drift = 0.08,
  dim = 0.18,
}) => {
  const frame = useCurrentFrame();
  const t = frame / FPS - cut;
  const len = until - cut;
  const punch = 0.16 * Math.exp(-t * 11);
  const scale = base + drift * clamp01(t / len) + punch;
  return (
    <Sequence from={f(cut)} durationInFrames={Math.max(1, f(len))} premountFor={30}>
      <AbsoluteFill style={{ overflow: "hidden", background: "#0B1420" }}>
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin }}>
          <OffthreadVideo src={staticFile(src)} muted trimBefore={f(clipFrom)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(5,14,24,0) 40%, rgba(5,14,24,${0.55 + dim}) 100%)` }} />
        <AbsoluteFill style={{ background: `rgba(5,14,24,${dim})` }} />
      </AbsoluteFill>
    </Sequence>
  );
};

/** The countdown ring: `left` is the share of the window still to run. */
const Ring: React.FC<{ size: number; left: number; drawn: number; color?: string }> = ({ size, left, drawn, color = MINT }) => {
  const r = size * 0.44;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow: "visible" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(169,222,210,0.14)" strokeWidth={size * 0.045} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.045}
        strokeLinecap="round"
        strokeDasharray={`${c * clamp01(left) * drawn} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ filter: `drop-shadow(0 0 ${size * 0.04}px rgba(169,222,210,0.55))` }}
      />
      {Array.from({ length: 60 }, (_, i) => (
        <line
          key={i}
          x1={size / 2}
          y1={size / 2 - r - size * 0.07}
          x2={size / 2}
          y2={size / 2 - r - size * (i % 5 === 0 ? 0.105 : 0.085)}
          stroke="rgba(255,247,234,0.35)"
          strokeWidth={size * (i % 5 === 0 ? 0.008 : 0.004)}
          transform={`rotate(${i * 6} ${size / 2} ${size / 2})`}
          opacity={drawn}
        />
      ))}
    </svg>
  );
};

/** The drawn sample letter, close enough to read, with the lens on a row. */
const Letter: React.FC<{ w: number; lensRow: number; lensOn: number; mark: number; plainRow1: number }> = ({ w, lensRow, lensOn, mark, plainRow1 }) => {
  const h = w * 1.18;
  const pad = w * 0.075;
  const rowTop = h * 0.27;
  const rowH = h * 0.2;
  const fs = w * 0.052;
  return (
    <div style={{ position: "relative", width: w, height: h, background: PAPER, borderRadius: w * 0.018, boxShadow: "0 50px 90px -40px rgba(0,0,0,0.75), 0 0 0 1px rgba(16,38,59,0.06)", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: `repeating-linear-gradient(180deg, transparent 0 ${w * 0.06}px, rgba(160,140,110,0.08) ${w * 0.06}px ${w * 0.06 + 1}px)` }} />
      <div style={{ position: "absolute", left: pad, top: pad, fontFamily: MONO, fontWeight: 600, fontSize: w * 0.027, letterSpacing: "0.08em", color: "#5F6E78", whiteSpace: "nowrap" }}>
        NOTICE OF ADVERSE BENEFIT DETERMINATION
      </div>
      <div style={{ position: "absolute", left: pad, top: pad + w * 0.055, fontFamily: MONO, fontSize: w * 0.026, color: "#93A2AC" }}>Claim A-20418-77 · DOS 03/14</div>
      {/* An example, never the viewer's letter: "180 days" is this sample plan's window. */}
      <div style={{ position: "absolute", right: pad * 0.8, top: pad + w * 0.035, padding: `${w * 0.006}px ${w * 0.016}px`, border: `${Math.max(2, w * 0.005)}px solid ${TEAL}`, borderRadius: w * 0.01, fontFamily: MONO, fontWeight: 700, fontSize: w * 0.04, letterSpacing: "0.12em", color: TEAL, transform: "rotate(-6deg)", opacity: 0.92 }}>
        SAMPLE LETTER
      </div>
      <div style={{ position: "absolute", left: pad, right: pad, top: h * 0.2, height: 1.5, background: "rgba(23,50,77,0.14)" }} />
      {ROWS.map((row, i) => {
        const k = i === 1 ? plainRow1 : 0;
        return (
          <div key={row.jargon} style={{ position: "absolute", left: pad, right: pad, top: rowTop + i * rowH, height: rowH * 0.86 }}>
            <div style={{ position: "absolute", inset: 0, fontFamily: SERIF, fontSize: fs, lineHeight: 1.3, color: "#4A5865", opacity: 1 - k, filter: `blur(${k * 5}px)` }}>
              {i === 1 ? (
                <>
                  Member may request an internal appeal{" "}
                  <span style={{ background: `linear-gradient(90deg, rgba(169,222,210,0.95) ${mark * 100}%, transparent ${mark * 100}%)`, color: mark > 0.5 ? NAVY_DARK : undefined, fontWeight: mark > 0.5 ? 700 : 400, borderRadius: 6 }}>
                    within 180 calendar days
                  </span>{" "}
                  of receipt.
                </>
              ) : (
                row.jargon
              )}
            </div>
            {i === 1 && k > 0.001 && (
              <div style={{ position: "absolute", inset: `${-w * 0.014}px ${-w * 0.022}px`, padding: `${w * 0.014}px ${w * 0.022}px`, borderRadius: w * 0.022, background: `rgba(234,243,241,${k})`, fontFamily: SANS, fontWeight: 750, fontSize: fs * 1.06, lineHeight: 1.28, color: NAVY_DARK, opacity: k, transform: `translateY(${(1 - k) * 10}px)` }}>
                {row.plain}
              </div>
            )}
          </div>
        );
      })}
      {[0.86, 0.72, 0.5].map((k2, i) => (
        <div key={k2} style={{ position: "absolute", left: pad, top: h * 0.86 + i * w * 0.042, width: (w - pad * 2) * k2, height: w * 0.016, borderRadius: 99, background: "rgba(31,43,55,0.09)" }} />
      ))}
      {lensOn > 0.001 && (
        <div
          style={{
            position: "absolute",
            left: pad * 0.55,
            right: pad * 0.55,
            top: rowTop + lensRow * rowH - w * 0.022,
            height: rowH * 0.86 + w * 0.044,
            borderRadius: w * 0.026,
            opacity: lensOn,
            background: "linear-gradient(180deg, rgba(255,255,255,0.42), rgba(255,255,255,0) 40%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.9), inset 0 0 0 2px rgba(47,111,98,0.55), 0 16px 34px -14px rgba(16,38,59,0.55), 0 0 36px -6px rgba(143,211,194,0.85)",
          }}
        >
          <span style={{ position: "absolute", top: -w * 0.032, right: w * 0.03, padding: `${w * 0.007}px ${w * 0.02}px`, borderRadius: 99, background: TEAL, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: w * 0.026 }}>
            GetMyYes lens
          </span>
        </div>
      )}
    </div>
  );
};

/** A quiet paper card with a check, for the plain-English summary. */
const Card: React.FC<{ title: string; line: string; w: number; p: number }> = ({ title, line, w, p }) => (
  <div
    style={{
      width: w,
      padding: `${w * 0.045}px ${w * 0.055}px`,
      borderRadius: w * 0.04,
      background: "rgba(255,253,247,0.95)",
      boxShadow: "0 30px 60px -30px rgba(5,14,24,0.7)",
      display: "flex",
      alignItems: "center",
      gap: w * 0.045,
      opacity: clamp01(p * 2),
      transform: `translateX(${(1 - p) * w * 0.35}px) rotate(${(1 - p) * 4}deg)`,
    }}
  >
    <svg width={w * 0.1} height={w * 0.1} viewBox="0 0 64 64" style={{ flex: "none" }}>
      <rect width="64" height="64" rx="16" fill={TEAL} />
      <path d="M17 33.5 27.5 44 47 22" fill="none" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <div>
      <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: w * 0.06, color: NAVY_DARK, lineHeight: 1.1 }}>{title}</div>
      <div style={{ fontFamily: SERIF, fontSize: w * 0.05, color: "#4A5865", lineHeight: 1.25, marginTop: w * 0.012 }}>{line}</div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ ad */

export const PulseAd: React.FC<{ format: PulseFormat }> = ({ format }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const feed = format === "feed";
  const u = width / 1080;
  const s = frame / FPS;
  // Reels: the top 14% sits under the header and the bottom fifth under the
  // caption, so nothing that matters goes there. The 4:5 Feed frame is clear.
  const band = feed ? { top: 0.07 * height, bottom: 0.93 * height } : { top: 0.15 * height, bottom: 0.76 * height };
  const mid = (band.top + band.bottom) / 2;
  const cap = (feed ? 118 : 132) * u;

  const inScene = (a: number, b: number) => s >= a && s < b;
  const flash = Math.max(0, ...CUTS.map((c) => (s >= c && s < c + 0.08 ? 1 - (s - c) / 0.08 : 0)));
  const shake = (a: number, amp: number) => (s >= a && s < a + 0.3 ? Math.sin((s - a) * 90) * amp * (1 - (s - a) / 0.3) : 0);

  // The clock: 180 ticks down one day per beat from "starts".
  const ticks = s < 1.38 ? 0 : Math.floor((s - 1.38) / 0.46) + 1;
  const ringSize = (feed ? 560 : 640) * u;

  // The big number counts up on its slam; on "Miss it" everything drains.
  const slam = spring({ frame, fps: FPS, delay: f(C.big), config: { damping: 11, stiffness: 240, mass: 0.7 } });
  const countUp = Math.round(mix(0, 180, Easing.out(Easing.cubic)(clamp01((s - C.big) / 0.32))));
  const drain = clamp01((s - C.miss) / 0.5);
  const drained = Math.round(mix(180, 0, Easing.in(Easing.quad)(drain)));

  // The NO note slaps on at "no" and thunks at "stick".
  const note = spring({ frame, fps: FPS, delay: f(at(19) - 0.06), config: { damping: 9, stiffness: 300, mass: 0.55 } });
  const thunk = 1 + 0.07 * Math.exp(-Math.max(0, s - at(21)) * 14) * (s >= at(21) ? 1 : 0);

  // The lens: finds row 0 on "finds", lands on the deadline row on "deadline".
  const lensRow = interpolate(s, [at(23) - 0.1, at(25) - 0.05, at(25) + 0.2], [-0.3, 0.6, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  const lensOn = glide(frame, at(23) - 0.3, at(23) - 0.05);
  const mark = glide(frame, at(25) + 0.12, at(25) + 0.42, Easing.out(Easing.cubic));
  const chip = pop(frame, at(25) + 0.3);
  const plainRow1 = settle(frame, at(30), 0.45);

  const cardW = (feed ? 700 : 780) * u;
  const letterW = (feed ? 760 : 860) * u;

  return (
    <AbsoluteFill style={{ background: NAVY_DARK, overflow: "hidden" }}>
      <Html5Audio src={staticFile("pulse-ad/voice.mp3")} volume={1} />
      {SFX.map((cue, i) => (
        <Sequence key={`${cue.sfx}-${i}`} from={f(cue.at)} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${cue.sfx}.mp3`)} volume={cue.volume * 0.85} />
        </Sequence>
      ))}

      <div style={{ position: "absolute", inset: 0, transform: `translate(${shake(C.big, 14 * u) + shake(at(21), 8 * u)}px, ${shake(C.big + 0.05, 10 * u)}px)` }}>
        {/* 1. Hook: the letter arrives at night. */}
        <Shot src="pulse-ad/shots/hands.mp4" cut={0} until={C.clock} clipFrom={0.35} origin="50% 55%" base={1.08} drift={0.1} dim={0.12} />
        {inScene(0, C.clock) && (
          <Kinetic
            lines={[
              [{ t: "A", at: 0 }, { t: "DENIAL", at: 0, accent: true }],
              [{ t: "LETTER", at: 0, accent: true }],
            ]}
            size={cap * 1.22}
            top={mid - cap * 1.5}
            out={C.clock}
          />
        )}

        {/* 2. The clock starts: the ring draws and ticks a day a beat. */}
        {inScene(C.clock, C.sand) && (
          <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 52%, ${NAVY} 0%, ${NAVY_DARK} 62%, #08121C 100%)` }}>
            <div style={{ position: "absolute", left: (width - ringSize) / 2, top: mid - ringSize * 0.38, transform: `scale(${mix(0.82, 1, settle(frame, C.clock, 0.35))})` }}>
              <Ring size={ringSize} drawn={glide(frame, C.clock, C.clock + 0.28, Easing.out(Easing.cubic))} left={1 - ticks / 180} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <div key={ticks} style={{ fontFamily: SERIF, fontWeight: 700, fontSize: ringSize * 0.34, color: CREAM, lineHeight: 1, transform: `translateY(${(1 - settle(frame, ticks === 0 ? C.clock : 1.38 + (ticks - 1) * 0.46, 0.18)) * -ringSize * 0.06}px)` }}>
                  {180 - ticks}
                </div>
                <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: ringSize * 0.06, letterSpacing: "0.3em", color: MINT, marginTop: ringSize * 0.02 }}>DAYS</div>
              </div>
            </div>
            <Kinetic lines={[words(3, 5, [5])]} size={cap * 0.92} top={mid - ringSize * 0.38 - cap * 1.45} />
          </AbsoluteFill>
        )}

        {/* 3. The sand runs. */}
        <Shot src="pulse-ad/shots/hourglass.mp4" cut={C.sand} until={C.big} clipFrom={0.6} origin="50% 40%" base={1.05} drift={0.09} dim={0.1} />
        {inScene(C.sand, C.big) && <Kinetic lines={[words(6, 7), words(8, 10)]} size={cap} top={band.top + 20 * u} />}

        {/* 4. The number: about 180 days to appeal. */}
        {inScene(C.big, C.miss) && (
          <AbsoluteFill>
            <DawnSky night={1} rise={0} hz={0.2} sunX={0.5} px={1.5 * u} />
            <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(16,38,59,0) 30%, rgba(8,18,28,0.65) 100%)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: mid - 430 * u * (feed ? 0.86 : 1), display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: 64 * u, letterSpacing: "0.18em", color: MINT, opacity: clamp01(slam * 2) }}>MANY PLANS · ABOUT</div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: (feed ? 430 : 500) * u, lineHeight: 0.95, color: CREAM, letterSpacing: "-0.03em", transform: `scale(${mix(1.65, 1, slam)})`, opacity: clamp01(slam * 3), textShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
                {countUp}
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 900, fontSize: 168 * u, lineHeight: 0.9, letterSpacing: "-0.02em", color: "#FFFFFF", marginTop: -10 * u, opacity: clamp01(settle(frame, at(12) - 0.04, 0.2) * 2), transform: `translateX(${(1 - settle(frame, at(12) - 0.04, 0.3)) * 260 * u}px)` }}>
                DAYS
              </div>
            </div>
            <Strip text="to appeal a denial." at={at(13) - 0.03} size={70 * u} style={{ left: 150 * u, top: mid + 330 * u * (feed ? 0.86 : 1) }} />
          </AbsoluteFill>
        )}

        {/* 5. Miss it: the window drains to zero. */}
        {inScene(C.miss, C.stick) && (
          <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 52%, #14283B 0%, ${NAVY_DARK} 60%, #060E16 100%)` }}>
            <div style={{ position: "absolute", left: (width - ringSize) / 2, top: mid - ringSize * 0.38 }}>
              <Ring size={ringSize} drawn={1} left={1 - drain} color={drain > 0.95 ? "rgba(255,247,234,0.25)" : MINT} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: SERIF, fontWeight: 700, fontSize: ringSize * 0.34, color: drain > 0.95 ? "rgba(255,247,234,0.45)" : CREAM }}>
                {drained}
              </div>
            </div>
            <Kinetic lines={[words(15, 16)]} size={cap * 1.3} top={mid - ringSize * 0.38 - cap * 1.6} />
          </AbsoluteFill>
        )}

        {/* 6. And the "no" can stick. */}
        <Shot src="pulse-ad/shots/hands.mp4" cut={C.stick} until={C.find} clipFrom={3.6} origin="55% 70%" base={1.12} drift={0.06} dim={0.3} />
        {inScene(C.stick, C.find) && (
          <>
            <div
              style={{
                position: "absolute",
                left: width / 2 - 230 * u,
                top: mid - 120 * u,
                width: 460 * u,
                height: 440 * u,
                background: "linear-gradient(165deg, #FFF3C9 0%, #F6E3A1 100%)",
                boxShadow: "0 40px 70px -30px rgba(0,0,0,0.75), inset 0 -18px 30px -24px rgba(120,90,20,0.35)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: SERIF,
                fontWeight: 700,
                fontSize: 250 * u,
                color: NAVY_DARK,
                opacity: clamp01(note * 3),
                transform: `rotate(${mix(-24, -6, note)}deg) scale(${mix(2.3, 1, note) * thunk})`,
              }}
            >
              NO
            </div>
            <Kinetic lines={[words(17, 19, [19], { 19: "“NO”" }), words(20, 21, [21])]} size={cap} top={band.top + 10 * u} />
          </>
        )}

        {/* 7. GetMyYes finds the deadline: the lens on the sample letter. */}
        {inScene(C.find, C.cards) && (
          <AbsoluteFill>
            <DawnSky night={0.82} rise={0.12} hz={0.16} sunX={0.5} px={1.5 * u} />
            {s < C.close && (
              <div style={{ position: "absolute", left: 0, right: 0, top: band.top, display: "flex", justifyContent: "center", alignItems: "center", gap: 18 * u, opacity: settle(frame, C.find, 0.25), transform: `scale(${mix(0.8, 1, settle(frame, C.find, 0.3))})` }}>
                <BrandMark size={74 * u} />
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 70 * u, color: CREAM }}>GetMyYes</span>
              </div>
            )}
            {(() => {
              // Wide until the beat at 9.2 s, then a hard cut in on the deadline row.
              const close = s >= C.close;
              // The close-up fills the width and no more, so no line is cut off.
              const zoom = close ? (0.96 * width) / letterW : mix(0.86, 1, settle(frame, C.find, 0.4));
              const ox = width / 2;
              const oy = mid + 60 * u;
              return (
                <div style={{ position: "absolute", left: ox - letterW / 2, top: oy - (letterW * 1.18) / 2, transform: `scale(${zoom})`, transformOrigin: close ? "50% 52%" : "50% 50%" }}>
                  <Letter w={letterW} lensRow={Math.max(0, lensRow)} lensOn={lensOn} mark={mark} plainRow1={plainRow1} />
                  {chip > 0.001 && s < C.plain && (
                    <div style={{ position: "absolute", left: letterW * 0.5 - 250 * u, top: letterW * 1.18 * 0.47 + 120 * u, width: 500 * u, padding: `${16 * u}px ${24 * u}px`, borderRadius: 999, background: TEAL, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: 40 * u, textAlign: "center", transform: `scale(${0.6 + 0.4 * chip})`, opacity: clamp01(chip * 2), boxShadow: "0 24px 40px -20px rgba(5,14,24,0.7)" }}>
                      Appeal deadline found
                    </div>
                  )}
                </div>
              );
            })()}
            {s < C.close && <Kinetic lines={[words(23, 25, [25])]} size={cap * 0.78} top={band.bottom - cap * 1.5} plate />}
            {s >= C.close && s < C.plain && <Kinetic lines={[words(26, 28)]} size={cap * 0.78} top={band.bottom - cap * 1.5} plate />}
            {s >= C.plain && <Kinetic lines={[words(29, 31, [30])]} size={cap * 0.78} top={band.bottom - cap * 1.5} plate />}
          </AbsoluteFill>
        )}

        {/* 8. In plain English: morning, and the summary's three answers. */}
        <Shot src="pulse-ad/shots/dawn.mp4" cut={C.cards} until={C.end} clipFrom={1.0} origin="50% 32%" base={1.24} drift={0.06} dim={0.22} />
        {inScene(C.cards, C.end) && (
          <>
            <Kinetic lines={[words(32, 34, [33, 34])]} size={cap * 0.95} top={band.top + 10 * u} />
            <div style={{ position: "absolute", left: 0, right: 0, top: mid - 200 * u, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 * u }}>
              {[
                ["Why it was denied", "Approval was needed first."],
                ["Your deadline", "Appeal within 180 days."],
                ["What to do next", "Ask your doctor for a letter."],
              ].map(([title, line], i) => (
                <Card key={title} title={title} line={line} w={cardW} p={settle(frame, at(32 + i) - 0.04, 0.3)} />
              ))}
            </div>
          </>
        )}

        {/* 9. The summary is free: the end card on the risen sky. */}
        {s >= C.end && (
          <AbsoluteFill>
            <DawnSky night={0} rise={1} hz={0.22} sunX={0.5} px={1.5 * u} offset={2} />
            <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start", paddingTop: band.top + 30 * u, gap: 26 * u, textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 18 * u, opacity: settle(frame, C.end, 0.3) }}>
                <BrandMark size={70 * u} />
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 56 * u, color: NAVY_DARK }}>GetMyYes</span>
              </div>
              <Kinetic lines={[words(35, 36), words(37, 38, [38])]} size={cap * 1.12} color={NAVY_DARK} accent={TEAL} relative />
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 * u }}>
                {["Plain-English summary", "No card needed"].map((c, i) => {
                  const p = pop(frame, at(38) + 0.25 + i * 0.12);
                  return (
                    <span key={c} style={{ padding: `${12 * u}px ${24 * u}px`, borderRadius: 999, background: "rgba(255,253,247,0.9)", color: NAVY_DARK, fontFamily: SANS, fontWeight: 700, fontSize: 32 * u, opacity: clamp01(p * 2), transform: `scale(${0.85 + 0.15 * p})`, boxShadow: "0 10px 26px -18px rgba(16,38,59,0.6)" }}>
                      {c}
                    </span>
                  );
                })}
              </div>
              <span style={{ marginTop: 8 * u, padding: `${22 * u}px ${40 * u}px`, borderRadius: 999, background: NAVY, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: 38 * u, opacity: settle(frame, at(38) + 0.5, 0.35), transform: `scale(${mix(0.92, 1, settle(frame, at(38) + 0.5, 0.35))})` }}>
                See my free denial summary
              </span>
              <span style={{ fontFamily: SANS, fontWeight: 800, fontSize: 40 * u, color: NAVY_DARK, opacity: settle(frame, at(38) + 0.7, 0.35) }}>getmyyes.com</span>
            </AbsoluteFill>
          </AbsoluteFill>
        )}
      </div>

      {/* The snap on every cut. */}
      {flash > 0 && <AbsoluteFill style={{ background: CREAM, opacity: flash * 0.32 }} />}
    </AbsoluteFill>
  );
};
