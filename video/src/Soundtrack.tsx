import React from "react";
import { Html5Audio, Sequence, interpolate, staticFile, useVideoConfig } from "remotion";
import { FPS } from "./brand";
import { T, f } from "./motion";
import { MARK_AT } from "./Stage";

/**
 * The score: one licensed music excerpt per guide (video/library/music.json,
 * chosen for the guide's mood by tool/social_video.mjs) under quiet sound
 * effects that land on the storyboard's own beats. Every cue reads its time
 * from `T`, so retiming the animation retimes the sound with it.
 *
 * The excerpts are loudness-matched to -20 dBFS and the effects
 * peak-normalised to -3 dBFS, so the relative volumes below are the mix and
 * MASTER sets the overall level. At 1.45 the loudest guide touched 0 dBFS
 * (an effect landing on a music peak), so 1.2 keeps every render at or
 * below about -1.5 dBFS, which AAC encoding needs to stay clean.
 */

const MASTER = 1.2;
const MUSIC_LEVEL = 0.72 * MASTER;

type Cue = { at: number; sfx: string; volume: number };

const CUES: Cue[] = [
  // Act 1: the letter slides in, is framed like a phone photo, and is read.
  { at: T.letterIn, sfx: "paper-slide", volume: 0.5 },
  { at: T.brackets + 0.04, sfx: "shutter", volume: 0.38 },
  { at: T.scanFrom, sfx: "scan-sweep", volume: 0.2 },
  ...MARK_AT.map((frame) => ({ at: frame / FPS, sfx: "tick", volume: 0.26 })),
  // Act 2: aside, the summary arrives, the reason flies across, rows check.
  { at: T.letterAside, sfx: "card-swoosh", volume: 0.3 },
  { at: T.fly, sfx: "fly-swoosh", volume: 0.26 },
  { at: T.fly + T.flyStagger, sfx: "fly-swoosh", volume: 0.18 },
  ...[0, 1, 2].map((row) => ({ at: T.checks + row * T.checkStagger, sfx: "check", volume: 0.42 })),
  // Act 3: regroup, the next steps pop in and each one is reached.
  { at: T.regroup, sfx: "regroup-swoosh", volume: 0.24 },
  ...[0, 1, 2].map((node) => ({ at: T.nodes + node * T.nodeStagger, sfx: "node-pop", volume: 0.3 })),
  ...[0, 1, 2].map((node) => ({
    at: T.pulses + node * T.pulseStagger + T.pulseSeconds,
    sfx: "arrive-tone",
    volume: 0.24,
  })),
  // The card settles and the call to action glints.
  { at: T.finale + 0.2, sfx: "done-chime", volume: 0.34 },
];

export const Soundtrack: React.FC<{ music: string | null }> = ({ music }) => {
  const { durationInFrames } = useVideoConfig();
  return (
    <>
      {music && (
        <Html5Audio
          src={staticFile(`audio/music/${music}.mp3`)}
          // In over half a second, out over the last second, so the loop
          // point is silence meeting silence rather than a cut.
          volume={(frame) =>
            MUSIC_LEVEL *
            interpolate(
              frame,
              [0, f(0.5), durationInFrames - f(1), durationInFrames - 1],
              [0, 1, 1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      )}
      {CUES.map((cue, index) => (
        <Sequence key={`${cue.sfx}-${index}`} from={f(cue.at)} layout="none">
          <Html5Audio src={staticFile(`audio/sfx/${cue.sfx}.mp3`)} volume={cue.volume * MASTER} />
        </Sequence>
      ))}
    </>
  );
};
