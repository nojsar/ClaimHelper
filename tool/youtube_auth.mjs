import crypto from "node:crypto";
import http from "node:http";
import process from "node:process";

/**
 * One-time helper: authorise the YouTube channel and print the refresh token
 * the autopilot's YOUTUBE_REFRESH_TOKEN secret needs.
 *
 *   YOUTUBE_CLIENT_ID=... YOUTUBE_CLIENT_SECRET=... node tool/youtube_auth.mjs
 *
 * Uses Google's loopback flow for a "Desktop app" OAuth client with PKCE: a
 * throwaway server on 127.0.0.1 receives the code, so nothing is pasted back
 * by hand. The token is printed once and never written to disk; put it in the
 * GitHub secret and close the terminal.
 */

const clientId = process.env.YOUTUBE_CLIENT_ID;
const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET (Google Cloud → Credentials → OAuth client, type Desktop app).");
  process.exit(1);
}

// Upload, plus read-only so the poster can see its own recent uploads.
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

const verifier = crypto.randomBytes(48).toString("base64url");
const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
const state = crypto.randomBytes(16).toString("hex");

const server = http.createServer();
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const redirectUri = `http://127.0.0.1:${server.address().port}/`;

const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
consent.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: SCOPES.join(" "),
  // offline + consent: Google only issues a refresh token on an explicit consent.
  access_type: "offline",
  prompt: "consent",
  state,
  code_challenge: challenge,
  code_challenge_method: "S256",
}).toString();

console.log("\nOpen this URL, sign in as the account that owns the GetMyYes channel, and allow access:\n");
console.log(consent.toString());
console.log("\nWaiting for Google to redirect back...");

const code = await new Promise((resolve, reject) => {
  server.on("request", (request, response) => {
    const url = new URL(request.url, redirectUri);
    if (url.pathname !== "/") {
      response.writeHead(404).end();
      return;
    }
    const error = url.searchParams.get("error");
    const ok = !error && url.searchParams.get("state") === state && url.searchParams.get("code");
    response.writeHead(ok ? 200 : 400, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(ok ? "Authorised. You can close this tab and return to the terminal." : `Not authorised: ${error ?? "state mismatch"}`);
    server.close();
    if (ok) resolve(url.searchParams.get("code"));
    else reject(new Error(`Authorisation failed: ${error ?? "state mismatch"}`));
  });
});

const response = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }),
});
const tokens = await response.json();
if (!response.ok || !tokens.refresh_token) {
  console.error("No refresh token came back:", JSON.stringify(tokens).slice(0, 400));
  console.error("Remove the app's access at https://myaccount.google.com/permissions and run this again.");
  process.exit(1);
}

console.log("\nSave this as the GitHub secret YOUTUBE_REFRESH_TOKEN:\n");
console.log(tokens.refresh_token);
console.log(
  "\nIf the OAuth consent screen is still in Testing, this token dies after 7 days." +
    "\nSet its publishing status to In production (Google Cloud → OAuth consent screen) first.\n",
);
