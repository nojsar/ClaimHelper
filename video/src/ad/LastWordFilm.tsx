import React from "react";
import { AbsoluteFill, Easing, Html5Audio, OffthreadVideo, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, MONO, NAVY, NAVY_DARK, SANS, SERIF, TEAL } from "../brand";
import { clamp01, f, glide, mix, pop, settle } from "../motion";
import data from "../../library/last-word/last-word.json";
import { CREAM, MINT, PAPER } from "./paper";
import { BrandMark } from "./DawnAd";
import { Card, Kinetic, Word } from "./PulseAd";
import "../fonts";

/**
 * "Not the last word": a narrated post film cut from the Higgsfield b-roll
 * library (library/broll). Hands only, night to morning, one cut per phrase:
 *
 *   0.0  hook     a letter drops through the door  "The letter says"
 *   1.0  no       the word lands on the letter    "no."
 *   2.2  night    rain, then a hand to the lamp   "That doesn't have to be the last word."
 *   4.5  right    a pen is picked up              "You usually have the right to appeal,"
 *   6.8  clock    the hourglass runs              "but the clock is running."
 *   8.3  reads    typing, and a SAMPLE line turns plain
 *  12.0  drafts   printer, clip, signature, call notes, one card per page
 *  16.8  send     review, seal, the mailbox
 *  19.7  morning  blinds open; end card          "Start with a free summary"
 *
 * Every time comes from the take's word timings (last-word.json), so a new
 * read moves the cuts with it. Voice and soft effects only, no music bed.
 */

export type LastWordFormat = "vertical" | "feed";
export const LAST_WORD_SECONDS = data.seconds;

const W = data.voice.words;
const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9]/g, "");
const wi = (text: string, nth = 1): number => {
  let seen = 0;
  for (let i = 0; i < W.length; i++) if (norm(W[i].text) === text && ++seen === nth) return i;
  throw new Error(`last-word.json has no "${text}" #${nth}`);
};
const at = (i: number): number => W[i].from;
const q = (s: number): number => Math.round(s * FPS) / FPS;

const I = {
  no: wi("no"),
  that: wi("that"),
  last: wi("last"),
  you: wi("you"),
  appeal: wi("appeal"),
  but: wi("but"),
  clock: wi("clock"),
  running: wi("running"),
  gmy: wi("getmyyes"),
  letter2: wi("letter", 2),
  plain: wi("plain"),
  free: wi("free"),
  then: wi("then"),
  appeal2: wi("appeal", 2),
  letter3: wi("letter", 3),
  evidence: wi("evidence"),
  call: wi("call"),
  script: wi("script"),
  you2: wi("you", 2),
  sign: wi("sign"),
  and: wi("and"),
  send: wi("send"),
  yourself: wi("yourself"),
  start: wi("start"),
  free2: wi("free", 2),
  summary: wi("summary"),
};

/** Each cut lands a hair before its word, so the picture leads the voice. */
const C = {
  no: q(at(I.no) - 0.04),
  night: q(at(I.that) - 0.08),
  lamp: q(at(I.last) - 0.04),
  right: q(at(I.you) - 0.06),
  clock: q(at(I.but) - 0.05),
  reads: q(at(I.gmy) - 0.1),
  drafts: q(at(I.then) - 0.02),
  clip: q(at(I.letter3) - 0.04),
  sign: q(at(I.evidence) - 0.05),
  call: q(at(I.call) - 0.06),
  review: q(at(I.you2) - 0.05),
  seal: q(at(I.sign) - 0.04),
  send: q(at(I.and) - 0.04),
  morning: q(at(I.start) - 0.05),
  card: q(at(I.summary) + 0.3),
  end: data.seconds,
};

const PAGES = [
  { word: I.letter3, title: "Appeal letter", line: "Answers the plan's reason, point by point." },
  { word: I.evidence, title: "Evidence checklist", line: "What to gather, and from whom." },
  { word: I.call, title: "Call script", line: "What to ask the plan, in order." },
];

