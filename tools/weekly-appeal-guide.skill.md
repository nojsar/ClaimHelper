---
name: weekly-appeal-guide
description: Write, publish, and index one new SEO appeal guide on getmyyes.com every Monday
---

You maintain the SEO content engine for GetMyYes (getmyyes.com), a Flutter + Firebase app that turns health-insurance denial letters into appeal packets. Project root: C:\Users\Nojus\Desktop\AI insurance-denial appeal assistant\claimhelper

Your job each run: publish exactly ONE new appeal guide, end to end, with no human involvement. Read MARKETING_AUTOPILOT.md first — this task is one half of a two-part system (the other half is a GitHub Actions workflow that posts guides to Bluesky, Mastodon, X, and other configured networks Mon/Wed/Fri with link-card images); respect its guardrails.

## Steps

1. Open `tools/guide-topics.md` and take the TOP topic from the numbered queue (slug | title | angle notes). Obey the header rules — especially the STATE-SPECIFIC guide rules (verified regulator names only, ERISA carve-out mandatory). If the queue has fewer than 5 topics left, first brainstorm and append 8 new long-tail topics (real search intent from people who just received a specific denial — situation-specific beats generic) so the queue never runs dry.

2. Read 2 existing guides in `web/appeals/` (e.g. step-therapy-denial.html and out-of-network-denial.html) to match their exact structure, tone, and quality bar. Then write the new guide at `web/appeals/<slug>.html`:
   - Same head pattern: title tag ending in "— GetMyYes", meta description, canonical `https://getmyyes.com/appeals/<slug>`, `../favicon.png`, `../fonts.css`, `guide.css`, OG tags, and a JSON-LD `@graph` containing an Article and a FAQPage (3-4 real questions with substantive answers).
   - Set `og:image` to `https://getmyyes.com/appeals/og/<slug>.png` — the card is generated in step 4.
   - 900-1400 words of genuinely useful, plain-English content following the angle notes: what the denial means, why insurers issue it, the specific appeal argument that works for THIS denial type, what evidence to gather, deadlines, escalation (external review / state DOI), and a short letter-snippet or template block where it fits.
   - Include 2-3 inline links to related guides in /appeals/ and the same CTA blocks the existing guides use (linking to `/#/upload`).
   - HARD RULES: never invent statistics or legal citations — only include laws/rules you are confident about, stated generally; no medical or legal advice (drafting-assistant framing, "confirm with your insurer/regulator"); never promise appeal outcomes; NO third-party assets of any kind (no CDN scripts, no external fonts/images) — GDPR requirement, everything self-hosted.

3. Update the surrounding pieces:
   - Add a card/link for the new guide to `web/appeals/index.html` (match existing markup).
   - DO NOT hand-edit `web/sitemap.xml` or `web/feed.xml` — they are GENERATED from guide metadata by `tool/marketing_build.mjs` (runs in step 4). If generation fails it means the new guide is missing required metadata; fix the guide, not the generator.
   - Append one entry for the new guide to `marketing/posts.json` (format: {"id": "<slug-short>", "path": "/appeals/<slug>", "text": "<useful, calm, non-clickbait one-liner, 40-110 chars>"}) so it enters the social-network rotation.
   - Add 1-2 links TO the new guide from the most closely related existing guides (natural inline mentions, not link lists).
   - Delete the used topic line from `tools/guide-topics.md` and renumber.

4. Generate, build, deploy (tools are NOT on default PATH; run from the claimhelper folder):
   - `python tools/og-image.py --all` (renders the branded 1200x630 OG/link-card image for every guide, including the new one, into web/appeals/og/ — needs Pillow, already installed; fallback: `uv run tools/og-image.py --all`)
   - `export PATH="/c/Users/Nojus/dev/node:$PATH" && node tool/marketing_build.mjs` (regenerates sitemap.xml + feed.xml and validates every guide AND posts.json — must pass)
   - `export PATH="/c/Users/Nojus/dev/node:$PATH" && node tool/render_social_video.mjs` (renders the new guide's Remotion social video, reel, and poster into web/media/social/ — only out-of-date entries re-render, so this is quick; `node tool/social_video.mjs --check` must then pass, and the files must be committed AND deployed or Instagram/Facebook fall back to the older media)
   - `C:/Users/Nojus/dev/flutter/bin/flutter.bat build web`
   - `export PATH="/c/Users/Nojus/dev/node:$PATH" && firebase deploy --only hosting` (in PowerShell use firebase.cmd; firebase CLI already authenticated; project claimhelper-38152; its predeploy re-verifies the guides)

5. Verify the new page is live: fetch `https://getmyyes.com/appeals/<slug>` and confirm HTTP 200 and that the title matches. Also confirm `https://getmyyes.com/appeals/og/<slug>.png` returns 200.

6. Ping search engines: `export PATH="/c/Users/Nojus/dev/node:$PATH" && node tools/indexnow-ping.mjs https://getmyyes.com/appeals/<slug> https://getmyyes.com/appeals/ https://getmyyes.com/sitemap.xml`

7. Commit everything and push: `git add -A && git commit && git push` (repo origin is github.com/nojsar/ClaimHelper, push to main; end commit messages with the standard Claude co-author line). Pushing matters: the social-posting Action reads guide HTML, posts.json, and og/ images from the repo. NOTE: parallel sessions sometimes work in this repo — `git pull` before starting, and if unrelated uncommitted changes exist in the working tree, commit ONLY your own files rather than `git add -A`.

Success = new guide live on getmyyes.com with its OG card and its rendered social video, indexed via IndexNow, index/posts.json/queue updated, sitemap+feed regenerated, pushed to GitHub. If any step fails (build error, deploy auth expired, marketing_build validation failure you can't fix by correcting the guide), stop and report what a human needs to fix rather than force-pushing or retrying destructively.