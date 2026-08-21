import { access, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { sameAs } from "./site_identity.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const webRoot = path.join(projectRoot, "web");
const guidesRoot = path.join(webRoot, "appeals");
const buildRoot = path.join(projectRoot, "build", "web");
const siteOrigin = "https://getmyyes.com";
// The reviewed social queue names the Remotion render each guide embeds.
const socialPosts = JSON.parse(
  await readFile(path.join(projectRoot, "marketing", "posts.json"), "utf8"),
);
const mode = process.argv[2] ?? "generate";
const discoveryFiles = [
  "analytics.js",
  "sitemap.xml",
  "feed.xml",
  "robots.txt",
  "llms.txt",
  "ae1eb6c514f913f2fa38028ca8b6699b.txt",
];
const publicStaticPages = ["privacy.html", "terms.html", "accessibility.html", "404.html"];
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
  { file: "sample-packet.html", canonical: `https://getmyyes.com/sample-packet` },
  { file: "editorial-policy.html", canonical: `https://getmyyes.com/editorial-policy` },
];

function fail(message) {
  throw new Error(`[marketing] ${message}`);
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
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

function validateSearchMetadata(html, file) {
  const title = decodeHtml(match(html, /<title>([\s\S]*?)<\/title>/i, "a title", file));
  const description = decodeHtml(metaDescription(html, file));
  if (title.length > 65) {
    fail(`${file} title is ${title.length} characters; keep it at 65 or fewer.`);
  }
  if (description.length > 170) {
    fail(`${file} meta description is ${description.length} characters; keep it at 170 or fewer.`);
  }
  validateCleanInternalLinks(html, file);
  return { title, description };
}

function jsonLdGraphs(html, file) {
  const graphs = [];
  for (const script of html.matchAll(
    /<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      graphs.push(JSON.parse(script[1]));
    } catch (error) {
      fail(`${file} has invalid JSON-LD: ${error.message}`);
    }
  }
  return graphs;
}

function schemaNodes(graphs) {
  return graphs.flatMap((graph) => Array.isArray(graph?.["@graph"])
    ? graph["@graph"]
    : [graph]);
}

function sitemapDateModified(html) {
  return html.match(
    /"dateModified"\s*:\s*"(\d{4}-\d{2}-\d{2})(?:T[^"]*)?"/,
  )?.[1] ?? null;
}

function requireGuideBreadcrumb(graphs, canonical, file) {
  const breadcrumb = schemaNodes(graphs).find((node) => node?.["@type"] === "BreadcrumbList");
  const items = breadcrumb?.itemListElement;
  if (!Array.isArray(items) || items.length !== 3) {
    fail(`${file} needs a three-level BreadcrumbList.`);
  }
  if (
    items[0]?.position !== 1 || items[0]?.item !== `${siteOrigin}/` ||
    items[1]?.position !== 2 || items[1]?.item !== `${siteOrigin}/appeals/` ||
    items[2]?.position !== 3 || items[2]?.item !== canonical
  ) {
    fail(`${file} has an invalid BreadcrumbList hierarchy.`);
  }
}

function requireArticleIdentity(graphs, html, canonical, file) {
  const article = schemaNodes(graphs).find((node) => node?.["@type"] === "Article");
  if (!article) fail(`${file} is missing Article structured data.`);
  if (
    article["@id"] !== `${canonical}#article`
    || article.url !== canonical
    || article.inLanguage !== "en-US"
    || article.mainEntityOfPage?.["@type"] !== "WebPage"
    || article.mainEntityOfPage?.["@id"] !== canonical
  ) {
    fail(`${file} Article identity does not match its canonical URL.`);
  }
  for (const role of ["author", "publisher"]) {
    if (
      article[role]?.["@type"] !== "Organization"
      || article[role]?.name !== "GetMyYes"
      || article[role]?.url !== `${siteOrigin}/`
    ) {
      fail(`${file} has incomplete Article ${role} identity.`);
    }
    // sameAs is how a search engine ties these pages to the brand entity.
    const profiles = article[role].sameAs;
    if (!Array.isArray(profiles) || sameAs.some((url) => !profiles.includes(url))) {
      fail(`${file} Article ${role} is missing the verified sameAs profiles.`);
    }
  }
  // Article rich results need an image; guides use their own card, the
  // reference sections share the site-wide one.
  if (!article.image?.startsWith(`${siteOrigin}/`) || !/\.(?:png|jpg|webp)$/.test(article.image)) {
    fail(`${file} Article needs an absolute image URL on this origin.`);
  }
  const isoWithTimezone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/;
  if (
    !isoWithTimezone.test(article.datePublished ?? "")
    || !isoWithTimezone.test(article.dateModified ?? "")
    || Date.parse(article.dateModified) < Date.parse(article.datePublished)
  ) {
    fail(`${file} needs valid, chronological Article dates with timezone information.`);
  }
  const visibleModified = html.match(
    /<time\b[^>]*\bdatetime=["']([^"']+)["'][^>]*>/i,
  )?.[1];
  if (visibleModified !== article.dateModified) {
    fail(`${file} visible updated date does not match Article dateModified.`);
  }
  if (sitemapDateModified(html) !== article.dateModified.slice(0, 10)) {
    fail(`${file} Article dateModified cannot be emitted as sitemap lastmod.`);
  }
}


