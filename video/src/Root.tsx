import React from "react";
import { Composition } from "remotion";
import { DURATION_IN_FRAMES, FPS, Format, LAYOUTS } from "./brand";
import { GuidePost } from "./GuidePost";
import { FILM_SECONDS, ProductFilm } from "./film/ProductFilm";
import { DAWN_AD_SECONDS, DawnAd } from "./ad/DawnAd";
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
    {queue.guides.flatMap((guide) =>
      (Object.keys(LAYOUTS) as Format[]).map((format) => (
        <Composition
          key={`${guide.id}-${format}`}
          id={`${guide.id}-${format}`}
          component={GuidePost}
          durationInFrames={DURATION_IN_FRAMES}
          fps={FPS}
          width={LAYOUTS[format].width}
          height={LAYOUTS[format].height}
          defaultProps={{
            format,
            title: guide.title,
            summary: guide.summary,
            kicker: queue.kicker,
            steps: queue.steps,
            url: queue.url,
            chip: queue.chip,
            music: guide.music ?? null,
          }}
        />
      )),
    )}
  </>
);
