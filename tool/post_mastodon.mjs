import process from "node:process";
import {
  campaignUrl,
  configured,
  dryRun,
  jsonRequest,
  postForDay,
  previewAndExit,
  weightedLength,
} from "./social_core.mjs";

// Mastodon poster. Unlike Bluesky, Mastodon servers unfurl a link card from
// the page's own OG tags, so a plain status with the URL is the whole job.
// Secrets: MASTODON_SERVER (e.g. https://mastodon.social), MASTODON_ACCESS_TOKEN
// (Settings → Development → New application → scope write:statuses).

const OFFSET = 1;
const LIMIT = 500; // Mastodon default; URLs count as 23 characters.

function compose(post) {
  return `${post.text}\n\n${campaignUrl(post, "mastodon")}\n\n#GetMyYesGuide #HealthInsurance`;
}

if (dryRun) previewAndExit("mastodon", compose, LIMIT, { offset: OFFSET, lengthOf: weightedLength });

if (!configured("mastodon", ["MASTODON_SERVER", "MASTODON_ACCESS_TOKEN"])) process.exit(0);

const server = process.env.MASTODON_SERVER.replace(/\/$/, "");
const post = postForDay(OFFSET);
const auth = { Authorization: `Bearer ${process.env.MASTODON_ACCESS_TOKEN}` };

// Same-day re-runs (manual dispatch after a partial failure, late cron) must
// skip cleanly: replaying an Idempotency-Key works only while the server
// still caches it — mastodon.social 500s on older replays. Check our own
// recent statuses for today's campaign post instead of relying on that.
// Uses the PUBLIC endpoints (our posts are public) so the access token can
// stay write-only.
const handle = process.env.MASTODON_HANDLE || "getmyyes";
const me = await jsonRequest(`${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`);
const recent = await jsonRequest(
  `${server}/api/v1/accounts/${me.id}/statuses?limit=10&exclude_replies=true&exclude_reblogs=true`,
);
const today = new Date().toISOString().slice(0, 10);
if (recent.some((s) => (s.created_at || "").slice(0, 10) === today && s.content?.includes("GetMyYesGuide"))) {
  console.log("[marketing] mastodon: today's campaign post already exists; skipping safely.");
  process.exit(0);
}

const result = await jsonRequest(`${server}/api/v1/statuses`, {
  method: "POST",
  headers: {
    ...auth,
    "Content-Type": "application/json",
    // One post per guide per day even if the workflow retries.
    "Idempotency-Key": `getmyyes-${post.id}-${new Date().toISOString().slice(0, 10)}`,
  },
  body: JSON.stringify({ status: compose(post), visibility: "public", language: "en" }),
});
console.log(`[marketing] mastodon: published ${post.id}: ${result.url}`);
