import React, { useLayoutEffect, useRef, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame, useVideoConfig } from "remotion";
import { NAVY_DARK, SERIF } from "../brand";
import { clamp01, glide, settle } from "../motion";
import { DAWN_FRAG, DAWN_VERT } from "./dawnShader";

/**
 * The dawn-print kit shared by the ad and the guide posts: the homepage's
 * shader sky drawn per frame, a few stars, type that rises out of its own
 * mask, labels printed on paper strips, and the paper plane. One kit, so
 * every film and post looks like the site.
 */

export const CREAM = "#FFF7EA";
export const PAPER = "#FFFDF7";
export const MINT = "#A9DED2";

/* ------------------------------------------------------------- the sky */

type Uniforms = Record<string, WebGLUniformLocation | null>;

/** The homepage's dawn print, drawn once per frame at the video's size. */
export const DawnSky: React.FC<{ night: number; rise: number; hz: number; sunX: number; px: number }> = ({ night, rise, hz, sunX, px }) => {
  const frame = useCurrentFrame();
  const { width, height, fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const gl = useRef<{ ctx: WebGLRenderingContext; u: Uniforms } | null>(null);
  const [handle] = useState(() => delayRender("Compiling the dawn sky"));

  useLayoutEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("webgl", { preserveDrawingBuffer: true, antialias: false, alpha: false }) ?? null;
    if (ctx) {
      const shader = (type: number, src: string) => {
        const s = ctx.createShader(type)!;
        ctx.shaderSource(s, src);
        ctx.compileShader(s);
        return s;
      };
      const prog = ctx.createProgram()!;
      ctx.attachShader(prog, shader(ctx.VERTEX_SHADER, DAWN_VERT));
      ctx.attachShader(prog, shader(ctx.FRAGMENT_SHADER, DAWN_FRAG));
      ctx.linkProgram(prog);
      ctx.useProgram(prog);
      const buf = ctx.createBuffer();
      ctx.bindBuffer(ctx.ARRAY_BUFFER, buf);
      ctx.bufferData(ctx.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), ctx.STATIC_DRAW);
      const loc = ctx.getAttribLocation(prog, "p");
      ctx.enableVertexAttribArray(loc);
      ctx.vertexAttribPointer(loc, 2, ctx.FLOAT, false, 0, 0);
      const u: Uniforms = {};
      for (const name of ["uRes", "uPx", "uVH", "uTime", "uRise", "uNight", "uHz", "uSunX"]) u[name] = ctx.getUniformLocation(prog, name);
      gl.current = { ctx, u };
    }
    continueRender(handle);
  }, [handle]);

  useLayoutEffect(() => {
    if (!gl.current) return;
    const { ctx, u } = gl.current;
    ctx.viewport(0, 0, width, height);
    ctx.uniform2f(u.uRes, width, height);
    ctx.uniform1f(u.uPx, px);
    ctx.uniform1f(u.uVH, height / px);
    ctx.uniform1f(u.uTime, 30 + frame / fps);
    ctx.uniform1f(u.uRise, rise);
    ctx.uniform1f(u.uNight, night);
    ctx.uniform1f(u.uHz, hz);
    ctx.uniform1f(u.uSunX, sunX);
    ctx.drawArrays(ctx.TRIANGLES, 0, 3);
    ctx.finish();
  });

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", background: "linear-gradient(180deg, #0D1726, #2E3349 70%, #091420)" }}
    />
  );
};

/** A few stars over the night sky, fading as the dawn comes. */
export const Stars: React.FC<{ night: number }> = ({ night }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const stars = [
    [0.12, 0.08], [0.24, 0.16], [0.4, 0.05], [0.58, 0.12], [0.71, 0.07], [0.86, 0.15], [0.33, 0.26], [0.92, 0.3], [0.07, 0.34], [0.64, 0.22], [0.5, 0.31], [0.18, 0.45],
  ];
  return (
    <AbsoluteFill style={{ opacity: clamp01((night - 0.35) / 0.5) }}>
      {stars.map(([x, y], i) => {
        const tw = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(frame / 60 * (1.1 + i * 0.29) + i * 1.7));
        const r = (i % 3 === 0 ? 2.6 : 1.8) * (height / 1080);
        return <div key={i} style={{ position: "absolute", left: x * width, top: y * height * 0.62, width: r * 2, height: r * 2, borderRadius: 99, background: "#FFF3D6", opacity: tw, boxShadow: `0 0 ${r * 4}px rgba(255,236,200,0.7)` }} />;
      })}
    </AbsoluteFill>
  );
};

/** Lines of type that rise out of their own masks, as on the homepage. */
export const Rise: React.FC<{ lines: string[]; at: number; out?: number; size: number; color: string; font?: string; weight?: number; style?: React.CSSProperties; align?: "left" | "center" }> = ({
  lines,
  at,
  out,
  size,
  color,
  font = SERIF,
  weight = 700,
  style,
  align = "left",
}) => {
  const frame = useCurrentFrame();
  const fade = out ? 1 - glide(frame, out - 0.35, out) : 1;
  if (fade <= 0) return null;
  return (
    <div style={{ position: "absolute", textAlign: align, opacity: fade, ...style }}>
      {lines.map((line, i) => {
        const p = settle(frame, at + i * 0.14, 0.9);
        return (
          <div
            key={line}
            style={{
              fontFamily: font,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1.08,
              letterSpacing: font === SERIF ? "-0.015em" : undefined,
              color,
              // Fully risen, the mask opens below the line so a text shadow is not cut.
              clipPath: `inset(-20% -5% ${(1 - p) * 120 - 20}% -5%)`,
              transform: `translateY(${(1 - p) * size * 0.55}px)`,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

/** A label printed on a strip of paper: readable on any part of the sky. */
export const Strip: React.FC<{ text: string; at: number; out?: number; size: number; style?: React.CSSProperties }> = ({ text, at, out, size, style }) => {
  const frame = useCurrentFrame();
  const p = settle(frame, at, 0.8);
  const fade = out ? 1 - glide(frame, out - 0.3, out) : 1;
  if (p <= 0.001 || fade <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        padding: `${size * 0.32}px ${size * 0.62}px`,
        background: PAPER,
        color: NAVY_DARK,
        fontFamily: SERIF,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.1,
        boxShadow: "0 18px 40px -22px rgba(0,0,0,0.65)",
        clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
        transform: `rotate(-1.2deg)`,
        opacity: fade,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {text}
    </div>
  );
};

/** The paper plane, folded from the same paper (three facets). */
export const Plane: React.FC<{ w: number }> = ({ w }) => (
  <svg width={w} height={w * (200 / 300)} viewBox="0 0 300 200" style={{ overflow: "visible", filter: "drop-shadow(0 20px 26px rgba(0,0,0,0.45))" }}>
    <path d="M138 118 L292 18 L196 150 Z" fill="#E7DCC8" />
    <path d="M138 118 L292 18 L176 128 Z" fill={PAPER} />
    <path d="M176 128 L292 18 L206 176 L190 140 Z" fill="#F2E8D6" />
    <path d="M190 140 L206 176 L176 128 Z" fill="#CDBD9F" />
    <path d="M138 118 L176 128 L292 18" fill="none" stroke="#DCCDB4" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);


export const bez = (t: number, p0: number, p1: number, p2: number, p3: number) =>
  (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3;
