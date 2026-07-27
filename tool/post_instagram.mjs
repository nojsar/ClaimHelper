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

// Instagram poster: links are not clickable on IG, so the post is the guide's
// branded OG card (1200x630 — inside IG's 1.91:1 limit) with a caption naming
// the URL in plain text. Skips politely when the guide has no generated card.
//
// Secrets: INSTAGRAM_USER_ID, INSTAGRAM_ACCESS_TOKEN. Meta offers two ways to
// mint those, and the /media + /media_publish calls below are identical on
// both — only the host differs, so we pick it from the token itself:
//
//   Instagram Login (graph.instagram.com) — token starts "IGAA", id is the
//     Instagram-scoped user id. Expires in 60 days; refresh via
//     GET graph.instagram.com/refresh_access_token.
//   Facebook Login (graph.facebook.com) — Page token from the Graph API
//     Explorer, id is the IG *Business Account* id read off the linked Page.
//     Derived from a long-lived user token it does not expire.
//
// See MARKETING_AUTOPILOT.md for the setup steps behind each.

const OFFSET = 5; // same guide as the Facebook Page — one audience, two surfaces
const LIMIT = 2200;

// Instagram never linkifies caption text, so a deep guide URL was decorative —
// nobody retypes 45 characters from a phone. Point at the bio link (one tap)
// and keep a short, typeable fallback that lands on the guide hub, from where
// every guide is one click away.
function compose(post) {
  return (
    `${post.text}\n\nFull guide → link in bio (getmyyes.com/appeals)` +
    `\n\n#HealthInsurance #InsuranceDenial #AppealDenial`
  );
}

if (dryRun) previewAndExit("instagram", compose, LIMIT, { offset: OFFSET, lengthOf: graphemes });

if (!configured("instagram", ["INSTAGRAM_USER_ID", "INSTAGRAM_ACCESS_TOKEN"])) process.exit(0);

const token = process.env.INSTAGRAM_ACCESS_TOKEN;
const userId = process.env.INSTAGRAM_USER_ID;
const GRAPH = token.startsWith("IGAA")
  ? "https://graph.instagram.com/v23.0"
  : "https://graph.facebook.com/v23.0";
const post = postForDay(OFFSET);
const meta = await guideMeta(post);

// Read-before-write, like the Bluesky/Mastodon/X posters. Two runs can land in
// the same UTC day — a manual dispatch plus a cron firing late, which is what
// happened on 2026-07-27 when the 15:17 slot arrived at 16:04 and this poster
// published the same guide twice. postForDay is deterministic, so the second
// run picks the same guide; matching today's date against the guide URL in the
// caption is enough to recognise our own post and stand down.
// Match on the guide's reviewed copy rather than its URL: the copy is unique
// per guide and appears verbatim at the head of every caption, so the guard
// survives changes to how the link line is worded.
const marker = post.text;
const today = new Date().toISOString().slice(0, 10);
const recent = new URL(`${GRAPH}/${userId}/media`);
recent.searchParams.set("fields", "id,caption,timestamp");
recent.searchParams.set("limit", "25");
recent.searchParams.set("access_token", token);
const recentMedia = await jsonRequest(recent).catch((error) => {
  // Fail open so a read blip cannot cost a whole publishing slot, but say so —
  // a silent catch here would hide the duplicate guard being inactive.
  console.warn(`[marketing] instagram: duplicate check unavailable (${error.message}); publishing anyway.`);
  return null;
});
const duplicate = (recentMedia?.data ?? []).find(
  (item) =>
    typeof item.caption === "string" &&
    item.caption.includes(marker) &&
    String(item.timestamp ?? "").slice(0, 10) === today,
);
if (duplicate) {
  console.log(`[marketing] instagram: ${post.id} already posted today (media ${duplicate.id}); skipping safely.`);
  process.exit(0);
}

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
