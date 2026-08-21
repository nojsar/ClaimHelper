import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requestedRoot = process.argv[2] ?? "web";
const siteRoot = path.resolve(projectRoot, requestedRoot);
const failures = [];

function fail(file, message) {
  failures.push(`${path.relative(projectRoot, file)}: ${message}`);
}

function must(file, condition, message) {
  if (!condition) fail(file, message);
}

function textContent(fragment) {
  return fragment
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&[a-z#0-9]+;/gi, "x")
    .trim();
}

function attribute(tag, name) {
  return tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])([\\s\\S]*?)\\1`, "i"))?.[2];
}

function withoutEmbeddedCode(html) {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "");
}

function openingTags(fragment, elementPattern) {
  return [...fragment.matchAll(new RegExp(`<(?:${elementPattern})\\b[^>]*>`, "gi"))];
}

function hasAccessibleName(tag, inner = "") {
  return Boolean(
    textContent(inner)
    || attribute(tag, "aria-label")?.trim()
    || attribute(tag, "aria-labelledby")?.trim()
    || attribute(tag, "title")?.trim(),
  );
}

function hexToRgb(hex) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return null;
  return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function luminance(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  const [red, green, blue] = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrastRatio(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  if (a == null || b == null) return null;
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function cssVariable(css, name) {
  return css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
}

function checkContrastToken(file, css, foregroundName, backgroundName, minimum = 4.5) {
  const foreground = cssVariable(css, foregroundName);
  const background = cssVariable(css, backgroundName);
  if (!foreground || !background) return;
  const ratio = contrastRatio(foreground, background);
  must(
    file,
    ratio >= minimum,
    `--${foregroundName} on --${backgroundName} is ${ratio.toFixed(2)}:1; expected at least ${minimum}:1.`,
  );
}

async function pageFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await pageFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const guideCss = await readFile(path.join(siteRoot, "appeals", "guide.css"), "utf8");
const files = await pageFiles(siteRoot);
const relativeFiles = new Set(files.map((file) => path.relative(siteRoot, file)));
const pageTitles = new Map();
for (const required of ["index.html", "privacy.html", "terms.html", "accessibility.html"]) {
  if (!relativeFiles.has(required)) fail(path.join(siteRoot, required), "required public page is missing.");
}

for (const file of files) {
  let html;
  try {
    html = await readFile(file, "utf8");
  } catch {
    fail(file, "required public page is missing.");
    continue;
  }
  // Any page that links the shared guide stylesheet inherits its focus,
  // reduced-motion, and contrast tokens (appeals, codes, tools, data pages).
  const isGuide = path.basename(path.dirname(file)) === "appeals"
    || /appeals\/guide\.css/.test(html);
  const css = `${html}\n${isGuide ? guideCss : ""}`;
  const semanticHtml = withoutEmbeddedCode(html);
  const title = html.match(/<title>\s*([^<]+?)\s*<\/title>/i)?.[1]?.trim();
  const previousTitleFile = title && pageTitles.get(title);
  if (title && !previousTitleFile) pageTitles.set(title, file);

  const ids = new Set();
  for (const match of semanticHtml.matchAll(/<[^>]+\sid\s*=\s*(["'])([^"']+)\1[^>]*>/gi)) {
    const id = match[2];
    must(file, !ids.has(id), `duplicate id "${id}" makes labels and targets ambiguous.`);
    ids.add(id);
  }

  must(file, /<html\b[^>]*\blang=["'][^"']+["']/i.test(html), "the document language is missing.");
  must(file, /<meta\b[^>]*\bcharset=["']?utf-8/i.test(html), "UTF-8 character encoding metadata is missing.");
  must(file, Boolean(title), "a descriptive title is missing.");
  must(file, !previousTitleFile, `page title duplicates ${path.relative(projectRoot, previousTitleFile ?? file)}.`);
  must(file, /<meta\b[^>]*\bname=["']viewport["'][^>]*\bcontent=["'][^"']*width=device-width[^"']*initial-scale=1(?:\.0)?/i.test(html), "responsive viewport metadata is missing or incomplete.");
  must(file, !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?/i.test(html), "browser zoom is disabled.");
  if (path.relative(siteRoot, file) === "index.html") {
    const hasRuntimeZoomGuard = /<script\b[^>]*\bid=["']preserve-browser-zoom["']/i.test(html)
      && /new\s+MutationObserver\s*\(/i.test(html)
      && /querySelectorAll\s*\(\s*["']meta\[name=["']viewport["']\]["']\s*\)/i.test(html);
    must(file, hasRuntimeZoomGuard, "Flutter runtime viewport mutations are not guarded, so app routes can disable zoom.");
  }
  must(file, (semanticHtml.match(/<h1\b/gi) ?? []).length === 1, "the page must contain exactly one h1.");
  must(file, (semanticHtml.match(/<main\b/gi) ?? []).length === 1, "the page must contain exactly one main landmark.");
  must(file, /<main\b[^>]*\bid=["']main-content["']/i.test(html), "main#main-content landmark is missing.");
  must(file, /<footer\b/i.test(semanticHtml), "the page footer landmark is missing.");
  must(file, /<a\b[^>]*\bhref=["']#main-content["'][^>]*>/i.test(html), "a skip-to-main link is missing.");
  must(file, !/tabindex=["']?[1-9]/i.test(html), "positive tabindex disrupts the natural focus order.");
  must(file, /:focus-visible/i.test(css), "visible keyboard focus styling is missing.");
  must(file, /prefers-reduced-motion\s*:\s*reduce/i.test(css), "reduced-motion handling is missing.");
  const hasInfiniteAnimation = /animation(?:-iteration-count)?\s*:[^;{}]*\binfinite\b/i.test(css);
  const hasAnimationControl = /<button\b[^>]*\bdata-animation-control\b[^>]*>/i.test(html)
    && /animation-play-state\s*:\s*paused\b/i.test(css);
  must(file, !hasInfiniteAnimation || hasAnimationControl, "an automatic infinite animation has no pause or stop mechanism.");

  let previousHeadingLevel = 0;
  for (const heading of semanticHtml.matchAll(/<h([1-6])\b[^>]*>/gi)) {
    const level = Number(heading[1]);
    if (previousHeadingLevel) {
      must(file, level <= previousHeadingLevel + 1, `heading level jumps from h${previousHeadingLevel} to h${level}.`);
    }
    previousHeadingLevel = level;
  }

  for (const tagMatch of semanticHtml.matchAll(/<[^>]+>/g)) {
    const tag = tagMatch[0];
    for (const referenceName of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-details", "aria-errormessage"]) {
      const references = attribute(tag, referenceName)?.trim().split(/\s+/).filter(Boolean) ?? [];
      for (const reference of references) {
        must(file, ids.has(reference), `${referenceName} references missing id "${reference}".`);
      }
    }
  }

  for (const hashLink of semanticHtml.matchAll(/<a\b[^>]*\bhref=["']#([^"']+)["'][^>]*>/gi)) {
    must(file, ids.has(hashLink[1]), `link target #${hashLink[1]} does not exist.`);
  }

  for (const match of semanticHtml.matchAll(/<img\b[^>]*>/gi)) {
    must(file, /\salt\s*=\s*(["'])[^"']*\1/i.test(match[0]), `image is missing alt text: ${match[0].slice(0, 100)}`);
  }
  const metaTags = openingTags(semanticHtml, "meta").map((match) => match[0]);
  const twitterImage = metaTags.find(
    (tag) => (attribute(tag, "name") ?? "").toLowerCase() === "twitter:image",
  );
  if (twitterImage) {
    const twitterImageAlt = metaTags.find(
      (tag) => (attribute(tag, "name") ?? "").toLowerCase() === "twitter:image:alt",
    );
    must(
      file,
      Boolean(attribute(twitterImageAlt ?? "", "content")?.trim()),
      "the social preview image is missing twitter:image:alt text.",
    );
  }
  for (const match of semanticHtml.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/gi)) {
    must(file, hasAccessibleName(match[1], match[2]), `button has no accessible name: ${match[1]}`);
    must(file, /\stype=["'](?:button|submit|reset)["']/i.test(match[1]), `button is missing an explicit type: ${match[1]}`);
  }
  for (const match of semanticHtml.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) {
    must(file, hasAccessibleName(match[1], match[2]), `link has no accessible name: ${match[1]}`);
    if ((attribute(match[1], "target") ?? "").toLowerCase() === "_blank") {
      must(file, /\bnoopener\b/i.test(attribute(match[1], "rel") ?? ""), `new-window link is missing rel="noopener": ${match[1]}`);
    }
  }
  for (const match of openingTags(semanticHtml, "input|select|textarea")) {
    const tag = match[0];
    if ((attribute(tag, "type") ?? "").toLowerCase() === "hidden") continue;
    const id = attribute(tag, "id");
    const labelled = attribute(tag, "aria-label") || attribute(tag, "aria-labelledby");
    const explicitLabel = id && new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html);
    must(file, Boolean(labelled || explicitLabel), `form control has no programmatic label: ${tag.slice(0, 100)}`);
  }
  for (const svg of semanticHtml.matchAll(/(<svg\b[^>]*>)([\s\S]*?)<\/svg>/gi)) {
    const hidden = (attribute(svg[1], "aria-hidden") ?? "").toLowerCase() === "true";
    const named = hasAccessibleName(svg[1], /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(svg[2])?.[1] ?? "");
    must(file, hidden || named, `informative SVG has no accessible name: ${svg[1].slice(0, 100)}`);
  }
  for (const iframe of semanticHtml.matchAll(/<iframe\b[^>]*>/gi)) {
    must(file, Boolean(attribute(iframe[0], "title")?.trim()), `iframe is missing a descriptive title: ${iframe[0].slice(0, 100)}`);
  }
  for (const media of semanticHtml.matchAll(/(<(?:video|audio)\b[^>]*>)([\s\S]*?)<\/(?:video|audio)>/gi)) {
    const tag = media[1];
    const decorativeMutedVideo = /^<video\b/i.test(tag)
      && /\bmuted\b/i.test(tag)
      && (attribute(tag, "aria-hidden") ?? "").toLowerCase() === "true";
    if (!decorativeMutedVideo) {
      must(file, /\bcontrols\b/i.test(tag), `media must expose native controls: ${tag.slice(0, 100)}`);
      must(file, !/\bautoplay\b/i.test(tag), `media must not autoplay without a stop mechanism: ${tag.slice(0, 100)}`);
      if (/^<video\b/i.test(tag) && !/\bmuted\b/i.test(tag)) {
        const hasCaptions = /<track\b[^>]*\bkind=["']captions["']/i.test(media[2]);
        must(file, hasCaptions || Boolean(attribute(tag, "aria-describedby")), `video with audio needs captions or a linked transcript: ${tag.slice(0, 100)}`);
      }
    }
  }
  const navs = [...semanticHtml.matchAll(/<nav\b[^>]*>/gi)];
  if (navs.length > 1) {
    const navLabels = new Set();
    for (const nav of navs) {
      const navLabel = attribute(nav[0], "aria-label") || attribute(nav[0], "aria-labelledby");
      must(file, Boolean(navLabel), `navigation landmark needs a unique label: ${nav[0]}`);
      if (navLabel) {
        must(file, !navLabels.has(navLabel.toLowerCase()), `navigation landmark label "${navLabel}" is duplicated.`);
        navLabels.add(navLabel.toLowerCase());
      }
    }
  }
  const tables = [...semanticHtml.matchAll(/<table\b[\s\S]*?<\/table>/gi)];
  for (const table of tables) {
    must(file, /<caption\b[^>]*>[\s\S]*?<\/caption>/i.test(table[0]), "data table is missing a caption.");
    for (const header of table[0].matchAll(/<th\b[^>]*>/gi)) {
      must(file, /\bscope=["'](?:col|row|colgroup|rowgroup)["']/i.test(header[0]), `table header is missing scope: ${header[0]}`);
    }
  }
  const keyboardScrollableTables = [...semanticHtml.matchAll(/<((?:div|section))\b([^>]*\bclass=["'][^"']*\btable-wrap\b[^"']*["'][^>]*)>[\s\S]*?<table\b[\s\S]*?<\/table>[\s\S]*?<\/\1>/gi)];
  if (tables.length) {
    must(file, keyboardScrollableTables.length === tables.length, "every horizontally scrollable table needs its own keyboard-accessible container.");
  }
  for (const wrapper of keyboardScrollableTables) {
    const openingTag = `<${wrapper[1]}${wrapper[2]}>`;
    must(file, attribute(openingTag, "tabindex") === "0", `scrollable table container must have tabindex="0": ${openingTag}`);
    must(file, Boolean(attribute(openingTag, "aria-label") || attribute(openingTag, "aria-labelledby")), `scrollable table container needs an accessible name: ${openingTag}`);
    must(file, wrapper[1].toLowerCase() === "section" || (attribute(openingTag, "role") ?? "").toLowerCase() === "region", `scrollable table container must expose a region landmark: ${openingTag}`);
  }

  if (isGuide) {
    checkContrastToken(file, css, "muted", "paper");
    checkContrastToken(file, css, "carmine", "paper");
    checkContrastToken(file, css, "green", "paper");
    checkContrastToken(file, css, "green-on-dark", "panel-dark");
    checkContrastToken(file, css, "control-border", "letter", 3);
  } else if (path.basename(file) === "index.html") {
    for (const token of ["background", "surface", "navy", "navy-dark", "teal-dark", "text", "text-soft", "muted", "error"]) {
      must(file, new RegExp(`--${token}\\s*:\\s*#[0-9a-f]{6}\\b`, "i").test(css), `homepage is missing the required --${token} color token.`);
    }
    must(file, /body\s*\{[^}]*font-size:\s*18px\b[^}]*line-height:\s*1\.6[05]\b/s.test(css), "homepage body copy must retain an older-adult-friendly 18px size and generous line height.");
    must(file, /\.button\s*\{[^}]*min-height:\s*(?:4[89]|[5-9]\d)px\b/s.test(css), "homepage buttons must retain at least a 48px target height.");
    must(file, /id=["']hero-trust["']/.test(html), "homepage primary action needs a visible trust disclosure.");
    must(file, !/ticker-marquee|ticker-motion-toggle|[\u2715\u2716]/i.test(html), "homepage must not use an alarming cross ticker.");
    checkContrastToken(file, css, "text-soft", "background");
    checkContrastToken(file, css, "muted", "background");
    checkContrastToken(file, css, "navy", "background");
    checkContrastToken(file, css, "teal-dark", "background");
  } else {
    checkContrastToken(file, css, "dim", "bg");
    checkContrastToken(file, css, "blue", "bg");
  }
}

if (failures.length) {
  console.error(`[accessibility] ${failures.length} static accessibility regression(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`[accessibility] Checked ${files.length} public pages against the static WCAG regression rules.`);
}