const SFX: { at: number; sfx: string; volume: number }[] = [
  { at: 0.02, sfx: "paper-slide", volume: 0.26 },
  { at: C.no, sfx: "shutter", volume: 0.28 },
  { at: at(I.clock), sfx: "tick", volume: 0.3 },
  { at: at(I.clock) + 0.48, sfx: "tick", volume: 0.27 },
  { at: at(I.clock) + 0.96, sfx: "tick", volume: 0.24 },
  { at: at(I.plain) - 0.1, sfx: "scan-sweep", volume: 0.2 },
  { at: at(I.free), sfx: "node-pop", volume: 0.2 },
  ...PAGES.map((page) => ({ at: at(page.word), sfx: "node-pop", volume: 0.18 })),
  { at: at(I.send), sfx: "paper-slide", volume: 0.22 },
  { at: C.morning, sfx: "fly-swoosh", volume: 0.18 },
  { at: at(I.free2), sfx: "done-chime", volume: 0.2 },
];

/** Words i..j of the read as kinetic words. */
const words = (from: number, to: number, accents: number[] = [], rename: Record<number, string> = {}, now = false): Word[] =>
  W.slice(from, to + 1).map((w, k) => ({
    t: (rename[from + k] ?? w.text).replace(/[.,:—]/g, ""),
    at: now ? 0 : w.from,
    accent: accents.includes(from + k),
  }));

/** A b-roll shot, full bleed: a gentle push on the cut, then a slow drift. */
const Shot: React.FC<{ src: string; cut: number; until: number; clipFrom: number; origin?: string; base?: number; drift?: number; dim?: number; blur?: number; fadeIn?: number }> = ({
  src,
  cut,
  until,
  clipFrom,
  origin = "50% 50%",
  base = 1.04,
  drift = 0.06,
  dim = 0.16,
  blur = 0,
  fadeIn = 0,
}) => {
  const frame = useCurrentFrame();
  const t = frame / FPS - cut;
  const len = until - cut;
  const punch = 0.05 * Math.exp(-t * 9);
  const scale = base + drift * clamp01(t / len) + punch;
  const opacity = fadeIn > 0 ? clamp01(t / fadeIn) : 1;
  return (
    <Sequence from={f(cut)} durationInFrames={Math.max(1, f(len))} premountFor={30}>
      <AbsoluteFill style={{ overflow: "hidden", opacity }}>
        <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: origin, filter: blur ? `blur(${blur}px)` : undefined }}>
          <OffthreadVideo src={staticFile(`broll/${src}.mp4`)} muted trimBefore={f(clipFrom)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </AbsoluteFill>
        <AbsoluteFill style={{ background: `radial-gradient(ellipse at 50% 45%, rgba(5,14,24,0) 45%, rgba(5,14,24,${0.45 + dim}) 100%)` }} />
        <AbsoluteFill style={{ background: `rgba(5,14,24,${dim})` }} />
      </AbsoluteFill>
    </Sequence>
  );
};

