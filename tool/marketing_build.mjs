import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
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
  "analytics.js",
  "sitemap.xml",
  "feed.xml",
  "robots.txt",
  "llms.txt",
  "ae1eb6c514f913f2fa38028ca8b6699b.txt",
];
const publicStaticPages = ["privacy.html", "terms.html", "accessibility.html"];
const publicStaticAssets = [...publicStaticPages, "legal.css"];
// Marketing sections beyond /appeals/: the denial-code library, the
// insurer-specific appeal library, plus standalone tool/data pages.
// Validated and sitemapped like guides, but without per-page social images
// (they share the site-wide og-image.png).
const codesRootName = "codes";
const insurersRootName = "insurers";
const standalonePages = [
  { file: "tools/appeal-deadline-calculator.html", canonical: `https://getmyyes.com/tools/appeal-deadline-calculator` },
  { file: "insurer-denial-rates.html", canonical: `https://getmyyes.com/insurer-denial-rates` },
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

function requireStaticTracker(html, file) {
  if (!html.includes('<script src="/analytics.js" data-static></script>')) {
    fail(`${file} is missing the shared first-party visit counter.`);
  }
  if (html.includes("sendBeacon('/api/track'") || html.includes('sendBeacon("/api/track"')) {
    fail(`${file} still contains a stale inline visit counter.`);
  }
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
    requireStaticTracker(html, name);

    const socialSlug = name === "index.html" ? "index" : name.slice(0, -5);
    const expectedSocialImage = `${siteOrigin}/appeals/og/${socialSlug}.png`;
    const socialImage = match(
      html,
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
      "an Open Graph image",
      name,
    );
    if (socialImage !== expectedSocialImage) {
      fail(`${name} Open Graph image is ${socialImage}; expected ${expectedSocialImage}.`);
    }
    const socialImageFile = path.join(guidesRoot, "og", `${socialSlug}.png`);
    let socialImageSize;
    try {
      socialImageSize = (await stat(socialImageFile)).size;
    } catch {
      fail(`${name} points to missing social image appeals/og/${socialSlug}.png.`);
    }
    if (socialImageSize > 950_000) {
      fail(`appeals/og/${socialSlug}.png is too large for the Bluesky upload limit.`);
    }

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

/**
 * Validates non-guide marketing pages (denial codes + standalone tools) and
 * returns their sitemap entries. Same integrity rules as guides — canonical,
 * beacon, JSON-LD, resolvable internal links — minus per-page social images.
 */
async function extraModel(guideSlugs) {
  const entries = [];
  const codesRoot = path.join(webRoot, codesRootName);
  const codeNames = (await readdir(codesRoot)).filter((name) => name.endsWith(".html")).sort();
  if (!codeNames.includes("index.html")) fail("web/codes/index.html is missing.");
  const codeSlugs = new Set(codeNames.filter((n) => n !== "index.html").map((n) => n.slice(0, -5)));
  const insurersRoot = path.join(webRoot, insurersRootName);
  const insurerNames = (await readdir(insurersRoot)).filter((name) => name.endsWith(".html")).sort();
  if (!insurerNames.includes("index.html")) fail("web/insurers/index.html is missing.");
  const insurerSlugs = new Set(insurerNames.filter((n) => n !== "index.html").map((n) => n.slice(0, -5)));

  const validate = (name, html, expectedCanonical) => {
    for (const script of html.matchAll(
      /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi,
    )) {
      try {
        JSON.parse(script[1]);
      } catch (error) {
        fail(`${name} has invalid JSON-LD: ${error.message}`);
      }
    }
    requireStaticTracker(html, name);
    const canonical = match(
      html,
      /<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i,
      "a canonical URL",
      name,
    );
    if (canonical !== expectedCanonical) {
      fail(`${name} canonical is ${canonical}; expected ${expectedCanonical}.`);
    }
    metaDescription(html, name);
    for (const found of html.matchAll(/href=["'](\/appeals\/[^"'#?]*)/g)) {
      const route = found[1].replace(/\/$/, "");
      if (route === "/appeals" || /\.(css|png)$/.test(route)) continue;
      if (!guideSlugs.has(route.slice("/appeals/".length))) {
        fail(`${name} links to missing guide ${route}.`);
      }
    }
    for (const found of html.matchAll(/href=["'](\/codes\/[^"'#?]*)/g)) {
      const route = found[1].replace(/\/$/, "");
      if (route === "/codes") continue;
      if (!codeSlugs.has(route.slice("/codes/".length))) {
        fail(`${name} links to missing code page ${route}.`);
      }
    }
    for (const found of html.matchAll(/href=["'](\/insurers\/[^"'#?]*)/g)) {
      const route = found[1].replace(/\/$/, "");
      if (route === "/insurers") continue;
      if (!insurerSlugs.has(route.slice("/insurers/".length))) {
        fail(`${name} links to missing insurer page ${route}.`);
      }
    }
  };

  for (const name of codeNames) {
    const html = await readFile(path.join(codesRoot, name), "utf8");
    const expected = name === "index.html"
      ? `${siteOrigin}/codes/`
      : `${siteOrigin}/codes/${name.slice(0, -5)}`;
    validate(`codes/${name}`, html, expected);
    entries.push({ url: expected, modified: null });
  }
  for (const name of insurerNames) {
    const html = await readFile(path.join(insurersRoot, name), "utf8");
    const expected = name === "index.html"
      ? `${siteOrigin}/insurers/`
      : `${siteOrigin}/insurers/${name.slice(0, -5)}`;
    validate(`insurers/${name}`, html, expected);
    entries.push({ url: expected, modified: null });
  }
  for (const page of standalonePages) {
    const html = await readFile(path.join(webRoot, page.file), "utf8");
    validate(page.file, html, page.canonical);
    entries.push({ url: page.canonical, modified: null });
  }
  return entries;
}

function sitemapFor(pages, extraEntries = []) {
  const entries = [
    { url: `${siteOrigin}/`, modified: null },
    { url: `${siteOrigin}/appeals/`, modified: null },
    ...pages.map((page) => ({ url: page.canonical, modified: page.modified })),
    ...extraEntries,
    { url: `${siteOrigin}/accessibility`, modified: null },
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
  const extras = await extraModel(new Set(pages.map((page) => page.slug)));
  const index = await readFile(path.join(webRoot, "index.html"), "utf8");
  if (!index.includes('<script src="/analytics.js"></script>')) {
    fail("The homepage is missing the auth-gated first-party visit counter.");
  }
  if (!index.includes('href="/appeals/"')) fail("The homepage has no crawlable link to /appeals/.");
  if (!index.includes('href="/codes/"')) fail("The homepage has no crawlable link to /codes/.");
  if (!index.includes('href="/insurers/"')) fail("The homepage has no crawlable link to /insurers/.");
  for (const name of publicStaticPages) {
    requireStaticTracker(await readFile(path.join(webRoot, name), "utf8"), name);
  }
  await writeIfChanged(path.join(webRoot, "sitemap.xml"), sitemapFor(pages, extras));
  await writeIfChanged(path.join(webRoot, "feed.xml"), feedFor(pages));
  console.log(`[marketing] Generated sitemap + RSS for ${pages.length} guides and ${extras.length} reference pages.`);
}

async function stageBuild() {
  await access(buildRoot);
  await mkdir(path.join(buildRoot, "appeals"), { recursive: true });
  await cp(guidesRoot, path.join(buildRoot, "appeals"), { recursive: true, force: true });
  await mkdir(path.join(buildRoot, codesRootName), { recursive: true });
  await cp(path.join(webRoot, codesRootName), path.join(buildRoot, codesRootName), { recursive: true, force: true });
  await mkdir(path.join(buildRoot, insurersRootName), { recursive: true });
  await cp(path.join(webRoot, insurersRootName), path.join(buildRoot, insurersRootName), { recursive: true, force: true });
  await mkdir(path.join(buildRoot, "tools"), { recursive: true });
  for (const page of standalonePages) {
    await cp(path.join(webRoot, page.file), path.join(buildRoot, page.file), { force: true });
  }
  for (const name of discoveryFiles) {
    await cp(path.join(webRoot, name), path.join(buildRoot, name), { force: true });
  }
  for (const name of publicStaticAssets) {
    await cp(path.join(webRoot, name), path.join(buildRoot, name), { force: true });
  }
  console.log("[marketing] Staged guides, reference pages, and search-discovery files in build/web.");
}

async function verifyBuild() {
  const pages = await guideModel();
  await validatePosts(pages);
  await extraModel(new Set(pages.map((page) => page.slug)));
  for (const name of discoveryFiles) {
    await assertEqual(path.join(webRoot, name), path.join(buildRoot, name), name);
  }
  for (const name of publicStaticAssets) {
    await assertEqual(path.join(webRoot, name), path.join(buildRoot, name), name);
  }
  for (const name of (await readdir(guidesRoot)).filter((file) => /\.(html|css|js)$/.test(file))) {
    await assertEqual(path.join(guidesRoot, name), path.join(buildRoot, "appeals", name), `appeals/${name}`);
  }
  const codesRoot = path.join(webRoot, codesRootName);
  for (const name of (await readdir(codesRoot)).filter((file) => file.endsWith(".html"))) {
    await assertEqual(path.join(codesRoot, name), path.join(buildRoot, codesRootName, name), `codes/${name}`);
  }
  const insurersRoot = path.join(webRoot, insurersRootName);
  for (const name of (await readdir(insurersRoot)).filter((file) => file.endsWith(".html"))) {
    await assertEqual(path.join(insurersRoot, name), path.join(buildRoot, insurersRootName, name), `insurers/${name}`);
  }
  for (const page of standalonePages) {
    await assertEqual(path.join(webRoot, page.file), path.join(buildRoot, page.file), page.file);
  }
  const socialImagesRoot = path.join(guidesRoot, "og");
  for (const name of (await readdir(socialImagesRoot)).filter((file) => file.endsWith(".png"))) {
    await assertEqual(
      path.join(socialImagesRoot, name),
      path.join(buildRoot, "appeals", "og", name),
      `appeals/og/${name}`,
    );
  }
  console.log(`[marketing] Verified deploy artifact: ${pages.length} guides are crawlable and current.`);
}

if (mode === "generate") await generate();
else if (mode === "--stage-build") await stageBuild();
else if (mode === "--verify-build") await verifyBuild();
else fail(`Unknown mode: ${mode}`);
