import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const origin = (process.env.PRODUCTION_ORIGIN ?? "https://getmyyes.com").replace(/\/$/, "");
const artifactFlag = process.argv.indexOf("--artifact");
const artifactRoot = artifactFlag >= 0
  ? path.resolve(projectRoot, process.argv[artifactFlag + 1] ?? "build/web")
  : null;

const pages = [
  { route: "/", file: "index.html" },
  { route: "/accessibility", file: "accessibility.html" },
  { route: "/privacy.html", file: "privacy.html" },
  { route: "/terms.html", file: "terms.html" },
  { route: "/appeals/", file: "appeals/index.html" },
  { route: "/codes/", file: "codes/index.html" },
  {
    route: "/tools/appeal-deadline-calculator",
    file: "tools/appeal-deadline-calculator.html",
  },
  { route: "/insurer-denial-rates", file: "insurer-denial-rates.html" },
];
const bundles = [
  "main.dart.js",
  "flutter_bootstrap.js",
  "analytics.js",
  "legal.css",
  "appeals/guide.css",
];
const retries = Number(process.env.PRODUCTION_VERIFY_RETRIES ?? 6);
const retryDelayMs = Number(process.env.PRODUCTION_VERIFY_DELAY_MS ?? 2000);

function fail(message) {
  throw new Error(`[production] ${message}`);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function checkHeader(response, key, expected) {
  const actual = response.headers.get(key);
  if (!actual || !expected(actual)) {
    fail(`${response.url} has an invalid ${key} header: ${actual ?? "missing"}`);
  }
}

function checkHtml(url, html) {
  if (!/<html\b[^>]*\blang=["'][^"']+["']/i.test(html)) {
    fail(`${url} is missing the document language.`);
  }
  if (!/<title>\s*[^<]+\s*<\/title>/i.test(html)) {
    fail(`${url} is missing a descriptive title.`);
  }
  if ((html.match(/<h1\b/gi) ?? []).length !== 1) {
    fail(`${url} must contain exactly one h1.`);
  }
  if (!/<main\b[^>]*\bid=["']main-content["']/i.test(html)) {
    fail(`${url} is missing main#main-content.`);
  }
  if (!/<a\b[^>]*\bhref=["']#main-content["'][^>]*>/i.test(html)) {
    fail(`${url} is missing a skip-to-main link.`);
  }
  if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?/i.test(html)) {
    fail(`${url} disables browser zoom.`);
  }
}

async function fetchOnce(route, { allowErrorStatus = false } = {}) {
  const url = `${origin}${route}`;
  const response = await fetch(url, {
    headers: { "cache-control": "no-cache" },
    redirect: "follow",
  });
  if (!response.ok && !allowErrorStatus) {
    fail(`${url} returned HTTP ${response.status}.`);
  }
  if (new URL(response.url).origin !== new URL(origin).origin) {
    fail(`${url} unexpectedly redirected to ${response.url}.`);
  }
  checkHeader(response, "x-content-type-options", (value) => value.toLowerCase() === "nosniff");
  checkHeader(response, "x-frame-options", (value) => value.toUpperCase() === "SAMEORIGIN");
  checkHeader(response, "referrer-policy", (value) => value === "strict-origin-when-cross-origin");
  checkHeader(
    response,
    "permissions-policy",
    (value) => value.includes("geolocation=()") && value.includes("microphone=()"),
  );
  if (origin.startsWith("https://")) {
    checkHeader(response, "strict-transport-security", (value) => /max-age=\d+/.test(value));
  }
  return { response, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function verifyResource(route, file, checkDocument) {
  const expected = artifactRoot ? await readFile(path.join(artifactRoot, file)) : null;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { response, bytes } = await fetchOnce(route);
      if (checkDocument) {
        const type = response.headers.get("content-type") ?? "";
        if (!type.toLowerCase().includes("text/html")) {
          fail(`${response.url} has unexpected content type ${type || "missing"}.`);
        }
        checkHtml(response.url, bytes.toString("utf8"));
      }
      if (expected && hash(bytes) !== hash(expected)) {
        fail(`${response.url} does not match the tested artifact ${file}.`);
      }
      console.log(`[production] OK ${route}${expected ? " (artifact matched)" : ""}`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

async function verifyEndpoint(route, expectedStatus) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const { response } = await fetchOnce(route, { allowErrorStatus: true });
      if (response.status !== expectedStatus) {
        fail(`${response.url} returned HTTP ${response.status}; expected ${expectedStatus}.`);
      }
      console.log(`[production] OK ${route} (HTTP ${expectedStatus})`);
      return;
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(retryDelayMs);
    }
  }
  throw lastError;
}

for (const page of pages) {
  await verifyResource(page.route, page.file, true);
}
for (const file of bundles) {
  await verifyResource(`/${file}`, file, false);
}
// GET is deliberately a no-op in trackEvent, so this proves the Hosting
// rewrite and deployed function are live without modifying analytics data.
await verifyEndpoint("/api/track", 204);
// GET must reach the protected function and be rejected. A 200 would mean the
// Hosting catch-all served index.html instead of the token exchange endpoint.
await verifyEndpoint("/api/admin-analytics-exclusion", 405);

console.log(
  `[production] Verified ${pages.length} public pages, ${bundles.length} app bundles, and both analytics rewrites at ${origin}.`,
);
