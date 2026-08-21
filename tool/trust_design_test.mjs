import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const [
  home,
  theme,
  guides,
  legal,
  manifestSource,
  imageGenerator,
  purchaseSuccess,
  deadlineCalculator,
  uploadScreen,
  previewPaywall,
  appScaffold,
  caseLoader,
] = await Promise.all([
  readFile(path.join(root, "web", "index.html"), "utf8"),
  readFile(path.join(root, "lib", "core", "theme.dart"), "utf8"),
  readFile(path.join(root, "web", "appeals", "guide.css"), "utf8"),
  readFile(path.join(root, "web", "legal.css"), "utf8"),
  readFile(path.join(root, "web", "manifest.json"), "utf8"),
  readFile(path.join(root, "tools", "og-image.py"), "utf8"),
  readFile(path.join(root, "lib", "features", "preview", "purchase_success_screen.dart"), "utf8"),
  readFile(path.join(root, "web", "tools", "appeal-deadline-calculator.html"), "utf8"),
  readFile(path.join(root, "lib", "features", "upload", "upload_screen.dart"), "utf8"),
  readFile(path.join(root, "lib", "features", "preview", "preview_paywall_screen.dart"), "utf8"),
  readFile(path.join(root, "lib", "widgets", "app_scaffold.dart"), "utf8"),
  readFile(path.join(root, "lib", "widgets", "case_loader.dart"), "utf8"),
]);

