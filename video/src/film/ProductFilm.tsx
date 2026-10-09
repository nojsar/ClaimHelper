import React from "react";
import {
  AbsoluteFill,
  Easing,
  Html5Audio,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { INK, LETTER, NAVY, SANS, SERIF, TEAL } from "../brand";
import { clamp01, f, glide, mix, pop, settle } from "../motion";
import "../fonts";

/**
 * The product film: 25 seconds that show the service working instead of
 * describing it. Two illustrative stills open it (hands only, unreadable
 * letter, generated on Higgsfield); everything after that is the real app,
 * captured from a mock-mode build on a fictional case, and the packet that
 * same mock case produces. No testimonials, no faces, no promised outcome.
 *
 *   0.0  hook still        "Denied by your insurer? Read it in plain English."
 *   3.4  phone still       "Snap a photo of the letter." (shutter)
 *   6.2  the app           upload → preparing → the free summary, scrolled
 *  14.6  the packet        four documents fan out of the phone
 *  20.6  end card          free preview, no card, you send it yourself
 */

export type FilmFormat = "landscape" | "vertical";
export const FILM_SECONDS = 25;

const S = {
  hook: 0,
  phone: 3.4,
  shutter: 5.45,
  app: 6.2,
  processing: 7.5,
  summary: 8.7,
  scrollFrom: 10.6,
  scrollTo: 12.6,
  packet: 14.6,
  end: 20.6,
};

const INK_DARK = "#0E1922";
const MINT = "#A9DED2";

/* ------------------------------------------------------------- pieces */

/** Glass caption: frosted dark pill so white type reads on any photo. */
const Caption: React.FC<{ lines: string[]; at: number; size: number; style?: React.CSSProperties; dark?: boolean }> = ({
  lines,
  at,
  size,
  style,
  dark = true,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", display: "flex", flexDirection: "column", gap: size * 0.18, ...style }}>
      {lines.map((line, index) => {
        const p = settle(frame, at + index * 0.9, 0.7);
        return (
          <div
            key={line}
            style={{
              alignSelf: "flex-start",
              padding: `${size * 0.22}px ${size * 0.42}px`,
              borderRadius: size * 0.42,
              background: dark ? "rgba(14, 25, 34, 0.52)" : "rgba(255, 255, 255, 0.62)",
              border: `1px solid ${dark ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.8)"}`,
              backdropFilter: "blur(18px) saturate(1.5)",
              boxShadow: "0 20px 50px -30px rgba(0,0,0,0.6)",
              color: dark ? "#F4F7F8" : INK,
              fontFamily: index === 0 ? SERIF : SANS,
              fontWeight: index === 0 ? 700 : 600,
              fontSize: index === 0 ? size : size * 0.62,
              lineHeight: 1.15,
              opacity: p,
              transform: `translateY(${(1 - p) * 22}px)`,
              filter: `blur(${(1 - p) * 8}px)`,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

/** A still that drifts slowly toward a focal point (Ken Burns, eased). */
const Still: React.FC<{ src: string; from: number; to: number; focus: [number, number]; zoom: [number, number] }> = ({
  src,
  from,
  to,
  focus,
  zoom,
}) => {
  const frame = useCurrentFrame();
  const t = glide(frame, from, to, Easing.inOut(Easing.sin));
  const scale = mix(zoom[0], zoom[1], t);
  return (
    <AbsoluteFill style={{ overflow: "hidden", background: "#000" }}>
      <Img
        src={staticFile(src)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: `${focus[0] * 100}% ${focus[1] * 100}%`,
        }}
      />
      {/* Gentle vignette keeps captions legible without darkening the scene. */}
      <AbsoluteFill style={{ background: "radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 55%, rgba(8,16,24,0.38) 100%)" }} />
    </AbsoluteFill>
  );
};

/** The brand's night aurora, drifting, for everything after the photos. */
const Aurora: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const a = (frame / durationInFrames) * Math.PI * 2;
  const blob = (x: number, y: number, r: number, rgb: string, alpha: number) =>
    `radial-gradient(circle ${r}px at ${x}px ${y}px, rgba(${rgb},${alpha}) 0%, rgba(${rgb},${alpha * 0.4}) 40%, rgba(${rgb},0) 100%)`;
  const reach = Math.max(width, height);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: INK_DARK,
        backgroundImage: [
          blob(width * (0.18 + 0.08 * Math.cos(a)), height * (0.22 + 0.06 * Math.sin(a)), reach * 0.55, "47,111,98", 0.55),
          blob(width * (0.84 + 0.06 * Math.cos(a + 2)), height * (0.3 + 0.08 * Math.sin(a + 2)), reach * 0.45, "46,110,170", 0.4),
          blob(width * (0.6 + 0.07 * Math.cos(a + 4)), height * (0.92 + 0.05 * Math.sin(a + 4)), reach * 0.5, "143,211,194", 0.18),
        ].join(","),
      }}
    />
  );
};

/** Phone frame around a real app capture. `scroll` is in capture pixels. */
const Phone: React.FC<{ screenW: number; screenH: number; children: React.ReactNode }> = ({ screenW, screenH, children }) => {
  const bezel = Math.round(screenW * 0.035);
  const radius = screenW * 0.13;
  return (
    <div
      style={{
        width: screenW + bezel * 2,
        height: screenH + bezel * 2,
        padding: bezel,
        borderRadius: radius + bezel,
        background: "linear-gradient(145deg, #2a3440, #0b1118)",
        boxShadow: "0 0 0 1.5px rgba(255,255,255,0.14) inset, 0 60px 120px -40px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.6)",
        position: "relative",
      }}
    >
      <div style={{ position: "relative", width: screenW, height: screenH, borderRadius: radius, overflow: "hidden", background: "#F6F8F7" }}>
        {children}
        {/* The camera island. */}
        <div
          style={{
            position: "absolute",
            top: screenW * 0.025,
            left: "50%",
            width: screenW * 0.28,
            height: screenW * 0.075,
            marginLeft: -screenW * 0.14,
            borderRadius: 999,
            background: "#05080b",
          }}
        />
      </div>
    </div>
  );
};

/** One of the app's real screens inside the phone, with a crossfade in. */
const Screen: React.FC<{ src: string; at: number; screenW: number; scroll?: number; topInset: number }> = ({
  src,
  at,
  screenW,
  scroll = 0,
  topInset,
}) => {
  const frame = useCurrentFrame();
  const p = settle(frame, at, 0.45);
  const k = screenW / 860;
  return (
    <div style={{ position: "absolute", inset: 0, opacity: p, background: "#F6F8F7" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: topInset, background: "#FFFFFF" }} />
      <Img
        src={staticFile(src)}
        style={{ position: "absolute", top: topInset - scroll * k, left: 0, width: screenW }}
      />
    </div>
  );
};

/** A glass callout chip that pops in beside the phone. */
const Chip: React.FC<{ text: string; at: number; size: number; style: React.CSSProperties }> = ({ text, at, size, style }) => {
  const frame = useCurrentFrame();
  const p = pop(frame, at);
  const o = clamp01(glide(frame, at, at + 0.25));
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        gap: size * 0.5,
        padding: `${size * 0.55}px ${size * 0.9}px`,
        borderRadius: 999,
        background: "rgba(255,255,255,0.10)",
        border: "1px solid rgba(255,255,255,0.22)",
        backdropFilter: "blur(16px) saturate(1.6)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.18), 0 18px 40px -24px rgba(0,0,0,0.8)",
        color: "#F4F7F8",
        fontFamily: SANS,
        fontWeight: 600,
        fontSize: size,
        whiteSpace: "nowrap",
        opacity: o,
        transform: `scale(${0.85 + 0.15 * p})`,
        ...style,
      }}
    >
      <span
        style={{
          width: size * 1.1,
          height: size * 1.1,
          borderRadius: 999,
          background: MINT,
          color: INK_DARK,
          display: "grid",
          placeItems: "center",
          fontSize: size * 0.7,
          fontWeight: 800,
        }}
      >
        ✓
      </span>
      {text}
    </div>
  );
};

/* -------------------------------------------------------------- packet */

type PageSpec = { title: string; lines: string[]; kind: "letter" | "list" };

const PAGES: PageSpec[] = [
  {
    title: "Appeal letter",
    kind: "letter",
    lines: [
      "Sample Health Plan, Appeals Department",
      "Re: Appeal of denial: Wegovy (semaglutide) 2.4 mg",
      "Member: Jordan Sample · PA #: PA-77219",
      "I am writing to formally appeal the denial, which was based on step therapy…",
    ],
  },
  {
    title: "Evidence checklist",
    kind: "list",
    lines: ["Prescriber letter of medical necessity", "Record of alternatives already tried", "Copy of the denial letter ✓"],
  },
  {
    title: "Doctor letter request",
    kind: "letter",
    lines: ["Dear Dr. A. Chen,", "My insurer denied Wegovy citing step therapy. Could you provide a brief letter of medical necessity…"],
  },
  {
    title: "Deadline tracker",
    kind: "list",
    lines: ["Submit internal appeal", "Request prescriber support letter", "Confirm the deadline by phone"],
  },
];

const Page: React.FC<{ spec: PageSpec; w: number }> = ({ spec, w }) => {
  const h = w * 1.3;
  const fs = w * 0.052;
  return (
    <div
      style={{
        width: w,
        height: h,
        padding: w * 0.08,
        borderRadius: w * 0.03,
        background: LETTER,
        boxShadow: "0 40px 80px -30px rgba(0,0,0,0.7), 0 0 0 1px rgba(16,38,59,0.08)",
        display: "flex",
        flexDirection: "column",
        gap: w * 0.04,
        fontFamily: SANS,
        color: INK,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: w * 0.03 }}>
        <div style={{ width: w * 0.07, height: w * 0.07, borderRadius: w * 0.02, background: TEAL }} />
        <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: fs * 1.45, color: NAVY }}>{spec.title}</div>
      </div>
      <div style={{ height: 1.5, background: "rgba(16,38,59,0.12)" }} />
      {spec.lines.map((line) => (
        <div key={line} style={{ display: "flex", gap: w * 0.03, fontSize: fs, lineHeight: 1.45, color: "#2B3946" }}>
          {spec.kind === "list" && (
            <span style={{ flex: "0 0 auto", width: fs * 0.9, height: fs * 0.9, marginTop: fs * 0.25, borderRadius: fs * 0.2, border: `2px solid ${TEAL}` }} />
          )}
          <span>{line}</span>
        </div>
      ))}
      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: fs * 0.55 }}>
        {[0.92, 0.84, 0.6].map((k) => (
          <div key={k} style={{ height: fs * 0.42, width: `${k * 100}%`, borderRadius: 99, background: "rgba(31,43,55,0.10)" }} />
        ))}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------------- film */

