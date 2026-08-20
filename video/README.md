# Social videos (Remotion)

The marketing autopilot's post media is rendered here. One composition,
`GuidePost`, is registered twice per guide — `<id>-square` (1080x1080) and
`<id>-vertical` (1080x1920) — plus a still poster taken from the last frame.

Nothing in this folder invents copy. Every string comes from the guide library:
the headline is the guide page's own `og:title`, the body line is the reviewed
one-liner in `marketing/posts.json`, and the four fixed lines (kicker, steps,
URL, chip) live in `STATIC_COPY` in `tool/social_video.mjs`. `src/queue.json`
and `public/fonts/` are generated from those sources and are not committed.

## Commands

```bash
npm --prefix video install          # once
node tool/render_social_video.mjs   # render whatever is out of date
node tool/render_social_video.mjs --only er-denial --force
node tool/render_social_video.mjs --format vertical
npm --prefix video run studio       # visual editor at localhost:3000
npm --prefix video run typecheck
```

Output goes to `web/media/social/` and is committed, so publishing never
depends on a render succeeding at post time. Because Instagram and Facebook
fetch the file from the live site, **hosting has to be deployed before the next
posting slot** for a new render to be used; until then the posters fall back
(see `tool/post_instagram.mjs`).

## Notes

- Remotion renders in a headless Chrome it downloads into
  `video/node_modules/.remotion`. If that download is blocked, point at an
  existing binary: `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome-headless-shell`.
- Fonts are the repo's own files from `assets/fonts`, copied in by
  `node tool/social_video.mjs --sync`. Nothing is fetched from a font CDN.
- The brand tokens in `src/brand.ts` mirror `tools/og-image.py`. Keep the media
  calm: navy, teal, paper, no error red, no dramatic motion — the same rule
  `tool/trust_design_test.mjs` enforces on the product surfaces.
- Remotion is free for individuals and companies of up to three people, and
  needs a paid company licence beyond that. See https://remotion.dev/license.