/**
 * Every guide carries a Remotion-rendered summary video. Google only shows a
 * video rich result when the file is genuinely on the page, so the markup and
 * the <video> element are checked together — and the referenced files must
 * exist, because a VideoObject pointing at a 404 is a structured-data error
 * rather than a soft miss.
 */
async function requireGuideVideo(graphs, html, slug, canonical, file) {
  const post = socialPosts.find((entry) => entry.path.replace(/\/$/, "").endsWith(`/${slug}`));
  if (!post) fail(`${file} has no marketing/posts.json entry to source its video from.`);
  const video = schemaNodes(graphs).find((node) => node?.["@type"] === "VideoObject");
  if (!video) fail(`${file} is missing VideoObject structured data.`);
  const contentUrl = `${siteOrigin}/media/social/${post.id}-square.mp4`;
  const thumbnailUrl = `${siteOrigin}/media/social/${post.id}-poster.png`;
  if (
    video["@id"] !== `${canonical}#video`
    || video.contentUrl !== contentUrl
    || video.thumbnailUrl !== thumbnailUrl
  ) {
    fail(`${file} VideoObject does not match its rendered media.`);
  }
  for (const field of ["name", "description", "uploadDate", "duration"]) {
    if (!video[field]) fail(`${file} VideoObject is missing ${field}.`);
  }
  // Look at the markup only: the JSON-LD block already contains this URL, so
  // searching the whole document would match the claim instead of the embed.
  const markup = html.replace(/<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/gi, "");
  const embedded = /<video\b[\s\S]*?<\/video>/i.exec(markup)?.[0] ?? "";
  if (!embedded.includes(`/media/social/${post.id}-square.mp4`)) {
    fail(`${file} declares a VideoObject but never embeds the video on the page.`);
  }
  for (const asset of [`${post.id}-square.mp4`, `${post.id}-poster.png`]) {
    if (!(await fileExists(path.join(webRoot, "media", "social", asset)))) {
      fail(`${file} references web/media/social/${asset}, which does not exist.`);
    }
  }
}

/**
 * Guides make claims about deadlines and rights, so each one has to show its
 * work: the Article carries the authoritative sources the page already links,
 * and every citation must be a link that genuinely appears in the body.
 */
function requireGuideCitations(graphs, html, file) {
  const article = schemaNodes(graphs).find((node) => node?.["@type"] === "Article");
  const citations = article?.citation;
  if (!Array.isArray(citations) || citations.length === 0) {
    fail(`${file} Article is missing its source citations.`);
  }
  for (const citation of citations) {
    if (!citation?.url || !citation?.name) {
      fail(`${file} has a citation without a name or url.`);
    }
    if (!html.includes(`href="${citation.url}"`)) {
      fail(`${file} cites ${citation.url}, which the page does not link.`);
    }
  }
}
function requireStaticTracker(html, file) {
  if (!html.includes('<script src="/analytics.js" data-static></script>')) {
    fail(`${file} is missing the shared first-party visit counter.`);
  }
  if (html.includes("sendBeacon('/api/track'") || html.includes('sendBeacon("/api/track"')) {
    fail(`${file} still contains a stale inline visit counter.`);
  }
}

