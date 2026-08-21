import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import {
  Format,
  INK,
  INK_FAINT,
  INK_SOFT,
  LAYOUTS,
  LETTER,
  MONO,
  NAVY,
  PAPER,
  SANS,
  SERIF,
  TEAL,
  fitTitle,
} from "./brand";
import { Reveal } from "./Reveal";
import "./fonts";

export type GuidePostProps = {
  format: Format;
  /** The guide's own og:title. */
  title: string;
  /** The reviewed one-line social copy from marketing/posts.json. */
  summary: string;
  kicker: string;
  steps: string[];
  url: string;
  chip: string;
};

const BrandMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100">
    <rect width="100" height="100" rx="24" fill={TEAL} />
    <path
      d="M27 52 L44 68 L75 34"
      fill="none"
      stroke={LETTER}
      strokeWidth="9"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/** The hairline under the masthead draws itself in, left to right. */
const Rule: React.FC = () => {
  const frame = useCurrentFrame();
  const width = interpolate(frame, [8, 34], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        height: 2,
        background: INK_FAINT,
        transform: `scaleX(${width})`,
        transformOrigin: "left center",
      }}
    />
  );
};

/**
 * The rail connecting the step dots, drawing downward as each step lands. It is
 * the same device the guide pages use for their journey map, so a post and the
 * page it links to read as one system rather than two.
 */
const StepRail: React.FC<{ dot: number }> = ({ dot }) => {
  const frame = useCurrentFrame();
  const drawn = interpolate(frame, [104, 140], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        position: "absolute",
        left: dot / 2 - 1,
        top: dot,
        bottom: dot,
        width: 2,
        background: INK_FAINT,
        transform: `scaleY(${drawn})`,
        transformOrigin: "top center",
      }}
    />
  );
};

export const GuidePost: React.FC<GuidePostProps> = ({
  format,
  title,
  summary,
  kicker,
  steps,
  url,
  chip,
}) => {
  const layout = LAYOUTS[format];
  const contentWidth = layout.width - layout.padding * 2;
  const heading = fitTitle(title, contentWidth, layout);

  return (
    <AbsoluteFill style={{ backgroundColor: PAPER }}>
      {/* The same quiet document border the OG cards carry. */}
      <AbsoluteFill
        style={{
          margin: layout.padding / 2.6,
          border: `2px solid ${INK_FAINT}`,
        }}
      />

      <AbsoluteFill
        style={{
          padding: layout.padding,
          paddingTop: layout.padding + layout.safeTop,
          paddingBottom: layout.padding + layout.safeBottom,
          display: "flex",
          flexDirection: "column",
          gap: layout.gap,
        }}
      >
        <Reveal at={0} rise={0}>
          <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
            <BrandMark size={layout.markSize} />
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: layout.wordmark,
                  letterSpacing: 1.5,
                  color: INK,
                }}
              >
                GETMYYES
              </div>
              <div
                style={{
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: layout.kicker,
                  letterSpacing: 1.2,
                  color: TEAL,
                }}
              >
                {kicker}
              </div>
            </div>
          </div>
        </Reveal>

        <Rule />

        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: layout.gap,
          }}
        >
          <div>
            {heading.lines.map((line, index) => (
              <Reveal key={line + index} at={24 + index * 6}>
                <div
                  style={{
                    fontFamily: SERIF,
                    fontWeight: 700,
                    fontSize: heading.size,
                    lineHeight: 1.14,
                    color: INK,
                    // Lines are measured to fit; nowrap keeps a sub-pixel
                    // rounding difference from silently adding a fourth line.
                    whiteSpace: "nowrap",
                  }}
                >
                  {line}
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal at={66}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 400,
                fontSize: layout.summary,
                lineHeight: 1.44,
                color: INK_SOFT,
                maxWidth: contentWidth * 0.94,
              }}
            >
              {summary}
            </div>
          </Reveal>

          <div
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: layout.gap * 0.55,
            }}
          >
            <StepRail dot={layout.stepDot} />
            {steps.map((step, index) => (
              <Reveal key={step} at={100 + index * 12}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                  <div
                    style={{
                      position: "relative",
                      width: layout.stepDot,
                      height: layout.stepDot,
                      borderRadius: layout.stepDot,
                      background: TEAL,
                      color: LETTER,
                      fontFamily: SANS,
                      fontWeight: 700,
                      fontSize: layout.stepDot * 0.48,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    {index + 1}
                  </div>
                  <div
                    style={{
                      fontFamily: SANS,
                      fontWeight: 400,
                      fontSize: layout.step,
                      color: INK,
                    }}
                  >
                    {step}
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal at={150} rise={10}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
            }}
          >
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: layout.footer,
                letterSpacing: 0.6,
                color: NAVY,
                opacity: 0.75,
              }}
            >
              {url}
            </div>
            <div
              style={{
                fontFamily: MONO,
                fontWeight: 600,
                fontSize: layout.footer,
                letterSpacing: 1.2,
                color: LETTER,
                background: TEAL,
                borderRadius: 10,
                padding: `${layout.footer * 0.55}px ${layout.footer}px`,
              }}
            >
              {chip}
            </div>
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