/** The SAMPLE line on paper: jargon until "plain", then the plain-English read. */
const PlainCard: React.FC<{ w: number; turn: number; lens: number; chip: number }> = ({ w, turn, lens, chip }) => (
  <div style={{ position: "relative", width: w, padding: `${w * 0.06}px ${w * 0.065}px ${w * 0.07}px`, borderRadius: w * 0.045, background: "rgba(255,253,247,0.96)", boxShadow: "0 40px 80px -36px rgba(0,0,0,0.8)" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: w * 0.035 }}>
      <span style={{ fontFamily: MONO, fontWeight: 600, fontSize: w * 0.03, letterSpacing: "0.14em", color: "#5F6E78" }}>FROM THE LETTER</span>
      <span style={{ padding: `${w * 0.006}px ${w * 0.018}px`, border: `${Math.max(2, w * 0.004)}px solid ${TEAL}`, borderRadius: w * 0.012, fontFamily: MONO, fontWeight: 700, fontSize: w * 0.03, letterSpacing: "0.12em", color: TEAL, transform: "rotate(-4deg)" }}>SAMPLE</span>
    </div>
    <div style={{ position: "relative", minHeight: w * 0.26 }}>
      <div style={{ fontFamily: SERIF, fontSize: w * 0.058, lineHeight: 1.3, color: "#4A5865", opacity: 1 - turn, filter: `blur(${turn * 6}px)` }}>
        Service not certified. Prior authorization was not obtained per Section 4.2.
      </div>
      {turn > 0.001 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", opacity: turn, transform: `translateY(${(1 - turn) * 14}px)` }}>
          <div style={{ fontFamily: MONO, fontWeight: 600, fontSize: w * 0.03, letterSpacing: "0.14em", color: TEAL, marginBottom: w * 0.02 }}>IN PLAIN ENGLISH</div>
          <div style={{ fontFamily: SANS, fontWeight: 800, fontSize: w * 0.07, lineHeight: 1.18, color: NAVY_DARK }}>The plan says approval was needed first.</div>
        </div>
      )}
      {lens > 0.001 && lens < 0.999 && (
        <div
          style={{
            position: "absolute",
            top: -w * 0.02,
            bottom: -w * 0.02,
            left: `${mix(-30, 100, lens)}%`,
            width: "30%",
            borderRadius: w * 0.03,
            background: "linear-gradient(90deg, rgba(169,222,210,0) 0%, rgba(169,222,210,0.55) 50%, rgba(169,222,210,0) 100%)",
            boxShadow: "0 0 40px -6px rgba(143,211,194,0.9)",
          }}
        />
      )}
    </div>
    {chip > 0.001 && (
      <span style={{ position: "absolute", right: w * 0.05, bottom: -w * 0.045, padding: `${w * 0.016}px ${w * 0.04}px`, borderRadius: 999, background: TEAL, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: w * 0.042, letterSpacing: "0.04em", opacity: clamp01(chip * 2), transform: `scale(${mix(0.6, 1, chip)})`, boxShadow: "0 16px 30px -16px rgba(16,38,59,0.8)" }}>
        FREE SUMMARY
      </span>
    )}
  </div>
);