const SCORE_LEVEL = 0.88;
const SFX_GAIN = 1.15;

const SFX: { at: number; sfx: string; volume: number }[] = [
  { at: 0.15, sfx: "paper-slide", volume: 0.35 },
  { at: S.shutter, sfx: "shutter", volume: 0.5 },
  { at: S.app, sfx: "card-swoosh", volume: 0.32 },
  { at: S.summary + 0.5, sfx: "tick", volume: 0.3 },
  { at: S.summary + 1.1, sfx: "tick", volume: 0.28 },
  { at: S.scrollTo + 0.2, sfx: "check", volume: 0.42 },
  { at: S.packet, sfx: "fly-swoosh", volume: 0.3 },
  ...[0, 1, 2, 3].map((i) => ({ at: S.packet + 0.5 + i * 0.22, sfx: "node-pop", volume: 0.26 })),
  { at: S.end + 0.2, sfx: "done-chime", volume: 0.36 },
];

export const ProductFilm: React.FC<{ format: FilmFormat }> = ({ format }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const wide = format === "landscape";
  const unit = wide ? height / 1080 : width / 1080;

  // Scene opacities: photos crossfade, then the night stage takes over.
  const phoneIn = glide(frame, S.phone - 0.25, S.phone + 0.35);
  const stageIn = glide(frame, S.app - 0.15, S.app + 0.35);
  const flash = interpolate(frame, [f(S.shutter), f(S.shutter + 0.06), f(S.shutter + 0.42)], [0, 0.85, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Phone geometry.
  const screenH = wide ? 860 * unit : 1080 * unit;
  const screenW = screenH * (430 / 932);
  const topInset = screenW * 0.11;
  const phoneArrive = settle(frame, S.app, 0.9);
  const toPacket = settle(frame, S.packet, 1.0);
  const endFade = glide(frame, S.end - 0.3, S.end + 0.3);
  // The phone holds its place; at the packet it steps back and hands over to
  // the pages that fan out of it.
  const phoneX = wide ? width * 0.68 : width * 0.5;
  const phoneY = wide ? height * 0.5 : height * 0.6;
  const phoneScale = mix(0.86, 1, phoneArrive) * mix(1, 0.8, toPacket);
  const phoneOpacity = 1 - glide(frame, S.packet + 0.25, S.packet + 0.95);
  const phoneHalfW = (screenW * 1.07) / 2;
  const scroll = glide(frame, S.scrollFrom, S.scrollTo, Easing.inOut(Easing.cubic)) * 1480;

  const capSize = (wide ? 64 : 70) * unit;
  const chipSize = (wide ? 24 : 28) * unit;

  return (
    <AbsoluteFill style={{ background: INK_DARK }}>
      {/* Score and effects. */}
      <Html5Audio
        src={staticFile("film/score.mp3")}
        volume={(fr) =>
          SCORE_LEVEL * interpolate(fr, [0, f(0.8), durationInFrames - f(1.4), durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
        }
      />
      {SFX.map((cue, i) => (
        <Sequence key={`${cue.sfx}-${i}`} from={f(cue.at)} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${cue.sfx}.mp3`)} volume={cue.volume * SFX_GAIN} />
        </Sequence>
      ))}

      {/* 1. Hook. */}
      {frame < f(S.phone + 0.5) && (
        <AbsoluteFill>
          <Still src="stills/letter-hands.jpg" from={S.hook} to={S.phone + 0.5} focus={[0.62, 0.55]} zoom={[1.02, 1.16]} />
          <Caption
            lines={["Denied by your insurer?", "Read it in plain English."]}
            at={0.35}
            size={capSize}
            style={wide ? { left: 110 * unit, bottom: 120 * unit } : { left: 70 * unit, right: 70 * unit, bottom: 380 * unit }}
          />
        </AbsoluteFill>
      )}

      {/* 2. Snap a photo. */}
      {frame >= f(S.phone - 0.3) && frame < f(S.app + 0.4) && (
        <AbsoluteFill style={{ opacity: phoneIn }}>
          <Still src="stills/letter-phone.jpg" from={S.phone} to={S.app} focus={[0.47, 0.42]} zoom={[1.0, 1.35]} />
          <Caption
            lines={["Snap a photo of the letter."]}
            at={S.phone + 0.3}
            size={capSize}
            style={wide ? { left: 110 * unit, bottom: 120 * unit } : { left: 70 * unit, right: 70 * unit, bottom: 380 * unit }}
          />
          <AbsoluteFill style={{ background: "#FFFFFF", opacity: flash }} />
        </AbsoluteFill>
      )}

      {/* 3–4. The app, then the packet, on the night stage. */}
      {frame >= f(S.app - 0.2) && (
        <AbsoluteFill style={{ opacity: stageIn * (1 - endFade) }}>
          <Aurora />

          {/* Headline beside (landscape) or above (vertical) the phone. */}
          <div
            style={{
              position: "absolute",
              ...(wide ? { left: 120 * unit, top: 0, bottom: 0, width: width * 0.4 } : { left: 70 * unit, right: 70 * unit, top: 150 * unit }),
              display: "flex",
              flexDirection: "column",
              justifyContent: wide ? "center" : "flex-start",
              gap: 26 * unit,
              color: "#F4F7F8",
            }}
          >
            {[
              { at: S.app + 0.3, until: S.packet - 0.2, big: "A free plain-English summary.", small: "In about two minutes. No card." },
              { at: S.packet + 0.3, until: S.end, big: "Then your full appeal packet.", small: "You review every page. You send it." },
            ].map((block) => {
              const show = settle(frame, block.at, 0.7) * (1 - glide(frame, block.until - 0.35, block.until));
              if (show <= 0.001) return null;
              return (
                <div key={block.big} style={{ position: wide ? "absolute" : "absolute", ...(wide ? { top: "50%", marginTop: -130 * unit } : { top: 0 }), opacity: show, transform: `translateY(${(1 - show) * 24}px)`, filter: `blur(${(1 - show) * 8}px)` }}>
                  <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: (wide ? 76 : 78) * unit, lineHeight: 1.08, maxWidth: wide ? width * 0.4 : undefined }}>{block.big}</div>
                  <div style={{ marginTop: 22 * unit, fontFamily: SANS, fontWeight: 500, fontSize: (wide ? 32 : 38) * unit, color: "rgba(244,247,248,0.78)" }}>{block.small}</div>
                </div>
              );
            })}
          </div>

          {/* Packet pages fan out of the phone. */}
          {frame >= f(S.packet) &&
            PAGES.map((spec, i) => {
              const p = settle(frame, S.packet + 0.45 + i * 0.22, 0.9);
              const pageW = (wide ? 320 : 400) * unit;
              // Landscape: one fanned row. Vertical: a two-by-two spread that
              // fills the frame above the reel's caption zone.
              const fanX = width * (wide ? [0.555, 0.67, 0.785, 0.9][i] : [0.29, 0.71, 0.29, 0.71][i]);
              const fanY = wide ? height * 0.52 + [-16, 22, -10, 26][i] * unit : height * [0.43, 0.45, 0.7, 0.72][i];
              const rot = [-6, 3, -2, 5][i] * p;
              return (
                <div
                  key={spec.title}
                  style={{
                    position: "absolute",
                    left: mix(phoneX, fanX, p) - pageW / 2,
                    top: mix(phoneY, fanY, p) - (pageW * 1.3) / 2,
                    transform: `scale(${mix(0.3, wide ? 1 : 0.95, p)}) rotate(${rot}deg)`,
                    opacity: clamp01(p * 3),
                    zIndex: 3 + i,
                  }}
                >
                  <Page spec={spec} w={pageW} />
                </div>
              );
            })}

          <div
            style={{
              position: "absolute",
              left: phoneX,
              top: phoneY,
              transform: `translate(-50%, -50%) scale(${phoneScale})`,
              opacity: phoneOpacity,
              zIndex: 2,
            }}
          >
            <Phone screenW={screenW} screenH={screenH}>
              <Screen src="film/app-upload.png" at={S.app} screenW={screenW} topInset={topInset} />
              {frame >= f(S.processing) && <Screen src="film/app-processing.png" at={S.processing} screenW={screenW} topInset={topInset} />}
              {frame >= f(S.summary) && <Screen src="film/app-summary.png" at={S.summary} screenW={screenW} topInset={topInset} scroll={scroll} />}
            </Phone>
          </div>

          {/* Callouts while the summary is on screen. */}
          {frame >= f(S.summary) && frame < f(S.packet + 0.4) && (
            <div style={{ position: "absolute", inset: 0, zIndex: 6, opacity: 1 - glide(frame, S.packet - 0.3, S.packet + 0.2) }}>
              {(wide
                ? // Pinned to the phone's left edge beside what it names; the second replaces the first.
                  [
                    { t: "What happened, in plain words", at: S.summary + 0.5, until: S.scrollFrom + 0.4, style: { right: width - (phoneX - phoneHalfW + 22 * unit), top: height * 0.33 } },
                    { t: "Your appeal letter, already started", at: S.scrollTo + 0.2, until: S.packet, style: { right: width - (phoneX - phoneHalfW + 22 * unit), top: height * 0.33 } },
                  ]
                : // One slot between the headline and the phone; the second replaces the first.
                  [
                    { t: "What happened, in plain words", at: S.summary + 0.5, until: S.scrollFrom + 0.4, style: { left: 70 * unit, top: height * 0.215 } },
                    { t: "Your appeal letter, already started", at: S.scrollTo + 0.2, until: S.packet, style: { left: 70 * unit, top: height * 0.215 } },
                  ]
              ).map((c) =>
                frame < f(c.until) ? (
                  <div key={c.t} style={{ opacity: 1 - glide(frame, c.until - 0.3, c.until) }}>
                    <Chip text={c.t} at={c.at} size={chipSize} style={c.style} />
                  </div>
                ) : null,
              )}
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* 5. End card. */}
      {frame >= f(S.end - 0.3) && <EndCard wide={wide} unit={unit} />}
    </AbsoluteFill>
  );
};

const EndCard: React.FC<{ wide: boolean; unit: number }> = ({ wide, unit }) => {
  const frame = useCurrentFrame();
  const inP = glide(frame, S.end - 0.3, S.end + 0.3);
  const chips = ["Free preview", "No card", "You send it yourself", "Guest uploads auto-delete in 24 hours"];
  return (
    <AbsoluteFill style={{ opacity: inP }}>
      <Aurora />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 80 * unit, gap: 34 * unit, color: "#F4F7F8", textAlign: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 * unit, opacity: settle(frame, S.end, 0.6) }}>
          <svg width={64 * unit} height={64 * unit} viewBox="0 0 100 100">
            <rect width="100" height="100" rx="24" fill={TEAL} />
            <path d="M27 52 L44 68 L75 34" fill="none" stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 48 * unit }}>GetMyYes</span>
        </div>
        <div
          style={{
            fontFamily: SERIF,
            fontWeight: 700,
            fontSize: (wide ? 92 : 96) * unit,
            lineHeight: 1.06,
            maxWidth: wide ? 1300 * unit : 900 * unit,
            opacity: settle(frame, S.end + 0.25, 0.7),
            transform: `translateY(${(1 - settle(frame, S.end + 0.25, 0.7)) * 26}px)`,
          }}
        >
          Understand the denial. <span style={{ color: MINT }}>Build the appeal.</span>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 * unit, maxWidth: wide ? 1400 * unit : 900 * unit }}>
          {chips.map((c, i) => {
            const p = pop(frame, S.end + 0.9 + i * 0.15);
            return (
              <span
                key={c}
                style={{
                  padding: `${12 * unit}px ${22 * unit}px`,
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.22)",
                  backdropFilter: "blur(14px)",
                  fontFamily: SANS,
                  fontWeight: 600,
                  fontSize: (wide ? 26 : 30) * unit,
                  opacity: clamp01(p * 2),
                  transform: `scale(${0.85 + 0.15 * p})`,
                }}
              >
                {c}
              </span>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 * unit, marginTop: 10 * unit, opacity: settle(frame, S.end + 1.6, 0.6) }}>
          <span
            style={{
              padding: `${20 * unit}px ${36 * unit}px`,
              borderRadius: 14 * unit,
              background: MINT,
              color: "#0E1922",
              fontFamily: SANS,
              fontWeight: 800,
              fontSize: (wide ? 30 : 34) * unit,
            }}
          >
            See my free denial summary
          </span>
          <span style={{ fontFamily: SANS, fontWeight: 600, fontSize: (wide ? 28 : 32) * unit, color: "rgba(244,247,248,0.8)" }}>getmyyes.com</span>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
