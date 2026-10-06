import React from "react";
import { useCurrentFrame } from "remotion";
import { settle } from "./motion";

/**
 * A short fade with a small rise, for supporting type (the summary, the
 * footer). Calm on purpose: the brand keeps drama out of anything a denied
 * claimant sees, and quiet type still reads on a muted autoplay.
 */
export const Reveal: React.FC<{
  /** Seconds. */
  at: number;
  rise?: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, rise = 18, style, children }) => {
  const frame = useCurrentFrame();
  const progress = settle(frame, at, 0.6);

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

/**
 * A heading line rising out of its own baseline: the line is clipped to its
 * box and slides up into it, the way editorial titles are set in motion. The
 * clip carries a little room below so descenders are never cut on arrival.
 */
export const MaskLine: React.FC<{
  at: number;
  style?: React.CSSProperties;
  children: React.ReactNode;
}> = ({ at, style, children }) => {
  const frame = useCurrentFrame();
  const progress = settle(frame, at, 0.75);

  return (
    <div style={{ overflow: "hidden", paddingBottom: "0.16em", marginBottom: "-0.16em" }}>
      <div
        style={{
          transform: `translateY(${(1 - progress) * 130}%)`,
          opacity: Math.min(1, progress * 1.6),
          ...style,
        }}
      >
        {children}
      </div>
    </div>
  );
};
