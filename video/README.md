# Social videos (Remotion)

The marketing autopilot's post media is rendered here, along with the product
film (`--film`) and the dawn ad (`--dawn-ad`) that the homepage plays. One
composition, `DawnGuide` (`src/guide/DawnGuide.tsx`), is registered twice per
guide: `<id>-square` (1080x1080) and `<id>-vertical` (1080x1920). A still
poster comes with it.

Nothing in this folder invents copy. Every string comes from the guide library:
the headline is the guide page's own `og:title`, the body line is the reviewed
one-liner in `marketing/posts.json`, and the fixed lines live in `STATIC_COPY`
in `tool/social_video.mjs`. The voice-over reads the same words
(`library/guide-voice/scripts.json`). `src/queue.json` and `public/` are
generated from those sources and are not committed.

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
- **Each guide video is the homepage's dawn print, narrated** (about 15
  seconds at 60fps). Night: the title rises. A letter falls and unfolds while
  the plain-English lens prints the summary line by line. The letter folds
  into a paper plane that flies off as the sun comes up, then the end card.
  `guideTiming(voice)` places every scene on the voice-over, so the length
  follows the take. The print parts (sky, stars, rising type, plane) are
  shared with the dawn ad in `src/ad/paper.tsx`.
- **Voice and score.** One ElevenLabs take per guide lives in
  `library/guide-voice/<id>.mp3` (logged in `takes.json`).
  `tool/guide_voice.mjs` cuts each take into its three lines; the render
  runs it first. The score is one of four passages of Mixkit's "Daniel &
  Me" (`score.json`). It is ducked 18 dB under the voice and 12 dB in the
  gaps, so it stays quiet. A guide without a take renders on fixed timing
  with no voice. Motion stays calm: no shake, flash, or zoom punch, no
  stamp, and no "approved". Check new motion as stills at key seconds
  before rendering every guide.
- Frame 0 is the night sky before the title rises, so a network left to pick
  its own cover can come out nearly empty. The poster is taken at 2.2s, with
  the title up, and rendered with `cover: true`, which leaves out the letter
  that is crossing the title at that moment. It is passed explicitly as the cover
  (`cover_url` on Instagram, `thumbnail` on Mastodon). Facebook's `/videos`
  only takes `thumb` as multipart binary, not a URL, so it still picks its
  own; change that call to multipart if it ever matters.
- Frames are handed to the encoder as **PNG at CRF 16**, not JPEG. These are
  flat type cards, so JPEG's chroma subsampling blurs the text edges before
  h264 ever sees them — the two lossy passes together are what made earlier
  renders look soft.
- The brand tokens in `src/brand.ts` mirror `tools/og-image.py`. Keep the media
  calm: dawn colours, paper, no error red, no dramatic motion (smooth is not
  dramatic: no shake, flash, or zoom punch), the same rule
  `tool/trust_design_test.mjs` enforces on the product surfaces.
- Remotion is free for individuals and companies of up to three people, and
  needs a paid company licence beyond that. See https://remotion.dev/license.
