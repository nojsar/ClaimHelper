/**
 * Generates the static /codes/ denial-code library from tool/codes_data.mjs.
 * Output is committed (like appeals/og images) so every page is reviewable.
 * Run: node tool/build_codes.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { codes } from "./codes_data.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outRoot = path.join(projectRoot, "web", "codes");
const siteOrigin = "https://getmyyes.com";
const updated = "2026-07-12";

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

function shell({ title, description, canonical, h1, crumb, body }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <link rel="canonical" href="${canonical}">
  <link rel="icon" type="image/png" href="/favicon.png">
  <link rel="stylesheet" href="/fonts.css">
  <link rel="stylesheet" href="/appeals/guide.css">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="GetMyYes">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${siteOrigin}/og-image.png">
  <script>
  (function(){try{if(/^(localhost|127\\.|192\\.168\\.)/.test(location.hostname))return;
  var p=JSON.stringify({t:'visit',path:location.pathname,ref:document.referrer||''});
  if(navigator.sendBeacon)navigator.sendBeacon('/api/track',p);
  else fetch('/api/track',{method:'POST',body:p,keepalive:true}).catch(function(){});}catch(e){}})();
  </script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="site">
    <div class="bar">
      <a class="brand" href="/"><span class="mark" aria-hidden="true">✓</span> GetMyYes</a>
      <nav aria-label="Primary">
        <a class="navlink" href="/appeals/">Appeal guides</a>
        <a class="navlink" href="/codes/">Denial codes</a>
        <a class="btn-start" href="/#/upload">Start my appeal — free</a>
      </nav>
    </div>
  </header>

  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">getmyyes.com</a> / <a href="/codes/">denial codes</a>${crumb ? ` / ${esc(crumb)}` : ""}</nav>
    <main id="main-content" tabindex="-1">
    <article>
      <h1>${h1}</h1>
      <p class="updated">UPDATED JULY 2026 · U.S. PLANS · NOT LEGAL OR MEDICAL ADVICE</p>
${body}
    </article>
    </main>

    <footer class="site">
      <p><a href="/">GetMyYes</a> · <a href="/appeals/">Appeal guides</a> · <a href="/codes/">Denial codes</a> · <a href="/tools/appeal-deadline-calculator">Deadline calculator</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a></p>
      <p>© 2026 GetMyYes · U.S. plans only at launch. General information, not medical, legal, or insurance advice. Codes arrive with plan-specific remark codes — always confirm against your own notice and plan documents.</p>
    </footer>
  </div>
</body>
</html>
`;
}

function codePage(entry) {
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
        headline: `${entry.code} denial code: ${entry.name}`,
        description: entry.meaning,
        author: { "@type": "Organization", name: "GetMyYes", url: `${siteOrigin}/` },
        publisher: { "@type": "Organization", name: "GetMyYes" },
        dateModified: updated,
        mainEntityOfPage: `${siteOrigin}/codes/${entry.slug}`,
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

      <div class="cta">
        <div class="kicker">Denied? Don’t drop it</div>
        <h2>Upload your denial letter. Get the whole appeal packet.</h2>
        <p>GetMyYes reads the actual letter — codes, fine print, deadlines — and drafts your appeal letter, evidence checklist, doctor letter request, and call script. Free preview first.</p>
        <a class="go" href="/#/upload">Start my appeal — free preview</a>
        <p class="sub">FREE PREVIEW · $39 FULL PACKET · NO SUBSCRIPTION. EVER.</p>
      </div>

      <div class="related">
        <div class="kicker">Related denial codes</div>
        <ul>
${fallbackRelated.map((c) => `          <li><a href="/codes/${c.slug}">${esc(c.code)} — ${esc(c.name)}</a></li>`).join("\n")}
          <li><a href="/codes/">All denial codes</a></li>
        </ul>
      </div>`;
  return shell({
    title: `${entry.code} Denial Code: ${entry.name} — Meaning & How to Respond`,
    description: `${entry.code} means: ${entry.name.toLowerCase()}. What it means on your EOB, who fixes it, whether to appeal, and the exact next steps.`,
    canonical: `${siteOrigin}/codes/${entry.slug}`,
    h1: `${esc(entry.code)}: ${esc(entry.name)}`,
    crumb: entry.code,
    body,
  });
}

function hubPage() {
  const rows = codes
    .map((c) => `          <tr><th scope="row"><a href="/codes/${c.slug}">${esc(c.code)}</a></th><td>${esc(c.name)}</td><td>${esc(appealLabels[c.appeal].split(" —")[0])}</td></tr>`)
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

      <div class="table-wrap" style="overflow-x:auto">
      <table>
        <caption>Claim adjustment reason codes: meaning and whether to appeal</caption>
        <thead>
          <tr><th scope="col">Code</th><th scope="col">What it means</th><th scope="col">Appeal?</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </div>

      <p>Don’t see your code? The letter must still explain the denial in words and state your appeal rights — start with <a href="/appeals/how-to-appeal-health-insurance-denial">the step-by-step appeal guide</a>.</p>

      <div class="cta">
        <div class="kicker">Skip the decoding</div>
        <h2>Upload the letter. We read the codes for you.</h2>
        <p>GetMyYes identifies the denial type from your actual letter and drafts the right response: appeal letter, evidence checklist, doctor letter request, call script, deadlines.</p>
        <a class="go" href="/#/upload">Start my appeal — free preview</a>
        <p class="sub">FREE PREVIEW · $39 FULL PACKET · NO SUBSCRIPTION. EVER.</p>
      </div>`;
  return shell({
    title: "Insurance Denial Codes Explained (CO-45, CO-50, PR-204…) — GetMyYes",
    description: "Every common insurance denial code (CARC) in plain English: what CO-50, CO-45, CO-197, PR-204 and more mean on your EOB, who fixes each one, and when to appeal.",
    canonical: `${siteOrigin}/codes/`,
    h1: "Insurance denial codes, decoded",
    crumb: "",
    body,
  });
}

await mkdir(outRoot, { recursive: true });
await writeFile(path.join(outRoot, "index.html"), hubPage(), "utf8");
for (const entry of codes) {
  await writeFile(path.join(outRoot, `${entry.slug}.html`), codePage(entry), "utf8");
}
console.log(`[codes] Generated ${codes.length} code pages + hub in web/codes/.`);
