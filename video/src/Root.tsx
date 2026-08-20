import React from "react";
import { Composition } from "remotion";
import { DURATION_IN_FRAMES, FPS, Format, LAYOUTS } from "./brand";
import { GuidePost } from "./GuidePost";
import queue from "./queue.json";

/**
 * One composition per guide per format. The queue is generated from
 * marketing/posts.json and the guides' own OG tags by
 * `node tool/social_video.mjs --sync`, so the studio and the renderer always
 * see the same reviewed copy — nothing here invents text.
 */
export const RemotionRoot: React.FC = () => (
  <>
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
          }}
        />
      )),
    )}
  </>
);
