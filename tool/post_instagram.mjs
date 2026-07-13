import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  configured,
  dryRun,
  graphemes,
  guideMeta,
  jsonRequest,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";

// Instagram poster ("Instagram API with Instagram Login", graph.instagram.com):
// links are not clickable on IG, so the post is the guide's branded OG card
// (1200x630 — inside IG's 1.91:1 limit) with a caption naming the URL in
// plain text. Skips politely when the guide has no generated card yet.
// Secrets: INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN — professional-account
// long-lived token with instagram_business_content_publish (60 days;
// refresh via GET /refresh_access_token, see MARKETING_AUTOPILOT.md).

const OFFSET = 5; // same guide as the Facebook Page — one audience, two surfaces
const LIMIT = 2200;
const GRAPH = "https://graph.instagram.com/v23.0";

function compose(post) {
  return (
    `${post.text}\n\nFull free guide: getmyyes.com${post.path}` +
    `\n\n#HealthInsurance #InsuranceDenial #AppealDenial`
  );
}

if (dryRun) previewAndExit("instagram", compose, LIMIT, { offset: OFFSET, lengthOf: graphemes });

if (!configured("instagram", ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"])) process.exit(0);

const token = process.env.INSTAGRAM_ACCESS_TOKEN;
const userId = process.env.INSTAGRAM_USER_ID;
const post = postForDay(OFFSET);
const meta = await guideMeta(post);

if (!meta?.image?.includes("/appeals/og/")) {
  console.log(`[marketing] instagram: ${post.id} has no branded card yet; skipping this slot.`);
  process.exit(0);
}

const create = new URL(`${GRAPH}/${userId}/media`);
create.searchParams.set("image_url", meta.image); // fetched by IG from the live site
create.searchParams.set("caption", compose(post));
create.searchParams.set("access_token", token);
const container = await jsonRequest(create, { method: "POST" });

// IG fetches the image asynchronously; give the container time to be ready.
let published;
for (let attempt = 1; ; attempt += 1) {
  await sleep(10_000);
  try {
    const publish = new URL(`${GRAPH}/${userId}/media_publish`);
    publish.searchParams.set("creation_id", container.id);
    publish.searchParams.set("access_token", token);
    published = await jsonRequest(publish, { method: "POST" });
    break;
  } catch (error) {
    if (attempt >= 5) throw error;
  }
}
console.log(`[marketing] instagram: published ${post.id}: media ${published.id}`);
