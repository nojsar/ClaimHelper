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
// Secrets: FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN (page token derived from a
// long-lived user token does not expire).

const OFFSET = 5;
const LIMIT = 5000; // effectively unlimited; guard against runaway copy

const compose = (post) => post.text;

if (dryRun) previewAndExit("facebook", compose, LIMIT, { offset: OFFSET, lengthOf: graphemes });

if (!configured("facebook", ["FACEBOOK_PAGE_ID", "FACEBOOK_PAGE_TOKEN"])) process.exit(0);

const post = postForDay(OFFSET);
const result = await jsonRequest(
  `https://graph.facebook.com/v23.0/${process.env.FACEBOOK_PAGE_ID}/feed`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: compose(post),
      link: campaignUrl(post, "facebook"),
      access_token: process.env.FACEBOOK_PAGE_TOKEN,
    }),
  },
);
console.log(`[marketing] facebook: published ${post.id}: ${result.id}`);