function token(css, name) {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*(#[0-9a-f]{6})\\b`, "i"));
  assert.ok(match, `Missing required --${name} color token.`);
  return match[1].toUpperCase();
}

function dartColor(source, name) {
  const match = source.match(new RegExp(`static const ${name} = Color\\(0xFF([0-9A-F]{6})\\)`));
  assert.ok(match, `Missing AppColors.${name}.`);
  return `#${match[1]}`;
}

assert.doesNotMatch(
  home,
  /ticker-marquee|ticker-motion-toggle|class=["'][^"']*\bticker\b|[\u2715\u2716]/i,
  "The homepage must not use denial crosses or a moving denial ticker.",
);
assert.doesNotMatch(home, /\b(?:gsap|lenis)\b/i, "The calm homepage must not load motion libraries.");
assert.doesNotMatch(
  home,
  /the insurer stamped no|draft the comeback|reply harder|the reckoning|class=["'][^"']*\bvoices\b/i,
  "The homepage must not use aggressive copy or unverified testimonial styling.",
);

assert.match(home, /id=["']hero-trust["']/i, "The hero trust disclosure is required.");
assert.match(home, /Example of your free summary/i, "The hero must show tangible product proof.");
assert.match(home, /Preview \$0; no credit card required/i);
assert.match(home, /Full packet \$39 or Full Case \$59/i);
assert.match(home, /Create an account only if you purchase/i);
assert.doesNotMatch(home, /Start (?:my |with the )?free preview/i);
assert.match(home, /\.faq summary::after\s*\{[^}]*Show answer \+/s);
assert.match(home, /class=["']mobile-menu["']/i, "The homepage needs a mobile navigation menu.");
assert.match(home, /aria-label=["']Mobile page navigation["']/i);
assert.match(
  home,
  /data-boot=["']\/upload["'][^>]*aria-describedby=["']hero-trust["']/i,
  "The primary upload action must programmatically reference its trust disclosure.",
);
for (const proof of [
  /No credit card required/i,
  /No subscription/i,
  /Never used to train AI/i,
  /Guest files normally delete in 24 hours/i,
  /support@getmyyes\.com/i,
  /Stripe processes payments/i,
  /href=["']\/sample-packet["']/i,
  /Nojus [^<]+, registered sole trader/i,
]) {
  assert.match(home, proof, `Missing trust proof: ${proof}.`);
}

assert.match(home, /body\s*\{[^}]*font-size:\s*18px\b[^}]*line-height:\s*1\.65\b/s);
assert.match(home, /\.button\s*\{[^}]*min-height:\s*54px\b/s);
assert.match(home, /\.evidence-number\s*\{[^}]*white-space:\s*nowrap\b/s);

const navy = token(home, "navy");
const teal = token(home, "teal");
const error = token(home, "error");
assert.notEqual(navy, error, "Brand navy must remain separate from error red.");
assert.notEqual(teal, error, "Trust teal must remain separate from error red.");
assert.match(home, /\.button-primary\s*\{[^}]*background:\s*var\(--navy\)/s);
assert.match(
  home,
  /<aside class=["']reassurance["'][^>]*>\s*<div class=["']wrap["']>\s*<ul class=["']reassurance-list["']/s,
  "The centered reassurance ledger needs its own wrapper.",
);
assert.match(home, /\.reassurance-list\s*\{[^}]*margin:\s*0 auto\b/s);
assert.match(home, /\.check\s*\{[^}]*line-height:\s*1\b/s);
assert.match(home, /\.check::before\s*\{[^}]*mask:\s*url\(/s);
assert.match(home, /\.check::before\s*\{[^}]*transform:\s*translateY\(-0\.5px\)/s);
assert.match(home, /class=["']hero-title-line["']>Understand the denial\.<\/span>/i);
assert.match(home, /class=["']hero-title-line hero-accent["']>Build the appeal\.<\/span>/i);
assert.match(home, /class=["']packet-shell["']/i, "The packet contents need one recognizable case-file composition.");
assert.equal(
  (home.match(/<li class=["']packet-item["']/g) ?? []).length,
  6,
  "The packet manifest must expose six document rows.",
);
assert.equal(
  (home.match(/class=["']packet-check["']/g) ?? []).length,
  6,
  "Every packet document needs one consistently aligned visual check.",
);
assert.match(home, /\.packet-check\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center[^}]*margin:\s*0/s);
assert.match(home, /\.packet-check svg\s*\{[^}]*display:\s*block[^}]*transform:\s*translateY\(-0\.5px\)/s);
assert.match(home, /<ul class=["']packet-list["']>/i);
assert.match(home, /<strong>Plus:<\/strong> a follow-up plan/i);
assert.doesNotMatch(
  home,
  /\.packet-item\s+span\s*\{/,
  "Broad descendant span rules must not override the packet check alignment.",
);
assert.match(home, /<section\b[^>]*data-proof-carousel[^>]*aria-roledescription=["']carousel["']/i);
assert.equal((home.match(/<article\b[^>]*\bdata-proof-slide\b/g) ?? []).length, 4, "The proof carousel needs four verifiable slides.");
assert.match(home, /data-proof-prev[^>]*aria-label=["']Show previous proof["']/i);
assert.match(home, /data-proof-next[^>]*aria-label=["']Show next proof["']/i);
assert.match(home, /event\.key === ["']ArrowRight["']/);
assert.match(home, /toggleAttribute\(["']inert["']/);
assert.match(home, /prefers-reduced-motion:\s*reduce/);
assert.match(home, /pendingAnnouncement\s*=\s*announce/);
assert.doesNotMatch(
  home,
  /\.proof-slide \.proof-action\s*\{[^}]*padding(?:-top)?\s*:/s,
  "Carousel CTA spacing must not override the button's centered padding.",
);
assert.doesNotMatch(home, /setInterval\s*\(/, "The proof carousel must never autoplay.");
assert.doesNotMatch(
  home,
  /Approved on the first appeal|exception was granted|Fixed and paid within three weeks/i,
  "Unsupported historical testimonial claims must stay unpublished.",
);

const primary = dartColor(theme, "primary");
const accent = dartColor(theme, "accent");
const dartError = dartColor(theme, "error");
assert.notEqual(primary, dartError, "Flutter primary color must not reuse error red.");
assert.notEqual(accent, dartError, "Flutter accent color must not reuse error red.");
assert.match(theme, /static const brand = LinearGradient\(\s*colors:\s*\[AppColors\.primary, AppColors\.accent\]/s);
assert.match(theme, /bodyLarge:[^\n]*copyWith\(fontSize:\s*18,/);
assert.match(theme, /minimumSize:\s*const Size\(52, 52\)/);

assert.equal(token(guides, "carmine"), navy, "Guide brand color must match homepage navy.");
assert.equal(token(guides, "green"), teal, "Guide accent color must match homepage teal.");
assert.equal(token(guides, "control-border"), token(home, "muted"), "Guide controls must use the strong interactive border.");
assert.match(guides, /\.brand \.mark\s*\{[^}]*linear-gradient\(135deg, var\(--carmine\), var\(--green\)\)/s);
assert.match(legal, /the same calm document system/i);

const manifest = JSON.parse(manifestSource);
assert.equal(manifest.background_color, "#F6F8F7");
assert.equal(manifest.theme_color, "#17324D");
assert.match(imageGenerator, /def render_brand_assets\(\)/);
assert.doesNotMatch(imageGenerator, /CARMINE|DENIED|comeback/i);
assert.doesNotMatch(
  purchaseSuccess,
  /B3202A|denial red|cinematic|VideoPlayer|packet_assembly|scan line|splatter/i,
  "Post-purchase progress must use a calm, static status surface.",
);
assert.match(deadlineCalculator, /border:\s*1(?:\.5)?px solid var\(--control-border\)/);
assert.match(deadlineCalculator, /\.calc button\.go:hover\s*\{\s*background:\s*var\(--green-bright\)/);
assert.doesNotMatch(deadlineCalculator, /#D92632|min-height:\s*44px/);
assert.doesNotMatch(
  uploadScreen,
  /isPdf\s*\?\s*AppColors\.error/,
  "Accepted PDFs must use a calm brand color rather than the error color.",
);
assert.match(uploadScreen, /WorkflowProgress\(currentStep:\s*0\)/);
assert.match(uploadScreen, /Choose files/);
assert.match(uploadScreen, /Create my free summary/);
assert.doesNotMatch(
  uploadScreen,
  /fontSize:\s*(?:12|12\.5|13|13\.5|14\.5|15)\b/,
  "The first upload step must not override important copy below 16px.",
);
assert.doesNotMatch(previewPaywall, /On the table:|once, ever|Unlock full|Published marketplace data/i);
assert.match(previewPaywall, /Continue to secure Stripe checkout/);
assert.match(previewPaywall, /An account is required only when you continue to checkout/i);
assert.doesNotMatch(appScaffold, /Transform\.scale\(/, "Page entrances must remain spatially stable.");
assert.doesNotMatch(
  caseLoader,
  /CustomPainter|paintStamp|splatter|evidence string|stamp slams/i,
  "Document processing must use a conventional status card.",
);

console.log("[trust-design] Calm brand, trust disclosure, readable controls, and shared theme contracts passed.");