export const LastWordFilm: React.FC<{ format: LastWordFormat }> = ({ format }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const feed = format === "feed";
  const u = width / 1080;
  const s = frame / FPS;
  // Reels: the top 15% sits under the header and the bottom quarter under the
  // caption and buttons. The 4:5 Feed frame is clear almost to the edges.
  const band = feed ? { top: 0.08 * height, bottom: 0.92 * height } : { top: 0.15 * height, bottom: 0.76 * height };
  const mid = (band.top + band.bottom) / 2;
  const cap = (feed ? 104 : 118) * u;
  const low = band.bottom - cap * (feed ? 2.6 : 2.4);
  const inScene = (a: number, b: number) => s >= a && s < b;

  // "No." lands like a stamp, and the frame takes the hit.
  const slam = spring({ frame, fps: FPS, delay: f(C.no), config: { damping: 12, stiffness: 260, mass: 0.6 } });
  const shake = s >= C.no && s < C.no + 0.3 ? Math.sin((s - C.no) * 90) * 10 * u * (1 - (s - C.no) / 0.3) : 0;
  const flash = s >= C.no && s < C.no + 0.1 ? 1 - (s - C.no) / 0.1 : 0;

  // The clock: a thin bar drains under the words while the sand runs.
  const drain = glide(frame, C.clock, C.reads, Easing.linear);

  // The SAMPLE line turns plain as "plain" is said; FREE pops on "free".
  const cardIn = settle(frame, at(I.letter2) - 0.2, 0.45);
  const lens = glide(frame, at(I.plain) - 0.15, at(I.plain) + 0.45, Easing.inOut(Easing.cubic));
  const turn = glide(frame, at(I.plain) + 0.05, at(I.plain) + 0.4, Easing.out(Easing.cubic));
  const chip = pop(frame, at(I.free) - 0.03);

  // The end card rises over the morning.
  const endIn = glide(frame, C.card, C.card + 0.45, Easing.out(Easing.cubic));
  const cardW = (feed ? 700 : 800) * u;

  return (
    <AbsoluteFill style={{ background: NAVY_DARK, overflow: "hidden" }}>
      <Html5Audio src={staticFile("last-word/voice.mp3")} volume={1} />
      {SFX.map((cue, i) => (
        <Sequence key={`${cue.sfx}-${i}`} from={f(cue.at)} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${cue.sfx}.mp3`)} volume={cue.volume} />
        </Sequence>
      ))}

      <div style={{ position: "absolute", inset: 0, transform: `translate(${shake}px, 0px)` }}>
        {/* 1. Hook: the letter drops through the door. The words are there on frame one. */}
        <Shot src="mail-slot-drop" cut={0} until={C.no} clipFrom={0.85} origin="50% 55%" base={1.06} drift={0.06} dim={0.1} />
        {inScene(0, C.no) && <Kinetic lines={[words(0, 1, [1], {}, true), words(2, 2, [], {}, true)]} size={cap * 1.15} top={low - cap * 0.6} />}

        {/* 2. "No." */}
        <Shot src="glasses-on-letter" cut={C.no} until={C.night} clipFrom={1.6} origin="50% 60%" base={1.12} drift={0.05} dim={0.42} />
        {inScene(C.no, C.night) && (
          <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
            <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: (feed ? 380 : 440) * u, lineHeight: 1, color: CREAM, letterSpacing: "-0.03em", opacity: clamp01(slam * 3), transform: `scale(${mix(1.9, 1, slam)}) rotate(${mix(-8, -3, slam)}deg)`, textShadow: "0 30px 80px rgba(0,0,0,0.55)" }}>
              No.
            </div>
          </AbsoluteFill>
        )}

        {/* 3. That doesn't have to be the last word: rain, then the lamp. */}
        <Shot src="rain-window-night" cut={C.night} until={C.lamp} clipFrom={0.8} origin="50% 70%" base={1.06} drift={0.05} dim={0.18} />
        <Shot src="lamp-off-night" cut={C.lamp} until={C.right} clipFrom={1.1} origin="50% 40%" base={1.06} drift={0.05} dim={0.16} />
        {inScene(C.night, C.right) && <Kinetic lines={[words(I.that, I.that + 4), words(I.last - 1, I.last + 1, [I.last, I.last + 1])]} size={cap} top={low - cap * 0.6} out={C.right} />}

        {/* 4. You usually have the right to appeal: a pen is picked up. */}
        <Shot src="pen-on-notebook" cut={C.right} until={C.clock} clipFrom={0.6} origin="40% 60%" base={1.06} drift={0.06} dim={0.16} />
        {inScene(C.right, C.clock) && <Kinetic lines={[words(I.you, I.you + 2), words(I.you + 3, I.appeal, [I.appeal])]} size={cap} top={low - cap * 0.6} out={C.clock} />}

        {/* 5. But the clock is running. */}
        <Shot src="hourglass-turn" cut={C.clock} until={C.reads} clipFrom={2.2} origin="50% 60%" base={1.08} drift={0.08} dim={0.14} />
        {inScene(C.clock, C.reads) && (
          <>
            <Kinetic lines={[words(I.but, I.clock, [I.clock]), words(I.clock + 1, I.running)]} size={cap} top={band.top + 10 * u} out={C.reads} />
            <div style={{ position: "absolute", left: 140 * u, right: 140 * u, top: band.top + cap * 2.35 + 30 * u, height: 10 * u, borderRadius: 99, background: "rgba(255,247,234,0.18)", opacity: settle(frame, C.clock, 0.3) }}>
              <div style={{ width: `${(1 - drain) * 100}%`, height: "100%", borderRadius: 99, background: MINT, boxShadow: "0 0 18px rgba(169,222,210,0.7)" }} />
            </div>
          </>
        )}

        {/* 6. GetMyYes reads your letter in plain English, free. */}
        <Shot src="laptop-typing-night" cut={C.reads} until={C.drafts} clipFrom={0.5} origin="50% 70%" base={1.06} drift={0.05} dim={0.38} />
        {inScene(C.reads, C.drafts) && (
          <>
            <div style={{ position: "absolute", left: 0, right: 0, top: band.top, display: "flex", justifyContent: "center", alignItems: "center", gap: 16 * u, opacity: settle(frame, C.reads, 0.3), transform: `scale(${mix(0.85, 1, settle(frame, C.reads, 0.35))})` }}>
              <BrandMark size={64 * u} />
              <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 60 * u, color: CREAM }}>GetMyYes</span>
            </div>
            <Kinetic lines={[words(I.gmy + 1, I.letter2), words(I.letter2 + 1, I.free, [I.free])]} size={cap * 0.74} top={band.top + 110 * u} />
            <div style={{ position: "absolute", left: (width - cardW) / 2, top: mid - (feed ? 20 : 60) * u, opacity: clamp01(cardIn * 1.5), transform: `translateY(${(1 - cardIn) * 80 * u}px) scale(${mix(0.94, 1, cardIn)})` }}>
              <PlainCard w={cardW} turn={turn} lens={lens} chip={chip} />
            </div>
          </>
        )}

        {/* 7. Then it drafts your appeal: one shot and one page per phrase. */}
        <Shot src="printer-pages" cut={C.drafts} until={C.clip} clipFrom={1.0} origin="50% 55%" base={1.05} drift={0.05} dim={0.2} />
        <Shot src="paperclip-stack" cut={C.clip} until={C.sign} clipFrom={1.8} origin="55% 45%" base={1.05} drift={0.05} dim={0.26} />
        <Shot src="doctor-signs" cut={C.sign} until={C.call} clipFrom={1.3} origin="55% 70%" base={1.06} drift={0.05} dim={0.26} />
        <Shot src="phone-call-notes" cut={C.call} until={C.review} clipFrom={1.0} origin="45% 45%" base={1.05} drift={0.05} dim={0.26} />
        {inScene(C.drafts, C.clip) && <Kinetic lines={[words(I.then, I.then + 2), words(I.then + 3, I.appeal2, [I.appeal2])]} size={cap} top={band.top + 10 * u} out={C.clip} />}
        {inScene(C.clip, C.review) && (
          <>
            <div style={{ position: "absolute", left: 0, right: 0, top: band.top + 10 * u, textAlign: "center", fontFamily: MONO, fontWeight: 600, fontSize: 42 * u, letterSpacing: "0.22em", color: MINT, opacity: settle(frame, C.clip, 0.25), textShadow: "0 4px 18px rgba(5,14,24,0.8)" }}>
              YOUR APPEAL PACKET
            </div>
            <div style={{ position: "absolute", left: 0, right: 0, top: mid - (feed ? 250 : 230) * u, display: "flex", flexDirection: "column", alignItems: "center", gap: 22 * u }}>
              {PAGES.map((page) => (
                <Card key={page.title} title={page.title} line={page.line} w={cardW} p={settle(frame, at(page.word) - 0.06, 0.3)} />
              ))}
            </div>
          </>
        )}

        {/* 8. You review it, sign it, and send it yourself. */}
        <Shot src="staple-pages" cut={C.review} until={C.seal} clipFrom={2.2} origin="50% 60%" base={1.06} drift={0.05} dim={0.18} />
        <Shot src="fold-and-seal" cut={C.seal} until={C.send} clipFrom={2.6} origin="50% 55%" base={1.06} drift={0.05} dim={0.18} />
        <Shot src="street-mailbox-drop" cut={C.send} until={C.morning} clipFrom={1.1} origin="50% 30%" base={1.14} drift={0.05} dim={0.16} />
        {inScene(C.review, C.seal) && <Kinetic lines={[words(I.you2, I.you2 + 2)]} size={cap * 1.1} top={low} out={C.seal} />}
        {inScene(C.seal, C.send) && <Kinetic lines={[words(I.sign, I.sign + 1)]} size={cap * 1.1} top={low} out={C.send} />}
        {inScene(C.send, C.morning) && <Kinetic lines={[words(I.and, I.send + 1), words(I.yourself, I.yourself, [I.yourself])]} size={cap * 1.1} top={low - cap * 0.9} out={C.morning} />}

        {/* 9. Morning: the blinds open, then the end card. */}
        <Shot src="blinds-open" cut={C.morning} until={C.card + 0.5} clipFrom={2.0} origin="50% 45%" base={1.05} drift={0.05} dim={0.08} />
        <Shot src="morning-mug-pages" cut={C.card} until={C.end} clipFrom={0.5} origin="50% 70%" base={1.1} drift={0.04} dim={0} blur={10 * u} fadeIn={0.45} />
        {inScene(C.morning, C.card + 0.5) && <Kinetic lines={[words(I.start, I.free2 - 1), words(I.free2, I.summary, [I.free2])]} size={cap * 1.05} top={low - cap * 0.9} out={C.card + 0.45} />}
        {s >= C.card && (
          <AbsoluteFill style={{ opacity: endIn }}>
            <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(255,250,240,0.66) 0%, rgba(255,250,240,0.82) 50%, rgba(255,250,240,0.92) 100%)` }} />
            {/* Centred in the safe band, sized for a phone held at arm's length. */}
            <div style={{ position: "absolute", left: 0, right: 0, top: band.top, height: band.bottom - band.top, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: (feed ? 30 : 40) * u, textAlign: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 20 * u }}>
                <BrandMark size={92 * u} />
                <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 76 * u, color: NAVY_DARK }}>GetMyYes</span>
              </div>
              <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: (feed ? 100 : 120) * u, lineHeight: 1.02, color: NAVY_DARK, letterSpacing: "-0.02em", padding: `0 ${60 * u}px`, transform: `translateY(${(1 - endIn) * 30 * u}px)` }}>
                A “no” doesn’t have to be the last word.
              </div>
              <div style={{ fontFamily: SANS, fontWeight: 650, fontSize: (feed ? 42 : 48) * u, color: "#3D4B57", lineHeight: 1.28, padding: `0 ${80 * u}px` }}>Start with a free plain-English summary of your denial letter.</div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 14 * u, padding: `0 ${60 * u}px` }}>
                {["No card needed", "Full appeal packet $5", "You send it yourself"].map((c, i) => {
                  const p = pop(frame, C.card + 0.35 + i * 0.12);
                  return (
                    <span key={c} style={{ padding: `${14 * u}px ${28 * u}px`, borderRadius: 999, background: PAPER, color: NAVY_DARK, fontFamily: SANS, fontWeight: 700, fontSize: (feed ? 34 : 38) * u, opacity: clamp01(p * 2), transform: `scale(${0.85 + 0.15 * p})`, boxShadow: "0 10px 26px -18px rgba(16,38,59,0.6)", border: "1px solid rgba(16,38,59,0.08)" }}>
                      {c}
                    </span>
                  );
                })}
              </div>
              <span style={{ padding: `${28 * u}px ${60 * u}px`, borderRadius: 999, background: NAVY, color: "#FFFFFF", fontFamily: SANS, fontWeight: 800, fontSize: (feed ? 52 : 58) * u, opacity: settle(frame, C.card + 0.7, 0.35), transform: `scale(${mix(0.92, 1, settle(frame, C.card + 0.7, 0.35))})`, boxShadow: "0 24px 50px -24px rgba(16,38,59,0.8)" }}>
                getmyyes.com
              </span>
            </div>
          </AbsoluteFill>
        )}
      </div>

      {flash > 0 && <AbsoluteFill style={{ background: CREAM, opacity: flash * 0.25 }} />}
      {/* A last breath of fade, so a loop does not snap. */}
      <AbsoluteFill style={{ background: CREAM, opacity: interpolate(s, [C.end - 0.25, C.end], [0, 0.35], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
