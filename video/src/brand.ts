/**
 * Brand tokens for the social videos, kept in step with tools/og-image.py and
 * the site's calm navy/teal system. Error red never appears in shared media —
 * see tool/trust_design_test.mjs, which guards the same rule elsewhere.
 */

export const PAPER = "#F6F8F7";
export const LETTER = "#FFFFFF";
export const INK = "#1F2B37";
export const INK_SOFT = "#4A5865";
export const INK_FAINT = "rgba(23, 50, 77, 0.32)";
export const NAVY = "#17324D";
export const NAVY_DARK = "#10263B";
export const TEAL = "#2F6F62";

export const SERIF = "Tinos";
export const SANS = "Inter";
export const MONO = "IBM Plex Mono";

export const FPS = 60;
export const DURATION_IN_FRAMES = 12 * FPS; // long enough to play the three acts and hold the card

export type Format = "square" | "vertical";

export type Layout = {
  width: number;
  height: number;
  padding: number;
  /** Extra inset for the app chrome a full-screen player draws over. */
  safeTop: number;
  safeBottom: number;
  markSize: number;
  wordmark: number;
  kicker: number;
  /** Title sizes tried largest-first, exactly like og-image.py's fit_title. */
  titleSizes: number[];
  titleMaxLines: number;
  /**
   * The square cut leaves the one-liner to the post text it always travels
   * with, so the illustration gets the room; the reel has height to spare.
   */
  showSummary: boolean;
  summary: number;
  railDot: number;
  railLabel: number;
  footer: number;
  gap: number;
};

export const LAYOUTS: Record<Format, Layout> = {
  square: {
    width: 1080,
    height: 1080,
    padding: 72,
    safeTop: 0,
    safeBottom: 0,
    markSize: 60,
    wordmark: 28,
    kicker: 19,
    titleSizes: [64, 58, 54, 50, 46],
    titleMaxLines: 3,
    showSummary: false,
    summary: 28,
    railDot: 34,
    railLabel: 21,
    footer: 23,
    gap: 26,
  },
  vertical: {
    width: 1080,
    height: 1920,
    padding: 84,
    // Reels and Stories put the account row near the top and the caption,
    // audio, and action rail across the bottom; nothing readable goes there.
    safeTop: 40,
    safeBottom: 230,
    markSize: 76,
    wordmark: 34,
    kicker: 23,
    titleSizes: [84, 78, 72, 66, 60],
    titleMaxLines: 4,
    showSummary: true,
    summary: 32,
    railDot: 42,
    railLabel: 25,
    footer: 27,
    gap: 44,
  },
};

/**
 * Titles are measured for real, against the loaded face, so a line can never
 * reflow inside its own box and turn a three-line heading into four. The
 * canvas is only unavailable in a non-browser environment, where a coarse
 * estimate is good enough to keep the module importable.
 */
const FALLBACK_RATIO = 0.54;

let context: CanvasRenderingContext2D | null | undefined;

function measurer(): CanvasRenderingContext2D | null {
  if (context === undefined) {
    context =
      typeof document === "undefined"
        ? null
        : document.createElement("canvas").getContext("2d");
  }
  return context;
}

function widthOf(text: string, size: number): number {
  const canvas = measurer();
  if (!canvas) return text.length * size * FALLBACK_RATIO;
  canvas.font = `700 ${size}px "${SERIF}"`;
  return canvas.measureText(text).width;
}

function wrap(text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const probe = line ? `${line} ${word}` : word;
    if (widthOf(probe, size) <= maxWidth) {
      line = probe;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Largest title size from the ladder that wraps within the allowed lines. */
export function fitTitle(
  text: string,
  maxWidth: number,
  layout: Layout,
): { size: number; lines: string[] } {
  for (const size of layout.titleSizes) {
    const lines = wrap(text, maxWidth, size);
    if (lines.length <= layout.titleMaxLines) return { size, lines };
  }
  const size = layout.titleSizes[layout.titleSizes.length - 1];
  return { size, lines: wrap(text, maxWidth, size).slice(0, layout.titleMaxLines) };
}
