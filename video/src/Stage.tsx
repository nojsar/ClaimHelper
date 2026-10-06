import React from "react";
import { Easing, useCurrentFrame } from "remotion";
import { Format, INK, LETTER, NAVY, TEAL } from "./brand";
import { T, clamp01, drop, f, glide, glideFrames, mix, pop, settle } from "./motion";

/**
 * The illustration: a wordless three-act story drawn in one SVG that scales to
 * whatever room each format leaves. The pieces and the timing are shared; only
 * where things stand differs, because a reel's free space is far less wide.
 *
 * Nothing in it is text. The letter and the summary are skeleton lines, the
 * next steps are icons, and every mark is in the brand's teal and navy. There
 * is no stamp and no verdict: the story is "understand it, then act", never
 * "approved".
 */

type Spot = { x: number; y: number; s: number; r: number };

/**
 * Where everything stands, per format. `view` frames only the region any act
 * ever uses, so the drawing is as large as the format's free space allows.
 */
type Geometry = {
  view: string;
  /** Act 1: the letter, centred and read. It drops in from `dropFrom` above. */
  letter: Spot;
  dropFrom: number;
  /** Act 2: moved aside for the summary. */
  letterAside: Spot;
  /** Act 3: set back, half faded, as the source the summary came from. */
  letterBack: Spot;
  cardFrom: { x: number; y: number };
  card: { x: number; y: number };
  cardBack: { x: number; y: number };
  /** Act 3: the branches leave the card here and fan out to the nodes. */
  port: { x: number; y: number };
  nodeX: number;
  nodeYs: number[];
};

const GEOMETRY: Record<Format, Geometry> = {
  // Wide: the three acts read left to right.
  square: {
    view: "40 36 820 368",
    letter: { x: 450, y: 220, s: 1, r: -2.5 },
    dropFrom: 102,
    letterAside: { x: 236, y: 220, s: 0.86, r: -4 },
    letterBack: { x: 143, y: 230, s: 0.66, r: -6 },
    cardFrom: { x: 680, y: 220 },
    card: { x: 615, y: 220 },
    cardBack: { x: 385, y: 220 },
    port: { x: 535, y: 220 },
    nodeX: 785,
    nodeYs: [92, 220, 348],
  },
  // Compact: side by side, then the letter tucks behind the summary like a
  // stack of papers and the branches fan out close.
  vertical: {
    view: "36 30 600 430",
    letter: { x: 330, y: 245, s: 1.2, r: -2.5 },
    dropFrom: 100,
    letterAside: { x: 165, y: 245, s: 0.95, r: -4 },
    letterBack: { x: 150, y: 215, s: 0.78, r: -7 },
    cardFrom: { x: 540, y: 245 },
    card: { x: 470, y: 245 },
    cardBack: { x: 245, y: 255 },
    port: { x: 395, y: 255 },
    nodeX: 575,
    nodeYs: [115, 255, 395],
  },
};

const LETTER_W = 230;
const LETTER_H = 300;
const CARD_W = 300;
const CARD_H = 230;

const HAIRLINE = "rgba(23, 50, 77, 0.10)";
const SKELETON = "rgba(31, 43, 55, 0.16)";

type Pose = { x: number; y: number; r: number; s: number; o: number };

