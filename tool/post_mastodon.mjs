import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  campaignUrl,
  configured,
  dryRun,
  guideMeta,
  jsonRequest,
  postForDay,
  previewAndExit,
  weightedLength,
} from "./social_core.mjs";
import { altText, readVideo } from "./social_video.mjs";

// Mastodon poster: the day's guide as the Remotion-rendered square video,
// uploaded from the checkout rather than fetched by URL, with the campaign
// link still clickable in the status text. An attachment replaces the unfurled
// OG card, which is the trade: media travels further on Mastodon.
// Secrets: MASTODON_SERVER (e.g. https://mastodon.social), MASTODON_ACCESS_TOKEN
// (Settings → Development → New application → scopes write:statuses and
// write:media — without write:media the upload is refused and the poster
// falls back to the plain status it always sent).

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

// mastodon.social caps attachments at 40MB; ours are around 1MB, but a
// future longer cut should degrade rather than fail the slot.
const video = await readVideo(post.id, "square", 40_000_000);
let mediaIds;
if (video) {
  try {
    const meta = await guideMeta(post);
    const form = new FormData();
    form.append("file", new Blob([video], { type: "video/mp4" }), `${post.id}.mp4`);
    form.append("description", altText(meta?.title ?? post.text, post.text));
    const uploaded = await jsonRequest(`${server}/api/v2/media`, {
      method: "POST",
      headers: auth,
      body: form,
    });
    // A 202 comes back with url: null while the server transcodes; attaching
    // an unfinished attachment to a status is rejected, so wait for it.
    for (let attempt = 1; attempt <= 20 && !uploaded.url; attempt += 1) {
      await sleep(3_000);
      const ready = await fetch(`${server}/api/v1/media/${uploaded.id}`, { headers: auth });
      if (ready.ok) break;
    }
    mediaIds = [uploaded.id];
  } catch (error) {
    console.warn(`[marketing] mastodon: could not attach the video (${error.message}); posting the link alone.`);
  }
}

const result = await jsonRequest(`${server}/api/v1/statuses`, {
  method: "POST",
  headers: {
    ...auth,
    "Content-Type": "application/json",
    // One post per guide per day even if the workflow retries.
    "Idempotency-Key": `getmyyes-${post.id}-${new Date().toISOString().slice(0, 10)}`,
  },
  body: JSON.stringify({
    status: compose(post),
    visibility: "public",
    language: "en",
    ...(mediaIds ? { media_ids: mediaIds } : {}),
  }),
});
console.log(`[marketing] mastodon: published ${post.id}${mediaIds ? " with video" : ""}: ${result.url}`);
