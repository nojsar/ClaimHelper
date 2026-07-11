# GetMyYes marketing autopilot

This is intentionally a small, durable acquisition system—not a mass-content or cold-message bot.

## What runs automatically

- Every deploy validates every appeal-guide link, generates `sitemap.xml` and `feed.xml`, and refuses to deploy if the crawlable guide copy in `build/web` is missing or stale.
- Search engines can discover the guide hub from the homepage and every guide from the sitemap.
- After a successful deploy, the script submits all sitemap URLs to IndexNow so participating search engines can recrawl changes. Google still uses the sitemap and Search Console.
- GitHub Actions can publish one useful evergreen guide to Bluesky each Monday, Wednesday, and Friday. It rotates the queue, adds campaign tags, and refuses to post twice within 36 hours.
- The private owner dashboard at `https://getmyyes.com/#/stats` reports visits, funnel conversion, top pages/referrers/countries, revenue, and campaign traffic without analytics cookies.

## One-time setup: search

1. Add `getmyyes.com` as a **Domain property** in [Google Search Console](https://search.google.com/search-console/about).
2. Google will give you a TXT record. Add it in Namecheap under **Domain List → Manage → Advanced DNS → Add New Record → TXT Record**.
3. After verification, submit `https://getmyyes.com/sitemap.xml` under **Sitemaps**.
4. Do the equivalent in [Bing Webmaster Tools](https://www.bing.com/webmasters/about). It can import the verified Search Console property.

A sitemap is a discovery hint, not a ranking guarantee. The internal links and genuinely useful guide pages are the durable part.

## One-time setup: scheduled social posts

1. Create a GetMyYes Bluesky account and complete its profile. Do not automate replies, follows, DMs, or unsolicited mentions.
2. In Bluesky, create an **App Password** under **Settings → Privacy and security → App passwords**.
3. In the GitHub repository, open **Settings → Secrets and variables → Actions** and add:
   - `BLUESKY_HANDLE` — for example `getmyyes.com` or `getmyyes.bsky.social`
   - `BLUESKY_APP_PASSWORD` — the app password, not the main account password
4. Open **Actions → Marketing autopilot → Run workflow** and leave **dry run** enabled. Check the preview in the job log.
5. Run it once with **dry run disabled**. Scheduled runs will then continue without intervention.

Edit `marketing/posts.json` to change the approved evergreen queue. The automation never invents health or insurance claims at runtime; it only rotates copy reviewed in the repository.

`tools/guide-topics.md` is a researched publishing backlog, not an automatic medical-content generator. New guides still need authoritative-source review before they are added to `web/appeals/`; once added, the build automatically includes them in the sitemap and feed.

## Normal deploy

Run `deploy_claimhelper.bat`. It generates the marketing assets before Flutter builds, stages them into the deploy artifact, Firebase verifies them again before publishing, and then notifies IndexNow.

## Guardrails

- No bought lists, cold email, auto-DMs, fake forum accounts, or automated Reddit posts.
- No unreviewed AI-generated medical/insurance pages.
- No analytics cookies or individual visitor profiles.
- Review guide facts when laws, federal rules, or cited sources change.