/** A local point on a posed sheet, in stage coordinates. */
function toStage(pose: Pose, w: number, h: number, lx: number, ly: number) {
  const dx = (lx - w / 2) * pose.s;
  const dy = (ly - h / 2) * pose.s;
  const rad = (pose.r * Math.PI) / 180;
  return {
    x: pose.x + dx * Math.cos(rad) - dy * Math.sin(rad),
    y: pose.y + dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

const poseTransform = (pose: Pose, w: number, h: number) =>
  `translate(${pose.x} ${pose.y}) rotate(${pose.r}) scale(${pose.s}) translate(${-w / 2} ${-h / 2})`;

/** Act 1 -> act 2 -> act 3, each leg a spring from the last resting spot. */
function letterPose(frame: number, g: Geometry): Pose {
  const enter = drop(frame, T.letterIn);
  const aside = settle(frame, T.letterAside, 0.9);
  const back = settle(frame, T.regroup, 0.9);
  const leg = (key: keyof Spot) => mix(mix(g.letter[key], g.letterAside[key], aside), g.letterBack[key], back);
  return {
    x: leg("x"),
    y: leg("y") - (1 - enter) * g.dropFrom,
    r: leg("r") - (1 - enter) * 6.5,
    s: leg("s"),
    o: clamp01(glide(frame, T.letterIn, T.letterIn + 0.3)) * mix(1, 0.5, back),
  };
}

function cardPose(frame: number, g: Geometry): Pose {
  const enter = settle(frame, T.cardIn, 0.85);
  const back = settle(frame, T.regroup, 0.9);
  return {
    x: mix(mix(g.cardFrom.x, g.card.x, enter), g.cardBack.x, back),
    y: mix(mix(g.cardFrom.y, g.card.y, enter), g.cardBack.y, back),
    r: 0,
    s: 1,
    o: enter,
  };
}

/* ------------------------------------------------------------------ letter */

const LETTER_LINES: { y: number; w: number; mark?: number }[] = [
  { y: 76, w: 196 },
  { y: 92, w: 184 },
  { y: 108, w: 192 },
  { y: 124, w: 128 },
  { y: 150, w: 190, mark: 0 },
  { y: 166, w: 168, mark: 1 },
  { y: 182, w: 194 },
  { y: 198, w: 104 },
  { y: 224, w: 196 },
  { y: 240, w: 150 },
];

const MARKED = LETTER_LINES.filter((line) => line.mark !== undefined);

const scanY = (frame: number) => mix(-8, LETTER_H + 8, glide(frame, T.scanFrom, T.scanTo));

/** The frame the scan line crosses a given height: highlights follow the scan. */
function crossing(y: number): number {
  for (let frame = f(T.scanFrom); frame <= f(T.scanTo); frame += 1) {
    if (scanY(frame) >= y) return frame;
  }
  return f(T.scanTo);
}
const MARK_AT = MARKED.map((line) => crossing(line.y));

const Letter: React.FC<{ frame: number; pose: Pose }> = ({ frame, pose }) => {
  const bracketsIn = settle(frame, T.brackets, 0.55);
  const bracketsOut = glide(frame, T.bracketsOut, T.bracketsOut + 0.35);
  const bracketScale = mix(1.14, 1, bracketsIn);
  const scanning = frame >= f(T.scanFrom) && frame <= f(T.scanTo);
  const y = scanY(frame);
  const scanProgress = glide(frame, T.scanFrom, T.scanTo);
  const scanOpacity = clamp01(Math.min(scanProgress, 1 - scanProgress) * 8);

  return (
    <g transform={poseTransform(pose, LETTER_W, LETTER_H)} opacity={pose.o}>
      <rect
        width={LETTER_W}
        height={LETTER_H}
        rx={8}
        fill={LETTER}
        stroke={HAIRLINE}
        strokeWidth={1.5}
        filter="url(#sheet-shadow)"
      />
      {/* Letterhead: an insurer's mark, a return address, the date. */}
      <rect x={18} y={20} width={58} height={14} rx={3} fill={NAVY} opacity={0.78} />
      <rect x={84} y={21} width={46} height={5} rx={2.5} fill={SKELETON} />
      <rect x={84} y={30} width={32} height={4} rx={2} fill={SKELETON} />
      <rect x={172} y={22} width={40} height={6} rx={3} fill={SKELETON} />
      <rect x={18} y={50} width={118} height={9} rx={4.5} fill={INK} opacity={0.5} />

      {MARKED.map((line, index) =>
        // Once its copy lifts off, the highlight is gone from the page: the
        // flying bar IS this highlight, so the two never overlap.
        frame >= f(T.fly + index * T.flyStagger) ? null : (
        <rect
          key={`mark-${line.y}`}
          x={14}
          y={line.y - 7}
          width={line.w + 8}
          height={14}
          rx={4}
          fill={TEAL}
          opacity={0.22}
          transform={`translate(14 0) scale(${glideFrames(frame, MARK_AT[index], MARK_AT[index] + f(0.35))} 1) translate(-14 0)`}
        />
        ),
      )}
      {LETTER_LINES.map((line) => (
        <rect
          key={line.y}
          x={18}
          y={line.y - 3.5}
          width={line.w}
          height={7}
          rx={3.5}
          fill={line.mark === undefined ? SKELETON : "rgba(31, 43, 55, 0.30)"}
        />
      ))}
      <path
        d="M18 272 c 8 -13 15 5 23 -4 s 11 -10 19 2 s 13 2 21 -6"
        fill="none"
        stroke={INK}
        strokeOpacity={0.4}
        strokeWidth={2}
        strokeLinecap="round"
      />
      <rect x={18} y={282} width={70} height={5} rx={2.5} fill={SKELETON} />

      {/* Act 1: framed like a phone photo, then read top to bottom. */}
      <g
        transform={`translate(${LETTER_W / 2} ${LETTER_H / 2}) scale(${bracketScale}) translate(${-LETTER_W / 2} ${-LETTER_H / 2})`}
        opacity={bracketsIn * (1 - bracketsOut)}
        fill="none"
        stroke={TEAL}
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M-16 18 V-16 H18" />
        <path d={`M${LETTER_W - 18} -16 H${LETTER_W + 16} V18`} />
        <path d={`M-16 ${LETTER_H - 18} V${LETTER_H + 16} H18`} />
        <path d={`M${LETTER_W - 18} ${LETTER_H + 16} H${LETTER_W + 16} V${LETTER_H - 18}`} />
      </g>
      {scanning && (
        <g opacity={scanOpacity}>
          <rect
            x={0}
            y={y - 54}
            width={LETTER_W}
            height={54}
            fill="url(#scan-glow)"
            clipPath="url(#letter-clip)"
          />
          <path
            d={`M-12 ${y} H${LETTER_W + 12}`}
            stroke={TEAL}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </g>
      )}
    </g>
  );
};

/* -------------------------------------------------------------------- card */

const ROWS = [84, 136, 188];
const ROW_BAR = [178, 152, 196];
const ROW_SUB = [132, 168, 116];

const Card: React.FC<{ frame: number; pose: Pose }> = ({ frame, pose }) => (
  <g transform={poseTransform(pose, CARD_W, CARD_H)} opacity={pose.o}>
    <rect
      width={CARD_W}
      height={CARD_H}
      rx={14}
      fill={LETTER}
      stroke={HAIRLINE}
      strokeWidth={1.5}
      filter="url(#card-shadow)"
    />
    <circle cx={30} cy={30} r={7} fill={TEAL} />
    <rect x={46} y={25} width={92} height={10} rx={5} fill={INK} opacity={0.55} />
    <rect x={216} y={21} width={62} height={18} rx={9} fill={TEAL} opacity={0.14} />
    <path d="M22 54 H278" stroke={HAIRLINE} strokeWidth={1.5} />

    {ROWS.map((rowY, index) => {
      const at = T.checks + index * T.checkStagger;
      const check = pop(frame, at);
      const sub = settle(frame, at + 0.1, 0.5);
      const grow = index === 2 ? settle(frame, at - 0.3, 0.6) : 0;
      return (
        <g key={rowY}>
          <circle cx={36} cy={rowY} r={13} fill={LETTER} stroke={INK} strokeOpacity={0.2} strokeWidth={2} />
          <g transform={`translate(36 ${rowY}) scale(${check})`}>
            <circle r={13} fill={TEAL} />
            <path
              d="M-5.5 0.5 L-1.5 4.5 L6 -4"
              fill="none"
              stroke={LETTER}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
          {index === 2 && (
            <rect
              x={58}
              y={rowY - 10}
              width={ROW_BAR[index] * grow}
              height={11}
              rx={5.5}
              fill={INK}
              opacity={0.5}
            />
          )}
          <rect
            x={58}
            y={rowY + 8}
            width={ROW_SUB[index]}
            height={7}
            rx={3.5}
            fill={SKELETON}
            opacity={sub}
          />
        </g>
      );
    })}
  </g>
);

/**
 * Act 2's one piece of magic: the two highlighted lines lift off the letter
 * and land as the first two rows of the summary. Both ends are recomputed from
 * the live poses, so a landed line rides along when the card moves in act 3.
 */
const FlyingLines: React.FC<{ frame: number; letter: Pose; card: Pose }> = ({ frame, letter, card }) => (
  <>
    {MARKED.map((line, index) => {
      const at = T.fly + index * T.flyStagger;
      if (frame < f(at)) return null;
      const p = settle(frame, at, T.flySeconds);
      const from = toStage(letter, LETTER_W, LETTER_H, 14, line.y);
      const to = toStage(card, CARD_W, CARD_H, 58, ROWS[index] - 4.5);
      const lift = Math.sin(Math.PI * p) * 46;
      const width = mix((line.w + 8) * letter.s, ROW_BAR[index], p);
      const height = mix(14 * letter.s, 11, p);
      return (
        <g
          key={line.y}
          transform={`translate(${mix(from.x, to.x, p)} ${mix(from.y, to.y, p) - lift}) rotate(${mix(letter.r, 0, p)})`}
        >
          <rect
            y={-height / 2 + 9}
            width={width}
            height={height}
            rx={mix(4, 5.5, p)}
            fill={TEAL}
            opacity={0.28 * Math.sin(Math.PI * p)}
            filter="url(#lift-blur)"
          />
          <rect
            y={-height / 2}
            width={width}
            height={height}
            rx={mix(4, 5.5, p)}
            fill={TEAL}
            opacity={mix(0.22, 0.92, p)}
          />
        </g>
      );
    })}
  </>
);

/* ------------------------------------------------------------- next steps */

const ICONS = ["letter", "deadline", "review"] as const;
const NODE_R = 46;

type Curve = ReturnType<typeof curve>;

/** One branch: leaves the port level, turns, and arrives level at its node. */
function curve(g: Geometry, y: number) {
  const p3 = { x: g.nodeX - NODE_R - 2, y };
  const run = p3.x - g.port.x;
  const p0 = g.port;
  const p1 = { x: g.port.x + run * 0.36, y: g.port.y };
  const p2 = { x: g.port.x + run * 0.44, y };
  return { p0, p1, p2, p3, d: `M${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}` };
}

function bezier(c: Curve, t: number) {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const d = 3 * u * t * t;
  const e = t * t * t;
  return {
    x: a * c.p0.x + b * c.p1.x + d * c.p2.x + e * c.p3.x,
    y: a * c.p0.y + b * c.p1.y + d * c.p2.y + e * c.p3.y,
  };
}

/** An appeal letter, a deadline, an independent review. Line icons, no words. */
const Icon: React.FC<{ kind: (typeof ICONS)[number] }> = ({ kind }) => {
  const stroke = {
    fill: "none",
    stroke: NAVY,
    strokeWidth: 3.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (kind === "letter") {
    return (
      <g {...stroke}>
        <path d="M-13 -17 H6 L13 -10 V17 H-13 Z" />
        <path d="M6 -17 V-10 H13" />
        <path d="M-7 -2 H7 M-7 5 H7 M-7 12 H2" />
      </g>
    );
  }
  if (kind === "deadline") {
    return (
      <g>
        <g {...stroke}>
          <rect x={-16} y={-13} width={32} height={29} rx={4} />
          <path d="M-16 -4 H16 M-8 -18 V-9 M8 -18 V-9" />
        </g>
        <rect x={1} y={3} width={9} height={8} rx={2} fill={TEAL} />
      </g>
    );
  }
  return (
    <g {...stroke}>
      <path d="M0 -15 V15 M-10 15 H10 M-17 -9 H17" />
      <path d="M-17 -9 L-22 4 M-17 -9 L-12 4 M-23 4 Q-17 11 -11 4" />
      <path d="M17 -9 L12 4 M17 -9 L22 4 M11 4 Q17 11 23 4" />
    </g>
  );
};

const NextSteps: React.FC<{ frame: number; g: Geometry }> = ({ frame, g }) => {
  const curves = g.nodeYs.map((y) => curve(g, y));
  const portIn = pop(frame, T.paths - 0.05);
  const flowIn = glide(frame, T.finale, T.finale + 0.6);
  // One gentle trip along each branch per 1.6s through the hold.
  const flow = ((frame - f(T.finale)) / f(1.6)) % 1;

  return (
    <g>
      {curves.map((c, index) => {
        const drawn = glide(
          frame,
          T.paths + index * T.pathStagger,
          T.paths + index * T.pathStagger + T.pathSeconds,
        );
        // A zero-length dash with round caps still paints a dot, so an undrawn
        // branch is left out entirely rather than drawn at length zero.
        if (drawn <= 0) return null;
        return (
          <g key={c.d}>
            <path
              d={c.d}
              pathLength={1}
              fill="none"
              stroke={TEAL}
              strokeOpacity={0.5}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="1 1"
              strokeDashoffset={1 - drawn}
            />
            {flowIn > 0 && (
              <path
                d={c.d}
                pathLength={1}
                fill="none"
                stroke={TEAL}
                strokeWidth={4}
                strokeLinecap="round"
                strokeDasharray="0.07 0.93"
                strokeDashoffset={-((flow + index * 0.18) % 1)}
                opacity={flowIn}
              />
            )}
          </g>
        );
      })}
      <circle cx={g.port.x} cy={g.port.y} r={7 * portIn} fill={TEAL} />

      {ICONS.map((icon, index) => {
        const c = curves[index];
        const nodeY = g.nodeYs[index];
        const start = T.pulses + index * T.pulseStagger;
        const t = glide(frame, start, start + T.pulseSeconds, Easing.inOut(Easing.quad));
        const travelling = t > 0 && t < 1;
        const appear = pop(frame, T.nodes + index * T.nodeStagger);
        const arrived = settle(frame, start + T.pulseSeconds, 0.45);
        const ping = glide(frame, start + T.pulseSeconds, start + T.pulseSeconds + 0.7, Easing.out(Easing.cubic));

        return (
          <g key={icon}>
            {travelling &&
              [0, 0.035, 0.07].map((lag, trail) => {
                const point = bezier(c, Math.max(0, t - lag));
                return (
                  <circle
                    key={lag}
                    cx={point.x}
                    cy={point.y}
                    r={7 - trail * 1.6}
                    fill={TEAL}
                    opacity={(1 - trail * 0.35) * clamp01(Math.min(t, 1 - t) * 10)}
                  />
                );
              })}
            {ping > 0 && ping < 1 && (
              <circle
                cx={g.nodeX}
                cy={nodeY}
                r={NODE_R + ping * 20}
                fill="none"
                stroke={TEAL}
                strokeWidth={2}
                opacity={(1 - ping) * 0.5}
              />
            )}
            <g transform={`translate(${g.nodeX} ${nodeY}) scale(${appear})`}>
              <circle
                r={NODE_R}
                fill={LETTER}
                stroke={TEAL}
                strokeOpacity={mix(0.28, 1, arrived)}
                strokeWidth={mix(2, 3.5, arrived)}
                filter="url(#card-shadow)"
              />
              <Icon kind={icon} />
            </g>
          </g>
        );
      })}
    </g>
  );
};

/* ------------------------------------------------------------------- stage */

export const Stage: React.FC<{ format: Format }> = ({ format }) => {
  const frame = useCurrentFrame();
  const g = GEOMETRY[format];
  const letter = letterPose(frame, g);
  const card = cardPose(frame, g);

  return (
    <svg
      viewBox={g.view}
      width="100%"
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "visible", display: "block" }}
    >
      <defs>
        {/* Shadows tinted with the brand navy, never neutral black. */}
        <filter id="sheet-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx={0} dy={14} stdDeviation={16} floodColor={NAVY} floodOpacity={0.13} />
        </filter>
        <filter id="card-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx={0} dy={10} stdDeviation={12} floodColor={NAVY} floodOpacity={0.12} />
        </filter>
        <filter id="lift-blur" x="-20%" y="-300%" width="140%" height="700%">
          <feGaussianBlur stdDeviation={6} />
        </filter>
        <linearGradient id="scan-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={TEAL} stopOpacity={0} />
          <stop offset="1" stopColor={TEAL} stopOpacity={0.2} />
        </linearGradient>
        <clipPath id="letter-clip">
          <rect width={LETTER_W} height={LETTER_H} rx={8} />
        </clipPath>
      </defs>

      {frame >= f(T.regroup) && <NextSteps frame={frame} g={g} />}
      <Letter frame={frame} pose={letter} />
      {frame >= f(T.cardIn) && <Card frame={frame} pose={card} />}
      <FlyingLines frame={frame} letter={letter} card={card} />
    </svg>
  );
};
