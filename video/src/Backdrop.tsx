import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { INK_FAINT, PAPER } from "./brand";

/**
 * Paper with two soft washes of light drifting behind it, so no frame is ever
 * completely still. Each wash travels one full, slow circle over the length
 * of the video, so the last frame meets the first and the loop has no seam.
 */
export const Backdrop: React.FC<{ inset: number }> = ({ inset }) => {
  const frame = useCurrentFrame();
  const { width, height, durationInFrames } = useVideoConfig();
  const angle = (frame / durationInFrames) * Math.PI * 2;
  const reach = Math.max(width, height);

  const wash = (x: number, y: number, radius: number, rgb: string, alpha: number) =>
    `radial-gradient(circle ${radius}px at ${x}px ${y}px, rgba(${rgb}, ${alpha}) 0%, rgba(${rgb}, ${alpha * 0.45}) 38%, rgba(${rgb}, 0) 100%)`;

  return (
    <>
      <AbsoluteFill
        style={{
          backgroundColor: PAPER,
          backgroundImage: [
            wash(
              width * (0.2 + Math.cos(angle) * 0.06),
              height * (0.26 + Math.sin(angle) * 0.05),
              reach * 0.62,
              "47, 111, 98",
              0.065,
            ),
            wash(
              width * (0.86 + Math.cos(angle + Math.PI) * 0.06),
              height * (0.8 + Math.sin(angle + Math.PI) * 0.05),
              reach * 0.7,
              "23, 50, 77",
              0.045,
            ),
          ].join(", "),
        }}
      />
      {/* The same quiet document border the OG cards carry. */}
      <AbsoluteFill style={{ margin: inset, border: `2px solid ${INK_FAINT}` }} />
    </>
  );
};
