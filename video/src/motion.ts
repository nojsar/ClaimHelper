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

/** Eased 0 -> 1 across an exact window, for motion that must take that long. */
export function glide(
  frame: number,
  from: number,
  to: number,
  easing: (t: number) => number = Easing.inOut(Easing.cubic),
): number {
  return interpolate(frame, [f(from), f(to)], [0, 1], { ...clamp, easing });
}

export const mix = (from: number, to: number, t: number): number => from + (to - from) * t;

export const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
