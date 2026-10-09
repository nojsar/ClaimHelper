import crypto from "node:crypto";
import process from "node:process";
import { setTimeout as sleep } from "node:timers/promises";
import {
  campaignUrl,
  configured,
  dryRun,
  guideMeta,
  isOneOff,
  jsonRequest,
  postForDay,
  previewAndExit,
  weightedLength,
} from "./social_core.mjs";
import { altText, readVideo } from "./social_video.mjs";

// X (Twitter) poster via POST /2/tweets with OAuth 1.0a user context — the
// free tier's write allowance (17/day, 500/month) is far above our 3/week.
// X shortens links to t.co (23 chars). The post carries the guide's Remotion
// square video, uploaded through the chunked v2 media API; an attachment
// replaces the unfurled OG card, and the link stays clickable in the text.
// Any upload failure posts the link on its own, exactly as before.
// Secrets (developer.x.com → your app → Keys and tokens):
//   X_API_KEY, X_API_KEY_SECRET   — "API Key and Secret" (consumer keys)
//   X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET — with Read and Write permission

const OFFSET = 2;
const LIMIT = 280;
const ENDPOINT = "https://api.x.com/2/tweets";
const MEDIA = "https://api.x.com/2/media";
const CHUNK = 4 * 1024 * 1024; // X allows up to 5MB per APPEND segment

function compose(post) {
  return `${post.text}\n\n${campaignUrl(post, "twitter")}`;
}

if (dryRun) previewAndExit("x", compose, LIMIT, { offset: OFFSET, lengthOf: weightedLength });

const SECRETS = ["X_API_KEY", "X_API_KEY_SECRET", "X_ACCESS_TOKEN", "X_ACCESS_TOKEN_SECRET"];
if (!configured("x", SECRETS)) process.exit(0);

