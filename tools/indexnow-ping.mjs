#!/usr/bin/env node
/**
 * IndexNow ping — tells Bing/DuckDuckGo/Seznam/Naver (and anyone else on the
 * IndexNow protocol) that our pages changed, so they re-crawl within minutes
 * instead of weeks. No account needed: ownership is proven by the key file
 * hosted at https://getmyyes.com/<key>.txt (lives in web/, deployed with
 * Hosting). Google does not support IndexNow — it discovers via sitemap.xml
 * and Search Console instead.
 *
 * Usage:  node tools/indexnow-ping.mjs             # pings every sitemap URL
 *         node tools/indexnow-ping.mjs <url> ...   # pings specific URLs
 *         node tools/indexnow-ping.mjs --dry-run   # validates without sending
 *
 * Run after every Hosting deploy that adds or changes public pages.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HOST = "getmyyes.com";
const KEY = "ae1eb6c514f913f2fa38028ca8b6699b";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function sitemapUrls() {
  const xml = readFileSync(join(root, "web", "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

const dryRun = process.argv.includes("--dry-run");
const requested = process.argv.slice(2).filter((arg) => arg !== "--dry-run");
const urls = requested.length ? requested : sitemapUrls();
if (urls.length === 0) throw new Error("No URLs found to submit.");
for (const value of urls) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== HOST) {
    throw new Error(`Refusing to submit an off-site or insecure URL: ${value}`);
  }
}

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList: urls,
};

if (dryRun) {
  console.log(`IndexNow dry run: ${urls.length} validated URL(s); key file ${payload.keyLocation}`);
  process.exit(0);
}

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(payload),
});

// 200 = accepted, 202 = accepted (key validation pending). Anything else is a
// real problem worth surfacing.
console.log(`IndexNow: ${res.status} ${res.statusText} — ${urls.length} URL(s) submitted`);
if (res.status !== 200 && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
