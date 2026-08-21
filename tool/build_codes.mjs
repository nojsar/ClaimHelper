/**
 * Generates the static /codes/ denial-code library from tool/codes_data.mjs.
 * Output is committed (like appeals/og images) so every page is reviewable.
 * Run: node tool/build_codes.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codes } from "./codes_data.mjs";
import { articleAuthor, articlePublisher, defaultSocialImage } from "./site_identity.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outRoot = path.join(projectRoot, "web", "codes");
const siteOrigin = "https://getmyyes.com";
const publishedAt = "2026-07-12T00:00:00Z";
const modifiedAt = "2026-07-27T00:00:00Z";
const modifiedLabel = "JULY 27, 2026";
const socialImage = `${siteOrigin}/og-image.png`;
const socialImageAlt = "GetMyYes graphic: Health insurance appeal help, step by step. Free preview, no card, and no subscription.";

const guideTitles = {
  "not-medically-necessary": "“Not medically necessary” denials",
  "prior-authorization-denied": "Prior authorization denials",
  "step-therapy-denial": "Step therapy denials",
  "formulary-exclusion-denial": "Formulary / drug-not-covered denials",
  "out-of-network-denial": "Out-of-network denials",
  "how-to-appeal-health-insurance-denial": "How to appeal, step by step",
  "appeal-letter-template": "Free appeal letter template",
  "external-review": "External review, explained",
};

const groupNames = {
  CO: "Contractual Obligation — in-network providers generally cannot bill you for CO adjustments",
  PR: "Patient Responsibility — the payer assigns this amount to you (verify before paying)",
  OA: "Other Adjustment — usually informational",
};

const appealLabels = { yes: "Yes — commonly appealed", sometimes: "Sometimes — depends on the facts", rarely: "Rarely — usually fixed by resubmission" };
const fixLabels = { provider: "The provider’s billing office", patient: "You (the member)", both: "You and the billing office together" };

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const truncate = (value, max) => value.length <= max
  ? value
  : `${value.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;

function officialCodeSources() {
  return `      <aside class="sources" aria-labelledby="official-code-sources">
        <div class="kicker">Official references</div>
        <h2 id="official-code-sources">Check the code before you act</h2>
        <p>GetMyYes adds plain-English context. Confirm the code number, current status, and official wording in the <a href="https://x12.org/codes/claim-adjustment-reason-codes" rel="noopener">X12 Claim Adjustment Reason Code list</a>. If your notice also shows a remark code, check the <a href="https://x12.org/codes/remittance-advice-remark-codes" rel="noopener">X12 Remittance Advice Remark Code list</a>. <a href="https://www.cms.gov/medicare/coding-billing/electronic-billing/health-care-payment-remittance-advice" rel="noopener">CMS explains how reason and remark codes work together</a>.</p>
        <p class="source-note">Your payer’s full notice and plan documents control.</p>
      </aside>`;
}

function shell({ title, description, canonical, h1, crumb, body }) {
  const pageTitle = truncate(title, 65);
  const pageDescription = truncate(description, 165);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <title>${esc(pageTitle)}</title>
  <meta name="description" content="${esc(pageDescription)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="stylesheet" href="/fonts.css">
  <link rel="stylesheet" href="/appeals/guide.css">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="en_US">
  <meta property="og:site_name" content="GetMyYes">
  <meta property="og:title" content="${esc(pageTitle)}">
  <meta property="og:description" content="${esc(pageDescription)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${socialImage}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(socialImageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(pageTitle)}">
  <meta name="twitter:description" content="${esc(pageDescription)}">
  <meta name="twitter:image" content="${socialImage}">
  <meta name="twitter:image:alt" content="${esc(socialImageAlt)}">
  <script src="/analytics.js" data-static></script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="site">
    <div class="bar">
      <a class="brand" href="/"><span class="mark" aria-hidden="true">✓</span> GetMyYes</a>
      <nav aria-label="Primary">
        <a class="navlink" href="/appeals/">Appeal guides</a>
        <a class="navlink" href="/codes/">Denial codes</a>
        <a class="btn-start" href="/#/upload">See my free denial summary</a>
      </nav>
    </div>
  </header>

  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">getmyyes.com</a> / <a href="/codes/">denial codes</a>${crumb ? ` / ${esc(crumb)}` : ""}</nav>
    <main id="main-content" tabindex="-1">
    <article>
      <h1>${h1}</h1>
      <p class="updated">UPDATED <time datetime="${modifiedAt}">${modifiedLabel}</time> · U.S. PLANS · NOT LEGAL OR MEDICAL ADVICE</p>
${body}
    </article>
    </main>

    <footer class="site">
      <p><a href="/">GetMyYes</a> · <a href="/appeals/">Appeal guides</a> · <a href="/codes/">Denial codes</a> · <a href="/tools/appeal-deadline-calculator">Deadline calculator</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/editorial-policy">Editorial policy</a></p>
      <p>© 2026 GetMyYes · U.S. plans only at launch. General information, not medical, legal, or insurance advice. Codes arrive with plan-specific remark codes — always confirm against your own notice and plan documents.</p>
    </footer>
  </div>
</body>
</html>
`;
}

function codePage(entry) {
  const canonical = `${siteOrigin}/codes/${entry.slug}`;
  const related = codes.filter((c) => c.slug !== entry.slug && c.guide === entry.guide && entry.guide).slice(0, 3);
  const fallbackRelated = related.length ? related : codes.filter((c) => c.slug !== entry.slug && c.group === entry.group).slice(0, 3);
  const guideLink = entry.guide
    ? `<p><strong>Best next read:</strong> <a href="/appeals/${entry.guide}">${esc(guideTitles[entry.guide])}</a> — the full guide (with a free letter template) for this denial type.</p>`
    : "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: `${entry.code} denial code: ${entry.name}`,
        description: entry.meaning,
        url: canonical,
        inLanguage: "en-US",
        image: defaultSocialImage,
        author: articleAuthor(),
        publisher: articlePublisher(),
        datePublished: publishedAt,
        dateModified: modifiedAt,
        mainEntityOfPage: { "@type": "WebPage", "@id": canonical },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GetMyYes", item: `${siteOrigin}/` },
          { "@type": "ListItem", position: 2, name: "Denial codes", item: `${siteOrigin}/codes/` },
          { "@type": "ListItem", position: 3, name: entry.code },
        ],
      },
    ],
  };
  const body = `      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      <p class="lede">${esc(entry.meaning)}</p>

      <div class="keyfacts">
        <div class="kicker">${esc(entry.code)} at a glance</div>
        <ul>
          <li><strong>Code group:</strong> ${esc(entry.group)} — ${esc(groupNames[entry.group])}.</li>
          <li><strong>Who usually fixes it:</strong> ${esc(fixLabels[entry.fix])}.</li>
          <li><strong>Worth appealing?</strong> ${esc(appealLabels[entry.appeal])}.</li>
        </ul>
      </div>

      <h2>What to do about a ${esc(entry.code)} denial</h2>
      <ol>
${entry.steps.map((s) => `        <li>${esc(s)}</li>`).join("\n")}
      </ol>
      ${guideLink}

${officialCodeSources()}

      <div class="cta">
        <div class="kicker">Denied? Don’t drop it</div>
        <h2>Upload your denial letter. Get the whole appeal packet.</h2>
        <p>GetMyYes reads the actual letter — codes, fine print, deadlines — and drafts your appeal letter, evidence checklist, doctor letter request, and call script. Free preview first.</p>
        <p class="cta-trust" id="preview-trust">No card is required for the preview. Unsaved guest uploads normally auto-delete after 24 hours. <a href="/privacy">Read the retention details</a>.</p>
        <div class="cta-actions">
          <a class="go" href="/#/upload" aria-describedby="preview-trust">See my free denial summary</a>
          <a class="sample" href="/sample-packet">See a sample packet first</a>
        </div>
        <p class="sub">Free preview · $39 full packet · No subscription</p>
      </div>

      <div class="related">
        <div class="kicker">Related denial codes</div>
        <ul>
${fallbackRelated.map((c) => `          <li><a href="/codes/${c.slug}">${esc(c.code)} — ${esc(c.name)}</a></li>`).join("\n")}
          <li><a href="/codes/">All denial codes</a></li>
        </ul>
      </div>`;
  return shell({
    title: `${entry.code} Denial Code: ${entry.name} | GetMyYes`,
    description: `${entry.code}: ${entry.name}. Learn what it means on an EOB, who normally fixes it, whether an appeal may help, and the next steps.`,
    canonical,
    h1: `${esc(entry.code)}: ${esc(entry.name)}`,
    crumb: entry.code,
    body,
  });
}

function hubPage() {
  const rows = codes
    .map((c) => `          <tr data-code-row data-code-search="${esc(`${c.code} ${c.name} ${c.meaning}`)}"><th scope="row"><a href="/codes/${c.slug}">${esc(c.code)}</a></th><td>${esc(c.name)}</td><td>${esc(appealLabels[c.appeal].split(" —")[0])}</td></tr>`)
    .join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Insurance Denial Codes, Explained",
    url: `${siteOrigin}/codes/`,
    description: "Plain-English explanations of CARC denial codes on EOBs and denial letters, with next steps for each.",
    isPartOf: { "@type": "WebSite", name: "GetMyYes", url: `${siteOrigin}/` },
  };
  const body = `      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      <p class="lede">The codes on your EOB or denial letter (CO-45, CO-50, PR-204…) are standardized <strong>Claim Adjustment Reason Codes</strong>. Each one tells you who is expected to act — you, or the provider’s billing office — and whether an appeal is worth it. Find yours below.</p>

      <div class="keyfacts">
        <div class="kicker">How to read a code</div>
        <ul>
          <li><strong>CO (Contractual Obligation):</strong> in-network providers generally cannot bill you for these adjustments.</li>
          <li><strong>PR (Patient Responsibility):</strong> assigned to you — but verify before paying.</li>
          <li><strong>OA (Other Adjustment):</strong> usually informational.</li>
        </ul>
      </div>

      <div class="code-finder" role="search" aria-label="Search denial codes">
        <label for="code-query">Find the code printed on your EOB</label>
        <p id="code-query-help">Enter a code or a few words, such as <strong>CO-50</strong>, <strong>CO50</strong>, or <strong>prior authorization</strong>.</p>
        <div class="code-finder-controls">
          <input id="code-query" name="code" type="search" autocomplete="off" spellcheck="false" aria-describedby="code-query-help code-results-status">
          <button id="clear-code-query" type="button" hidden>Clear search</button>
        </div>
        <p id="code-results-status" class="code-results-status" role="status" aria-live="polite" aria-atomic="true">Showing all ${codes.length} codes.</p>
      </div>

      <section class="table-wrap" aria-labelledby="codes-table-caption" tabindex="0">
      <table>
        <caption id="codes-table-caption">Claim adjustment reason codes: meaning and whether to appeal</caption>
        <thead>
          <tr><th scope="col">Code</th><th scope="col">What it means</th><th scope="col">Appeal?</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </section>

      <div id="code-no-results" class="code-no-results" hidden>
        <p><strong>No matching code in this guide.</strong> Check the letters and numbers on your notice, or upload the letter so GetMyYes can identify the denial reason.</p>
        <a href="/#/upload">Upload my denial letter — free preview</a>
      </div>

      <p>Don’t see your code? The letter must still explain the denial in words and state your appeal rights — start with <a href="/appeals/how-to-appeal-health-insurance-denial">the step-by-step appeal guide</a>.</p>

${officialCodeSources()}

      <div class="cta">
        <div class="kicker">Help with the code</div>
        <h2>Upload the letter. We explain the code and prepare a draft.</h2>
        <p>GetMyYes identifies the denial type from your letter, explains it in plain language, and prepares documents for you to review.</p>
        <p class="cta-trust" id="preview-trust">No card is required for the preview. Unsaved guest uploads normally auto-delete after 24 hours. <a href="/privacy">Read the retention details</a>.</p>
        <div class="cta-actions">
          <a class="go" href="/#/upload" aria-describedby="preview-trust">See my free denial summary</a>
          <a class="sample" href="/sample-packet">See a sample packet first</a>
        </div>
        <p class="sub">Free preview · $39 full packet · No subscription</p>
      </div>`;
  return shell({
    title: "Insurance Denial Codes Explained | GetMyYes",
    description: "Common CARC insurance denial codes in plain English: what they mean on your EOB, who normally fixes each one, and when an appeal may help.",
    canonical: `${siteOrigin}/codes/`,
    h1: "Insurance denial codes, decoded",
    crumb: "",
    body,
  }).replace("</body>", "  <script src=\"/codes/code-finder.js\" defer></script>\n</body>");
}

await mkdir(outRoot, { recursive: true });
await writeFile(path.join(outRoot, "index.html"), hubPage(), "utf8");
for (const entry of codes) {
  await writeFile(path.join(outRoot, `${entry.slug}.html`), codePage(entry), "utf8");
}
console.log(`[codes] Generated ${codes.length} code pages + hub in web/codes/.`);
