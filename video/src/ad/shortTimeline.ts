/**
 * Timing for the 15-second cut of the Facebook test ads, shared by the
 * composition (DawnHook.tsx) and the caption writer (render.mjs), so the
 * captions can never drift from the picture. Plain functions over plain
 * numbers: Node runs this file directly with its type stripping.
 *
 *   hook | letter: the read line, the lens turning each row | end card
 *
 * Every clip is a whole sentence cut out of a take, then laid back to back
 * with a short gap, which trims the pauses the voice model leaves.
 */

export type Clip = { text: string; from: number; to: number; row?: number };
export type Placed = Clip & { at: number };

export type ShortTimeline = {
  total: number;
  /** The letter scene fades in over the hook's last TO_READ seconds. */
  readAt: number;
  /** The end card fades in from here; the ad's own clock there is endFrom. */
  endAt: number;
  endFrom: number;
  read: Placed[];
  end: Placed[];
  /** Composition seconds at which the letter's three rows turn. */
  rows: number[];
};

export const TO_READ = 0.3;
export const TO_END = 0.5;
/** On the ad's clock, the end card holds its button to here. */
const END_UNTIL = 24.4;
/** On the ad's clock, the strips before the end card have cleared here. */
const END_FROM_EARLIEST = 20.15;
/** Long enough to read the button when only the name is spoken. */
const END_SHORTEST = 3.5;
/** The end card's line starts this far in, which leaves a breath (~0.4 s)
 * after the read line instead of running the two together. */
const END_LINE_IN = 0.2;

const length = (clips: Clip[], gap: number): number =>
  clips.reduce((sum, clip) => sum + clip.to - clip.from, 0) + gap * Math.max(0, clips.length - 1);

const place = (clips: Clip[], gap: number, start: number): Placed[] => {
  let at = start;
  return clips.map((clip) => {
    const placed = { ...clip, at };
    at += clip.to - clip.from + gap;
    return placed;
  });
};

export function shortTimeline(o: {
  hookSeconds: number;
  target: number;
  read: Clip[];
  readGap: number;
  end: Clip[];
  endGap: number;
}): ShortTimeline {
  const readLength = length(o.read, o.readGap);
  // The whole tagline when it fits in the target, else just the name.
  const endFor = (clips: Clip[]) => Math.max(END_SHORTEST, END_LINE_IN + length(clips, o.endGap) + 0.15);
  const need = (endSeconds: number) => o.hookSeconds + 0.15 + readLength + 0.05 + endSeconds;
  const endClips = need(endFor(o.end)) <= o.target + 1e-6 ? o.end : o.end.slice(0, 1);
  const endSeconds = endFor(endClips);
  const total = Math.max(o.target, need(endSeconds));
  // The read line starts 0.15-0.45 s after the letter is in view (it is
  // unfolded by then); the dissolve to the end card starts just after it
  // ends, and any time left over holds the end card longer.
  const readStart = o.hookSeconds + 0.15 + Math.min(0.3, total - need(endSeconds));
  const read = place(o.read, o.readGap, readStart);
  const readEnd = readStart + readLength;
  const endAt = readEnd + 0.05;
  const endHeld = total - endAt;
  const rowAt = (row: number) => {
    const clip = read.find((c) => c.row === row);
    return clip ? clip.at + 0.15 : null;
  };
  const first = rowAt(0) ?? readStart + 0.15;
  const second = rowAt(1) ?? first + 1.0;
  const third = rowAt(2) ?? Math.max(second + 0.6, readEnd - 0.1);
  return {
    total,
    readAt: o.hookSeconds - TO_READ,
    endAt,
    // Never earlier than the strips before the card have cleared.
    endFrom: Math.max(END_FROM_EARLIEST, END_UNTIL - endHeld),
    read,
    end: place(endClips, o.endGap, endAt + END_LINE_IN),
    rows: [first, second, third],
  };
}
