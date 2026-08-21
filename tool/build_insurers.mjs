/**
 * Generates the static /insurers/ appeal-by-insurer library from
 * tool/insurers_data.mjs. Output is committed (like /codes/) so every page is
 * reviewable. Run: node tool/build_insurers.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { insurers } from "./insurers_data.mjs";
import { articleAuthor, articlePublisher, defaultSocialImage } from "./site_identity.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outRoot = path.join(projectRoot, "web", "insurers");
const siteOrigin = "https://getmyyes.com";
const publishedAt = "2026-07-13T00:00:00Z";
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

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const truncate = (value, max) => value.length <= max
  ? value
  : `${value.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
const indefiniteArticleFor = (name) => /^(Aetna|Ambetter|Anthem|Oscar)\b/i.test(name) ? "an" : "a";

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
  <link rel="icon" type="image/svg+xml" href="/icon.svg">
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
        <a class="navlink" href="/insurers/">By insurer</a>
        <a class="btn-start" href="/#/upload">See my free denial summary</a>
      </nav>
    </div>
  </header>

  <div class="wrap">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">getmyyes.com</a> / <a href="/insurers/">insurers</a>${crumb ? ` / ${esc(crumb)}` : ""}</nav>
    <main id="main-content" tabindex="-1">
    <article>
      <h1>${h1}</h1>
      <p class="updated">UPDATED <time datetime="${modifiedAt}">${modifiedLabel}</time> · U.S. PLANS · NOT LEGAL OR MEDICAL ADVICE</p>
${body}
    </article>
    </main>

    <footer class="site">
      <p><a href="/">GetMyYes</a> · <a href="/appeals/">Appeal guides</a> · <a href="/codes/">Denial codes</a> · <a href="/insurers/">By insurer</a> · <a href="/tools/appeal-deadline-calculator">Deadline calculator</a> · <a href="/terms">Terms</a> · <a href="/privacy">Privacy</a> · <a href="/editorial-policy">Editorial policy</a></p>
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
      </ul>
      <p><strong>Federal sources:</strong> <a href="https://www.healthcare.gov/appeal-insurance-company-decision/internal-appeals/" rel="noopener">HealthCare.gov internal appeals</a> and <a href="https://www.healthcare.gov/appeal-insurance-company-decision/external-review/" rel="noopener">HealthCare.gov external review</a>. Your denial notice and plan documents control when they differ.</p>`;
}

function insurerPage(entry) {
  const canonical = `${siteOrigin}/insurers/${entry.slug}`;
  const related = insurers.filter((i) => i.slug !== entry.slug).slice(0, 3);
  const indefiniteArticle = indefiniteArticleFor(entry.name);
  const guideLinks = entry.guides
    .map((g) => `<a href="/appeals/${g}">${esc(guideTitles[g])}</a>`)
    .join(" and ");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        "@id": `${canonical}#article`,
        headline: `How to appeal ${indefiniteArticle} ${entry.name} denial`,
        description: entry.overview,
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
        <p class="cta-trust" id="preview-trust">No card is required for the preview. Unsaved guest uploads normally auto-delete after 24 hours. <a href="/privacy">Read the retention details</a>.</p>
        <div class="cta-actions">
          <a class="go" href="/#/upload" aria-describedby="preview-trust">See my free denial summary</a>
          <a class="sample" href="/sample-packet">See a sample packet first</a>
        </div>
        <p class="sub">Free preview · $39 full packet · No subscription</p>
      </div>

      <div class="related">
        <div class="kicker">Other insurers</div>
        <ul>
${related.map((i) => `          <li><a href="/insurers/${i.slug}">How to appeal a denial from ${esc(i.name)}</a></li>`).join("\n")}
          <li><a href="/insurers/">All insurers</a></li>
        </ul>
      </div>`;
  return shell({
    title: `Appeal ${indefiniteArticle} ${entry.name} Denial | GetMyYes`,
    description: `How to appeal a denial from ${entry.name}: where to file, what to include, the deadlines that may apply, and external-review next steps.`,
    canonical,
    h1: `How to appeal a denial from ${esc(entry.name)}`,
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
        <div class="kicker">Help for your plan</div>
        <h2>Prepare a packet for the insurer named in your notice.</h2>
        <p>GetMyYes reads the insurer, reason, and deadline in your notice, then prepares clear documents for you to review.</p>
        <p class="cta-trust" id="preview-trust">No card is required for the preview. Unsaved guest uploads normally auto-delete after 24 hours. <a href="/privacy">Read the retention details</a>.</p>
        <div class="cta-actions">
          <a class="go" href="/#/upload" aria-describedby="preview-trust">See my free denial summary</a>
          <a class="sample" href="/sample-packet">See a sample packet first</a>
        </div>
        <p class="sub">Free preview · $39 full packet · No subscription</p>
      </div>`;
  return shell({
    title: "Appeal a Denial by Insurer | GetMyYes",
    description: "Appeal guides for major U.S. health insurers, covering where to file, what to include, deadlines, portals, and external-review next steps.",
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
