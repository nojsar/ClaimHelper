import { access, cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = path.join(projectRoot, "web");
const guidesRoot = path.join(webRoot, "appeals");
const buildRoot = path.join(projectRoot, "build", "web");
const siteOrigin = "https://getmyyes.com";
const mode = process.argv[2] ?? "generate";
const discoveryFiles = [
  "sitemap.xml",
  "feed.xml",
  "robots.txt",
  "ae1eb6c514f913f2fa38028ca8b6699b.txt",
];

function fail(message) {
  throw new Error(`[marketing] ${message}`);
}

function match(html, pattern, label, file) {
  const value = html.match(pattern)?.[1]?.trim();
  if (!value) fail(`${file} is missing ${label}.`);
  return value;
}

function decodeHtml(value) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(Number.parseInt(n, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function metaDescription(html, file) {
  const tag = html.match(/<meta\b[^>]*\bname=["']description["'][^>]*>/i)?.[0];
  const value = tag?.match(/\bcontent=(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  if (!value) fail(`${file} is missing a meta description.`);
  return value;
}

function xml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

async function guideModel() {
  const names = (await readdir(guidesRoot))
    .filter((name) => name.endsWith(".html"))
    .sort();
  if (!names.includes("index.html")) fail("web/appeals/index.html is missing.");

  const pages = [];
  const slugs = new Set();
  const allHtml = new Map();

  for (const name of names) {
    const html = await readFile(path.join(guidesRoot, name), "utf8");
    allHtml.set(name, html);

    for (const script of html.matchAll(
      /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        JSON.parse(script[1]);
      } catch (error) {
        fail(`${name} has invalid JSON-LD: ${error.message}`);
      }
    }
    const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((found) => found[1]);
    if (new Set(ids).size !== ids.length) fail(`${name} contains duplicate HTML ids.`);
    if (!html.includes("/api/track")) fail(`${name} is missing the first-party visit counter.`);

    if (name === "index.html") continue;

    const slug = name.slice(0, -5);
    const canonical = match(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i,
      "a canonical URL",
      name,
    );
    const expected = `${siteOrigin}/appeals/${slug}`;
    if (canonical !== expected) {
      fail(`${name} canonical is ${canonical}; expected ${expected}.`);
    }
    if (slugs.has(slug)) fail(`Duplicate guide slug: ${slug}.`);
    slugs.add(slug);

    pages.push({
      slug,
      canonical,
      title: decodeHtml(match(html, /<title>([\s\S]*?)<\/title>/i, "a title", name))
        .replace(/\s+[—-]\s+GetMyYes\s*$/i, ""),
      description: decodeHtml(metaDescription(html, name)),
      modified: html.match(/"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1] ?? null,
    });
  }

  // A linked-but-missing guide silently falls through to the Flutter SPA on
  // Firebase Hosting. Treat it as a build error instead of shipping a fake 200.
  for (const [name, html] of allHtml) {
    for (const found of html.matchAll(/href=["'](\/appeals\/[^"'#?]*)/g)) {
      const route = found[1].replace(/\/$/, "");
      if (route === "/appeals") continue;
      const slug = route.slice("/appeals/".length);
      if (!slugs.has(slug)) fail(`${name} links to missing guide ${route}.`);
    }
  }

  return pages.sort((a, b) => a.title.localeCompare(b.title));
}

function sitemapFor(pages) {
  const entries = [
    { url: `${siteOrigin}/`, modified: null },
    { url: `${siteOrigin}/appeals/`, modified: null },
    ...pages.map((page) => ({ url: page.canonical, modified: page.modified })),
    { url: `${siteOrigin}/terms.html`, modified: null },
    { url: `${siteOrigin}/privacy.html`, modified: null },
  ];
  const body = entries.map(({ url, modified }) => [
    "  <url>",
    `    <loc>${xml(url)}</loc>`,
    ...(modified ? [`    <lastmod>${modified}</lastmod>`] : []),
    "  </url>",
  ].join("\n")).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

function feedFor(pages) {
  const dated = pages
    .filter((page) => page.modified)
    .sort((a, b) => b.modified.localeCompare(a.modified) || a.title.localeCompare(b.title));
  const newest = dated[0]?.modified ?? "2026-07-11";
  const items = dated.map((page) => `    <item>
      <title>${xml(page.title)}</title>
      <link>${xml(page.canonical)}</link>
      <guid isPermaLink="true">${xml(page.canonical)}</guid>
      <pubDate>${new Date(`${page.modified}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${xml(page.description)}</description>
    </item>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>GetMyYes Health Insurance Appeal Guides</title>
    <link>${siteOrigin}/appeals/</link>
    <atom:link href="${siteOrigin}/feed.xml" rel="self" type="application/rss+xml" />
    <description>Plain-English health insurance appeal guides and free letter templates.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(`${newest}T12:00:00Z`).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

async function writeIfChanged(file, value) {
  let previous = null;
  try {
    previous = await readFile(file, "utf8");
  } catch {
    // The generated file does not exist yet.
  }
  if (previous !== value) await writeFile(file, value, "utf8");
}

async function assertEqual(left, right, label) {
  const [a, b] = await Promise.all([readFile(left), readFile(right)]);
  if (!a.equals(b)) fail(`${label} is missing or stale in build/web. Rebuild before deploying.`);
}

async function validatePosts(pages) {
  const postsFile = path.join(projectRoot, "marketing", "posts.json");
  const posts = JSON.parse(await readFile(postsFile, "utf8"));
  if (!Array.isArray(posts) || posts.length === 0) fail("marketing/posts.json has no posts.");
  const slugs = new Set(pages.map((page) => page.slug));
  const ids = new Set();
  for (const post of posts) {
    if (!post?.id || ids.has(post.id)) fail(`Duplicate or missing marketing post id: ${post?.id}.`);
    ids.add(post.id);
    if (!post.path?.startsWith("/appeals/")) fail(`${post.id} has an invalid path.`);
    if (!slugs.has(post.path.slice("/appeals/".length))) {
      fail(`${post.id} points to a missing guide: ${post.path}.`);
    }
    if (typeof post.text !== "string" || post.text.length < 40 || post.text.length > 110) {
      fail(`${post.id} text must be 40–110 characters before its link.`);
    }
  }
}

async function generate() {
  const pages = await guideModel();
  await validatePosts(pages);
  const index = await readFile(path.join(webRoot, "index.html"), "utf8");
  if (!index.includes('href="/appeals/"')) fail("The homepage has no crawlable link to /appeals/.");
  await writeIfChanged(path.join(webRoot, "sitemap.xml"), sitemapFor(pages));
  await writeIfChanged(path.join(webRoot, "feed.xml"), feedFor(pages));
  console.log(`[marketing] Generated sitemap + RSS for ${pages.length} guides.`);
}

async function stageBuild() {
  await access(buildRoot);
  await mkdir(path.join(buildRoot, "appeals"), { recursive: true });
  await cp(guidesRoot, path.join(buildRoot, "appeals"), { recursive: true, force: true });
  for (const name of discoveryFiles) {
    await cp(path.join(webRoot, name), path.join(buildRoot, name), { force: true });
  }
  console.log("[marketing] Staged guides and search-discovery files in build/web.");
}

async function verifyBuild() {
  const pages = await guideModel();
  await validatePosts(pages);
  for (const name of discoveryFiles) {
    await assertEqual(path.join(webRoot, name), path.join(buildRoot, name), name);
  }
  for (const name of (await readdir(guidesRoot)).filter((file) => /\.(html|css|js)$/.test(file))) {
    await assertEqual(path.join(guidesRoot, name), path.join(buildRoot, "appeals", name), `appeals/${name}`);
  }
  console.log(`[marketing] Verified deploy artifact: ${pages.length} guides are crawlable and current.`);
}

if (mode === "generate") await generate();
else if (mode === "--stage-build") await stageBuild();
else if (mode === "--verify-build") await verifyBuild();
else fail(`Unknown mode: ${mode}`);
