import React from "react";
import { AbsoluteFill, Html5Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { FPS, MONO, SERIF } from "../brand";
import { clamp01, f, settle } from "../motion";
import data from "../../library/dawn-ad/hooks.json";
import { BrandMark, DAWN_AD_SECONDS, DawnAd } from "./DawnAd";
import { CREAM, DawnSky, MINT, Rise, Stars, Strip } from "./paper";
import "../fonts";

/**
 * The Facebook angle test: one voiced opening per angle (hooks.json), set on
 * the ad's own night sky, then the dawn-print ad unchanged. The sea's clock
 * runs so that the hook ends exactly where the ad's sea begins, so the cut
 * between them is invisible: only the words change.
 */

export type HookFormat = "vertical" | "feed";
type Beat =
  | { kind: "rise"; lines: string[]; at: number; scale?: number; accent?: boolean }
  | { kind: "strip"; text: string; at: number }
  | { kind: "note"; text: string; at: number };
type Hook = (typeof data.hooks)[number] & { screen: Beat[] };

export const HOOKS = data.hooks as Hook[];
const { voiceAt, tail } = data.timing;

export const hookFrames = (hook: Hook): number => f(voiceAt + hook.seconds + tail);
export const hookAdFrames = (hook: Hook): number => hookFrames(hook) + DAWN_AD_SECONDS * FPS;

/** The opening alone: brand, the hook's words, its voice. */
const HookCard: React.FC<{ hook: Hook; format: HookFormat }> = ({ hook, format }) => {
  const frame = useCurrentFrame();
  const { width, durationInFrames } = useVideoConfig();
  const u = width / 1080;
  const feed = format === "feed";
  const seconds = durationInFrames / FPS;
  // The type leads the voice a little; it clears just before the cut.
  const lead = (at: number) => Math.max(0, at + voiceAt - 0.15);
  const out = seconds - 0.05;
  const base = 104 * u;

  // Beats stack down the frame in the order they are spoken.
  let cursor = (feed ? 230 : 500) * u;
  let strips = 0;
  const placed = hook.screen.map((beat) => {
    const top = cursor;
    const index = beat.kind === "strip" ? strips++ : 0;
    if (beat.kind === "rise") cursor += beat.lines.length * base * (beat.scale ?? 1) * 1.08 + 30 * u;
    else if (beat.kind === "strip") cursor += 46 * u * 1.75 + 18 * u;
    else cursor += 64 * u;
    return { beat, top, index };
  });

  const brand = settle(frame, 0, 0.6);
  const night = 1;

  return (
    <AbsoluteFill style={{ background: "#0D1726", overflow: "hidden" }}>
      <Sequence from={f(voiceAt)} layout="none">
        <Html5Audio src={staticFile(hook.file)} volume={1} />
      </Sequence>
      {placed
        .filter(({ beat }) => beat.kind === "strip")
        .map(({ beat }) => (
          <Sequence key={`tick-${beat.at}`} from={f(lead(beat.at) + 0.1)} layout="none">
            <Html5Audio src={staticFile("audio/sfx/tick.mp3")} volume={0.18} />
          </Sequence>
        ))}

      {/* The same sky the ad opens on, its clock ending where the ad's starts. */}
      <DawnSky night={night} rise={0} hz={0.25} sunX={0.5} px={1.5 * u} offset={-seconds} />
      <Stars night={night} offset={-seconds} />

      <div
        style={{
          position: "absolute",
          left: 84 * u,
          top: (feed ? 100 : 300) * u,
          display: "flex",
          alignItems: "center",
          gap: 16 * u,
          opacity: brand * (1 - clamp01((frame / FPS - (out - 0.35)) / 0.35)),
        }}
      >
        <BrandMark size={52 * u} />
        <span style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 40 * u, color: CREAM }}>GetMyYes</span>
      </div>

      {placed.map(({ beat, top, index }) => {
        const at = lead(beat.at);
        if (beat.kind === "rise") {
          return (
            <Rise
              key={beat.lines.join(" ")}
              lines={beat.lines}
              at={at}
              out={out}
              size={base * (beat.scale ?? 1)}
              color={beat.accent ? MINT : CREAM}
              style={{ left: 80 * u, right: 80 * u, top, textShadow: "0 4px 30px rgba(5,12,22,0.55)" }}
            />
          );
        }
        if (beat.kind === "strip") {
          return <Strip key={beat.text} text={beat.text} at={at} out={out} size={46 * u} style={{ left: 84 * u + index * 26 * u, top }} />;
        }
        const p = settle(frame, at, 0.8);
        return (
          <div
            key={beat.text}
            style={{
              position: "absolute",
              left: 84 * u,
              top,
              fontFamily: MONO,
              fontWeight: 600,
              fontSize: 28 * u,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: CREAM,
              opacity: 0.72 * p * (1 - clamp01((frame / FPS - (out - 0.35)) / 0.35)),
            }}
          >
            {beat.text}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** One test ad: the hook, then the dawn-print ad in the same format. */
export const DawnAdHook: React.FC<{ hook: string; format: HookFormat }> = ({ hook: id, format }) => {
  const hook = HOOKS.find((h) => h.id === id);
  if (!hook) throw new Error(`No hook ${id} in hooks.json`);
  const lead = hookFrames(hook);
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={lead}>
        <HookCard hook={hook} format={format} />
      </Sequence>
      <Sequence from={lead} durationInFrames={DAWN_AD_SECONDS * FPS}>
        <DawnAd format={format} />
      </Sequence>
    </AbsoluteFill>
  );
};
