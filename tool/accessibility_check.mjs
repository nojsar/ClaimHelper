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

  must(file, /<html\b[^>]*\blang=["'][^"']+["']/i.test(html), "the document language is missing.");
  must(file, /<title>\s*[^<]+\s*<\/title>/i.test(html), "a descriptive title is missing.");
  must(file, !/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?:\.0)?/i.test(html), "browser zoom is disabled.");
  must(file, (html.match(/<h1\b/gi) ?? []).length === 1, "the page must contain exactly one h1.");
  must(file, /<main\b[^>]*\bid=["']main-content["']/i.test(html), "main#main-content landmark is missing.");
  must(file, /<a\b[^>]*\bhref=["']#main-content["'][^>]*>/i.test(html), "a skip-to-main link is missing.");
  must(file, !/tabindex=["']?[1-9]/i.test(html), "positive tabindex disrupts the natural focus order.");
  must(file, /:focus-visible/i.test(css), "visible keyboard focus styling is missing.");
  must(file, /prefers-reduced-motion\s*:\s*reduce/i.test(css), "reduced-motion handling is missing.");

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    must(file, /\salt\s*=\s*(["'])[^"']*\1/i.test(match[0]), `image is missing alt text: ${match[0].slice(0, 100)}`);
  }
  for (const match of html.matchAll(/(<button\b[^>]*>)([\s\S]*?)<\/button>/gi)) {
    must(file, hasAccessibleName(match[1], match[2]), `button has no accessible name: ${match[1]}`);
  }
  for (const match of html.matchAll(/(<a\b[^>]*>)([\s\S]*?)<\/a>/gi)) {
    must(file, hasAccessibleName(match[1], match[2]), `link has no accessible name: ${match[1]}`);
  }
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = match[0];
    if ((attribute(tag, "type") ?? "").toLowerCase() === "hidden") continue;
    const id = attribute(tag, "id");
    const labelled = attribute(tag, "aria-label") || attribute(tag, "aria-labelledby");
    const explicitLabel = id && new RegExp(`<label\\b[^>]*\\bfor=["']${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`, "i").test(html);
    must(file, Boolean(labelled || explicitLabel), `form input has no programmatic label: ${tag.slice(0, 100)}`);
  }
  const navs = [...html.matchAll(/<nav\b[^>]*>/gi)];
  if (navs.length > 1) {
    for (const nav of navs) {
      must(file, Boolean(attribute(nav[0], "aria-label") || attribute(nav[0], "aria-labelledby")), `navigation landmark needs a unique label: ${nav[0]}`);
    }
  }
  for (const table of html.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    must(file, /<caption\b[^>]*>[\s\S]*?<\/caption>/i.test(table[0]), "data table is missing a caption.");
    for (const header of table[0].matchAll(/<th\b[^>]*>/gi)) {
      must(file, /\bscope=["'](?:col|row|colgroup|rowgroup)["']/i.test(header[0]), `table header is missing scope: ${header[0]}`);
    }
  }

  if (isGuide) {
    checkContrastToken(file, css, "muted", "paper");
  } else if (path.basename(file) === "index.html") {
    checkContrastToken(file, css, "ink-faint", "paper");
  } else {
    checkContrastToken(file, css, "dim", "bg");
  }
}

if (failures.length) {
  console.error(`[accessibility] ${failures.length} static accessibility regression(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`[accessibility] Checked ${files.length} public pages against the static WCAG regression rules.`);
}
