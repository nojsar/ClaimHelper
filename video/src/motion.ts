import { Easing, interpolate, spring } from "remotion";
import { FPS } from "./brand";

/**
 * Motion vocabulary for the social videos. Everything is written in seconds
 * and converted here, so the timeline reads like a storyboard and survives a
 * frame-rate change untouched.
 */

export const f = (seconds: number): number => Math.round(seconds * FPS);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/**
 * Critically damped: arrives without overshoot. The default for type and for
 * anything that travels far, where a bounce would read as a wobble.
 */
export function settle(frame: number, at: number, seconds = 0.8): number {
  return spring({
    frame,
    fps: FPS,
    delay: f(at),
    durationInFrames: f(seconds),
    config: { damping: 200 },
  });
}

/**
 * A small, quick overshoot (about ten percent) for marks that land: check
 * marks, step dots, destination nodes. Never used on type.
 */
export function pop(frame: number, at: number): number {
  return spring({
    frame,
    fps: FPS,
    delay: f(at),
    config: { damping: 12, stiffness: 170, mass: 0.6 },
  });
}

/** A paper sheet dropped onto a desk: heavier, with one soft settle. */
export function drop(frame: number, at: number): number {
  return spring({
    frame,
    fps: FPS,
    delay: f(at),
    config: { damping: 15, stiffness: 120, mass: 0.9 },
  });
}

/** Eased 0 -> 1 across an exact window, for motion that must take that long. */
export function glide(
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.inOut(Easing.cubic),
): number {
  return interpolate(frame, [f(from), f(to)], [0, 1], { ...clamp, easing });
}

/** The same, for windows already expressed in frames. */
export function glideFrames(
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.out(Easing.cubic),
): number {
  return interpolate(frame, [from, to], [0, 1], { ...clamp, easing });
}

export const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/**
 * The storyboard, in seconds. Three acts, one per step on the card's rail, so
 * the picture and the words underneath it always say the same thing:
 *
 *   1  Add your denial           the letter arrives and is scanned
 *   2  Review the free summary   its reason lifts into a plain summary
 *   3  Choose what to do next    the summary branches into next steps
 *
 * then a hold on the settled card, which is also the poster frame.
 */
export const T = {
  rule: 0.05,
  title: 0.12,
  titleStagger: 0.08,
  summary: 0.62,
  footer: 0.85,
  rail: 0.95,

  act1: 1.3,
  letterIn: 1.3,
  brackets: 2.1,
  scanFrom: 2.4,
  scanTo: 3.6,
  bracketsOut: 3.75,

  act2: 4.25,
  letterAside: 4.25,
  cardIn: 4.5,
  fly: 5.1,
  flyStagger: 0.16,
  flySeconds: 0.95,
  checks: 5.75,
  checkStagger: 0.24,

  act3: 7.25,
  regroup: 7.25,
  paths: 8.0,
  pathStagger: 0.14,
  pathSeconds: 0.7,
  nodes: 8.35,
  nodeStagger: 0.14,
  pulses: 8.9,
  pulseStagger: 0.12,
  pulseSeconds: 0.75,

  done: 9.85,
  finale: 10.0,
} as const;
