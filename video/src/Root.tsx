import React from "react";
import { Composition } from "remotion";
import { FPS, Format, LAYOUTS } from "./brand";
import { DawnGuide, guideTiming } from "./guide/DawnGuide";
import { FILM_SECONDS, ProductFilm } from "./film/ProductFilm";
import { DAWN_AD_SECONDS, DawnAd } from "./ad/DawnAd";
import { DawnAdHook, DawnShort, HOOKS, HookFormat, SHORT_FRAMES, hookAdFrames } from "./ad/DawnHook";
import queue from "./queue.json";

/**
 * One composition per guide per format. The queue is generated from
 * marketing/posts.json and the guides' own OG tags by
 * `node tool/social_video.mjs --sync`, so the studio and the renderer always
 * see the same reviewed copy — nothing here invents text.
 */
export const RemotionRoot: React.FC = () => (
  <>
    {/* The product film: one composition per cut, for the site and the reels. */}
    <Composition
      id="product-film-landscape"
      component={ProductFilm}
      durationInFrames={FILM_SECONDS * FPS}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ format: "landscape" as const }}
    />
    <Composition
      id="product-film-vertical"
      component={ProductFilm}
      durationInFrames={FILM_SECONDS * FPS}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ format: "vertical" as const }}
    />
    {/* "Some letters arrive at night": the dawn-print ad, all drawn. */}
    <Composition
      id="dawn-ad-vertical"
      component={DawnAd}
      durationInFrames={DAWN_AD_SECONDS * FPS}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ format: "vertical" as const }}
    />
    <Composition
      id="dawn-ad-landscape"
      component={DawnAd}
      durationInFrames={DAWN_AD_SECONDS * FPS}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ format: "landscape" as const }}
    />
    <Composition
      id="dawn-ad-feed"
      component={DawnAd}
      durationInFrames={DAWN_AD_SECONDS * FPS}
      fps={FPS}
      width={1080}
      height={1350}
      defaultProps={{ format: "feed" as const }}
    />
    {/* The Facebook angle test: a voiced hook per angle, then the ad, in
        9:16 for Reels and Stories and 4:5 for the Feed. */}
    {HOOKS.flatMap((hook) =>
      (["vertical", "feed"] as HookFormat[]).map((format) => (
        <Composition
          key={`${hook.id}-${format}`}
          id={`dawn-ad-${hook.id}-${format}`}
          component={DawnAdHook}
          durationInFrames={hookAdFrames(hook)}
          fps={FPS}
          width={1080}
          height={format === "feed" ? 1350 : 1920}
          defaultProps={{ hook: hook.id, format }}
        />
      )),
    )}
    {/* The same test cut to 15 seconds, the Feed's recommended length. */}
    {HOOKS.flatMap((hook) =>
      (["vertical", "feed"] as HookFormat[]).map((format) => (
        <Composition
          key={`short-${hook.id}-${format}`}
          id={`dawn-short-${hook.id}-${format}`}
          component={DawnShort}
          durationInFrames={SHORT_FRAMES}
          fps={FPS}
          width={1080}
          height={format === "feed" ? 1350 : 1920}
          defaultProps={{ hook: hook.id, format }}
        />
      )),
    )}
    {/* One post per guide per format, in the dawn-print style, each as
        long as its own narration needs. */}
    {queue.guides.flatMap((guide) =>
      (Object.keys(LAYOUTS) as Format[]).map((format) => (
        <Composition
          key={`${guide.id}-${format}`}
          id={`${guide.id}-${format}`}
          component={DawnGuide}
          durationInFrames={guideTiming(guide.voice ?? null).frames}
          fps={FPS}
          width={LAYOUTS[format].width}
          height={LAYOUTS[format].height}
          defaultProps={{
            format,
            title: guide.title,
            summary: guide.summary,
            voice: guide.voice ?? null,
            score: guide.score ?? "guide-voice/score-1.mp3",
          }}
        />
      )),
    )}
  </>
);
