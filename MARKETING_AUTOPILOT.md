# GetMyYes marketing autopilot

This is intentionally a small, durable acquisition system—not a mass-content or cold-message bot.

## What runs automatically

- Every deploy validates every appeal-guide link, generates `sitemap.xml` and `feed.xml`, and refuses to deploy if the crawlable guide copy in `build/web` is missing or stale.
- Search engines can discover the guide hub from the homepage and every guide from the sitemap.
- After a successful deploy, the script submits all sitemap URLs to IndexNow so participating search engines can recrawl changes. Google still uses the sitemap and Search Console.
- GitHub Actions can publish one useful evergreen guide each Monday, Wednesday, and Friday to every network whose secrets are configured: Bluesky, Mastodon, X, Threads, LinkedIn, Facebook, and Instagram. Each network is offset through the queue so they post different guides on the same day, every post carries campaign tags, and a network with missing secrets is skipped with a log line instead of failing the run (`tool/post_all.mjs`).
- The private owner dashboard at `https://getmyyes.com/#/stats` reports visits, funnel conversion, top pages/referrers/countries, revenue, and campaign traffic without analytics cookies.

## One-time setup: search

1. Add `getmyyes.com` as a **Domain property** in [Google Search Console](https://search.google.com/search-console/about).
2. Google will give you a TXT record. Add it in Namecheap under **Domain List → Manage → Advanced DNS → Add New Record → TXT Record**.
3. After verification, submit `https://getmyyes.com/sitemap.xml` under **Sitemaps**.
4. Do the equivalent in [Bing Webmaster Tools](https://www.bing.com/webmasters/about). It can import the verified Search Console property.

A sitemap is a discovery hint, not a ranking guarantee. The internal links and genuinely useful guide pages are the durable part.

## One-time setup: scheduled social posts

General rules for every network:

- Only ever use each platform's **official write API** — never browser automation. Posting cadence stays at 3/week per network, far under every rate limit.
- Automate **posting only**. Do not automate replies, follows, likes, DMs, or unsolicited mentions anywhere.
- Reddit and TikTok are deliberately **not** automated: their cultures and policies punish it. Participate there manually or not at all.
- All secrets go in the GitHub repository under **Settings → Secrets and variables → Actions**. A network activates on the next scheduled run once its secrets exist; removing its secrets deactivates it.
- After adding a network, open **Actions → Marketing autopilot → Run workflow** with **dry run** enabled to check the previews, then once with dry run disabled to verify a real post.

### Bluesky (live)

1. Create a GetMyYes Bluesky account and complete its profile.
2. In Bluesky, create an **App Password** under **Settings → Privacy and security → App passwords**.
3. Secrets: `BLUESKY_HANDLE` (e.g. `getmyyes.bsky.social`), `BLUESKY_APP_PASSWORD` (the app password, not the account password).

### Mastodon

1. Create a GetMyYes account on an instance (e.g. `https://mastodon.social`) and complete its profile.
2. **Preferences → Development → New application**: name it "GetMyYes autopilot", untick everything except the `write:statuses` scope, save, and copy **Your access token**.
3. Secrets: `MASTODON_SERVER` (e.g. `https://mastodon.social`), `MASTODON_ACCESS_TOKEN`.

### X (Twitter)

The free API tier (~500 posts/month, 17/day) comfortably covers this cadence.

1. Sign in at [developer.x.com](https://developer.x.com) with the GetMyYes X account and sign up for the **Free** tier.
2. In the project's app: **Settings → User authentication settings → Set up** — App permissions **Read and write**, type **Web App, Automated App or Bot**, callback/website URL `https://getmyyes.com`.
3. **Keys and tokens**: copy the **API Key and Secret**; then generate the **Access Token and Secret** (it must say *Read and Write* — regenerate it if you changed permissions after creating it).
4. Secrets: `X_API_KEY`, `X_API_KEY_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_TOKEN_SECRET`.

### Threads

1. At [developers.facebook.com](https://developers.facebook.com) create an app with the **Access the Threads API** use case.
2. In the use-case settings add the GetMyYes Threads account as a **Threads Tester**, then accept the invite in the Threads app (**Settings → Account → Website permissions → Invites**).
3. Generate a token with `threads_basic` + `threads_content_publish`, then exchange it for a **long-lived** token: `GET https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=<app-secret>&access_token=<short-token>`.
4. Secrets: `THREADS_ACCESS_TOKEN` (optional `THREADS_USER_ID`; fetched automatically when absent).
5. The token lasts **60 days**. Refresh before then with `GET https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=<current>` and update the secret.

### LinkedIn (Company Page)

1. Create a **LinkedIn Company Page** for GetMyYes (organization posting is the supported automation path; personal profiles are not).
2. At [developer.linkedin.com](https://developer.linkedin.com) create an app tied to that page and **verify** it from the page admin.
3. Under **Products**, request the **Community Management API** (grants `w_organization_social`; approval can take days).
4. Once approved, use the app's **OAuth token tools** to generate a member token with `w_organization_social` while signed in as a page admin.
5. `LINKEDIN_ORG_ID` is the numeric id in the page admin URL (`linkedin.com/company/<id>/admin`).
6. Secrets: `LINKEDIN_ACCESS_TOKEN` (60-day expiry — regenerate from the token tools), `LINKEDIN_ORG_ID`.

### Facebook Page

1. Reuse the Meta developer app; in the **Graph API Explorer** request a user token with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`.
2. Exchange it for a long-lived token, then call `GET /me/accounts` — copy the Page's `id` and its `access_token` (page tokens derived from a long-lived user token do not expire).
3. Secrets: `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_TOKEN`.
4. **Visibility caveat:** while the app is in Development mode, API posts publish but are visible only to app users. Public posts require the app to be **Live** with `pages_manage_posts` passed through App Review (a short screencast of the posting flow).

### Instagram

The account must be a **Professional** account either way. Meta offers two ways to mint the token; `tool/post_instagram.mjs` picks the matching API host from the token prefix, so both work with the same two secrets.

**Route A — System user token (what GetMyYes uses; the token never expires).** Correct whenever the Instagram account is owned by a Meta business portfolio, which also means it may have no usable standalone Instagram password.

1. Link the Instagram account to a Facebook Page (Page → Settings → Linked accounts). For GetMyYes: Page `Getmyyes` = `1281079755078718`, IG business account = `17841414691594124`.
2. Business settings → **Users → System users** → add one (role Admin), then **Assign assets**: the Page and the Instagram account, both with full control.
3. **Generate new token** on that system user: app `GetMyYes IGautopilot`, expiry **Never**, scopes `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`. Meta shows the token **once** — copy it immediately.
4. Secrets: `INSTAGRAM_USER_ID` = the IG business account id, `INSTAGRAM_ACCESS_TOKEN` = the system user token.

Do **not** try to derive this from a personal user token via `GET /me/accounts` — that returns an empty `data` array for portfolio-owned Pages no matter which permissions the token carries, which looks like a permissions bug and is not one. Assets owned by a business portfolio need an identity the portfolio can hold assets against, i.e. a system user.

Verify without posting — creating a media container is not a publish, and an unpublished container expires in 24h:

```
GET  /<page-id>?fields=instagram_business_account     # confirms the link
GET  /<ig-user-id>?fields=id,username,media_count     # confirms the identity
POST /<ig-user-id>/media?image_url=...&caption=...    # confirms content_publish
```

**Route B — Instagram login.** Simpler when the account has its own password.

1. Create (or extend) a Meta app with the **Instagram API with Instagram Login** use case; add the account under **App roles → Instagram Testers** and accept the invite at `instagram.com/accounts/manage_access/`.
2. Add `instagram_business_basic` + `instagram_business_content_publish` on the Permissions and features page **before** generating the token — the token freezes whatever scopes are granted at generation time.
3. **Generate token** re-authenticates as the Instagram account. If that login fails, log into instagram.com in the same browser profile first so the popup reuses the session, or fall back to Route A.
4. Secrets: `INSTAGRAM_USER_ID`, `INSTAGRAM_ACCESS_TOKEN` (60 days — refresh via `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=<current>`).

Neither route needs App Review or Tech Provider status: publishing to an account you own works with the app in Development mode. Review is only required to access *other people's* accounts.

Instagram posts are the guide's branded card image with the link written in plain text (links are not clickable on IG); guides without a generated card are skipped.

Edit `marketing/posts.json` to change the approved evergreen queue. The automation never invents health or insurance claims at runtime; it only rotates copy reviewed in the repository.

`tools/guide-topics.md` is a researched publishing backlog, not an automatic medical-content generator. New guides still need authoritative-source review before they are added to `web/appeals/`; once added, the build automatically includes them in the sitemap and feed.

When adding or renaming a guide, run `uv run tools/og-image.py --all`, then commit the generated `web/appeals/og/*.png` files. The script installs Pillow in uv's isolated cache; the build fails if a guide's branded social image is missing or too large for Bluesky.

## Normal deploy

Run `deploy_claimhelper.bat`. It generates the marketing assets before Flutter builds, stages them into the deploy artifact, Firebase verifies them again before publishing, and then notifies IndexNow.

## Guardrails

- No bought lists, cold email, auto-DMs, fake forum accounts, or automated Reddit posts.
- No unreviewed AI-generated medical/insurance pages.
- No analytics cookies or individual visitor profiles.
- Review guide facts when laws, federal rules, or cited sources change.
