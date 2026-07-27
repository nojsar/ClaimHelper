import process from "node:process";
import {
  campaignUrl,
  configured,
  dryRun,
  graphemes,
  jsonRequest,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";

// Facebook Page poster: one POST /{page-id}/feed with message + link — the
// card unfurls from OG tags. Public visibility requires the Meta app to be
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
const result = await jsonRequest(`${GRAPH}/${pageId}/feed`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: compose(post),
    link: campaignUrl(post, "facebook"),
    access_token: token,
  }),
});
console.log(`[marketing] facebook: published ${post.id}: ${result.id}`);
