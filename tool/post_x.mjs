import crypto from "node:crypto";
import process from "node:process";
import {
  campaignUrl,
  configured,
  dryRun,
  jsonRequest,
  postForDay,
  previewAndExit,
  weightedLength,
} from "./social_core.mjs";

// X (Twitter) poster via POST /2/tweets with OAuth 1.0a user context — the
// free tier's write allowance (17/day, 500/month) is far above our 3/week.
// X shortens links to t.co (23 chars) and unfurls the card from OG tags.
// Secrets (developer.x.com → your app → Keys and tokens):
//   X_API_KEY, X_API_KEY_SECRET   — "API Key and Secret" (consumer keys)
//   X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET — with Read and Write permission

const OFFSET = 2;
const LIMIT = 280;
const ENDPOINT = "https://api.x.com/2/tweets";

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

// With a JSON request body, only the oauth_* parameters enter the signature.
function oauthHeader(method, url) {
  const params = {
    oauth_consumer_key: process.env.X_API_KEY,
    oauth_nonce: crypto.randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: process.env.X_ACCESS_TOKEN,
    oauth_version: "1.0",
  };
  const paramString = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
    .join("&");
  const base = [method, rfc3986(url), rfc3986(paramString)].join("&");
  const signingKey = `${rfc3986(process.env.X_API_KEY_SECRET)}&${rfc3986(process.env.X_ACCESS_TOKEN_SECRET)}`;
  params.oauth_signature = crypto.createHmac("sha1", signingKey).update(base).digest("base64");
  const header = Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}="${rfc3986(params[key])}"`)
    .join(", ");
  return `OAuth ${header}`;
}

const post = postForDay(OFFSET);
let result;
try {
  result = await jsonRequest(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: oauthHeader("POST", ENDPOINT),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text: compose(post) }),
  });
} catch (error) {
  // X's pay-per-use tier returns 402 CreditsDepleted at zero balance. That's
  // a billing state, not a code failure — surface it as a workflow warning
  // instead of failing the whole run every slot until the account is topped
  // up (or the X secrets are removed to stop trying).
  if (error.message.includes("CreditsDepleted")) {
    console.log(`::warning title=X credits depleted::${error.message}`);
    console.log("[marketing] x: no API credits — top up in the X dev console (Billing → Credits) or remove the X_* secrets.");
    process.exit(0);
  }
  throw error;
}
console.log(`[marketing] x: published ${post.id}: tweet ${result.data?.id}`);
