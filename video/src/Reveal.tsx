import React from "react";
import { Easing, interpolate, useCurrentFrame } from "remotion";

/**
 * The only motion in these videos: a half-second fade with a small rise.
 * Deliberately calm — the brand keeps drama out of anything a denied
 * claimant sees, and a quiet card still reads on a muted autoplay.
 */
export const Reveal: React.FC<{
  at: number;
  rise?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, rise = 18, style, children }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [at, at + 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${(1 - progress) * rise}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
