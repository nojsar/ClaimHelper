import process from "node:process";
import {
  campaignUrl,
  configured,
  dryRun,
  graphemes,
  isOneOff,
  jsonRequest,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";
import { reachable, videoUrl } from "./social_video.mjs";

// Facebook Page poster: the day's guide as the Remotion-rendered square video
// (POST /{page-id}/videos, which Facebook fetches from /media/social/ on the
// live site), with the campaign link in the description so the post still
// carries its click target. Falls back to the plain link post — POST
// /{page-id}/feed with message + link, card unfurled from OG tags — whenever
// the render has not been deployed yet. Public visibility requires the Meta app to be
// LIVE with pages_manage_posts approved (dev-mode posts publish but are only
// visible to app users). See MARKETING_AUTOPILOT.md for the review path.
// Secrets: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN. FACEBOOK_PAGE_TOKEN must be
// a PAGE token, not the system user token that INSTAGRAM_ACCESS_TOKEN uses —
// Page writes have to be made as the Page. Derive it once with
// GET /<page-id>?fields=access_token&access_token=<system-user-token>; derived
// from a never-expiring system user token it does not expire either.
// See MARKETING_AUTOPILOT.md for the scope list and the draft-post check.

const OFFSET = 5;
const LIMIT = 5000; // effectively unlimited; guard against runaway copy

const compose = (post) => post.text;

if (dryRun) previewAndExit("facebook", compose, LIMIT, { offset: OFFSET, lengthOf: graphemes });

if (!configured("facebook", ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_TOKEN"])) process.exit(0);

const GRAPH = "https://graph.facebook.com/v23.0";
const pageId = process.env.FACEBOOK_PAGE_ID;

/**
 * Writes to a Page feed must originate as the Page. A system user token — the
 * one Instagram uses, and the obvious thing to paste into both secrets — has
 * every required scope and still fails with a (#200) that reads like a missing
 * permission. Rather than rely on the operator picking the right one of two
 * near-identical strings, exchange whatever we were given for a Page token.
 * A Page token asked for its own page returns itself, so this is a no-op when
 * the secret was already correct, and any failure falls back to the configured
 * value so a misconfigured exchange cannot be worse than not trying.
 */
async function asPageToken(configured) {
  const url = new URL(`${GRAPH}/${pageId}`);
  url.searchParams.set("fields", "access_token");
  url.searchParams.set("access_token", configured);
  try {
    const page = await jsonRequest(url);
    return page.access_token || configured;
  } catch (error) {
    console.warn(`[marketing] facebook: could not derive a Page token (${error.message}); using the configured token.`);
    return configured;
  }
}

const post = postForDay(OFFSET);
const token = await asPageToken(process.env.FACEBOOK_PAGE_TOKEN);
const url = campaignUrl(post, "facebook");

// A one-off is dispatched by hand, so a second dispatch is the likely way it
// would double-post. Fail open: a read blip must not cost the post.
if (isOneOff(post)) {
  const feed = new URL(`${GRAPH}/${pageId}/posts`);
  feed.searchParams.set("fields", "message");
  feed.searchParams.set("limit", "25");
  feed.searchParams.set("access_token", token);
  const recent = await jsonRequest(feed).catch((error) => {
    console.warn(`[marketing] facebook: duplicate check unavailable (${error.message}); publishing anyway.`);
    return null;
  });
  if ((recent?.data ?? []).some((item) => item.message?.includes(post.text.slice(0, 60)))) {
    console.log(`[marketing] facebook: ${post.id} is already posted; skipping safely.`);
    process.exit(0);
  }
}
const video = videoUrl(post.id, "square");

let result;
if (await reachable(video)) {
  // A video post reaches further than a link post, and Facebook still
  // linkifies the URL in the description, so nothing is lost by dropping the
  // unfurled card.
  result = await jsonRequest(`${GRAPH}/${pageId}/videos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      file_url: video,
      description: `${compose(post)}\n\n${url}`,
      access_token: token,
    }),
  });
  console.log(`[marketing] facebook: published ${post.id} as a video: ${result.id}`);
} else if (post.requireVideo) {
  console.log(`[marketing] facebook: ${post.id} only goes out with its video, which is not reachable; skipping.`);
} else {
  console.log(`[marketing] facebook: no rendered video deployed for ${post.id} yet; posting the link.`);
  result = await jsonRequest(`${GRAPH}/${pageId}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: compose(post),
      link: url,
      access_token: token,
    }),
  });
  console.log(`[marketing] facebook: published ${post.id}: ${result.id}`);
}
