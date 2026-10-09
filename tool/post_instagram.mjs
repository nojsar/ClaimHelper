import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  configured,
  dryRun,
  graphemes,
  guideMeta,
  isOneOff,
  jsonRequest,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";
import { posterUrl, reachable, videoUrl } from "./social_video.mjs";

// Instagram poster: links are not clickable on IG, so the post carries the
// guide itself as media — the vertical Reel rendered by Remotion
// (video/render.mjs, served from /media/social/) with a caption naming the
// bio link. Falls back to the square still, then to the guide's OG card, then
// skips politely, so a slot never depends on a render having shipped.
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
  const pointer = isOneOff(post)
    ? "Free preview → link in bio (getmyyes.com)"
    : "Full guide → link in bio (getmyyes.com/appeals)";
  return `${post.text}\n\n${pointer}\n\n#HealthInsurance #InsuranceDenial #AppealDenial`;
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
    (isOneOff(post) || String(item.timestamp ?? "").slice(0, 10) === today),
);
if (duplicate) {
  console.log(`[marketing] instagram: ${post.id} already posted today (media ${duplicate.id}); skipping safely.`);
  process.exit(0);
}
// What to post, best first. Instagram is video-first and never linkifies a
// caption, so a Reel of the guide card is strictly better than a still; the
// still stands in while a fresh render is waiting to be deployed, and the
// guide's own OG card remains the last resort.
const reel = videoUrl(post.id, "vertical");
const poster = posterUrl(post.id, "vertical");
let media = null;
if (await reachable(reel)) {
  media = { media_type: "REELS", video_url: reel, share_to_feed: "true" };
  // Given no cover, Instagram takes the reel's first frame — and the card
  // animates in from an empty page, so the profile grid fills with blank white
  // tiles. The poster is that same card fully settled, which is what it is for.
  if (await reachable(poster)) media.cover_url = poster;
} else if (post.requireVideo) {
  console.log(`[marketing] instagram: ${post.id} only goes out as its reel, which is not reachable; skipping.`);
  process.exit(0);
} else if (await reachable(poster)) {
  media = { image_url: poster };
} else if (meta?.image?.includes("/appeals/og/")) {
  console.log(`[marketing] instagram: no rendered media deployed for ${post.id} yet; using its OG card.`);
  media = { image_url: meta.image };
} else {
  console.log(`[marketing] instagram: ${post.id} has no branded media yet; skipping this slot.`);
  process.exit(0);
}

const create = new URL(`${GRAPH}/${userId}/media`);
for (const [field, value] of Object.entries(media)) create.searchParams.set(field, value);
create.searchParams.set("caption", compose(post));
create.searchParams.set("access_token", token);
const container = await jsonRequest(create, { method: "POST" });

// IG fetches and transcodes the media itself. An image container is ready
// almost at once; a Reel takes appreciably longer, so ask the container
// whether it is finished rather than hammering media_publish and hoping.
for (let attempt = 1; attempt <= 18; attempt += 1) {
  await sleep(attempt === 1 ? 5_000 : 10_000);
  const status = new URL(`${GRAPH}/${container.id}`);
  status.searchParams.set("fields", "status_code");
  status.searchParams.set("access_token", token);
  const { status_code: state } = await jsonRequest(status).catch(() => ({}));
  if (state === "FINISHED") break;
  if (state === "ERROR") throw new Error(`instagram: could not process the media for ${post.id}.`);
}

let published;
for (let attempt = 1; ; attempt += 1) {
  try {
    const publish = new URL(`${GRAPH}/${userId}/media_publish`);
    publish.searchParams.set("creation_id", container.id);
    publish.searchParams.set("access_token", token);
    published = await jsonRequest(publish, { method: "POST" });
    break;
  } catch (error) {
    if (attempt >= 5) throw error;
    await sleep(10_000);
  }
}
console.log(
  `[marketing] instagram: published ${post.id} as ${media.media_type === "REELS" ? "a reel" : "an image"}: media ${published.id}`,
);
