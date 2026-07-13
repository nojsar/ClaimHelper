/**
 * Generates the static /insurers/ appeal-by-insurer library from
 * tool/insurers_data.mjs. Output is committed (like /codes/) so every page is
 * reviewable. Run: node tool/build_insurers.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insurers } from "./insurers_data.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outRoot = path.join(projectRoot, "web", "insurers");
const siteOrigin = "https://getmyyes.com";
const updated = "2026-07-13";

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
  <script src="/analytics.js" data-static></script>
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to main content</a>
  <header class="site">
    <div class="bar">
      <a class="brand" href="/"><span class="mark" aria-hidden="true">✓</span> GetMyYes</a>
      <nav aria-label="Primary">
        <a class="navlink" href="/appeals/">Appeal guides</a>
        <a class="navlink" href="/insurers/">By insurer</a>
        <a class="btn-start" href="/#/upload">Start my appeal — free</a>
      </nav>
    </div>
  </header>

  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">getmyyes.com</a> / <a href="/insurers/">insurers</a>${crumb ? ` / ${esc(crumb)}` : ""}</nav>
    <main id="main-content" tabindex="-1">
    <article>
      <h1>${h1}</h1>
      <p class="updated">UPDATED JULY 2026 · U.S. PLANS · NOT LEGAL OR MEDICAL ADVICE</p>
${body}
    </article>
    </main>

    <footer class="site">
      <p><a href="/">GetMyYes</a> · <a href="/appeals/">Appeal guides</a> · <a href="/codes/">Denial codes</a> · <a href="/insurers/">By insurer</a> · <a href="/tools/appeal-deadline-calculator">Deadline calculator</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a></p>
      <p>© 2026 GetMyYes · U.S. plans only at launch. General information, not medical, legal, or insurance advice. Insurer processes vary by plan and state — the appeal-rights section of your own denial letter is authoritative.</p>
    </footer>
  </div>
</body>
</html>
`;
}

/** Shared federal-rules block: the same on every insurer page, by design —
 * these are the ACA/ERISA baselines that apply regardless of the insurer. */
function federalBlock(name) {
  return `      <h2>The deadlines that apply to nearly every ${esc(name)} plan</h2>
      <ul>
        <li><strong>At least 180 days</strong> to file the internal appeal from the date on the denial notice (non-grandfathered plans; the date printed on your letter controls).</li>
        <li><strong>The plan must decide</strong> within about 30 days for care you haven't received yet, and about 60 days for care already received.</li>
        <li><strong>Urgent case?</strong> Ask for an <em>expedited appeal</em> — a decision in roughly 72 hours when a physician confirms that waiting endangers your health.</li>
        <li><strong>After the final internal denial:</strong> you can request independent <a href="/appeals/external-review">external review</a> — generally within about 4 months, per your letter.</li>
        <li><strong>Employer self-funded plan?</strong> ERISA rules apply: state programs and regulators generally don't, and external review runs through the federal process. Your letter or HR can confirm the funding type.</li>
      </ul>`;
}

function insurerPage(entry) {
  const related = insurers.filter((i) => i.slug !== entry.slug).slice(0, 3);
  const guideLinks = entry.guides
    .map((g) => `<a href="/appeals/${g}">${esc(guideTitles[g])}</a>`)
    .join(" and ");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: `How to appeal a ${entry.name} denial`,
        description: entry.overview,
        author: { "@type": "Organization", name: "GetMyYes", url: `${siteOrigin}/` },
        publisher: { "@type": "Organization", name: "GetMyYes" },
        dateModified: updated,
        mainEntityOfPage: `${siteOrigin}/insurers/${entry.slug}`,
      },
      {
        "@type": "FAQPage",
        mainEntity: entry.faq.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "GetMyYes", item: `${siteOrigin}/` },
          { "@type": "ListItem", position: 2, name: "Appeal by insurer", item: `${siteOrigin}/insurers/` },
          { "@type": "ListItem", position: 3, name: entry.name },
        ],
      },
    ],
  };
  const body = `      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      <p class="lede">${esc(entry.overview)}</p>

      <div class="keyfacts">
        <div class="kicker">Before you write anything</div>
        <ul>
          <li><strong>Your denial letter is the map.</strong> Its appeal-rights section names the exact entity, address or portal, and deadline for <em>your</em> plan — insurer addresses vary by plan and state, so never use a generic one found online.</li>
          <li><strong>Where members usually file:</strong> ${esc(entry.portal)}, or by mail per the letter.</li>
          <li><strong>What to include:</strong> the claim number, the denial reason quoted back, your argument against that specific reason, and supporting records. Our <a href="/appeals/appeal-letter-template">free letter template</a> covers the structure.</li>
        </ul>
      </div>

      <h2>How appeals work at ${esc(entry.name)}</h2>
      <ul>
${entry.bullets.map((b) => `        <li>${esc(b)}</li>`).join("\n")}
      </ul>
${entry.special ? `      <p>${esc(entry.special)}</p>\n` : ""}
${federalBlock(entry.short)}

      <p><strong>Best next reads:</strong> ${guideLinks} — and decode any codes on the letter in the <a href="/codes/">denial-code library</a>.</p>

      <h2>Common questions</h2>
${entry.faq.map((f) => `      <h3>${esc(f.q)}</h3>\n      <p>${esc(f.a)}</p>`).join("\n")}

      <div class="cta">
        <div class="kicker">Denied by ${esc(entry.short)}? Don't drop it</div>
        <h2>Upload the denial letter. Get the whole appeal packet.</h2>
        <p>GetMyYes reads your actual ${esc(entry.short)} letter — denial reason, fine print, deadlines — and drafts the appeal letter, evidence checklist, doctor letter request, and call script. Free preview first.</p>
        <a class="go" href="/#/upload">Start my appeal — free preview</a>
        <p class="sub">FREE PREVIEW · $39 FULL PACKET · NO SUBSCRIPTION. EVER.</p>
      </div>

      <div class="related">
        <div class="kicker">Other insurers</div>
        <ul>
${related.map((i) => `          <li><a href="/insurers/${i.slug}">How to appeal a ${esc(i.name)} denial</a></li>`).join("\n")}
          <li><a href="/insurers/">All insurers</a></li>
        </ul>
      </div>`;
  return shell({
    title: `How to Appeal a ${entry.name} Denial — Deadlines & Next Steps`,
    description: `Appealing a ${entry.name} health insurance denial: where to file, the deadlines that apply, what to include, and how external review works. Plain English, free letter template.`,
    canonical: `${siteOrigin}/insurers/${entry.slug}`,
    h1: `How to appeal a ${esc(entry.name)} denial`,
    crumb: entry.short,
    body,
  });
}