// RFC 3986 percent-encoding, as OAuth 1.0a requires (stricter than
// encodeURIComponent, which leaves !'()* unescaped).
function rfc3986(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

// Signature covers oauth_* params plus any query params (a JSON body is
// excluded per OAuth 1.0a); only oauth_* fields go into the header itself.
function oauthHeader(method, url, query = {}) {
  const oauth = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const paramString = Object.entries({ ...oauth, ...query })
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .sort()
    .join("&");
  const base = [method, rfc3986(url), rfc3986(paramString)].join("&");
  const signingKey = `${rfc3986(process.env.X_API_KEY_SECRET)}&${rfc3986(process.env.X_ACCESS_TOKEN_SECRET)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  const header = Object.keys(oauth)
    .sort()
    .map((key) => `${rfc3986(key)}="${rfc3986(oauth[key])}"`)
    .join(", ");
  return `OAuth ${header}`;
}

async function apiGet(url, query = {}) {
  const full = new URL(url);
  for (const [key, value] of Object.entries(query)) full.searchParams.set(key, value);
  return jsonRequest(full, { headers: { Authorization: oauthHeader("GET", url, query) } });
}

/**
 * Upload the day's square video and return its media id, or null when there is
 * no render. Chunked INIT/APPEND/FINALIZE, then STATUS until X has finished
 * processing, because a post that names unprocessed media is rejected.
 * OAuth 1.0a signs only the oauth_* and query parameters: JSON and multipart
 * bodies are outside the signature by spec.
 */
async function uploadVideo(post) {
  // tweet_video allows 512MB; ours are around 1MB.
  const video = await readVideo(post.id, "square", 512_000_000);
  if (!video) return null;
  const signed = (url) => ({ Authorization: oauthHeader("POST", url) });

  const initUrl = `${MEDIA}/upload/initialize`;
  const init = await jsonRequest(initUrl, {
    method: "POST",
    headers: { ...signed(initUrl), "Content-Type": "application/json" },
    body: JSON.stringify({
      media_type: "video/mp4",
      total_bytes: video.byteLength,
      media_category: "tweet_video",
    }),
  });
  const id = init.data?.id;
  if (!id) throw new Error(`initialize returned no media id: ${JSON.stringify(init).slice(0, 200)}`);

  for (let index = 0, offset = 0; offset < video.byteLength; index += 1, offset += CHUNK) {
    const appendUrl = `${MEDIA}/upload/${id}/append`;
    const form = new FormData();
    form.append("segment_index", String(index));
    form.append("media", new Blob([video.subarray(offset, offset + CHUNK)]), `${post.id}.mp4`);
    await jsonRequest(appendUrl, { method: "POST", headers: signed(appendUrl), body: form });
  }

  const finalizeUrl = `${MEDIA}/upload/${id}/finalize`;
  const finalized = await jsonRequest(finalizeUrl, { method: "POST", headers: signed(finalizeUrl) });
  let processing = finalized.data?.processing_info;
  for (let polls = 0; processing && processing.state !== "succeeded"; polls += 1) {
    if (processing.state === "failed") {
      throw new Error(`processing failed: ${JSON.stringify(processing.error ?? processing).slice(0, 200)}`);
    }
    if (polls >= 40) throw new Error("processing did not finish within the time allowed");
    await sleep(Math.min(10, Math.max(1, processing.check_after_secs ?? 2)) * 1000);
    const status = await apiGet(`${MEDIA}/upload`, { command: "STATUS", media_id: id });
    processing = status.data?.processing_info;
  }

  // Alt text is a courtesy, not a requirement: a refusal here must not cost
  // the slot its video.
  try {
    const meta = await guideMeta(post);
    const metadataUrl = `${MEDIA}/metadata`;
    await jsonRequest(metadataUrl, {
      method: "POST",
      headers: { ...signed(metadataUrl), "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        metadata: { alt_text: { text: altText(meta?.title ?? post.text, post.text, post).slice(0, 1000) } },
      }),
    });
  } catch (error) {
    console.log(`[marketing] x: alt text not set (${error.message.slice(0, 160)}); posting anyway.`);
  }
  return id;
}

const post = postForDay(OFFSET);

/**
 * X's pay-per-use tier answers 402 at zero balance on EVERY call, reads
 * included, with a body like {"title":"Payment Required","detail":"credits
 * depleted"}. That is a billing state, not a code failure: surface it as a
 * workflow warning instead of failing the whole run every slot until the
 * account is topped up (or the X secrets are removed to stop trying).
 */
function exitIfCreditsDepleted(error) {
  if (!/credits[ -]?depleted/i.test(error.message)) return;
  console.log(`::warning title=X credits depleted::${error.message.slice(0, 300)}`);
  console.log("[marketing] x: no API credits — top up in the X dev console (Billing → Credits) or remove the X_* secrets.");
  process.exit(0);
}

// Read-before-write: the pay-per-use API happily accepts duplicate content,
// so a same-day re-run must detect today's post itself. Two GET requests
// (fractions of a cent) against posting twice is an easy trade.
let me;
let timeline;
try {
  me = await apiGet("https://api.x.com/2/users/me");
  timeline = await apiGet(`https://api.x.com/2/users/${me.data.id}/tweets`, {
    max_results: "5",
    "tweet.fields": "created_at",
  });
} catch (error) {
  exitIfCreditsDepleted(error);
  throw error;
}
const marker = post.text.slice(0, 60);
const today = new Date().toISOString().slice(0, 10);
// Same text AND same day: the rotation legitimately repeats a guide every
// nine days (~4 posting slots), so matching text alone would false-positive.
// A one-off goes out once, so its text on any recent day is a duplicate.
if (
  (timeline.data || []).some(
    (tweet) => tweet.text?.includes(marker) && (isOneOff(post) || tweet.created_at?.slice(0, 10) === today),
  )
) {
  console.log("[marketing] x: today's post already exists; skipping safely.");
  process.exit(0);
}

// Uploading happens only after the duplicate check, so a re-run never pays
// for media it will not use. A failed upload degrades to the link post; a
// depleted balance fails the same way at the post below and is handled there.
let mediaId = null;
try {
  mediaId = await uploadVideo(post);
} catch (error) {
  console.log(`[marketing] x: video upload failed, posting the link without it: ${error.message.slice(0, 300)}`);
}
if (!mediaId && post.requireVideo) {
  console.log(`[marketing] x: ${post.id} only goes out with its video; skipping, so a later dispatch can still post it.`);
  process.exit(0);
}

let result;
try {
  result = await jsonRequest(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: oauthHeader("POST", ENDPOINT),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text: compose(post),
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
    }),
  });
} catch (error) {
  exitIfCreditsDepleted(error);
  // Same-day re-runs compose identical text, which X rejects as a duplicate.
  // That means today's post already exists — a safe skip, not a failure.
  if (/duplicate/i.test(error.message)) {
    console.log("[marketing] x: today's post already exists (duplicate rejected); skipping safely.");
    process.exit(0);
  }
  throw error;
}
console.log(`[marketing] x: published ${post.id}${mediaId ? " with video" : ""}: tweet ${result.data?.id}`);
