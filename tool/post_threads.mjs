import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  campaignUrl,
  configured,
  dryRun,
  graphemes,
  jsonRequest,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";

// Threads poster (graph.threads.net): create a media container with a
// link_attachment (Threads renders the card from the page's OG tags), then
// publish it. The URL therefore stays out of the text itself.
// Secrets: THREADS_ACCESS_TOKEN — long-lived token (60 days; refresh it via
// GET /refresh_access_token before it lapses, see MARKETING_AUTOPILOT.md).
// Optional: THREADS_USER_ID (fetched from /me when absent).

const OFFSET = 3;
const LIMIT = 500;
const GRAPH = "https://graph.threads.net/v1.0";

const compose = (post) => post.text;

if (dryRun) previewAndExit("threads", compose, LIMIT, { offset: OFFSET, lengthOf: graphemes });

if (!configured("threads", ["THREADS_ACCESS_TOKEN"])) process.exit(0);

const token = process.env.THREADS_ACCESS_TOKEN;
const userId =
  process.env.THREADS_USER_ID ||
  (await jsonRequest(`${GRAPH}/me?fields=id&access_token=${encodeURIComponent(token)}`)).id;

const post = postForDay(OFFSET);
if (post.requireVideo) {
  console.log(`[marketing] threads: ${post.id} only goes out with its video, which this poster does not attach; skipping.`);
  process.exit(0);
}
const create = new URL(`${GRAPH}/${userId}/threads`);
create.searchParams.set("media_type", "TEXT");
create.searchParams.set("text", compose(post));
create.searchParams.set("link_attachment", campaignUrl(post, "threads"));
create.searchParams.set("access_token", token);
const container = await jsonRequest(create, { method: "POST" });

// Containers can take a moment to become publishable; retry briefly.
let published;
for (let attempt = 1; ; attempt += 1) {
  try {
    const publish = new URL(`${GRAPH}/${userId}/threads_publish`);
    publish.searchParams.set("creation_id", container.id);
    publish.searchParams.set("access_token", token);
    published = await jsonRequest(publish, { method: "POST" });
    break;
  } catch (error) {
    if (attempt >= 3) throw error;
    await sleep(10_000);
  }
}
console.log(`[marketing] threads: published ${post.id}: media ${published.id}`);
