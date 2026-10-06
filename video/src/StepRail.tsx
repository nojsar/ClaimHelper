import React from "react";
import { useCurrentFrame } from "remotion";
import { INK, INK_FAINT, INK_SOFT, LETTER, SANS, TEAL } from "./brand";
import { T, glide, mix, pop, settle } from "./motion";

/**
 * The three reviewed steps as a progress rail. Each step lights as its act
 * plays above it, and is checked off as the next one starts, so the words and
 * the picture never disagree about where the story is.
 */

const ACTIVE = [T.act1, T.act2, T.act3];
const COMPLETE = [T.act2, T.act3, T.done];

export const StepRail: React.FC<{
  steps: string[];
  width: number;
  dot: number;
  label: number;
}> = ({ steps, width, dot, label }) => {
  const frame = useCurrentFrame();
  const appear = settle(frame, T.rail, 0.6);
  const column = width / steps.length;

  return (
    <div
      style={{
        position: "relative",
        display: "grid",
        gridTemplateColumns: `repeat(${steps.length}, 1fr)`,
        opacity: appear,
        transform: `translateY(${(1 - appear) * 14}px)`,
      }}
    >
      {steps.slice(0, -1).map((step, index) => {
        const fill = glide(frame, COMPLETE[index] - 0.45, COMPLETE[index] + 0.2);
        const left = (index + 0.5) * column + dot / 2 + 8;
        const span = column - dot - 16;
        return (
          <div
            key={`rail-${step}`}
            style={{
              position: "absolute",
              left,
              top: dot / 2 - 1.5,
              width: span,
              height: 3,
              borderRadius: 3,
              background: INK_FAINT,
              opacity: 0.55,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "100%",
                background: TEAL,
                transform: `scaleX(${fill})`,
                transformOrigin: "left center",
              }}
            />
          </div>
        );
      })}

      {steps.map((step, index) => {
        const active = pop(frame, ACTIVE[index]);
        const lit = settle(frame, ACTIVE[index], 0.5);
        const done = settle(frame, COMPLETE[index], 0.45);
        return (
          <div
            key={step}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: dot * 0.36,
            }}
          >
            <div
              style={{
                position: "relative",
                width: dot,
                height: dot,
                borderRadius: dot,
                border: `2px solid ${INK_FAINT}`,
                background: LETTER,
                boxSizing: "border-box",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: -2,
                  borderRadius: dot,
                  background: TEAL,
                  transform: `scale(${active})`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: -2,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: SANS,
                  fontWeight: 700,
                  fontSize: dot * 0.46,
                  color: lit > 0.5 ? LETTER : INK_SOFT,
                  opacity: 1 - done,
                }}
              >
                {index + 1}
              </div>
              <svg
                viewBox="-12 -12 24 24"
                style={{ position: "absolute", inset: -2, width: dot, height: dot }}
              >
                <path
                  d="M-5 0.5 L-1.5 4 L5.5 -3.5"
                  pathLength={1}
                  fill="none"
                  stroke={LETTER}
                  strokeWidth={2.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="1 1"
                  strokeDashoffset={1 - done}
                  opacity={done > 0.01 ? 1 : 0}
                />
              </svg>
            </div>
            <div
              style={{
                fontFamily: SANS,
                fontWeight: 500,
                fontSize: label,
                lineHeight: 1.3,
                color: INK,
                opacity: mix(0.42, 1, lit),
                textAlign: "center",
                textWrap: "balance",
                maxWidth: column - 16,
              }}
            >
              {step}
            </div>
          </div>
        );
      })}
    </div>
  );
};
