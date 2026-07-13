import process from "node:process";
import {
  campaignUrl,
  configured,
  dryRun,
  graphemes,
  guideMeta,
  postForDay,
  previewAndExit,
} from "./social_core.mjs";

// LinkedIn poster: publishes to the GetMyYes *Company Page* (organization
// posts need the Community Management API product on the LinkedIn app).
// The article content block gives the post its link card.
// Secrets:
//   LINKEDIN_ACCESS_TOKEN — member token with w_organization_social, and the
//     member must be an admin of the page (60-day expiry; see docs to refresh)
//   LINKEDIN_ORG_ID — the numeric id from the page's admin URL
// Optional: LINKEDIN_VERSION — API version header (YYYYMM), default below.

const OFFSET = 4;
const LIMIT = 3000;

// LinkedIn's Little Text Format treats these as control characters; escape
// them so reviewed copy renders verbatim instead of erroring the request.
function littleText(text) {
  return text.replace(/[\\|{}@[\]()<>#*_~]/g, (c) => `\\${c}`);
}

function compose(post) {
  return `${post.text}\n\n#HealthInsurance #InsuranceAppeal`;
}

if (dryRun) previewAndExit("linkedin", compose, LIMIT, { offset: OFFSET, lengthOf: graphemes });

if (!configured("linkedin", ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORG_ID"])) process.exit(0);

const post = postForDay(OFFSET);
const meta = await guideMeta(post);
const url = campaignUrl(post, "linkedin");

const result = await fetch("https://api.linkedin.com/rest/posts", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.LINKEDIN_ACCESS_TOKEN}`,
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
    "LinkedIn-Version": process.env.LINKEDIN_VERSION || "202601",
  },
  body: JSON.stringify({
    author: `urn:li:organization:${process.env.LINKEDIN_ORG_ID}`,
    commentary: littleText(compose(post)),
    visibility: "PUBLIC",
    distribution: {
      feedDistribution: "MAIN_FEED",
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    content: {
      article: {
        source: url,
        title: meta?.title ?? post.text,
        ...(meta?.description ? { description: meta.description } : {}),
      },
    },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  }),
});
if (!result.ok) {
  const body = await result.text().catch(() => "");
  throw new Error(`${result.status} ${result.statusText}: ${body.slice(0, 500)}`);
}
// Success returns 201 with the post URN in a header, not a JSON body.
console.log(`[marketing] linkedin: published ${post.id}: ${result.headers.get("x-restli-id")}`);