function requireSamplePacketChoice(html, file) {
  const sampleLinks = [...html.matchAll(/<a\b[^>]*\bhref=["']\/sample-packet["'][^>]*>/gi)];
  if (!sampleLinks.some((link) => /\bclass=["'][^"']*\bsample\b[^"']*["']/i.test(link[0]))) {
    fail(`${file} is missing the sample-packet choice beside its conversion CTA.`);
  }
}

function requirePreviewReassurance(html, file) {
  const reassurance = html.match(
    /<p\b[^>]*\bclass=["'][^"']*\bcta-trust\b[^"']*["'][^>]*\bid=["']preview-trust["'][^>]*>([\s\S]*?)<\/p>/i,
  )?.[1];
  if (
    !reassurance
    || !reassurance.includes("No card is required for the preview.")
    || !reassurance.includes("Unsaved guest uploads normally auto-delete after 24 hours.")
    || !/href=["']\/privacy["']/.test(reassurance)
  ) {
    fail(`${file} is missing the preview payment and retention reassurance.`);
  }
  const uploadLinks = [...html.matchAll(/<a\b[^>]*\bhref=["']\/#\/upload["'][^>]*>/gi)];
  if (!uploadLinks.some((link) => /\baria-describedby=["']preview-trust["']/i.test(link[0]))) {
    fail(`${file} does not programmatically associate the reassurance with its upload CTA.`);
  }
}

function requireOfficialCodeSources(html, file) {
  if (!/<aside\b[^>]*\bclass=["'][^"']*\bsources\b[^"']*["'][^>]*\baria-labelledby=["']official-code-sources["']/i.test(html)) {
    fail(`${file} is missing its visible official-source panel.`);
  }
  const urls = [
    "https://x12.org/codes/claim-adjustment-reason-codes",
    "https://x12.org/codes/remittance-advice-remark-codes",
    "https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice",
  ];
  for (const url of urls) {
    if (!html.includes(`href="${url}"`)) {
      fail(`${file} is missing official source ${url}.`);
    }
  }
}

function requireCodeFinder(html, expectedRows, file) {
  if (
    !/<div\b[^>]*\bclass=["'][^"']*\bcode-finder\b[^"']*["'][^>]*\brole=["']search["'][^>]*\baria-label=["']Search denial codes["']/i.test(html)
    || !/<label\b[^>]*\bfor=["']code-query["']/i.test(html)
    || !/<input\b[^>]*\bid=["']code-query["'][^>]*\btype=["']search["']/i.test(html)
    || !/id=["']code-results-status["'][^>]*\brole=["']status["'][^>]*\baria-live=["']polite["']/i.test(html)
    || !/id=["']code-no-results["'][^>]*\bhidden\b/i.test(html)
    || !/<script\b[^>]*\bsrc=["']\/codes\/code-finder\.js["'][^>]*\bdefer\b/i.test(html)
  ) {
    fail(`${file} is missing the accessible denial-code finder contract.`);
  }
  const rows = html.match(/<tr\b[^>]*\bdata-code-row\b[^>]*\bdata-code-search=["'][^"']+["']/gi) ?? [];
  if (rows.length !== expectedRows) {
    fail(`${file} exposes ${rows.length} searchable code rows; expected ${expectedRows}.`);
  }
}

function socialMetaContent(html, attribute, key, file) {
  const tag = (html.match(/<meta\b[^>]*>/gi) ?? []).find(
    (candidate) => candidate.includes(`${attribute}="${key}"`)
      || candidate.includes(`${attribute}='${key}'`),
  );
  const value = tag?.match(/\bcontent=(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  if (!value) fail(`${file} is missing ${key}.`);
  return value;
}

function requireSharePreview(html, file) {
  const ogTitle = socialMetaContent(html, "property", "og:title", file);
  const ogDescription = socialMetaContent(html, "property", "og:description", file);
  const ogImage = socialMetaContent(html, "property", "og:image", file);
  const ogImageAlt = socialMetaContent(html, "property", "og:image:alt", file);
  if (
    socialMetaContent(html, "property", "og:locale", file) !== "en_US"
    || socialMetaContent(html, "property", "og:image:type", file) !== "image/png"
    || socialMetaContent(html, "property", "og:image:width", file) !== "1200"
    || socialMetaContent(html, "property", "og:image:height", file) !== "630"
  ) {
    fail(`${file} has incomplete Open Graph image metadata.`);
  }
  if (socialMetaContent(html, "name", "twitter:card", file) !== "summary_large_image") {
    fail(`${file} must request a large social preview card.`);
  }
  if (
    socialMetaContent(html, "name", "twitter:title", file) !== ogTitle
    || socialMetaContent(html, "name", "twitter:description", file) !== ogDescription
    || socialMetaContent(html, "name", "twitter:image", file) !== ogImage
    || socialMetaContent(html, "name", "twitter:image:alt", file) !== ogImageAlt
  ) {
    fail(`${file} has mismatched Open Graph and Twitter preview metadata.`);
  }
}

/**
 * Internal links should point straight at the canonical HTTPS URL. Firebase's
 * cleanUrls feature intentionally redirects .html and directory aliases, but
 * publishing those variants creates avoidable "Page with redirect" discoveries
 * in Search Console and wastes crawler work.
 */
function validateCleanInternalLinks(html, file) {
  for (const found of html.matchAll(/<a\b[^>]*\bhref=(["'])([^"']+)\1/gi)) {
    const href = decodeHtml(found[2]).trim();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
      continue;
    }

    let url;
    try {
      url = new URL(href, siteOrigin);
    } catch {
      continue;
    }
    if (!["getmyyes.com", "www.getmyyes.com"].includes(url.hostname)) continue;

    if (url.protocol !== "https:" || url.hostname !== "getmyyes.com") {
      fail(`${file} links to redirecting origin ${href}; use ${siteOrigin}${url.pathname}${url.search}${url.hash}.`);
    }
    if (url.pathname === "/index.html" || url.pathname.endsWith(".html")) {
      fail(`${file} links to redirecting .html URL ${href}; use the clean URL.`);
    }
    if (["/appeals", "/codes", "/insurers"].includes(url.pathname)) {
      fail(`${file} links to redirecting directory URL ${href}; add the trailing slash.`);
    }
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

    const graphs = jsonLdGraphs(html, name);
    const ids = [...html.matchAll(/\sid=["']([^"']+)["']/g)].map((found) => found[1]);
    if (new Set(ids).size !== ids.length) fail(`${name} contains duplicate HTML ids.`);
    requireStaticTracker(html, name);
    validateSearchMetadata(html, name);

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
    requireGuideBreadcrumb(graphs, canonical, name);
    requireArticleIdentity(graphs, html, canonical, name);
    await requireGuideVideo(graphs, html, slug, canonical, name);
    requireGuideCitations(graphs, html, name);
    if (slugs.has(slug)) fail(`Duplicate guide slug: ${slug}.`);
    slugs.add(slug);

    pages.push({
      slug,
      canonical,
      title: decodeHtml(match(html, /<title>([\s\S]*?)<\/title>/i, "a title", name))
        .replace(/\s+[—-]\s+GetMyYes\s*$/i, ""),
      description: decodeHtml(metaDescription(html, name)),
      modified: sitemapDateModified(html),
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
    const graphs = jsonLdGraphs(html, name);
    requireStaticTracker(html, name);
    validateSearchMetadata(html, name);
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
    return graphs;
  };

  for (const name of codeNames) {
    const html = await readFile(path.join(codesRoot, name), "utf8");
    const expected = name === "index.html"
      ? `${siteOrigin}/codes/`
      : `${siteOrigin}/codes/${name.slice(0, -5)}`;
    requireSamplePacketChoice(html, `codes/${name}`);
    requirePreviewReassurance(html, `codes/${name}`);
    requireOfficialCodeSources(html, `codes/${name}`);
    requireSharePreview(html, `codes/${name}`);
    if (name === "index.html") {
      requireCodeFinder(html, codeSlugs.size, `codes/${name}`);
    }
    const graphs = validate(`codes/${name}`, html, expected);
    if (name !== "index.html") {
      requireArticleIdentity(graphs, html, expected, `codes/${name}`);
    }
    entries.push({
      url: expected,
      modified: sitemapDateModified(html),
    });
  }
  for (const name of insurerNames) {
    const html = await readFile(path.join(insurersRoot, name), "utf8");
    const expected = name === "index.html"
      ? `${siteOrigin}/insurers/`
      : `${siteOrigin}/insurers/${name.slice(0, -5)}`;
    requireSamplePacketChoice(html, `insurers/${name}`);
    requirePreviewReassurance(html, `insurers/${name}`);
    requireSharePreview(html, `insurers/${name}`);
    const graphs = validate(`insurers/${name}`, html, expected);
    if (name !== "index.html") {
      requireArticleIdentity(graphs, html, expected, `insurers/${name}`);
    }
    entries.push({
      url: expected,
      modified: sitemapDateModified(html),
    });
  }
  for (const page of standalonePages) {
    const html = await readFile(path.join(webRoot, page.file), "utf8");
    validate(page.file, html, page.canonical);
    entries.push({
      url: page.canonical,
      modified: sitemapDateModified(html),
    });
  }
  // The hub pages carry no Article dateModified of their own, so without this
  // they would ship no lastmod at all.
  for (const hub of [`${siteOrigin}/${codesRootName}/`, `${siteOrigin}/${insurersRootName}/`]) {
    const entry = entries.find((item) => item.url === hub);
    if (entry) {
      entry.modified = newestModified(
        entries.filter((item) => item.url.startsWith(hub) && item.url !== hub),
      );
    }
  }
  return entries;
}

/** A section hub lists its children, so its freshness is the freshest child. */
function newestModified(items) {
  return items.map((item) => item.modified).filter(Boolean).sort().at(-1) ?? null;
}

function sitemapFor(pages, extraEntries = []) {
  const entries = [
    { url: `${siteOrigin}/`, modified: null },
    { url: `${siteOrigin}/appeals/`, modified: newestModified(pages) },
    ...pages.map((page) => ({ url: page.canonical, modified: page.modified })),
    ...extraEntries,
    { url: `${siteOrigin}/accessibility`, modified: null },
    { url: `${siteOrigin}/terms`, modified: null },
    { url: `${siteOrigin}/privacy`, modified: null },
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
  validateSearchMetadata(index, "index.html");
  if (Buffer.byteLength(index, "utf8") > 120_000) {
    fail("The homepage exceeded its 120 KB uncompressed performance budget.");
  }
  if (/<script\b[^>]*\bsrc=["']\/?flutter_bootstrap\.js["']/i.test(index)
      || /<link\b[^>]*\bhref=["']\/?main\.dart\.js["']/i.test(index)) {
    fail("The public homepage must lazy-load Flutter only after app intent.");
  }
  if (!/s\.src\s*=\s*["']flutter_bootstrap\.js["']/.test(index)
      || !/\[data-boot\]/.test(index)) {
    fail("The homepage is missing its intent-driven Flutter boot path.");
  }
  if (!index.includes('<script src="/analytics.js"></script>')) {
    fail("The homepage is missing the auth-gated first-party visit counter.");
  }
  if (/three\.min\.js|window\.THREE|new\s+THREE\./.test(index)) {
    fail("The homepage reintroduced the retired Three.js landing dependency.");
  }
  if (/ticker-marquee|ticker-motion-toggle|class=["'][^"']*\bticker\b|[\u2715\u2716]/i.test(index)) {
    fail("The homepage must not reintroduce the alarming denial ticker or cross symbols.");
  }
  if (/\b(?:gsap|lenis)\b/i.test(index)) {
    fail("The calm homepage must not reintroduce motion libraries.");
  }
  if (!/id=["']hero-trust["']/.test(index)
      || !/data-boot=["']\/upload["'][^>]*aria-describedby=["']hero-trust["']/.test(index)) {
    fail("The primary homepage action must be linked to its no-card trust disclosure.");
  }
  if (!/class=["'][^"']*\breassurance-list\b[^"']*["']/.test(index)
      || !/No card required/i.test(index)
      || !/No subscription/i.test(index)
      || !/support@getmyyes\.com/i.test(index)
      || !/Stripe processes payments/i.test(index)) {
    fail("The homepage is missing the required reassurance and support details.");
  }
  if (!/\.evidence-number\s*\{[^}]*white-space:\s*nowrap\b/s.test(index)) {
    fail("Homepage evidence values must stay on one line.");
  }
  if (/class=["'][^"']*\bvoices\b/.test(index)) {
    fail("The homepage must not publish unverified outcome testimonials.");
  }
  if (!/<section\b[^>]*data-proof-carousel[^>]*aria-roledescription=["']carousel["']/.test(index)
      || (index.match(/<article\b[^>]*\bdata-proof-slide\b/g) ?? []).length !== 4
      || !/data-proof-prev[^>]*aria-label=["']Show previous proof["']/.test(index)
      || !/data-proof-next[^>]*aria-label=["']Show next proof["']/.test(index)
      || !/event\.key === ["']ArrowRight["']/.test(index)
      || !/toggleAttribute\(["']inert["']/.test(index)
      || !/pendingAnnouncement\s*=\s*announce/.test(index)
      || !/prefers-reduced-motion:\s*reduce/.test(index)) {
    fail("The homepage proof carousel is missing its manual, keyboard, or focus-safe controls.");
  }
  if (/setInterval\s*\(/.test(index)) {
    fail("The homepage proof carousel must never autoplay.");
  }
  if (/\.proof-slide \.proof-action\s*\{[^}]*padding(?:-top)?\s*:/s.test(index)) {
    fail("The homepage proof CTA must preserve centered button padding.");
  }
  if (!index.includes('href="/appeals/"')) fail("The homepage has no crawlable link to /appeals/.");
  if (!index.includes('href="/codes/"')) fail("The homepage has no crawlable link to /codes/.");
  if (!index.includes('href="/insurers/"')) fail("The homepage has no crawlable link to /insurers/.");
  const manifest = JSON.parse(
    await readFile(path.join(webRoot, "manifest.json"), "utf8"),
  );
  if (manifest.id !== "/" || manifest.scope !== "/" || manifest.start_url !== "/#/account") {
    fail("The installed app must reopen the same-origin My cases workspace.");
  }
  if (Object.hasOwn(manifest, "orientation")) {
    fail("The web app manifest must not lock device orientation.");
  }
  for (const name of publicStaticPages) {
    const html = await readFile(path.join(webRoot, name), "utf8");
    requireStaticTracker(html, name);
    validateSearchMetadata(html, name);
  }
  const privacy = await readFile(path.join(webRoot, "privacy.html"), "utf8");
  const terms = await readFile(path.join(webRoot, "terms.html"), "utf8");
  if (!privacy.includes('rel="canonical" href="https://getmyyes.com/privacy"')) {
    fail("privacy.html must canonicalize to the clean /privacy URL.");
  }
  if (!terms.includes('rel="canonical" href="https://getmyyes.com/terms"')) {
    fail("terms.html must canonicalize to the clean /terms URL.");
  }
  const notFound = await readFile(path.join(webRoot, "404.html"), "utf8");
  if (!/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(notFound)) {
    fail("404.html must be noindex.");
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
  const bootstrap = await readFile(path.join(buildRoot, "flutter_bootstrap.js"), "utf8");
  if (!/canvasKitBaseUrl\s*:\s*["']canvaskit\//.test(bootstrap)) {
    fail("The Flutter bootstrap is not configured for same-origin CanvasKit.");
  }
  if (/\n\s*serviceWorkerSettings\s*:\s*\{/.test(bootstrap)) {
    fail("The Flutter bootstrap must not register the deprecated generated service worker.");
  }
  const fontManifest = JSON.parse(
    await readFile(path.join(buildRoot, "assets", "FontManifest.json"), "utf8"),
  );
  if (!fontManifest.some((entry) => entry.family === "Roboto")) {
    fail("The local CanvasKit Roboto fallback is missing from FontManifest.json.");
  }
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
  for (const name of (await readdir(codesRoot)).filter((file) => /\.(html|js)$/.test(file))) {
    await assertEqual(path.join(codesRoot, name), path.join(buildRoot, codesRootName, name), `codes/${name}`);
  }
  const insurersRoot = path.join(webRoot, insurersRootName);
  for (const name of (await readdir(insurersRoot)).filter((file) => file.endsWith(".html"))) {
    await assertEqual(path.join(insurersRoot, name), path.join(buildRoot, insurersRootName, name), `insurers/${name}`);
  }
  for (const page of standalonePages) {
    await assertEqual(path.join(webRoot, page.file), path.join(buildRoot, page.file), page.file);
  }
  if (await fileExists(path.join(buildRoot, "js", "three.min.js"))) {
    fail("The deploy artifact still contains the retired Three.js bundle.");
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
