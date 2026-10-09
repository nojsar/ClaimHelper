import process from "node:process";
import {
  campaignUrl,
  configured,
  dryRun,
  graphemes,
  guideMeta,
  isOneOff,
  jsonRequest,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";
import { readVideo } from "./social_video.mjs";

// YouTube poster: the day's guide as a Short, the Remotion vertical reel with
// its licensed soundtrack, uploaded through the Data API v3 resumable upload.
// A vertical video under three minutes becomes a Short on its own; no flag
// exists or is needed.
//
// Secrets (see MARKETING_AUTOPILOT.md → YouTube):
//   YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET — a Google Cloud OAuth client
//   YOUTUBE_REFRESH_TOKEN — from `node tool/youtube_auth.mjs`, for the channel
//
// Two platform facts shape this file:
// - An API project that has not passed YouTube's compliance audit has every
//   upload locked to private, whatever privacyStatus asks for. The poster
//   still uploads (so the channel fills up and the audit has real usage to
//   look at) and says so loudly in the log.
// - Links in Shorts descriptions are not clickable. The guide URL is still
//   written out, and the title carries the search terms people type.

const OFFSET = 6;
const TITLE_LIMIT = 100;
const DESCRIPTION_LIMIT = 5000;
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3/videos";

function describe(post) {
  const label = isOneOff(post) ? "Free preview" : "Free plain-English guide";
  return `${post.text}\n\n${label}: ${campaignUrl(post, "youtube")}\n\n#Shorts #HealthInsurance #InsuranceAppeal`;
}

if (dryRun) previewAndExit("youtube", describe, DESCRIPTION_LIMIT, { offset: OFFSET, lengthOf: graphemes });

const SECRETS = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN"];
if (!configured("youtube", SECRETS)) process.exit(0);

const tokens = await jsonRequest("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: process.env.YOUTUBE_CLIENT_ID,
    client_secret: process.env.YOUTUBE_CLIENT_SECRET,
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  }),
});
const auth = { Authorization: `Bearer ${tokens.access_token}` };

const post = postForDay(OFFSET);
const meta = await guideMeta(post);
const title = (meta?.title ?? post.text).slice(0, TITLE_LIMIT);

// Same-day re-runs must not upload twice. The channel's uploads playlist is
// the cheap way to look (1 quota unit a call; search.list costs 100).
const channels = await jsonRequest(`${API}/channels?part=contentDetails&mine=true`, { headers: auth });
const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
if (!uploads) throw new Error("youtube: the authorised account has no channel; create one first.");
const recent = await jsonRequest(
  `${API}/playlistItems?part=snippet&maxResults=10&playlistId=${encodeURIComponent(uploads)}`,
  { headers: auth },
);
const today = new Date().toISOString().slice(0, 10);
if (
  (recent.items ?? []).some(
    (item) =>
      item.snippet?.title === title &&
      (isOneOff(post) || String(item.snippet?.publishedAt ?? "").slice(0, 10) === today),
  )
) {
  console.log(`[marketing] youtube: ${post.id} was already uploaded today; skipping safely.`);
  process.exit(0);
}

// YouTube caps uploads far above this, but a future long cut should degrade
// to a skipped slot rather than an hour-long failed upload.
const video = await readVideo(post.id, "vertical", 256_000_000);
if (!video) {
  console.log(`[marketing] youtube: ${post.id} has no rendered reel yet; skipping this slot.`);
  process.exit(0);
}

// Resumable upload: the metadata opens a session, the bytes go to the URL it
// returns. One PUT is enough for a file this size.
const session = await fetch(`${UPLOAD}?uploadType=resumable&part=snippet,status`, {
  method: "POST",
  headers: {
    ...auth,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": "video/mp4",
    "X-Upload-Content-Length": String(video.byteLength),
  },
  body: JSON.stringify({
    snippet: {
      title,
      description: describe(post),
      tags: ["health insurance", "insurance denial", "insurance appeal", "claim denied", "GetMyYes"],
      categoryId: "26", // Howto & Style
      defaultLanguage: "en",
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
      // A guide is an animated explainer card, not realistic synthetic media.
      // A one-off says for itself (the film has generated stills and voice).
      containsSyntheticMedia: Boolean(post.syntheticMedia),
    },
  }),
});
if (!session.ok) {
  const body = await session.text();
  throw new Error(`youtube: could not open an upload session: ${session.status} ${body.slice(0, 400)}`);
}
const location = session.headers.get("location");
if (!location) throw new Error("youtube: the upload session returned no location.");

const uploaded = await jsonRequest(location, {
  method: "PUT",
  headers: { ...auth, "Content-Type": "video/mp4", "Content-Length": String(video.byteLength) },
  body: video,
});

const privacy = uploaded.status?.privacyStatus;
console.log(`[marketing] youtube: uploaded ${post.id} as https://youtube.com/shorts/${uploaded.id} (${privacy}).`);
if (privacy !== "public") {
  console.log(
    "::warning title=YouTube upload is private::This API project has not passed YouTube's compliance audit, " +
      "so every API upload is locked to private. Request the audit (MARKETING_AUTOPILOT.md → YouTube) " +
      "or publish the video by hand in YouTube Studio.",
  );
}