function hubPage() {
  const rows = insurers
    .map((i) => `          <tr><th scope="row"><a href="/insurers/${i.slug}">${esc(i.name)}</a></th><td>${esc(i.overview.split(". ")[0])}.</td></tr>`)
    .join("\n");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "How to Appeal a Denial, by Insurer",
    url: `${siteOrigin}/insurers/`,
    description: "Insurer-specific guides to appealing health-insurance denials: UnitedHealthcare, Aetna, Cigna, BCBS, Anthem, Humana, Kaiser, Ambetter, Molina, Oscar.",
    isPartOf: { "@type": "WebSite", name: "GetMyYes", url: `${siteOrigin}/` },
  };
  const body = `      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
      <p class="lede">The federal appeal rules are the same almost everywhere — <strong>at least 180 days to appeal, independent external review after the final internal denial</strong> — but every insurer routes appeals differently: different portals, entities, and quirks. Find yours below.</p>

      <div class="keyfacts">
        <div class="kicker">One rule beats them all</div>
        <ul>
          <li>The <strong>appeal-rights section of your own denial letter</strong> names the exact address, portal, and deadline for your plan. It is authoritative; insurer pages (including these) are the background briefing.</li>
        </ul>
      </div>

      <section class="table-wrap" aria-labelledby="insurers-table-caption" tabindex="0">
      <table>
        <caption id="insurers-table-caption">Insurer-specific appeal guides</caption>
        <thead>
          <tr><th scope="col">Insurer</th><th scope="col">What to know</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </section>

      <p>Don't see your insurer? The process still follows the same federal baseline — start with <a href="/appeals/how-to-appeal-health-insurance-denial">the step-by-step appeal guide</a> and the <a href="/appeals/appeal-letter-template">free letter template</a>.</p>

      <div class="cta">
        <div class="kicker">Whoever denied you</div>
        <h2>Upload the letter. We build the appeal for your exact insurer.</h2>
        <p>GetMyYes reads the actual denial letter — insurer, denial reason, deadlines — and drafts the right response: appeal letter, evidence checklist, doctor letter request, call script.</p>
        <a class="go" href="/#/upload">Start my appeal — free preview</a>
        <p class="sub">FREE PREVIEW · $39 FULL PACKET · NO SUBSCRIPTION. EVER.</p>
      </div>`;
  return shell({
    title: "How to Appeal a Health Insurance Denial, by Insurer — GetMyYes",
    description: "Insurer-specific appeal guides: UnitedHealthcare, Aetna, Cigna, Blue Cross Blue Shield, Anthem, Humana, Kaiser Permanente, Ambetter, Molina, and Oscar — deadlines, portals, and next steps.",
    canonical: `${siteOrigin}/insurers/`,
    h1: "Appeal a denial — by insurer",
    crumb: "",
    body,
  });
}

await mkdir(outRoot, { recursive: true });
await writeFile(path.join(outRoot, "index.html"), hubPage(), "utf8");
for (const entry of insurers) {
  await writeFile(path.join(outRoot, `${entry.slug}.html`), insurerPage(entry), "utf8");
}
console.log(`[insurers] Generated ${insurers.length} insurer pages + hub in web/insurers/.`);
