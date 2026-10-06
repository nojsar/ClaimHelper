import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import {
  Format,
  INK,
  INK_FAINT,
  INK_SOFT,
  LAYOUTS,
  LETTER,
  MONO,
  NAVY,
  SANS,
  SERIF,
  TEAL,
  fitTitle,
} from "./brand";
import { Backdrop } from "./Backdrop";
import { T, glide, settle } from "./motion";
import { MaskLine, Reveal } from "./Reveal";
import { Stage } from "./Stage";
import { StepRail } from "./StepRail";
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
  const width = settle(frame, T.rule, 0.9);
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

/** The call to action, with one slow glint across it once the story lands. */
const Chip: React.FC<{ text: string; size: number }> = ({ text, size }) => {
  const frame = useCurrentFrame();
  const sweep = glide(frame, T.finale + 0.2, T.finale + 1.1);
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        fontFamily: MONO,
        fontWeight: 600,
        fontSize: size,
        letterSpacing: 1.2,
        color: LETTER,
        background: TEAL,
        borderRadius: 10,
        padding: `${size * 0.55}px ${size}px`,
      }}
    >
      {text}
      {sweep > 0 && sweep < 1 && (
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "45%",
            left: `${-50 + sweep * 160}%`,
            background:
              "linear-gradient(100deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)",
          }}
        />
      )}
    </div>
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
    <AbsoluteFill>
      <Backdrop inset={layout.padding / 2.6} />

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
        {/* Present from the very first frame, so no cover a network picks
            for itself can come out as an empty page. */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <BrandMark size={layout.markSize} />
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
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

        <Rule />

        <div>
          {heading.lines.map((line, index) => (
            <MaskLine
              key={line + index}
              at={T.title + index * T.titleStagger}
              style={{
                fontFamily: SERIF,
                fontWeight: 700,
                fontSize: heading.size,
                lineHeight: 1.1,
                color: INK,
                // Lines are measured to fit; nowrap keeps a sub-pixel
                // rounding difference from silently adding another line.
                whiteSpace: "nowrap",
              }}
            >
              {line}
            </MaskLine>
          ))}
        </div>

        {layout.showSummary && (
          <Reveal at={T.summary}>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 400,
                fontSize: layout.summary,
                lineHeight: 1.42,
                color: INK_SOFT,
                maxWidth: contentWidth * 0.96,
                textWrap: "pretty",
              }}
            >
              {summary}
            </div>
          </Reveal>
        )}

        <div style={{ flex: 1, minHeight: 0 }}>
          <Stage format={format} />
        </div>

        <StepRail
          steps={steps}
          width={contentWidth}
          dot={layout.railDot}
          label={layout.railLabel}
        />

        <Reveal at={T.footer} rise={10}>
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
            <Chip text={chip} size={layout.footer} />
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
