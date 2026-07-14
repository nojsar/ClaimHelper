import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(name: string): string {
  return readFileSync(resolve(__dirname, "..", "..", "src", name), "utf8");
}

test("case milestone and daily aggregate writes share one transaction", () => {
  const analytics = source("analytics.ts");
  assert.match(analytics, /runTransaction\(async \(transaction\) =>/);
  assert.match(
    analytics,
    /transaction\.update\(caseRef, \{[\s\S]*analyticsMilestones\.\$\{milestone\}[\s\S]*true/,
  );
  assert.match(analytics, /transaction\.set\([\s\S]*dailyRef/);
  assert.match(analytics, /caseSnapshot\.get\("ownerUid"\) !== uid/);
  assert.match(analytics, /isAdminAnalyticsUid\(uid\)/);
});

test("public analytics endpoints enforce provenance without broad CORS", () => {
  const analytics = source("analytics.ts");
  assert.doesNotMatch(analytics, /cors:\s*true/);
  assert.match(
    analytics,
    /setAdminAnalyticsExclusion[\s\S]*isTrustedAnalyticsRequest\(req\.headers\)/,
  );
  assert.match(
    analytics,
    /trackEvent[\s\S]*isTrustedAnalyticsRequest\(req\.headers\)/,
  );
  for (const header of [
    "Content-Security-Policy",
    "Cross-Origin-Opener-Policy",
    "Cross-Origin-Resource-Policy",
    "X-Permitted-Cross-Domain-Policies",
  ]) {
    assert.match(analytics, new RegExp(`setHeader\\("${header}"`));
  }
  assert.match(
    analytics,
    /setAdminAnalyticsExclusion[\s\S]*setAnalyticsSecurityHeaders\(res\)/,
  );
  assert.match(
    analytics,
    /trackEvent[\s\S]*setAnalyticsSecurityHeaders\(res\)/,
  );
});

test("extraction records first start, completion, and bounded failures", () => {
  const extraction = source("extraction.ts");
  assert.match(extraction, /"extraction_started"/);
  assert.match(extraction, /"extraction_completed"/);
  assert.match(extraction, /"validation"/);
  assert.match(extraction, /"missing_prerequisite"/);
  assert.match(extraction, /modelAnalyticsErrorCategory\(err\)/);
});

test("preview completion uses only the first-per-case funnel writer", () => {
  const preview = source("preview.ts");
  assert.match(preview, /"preview_started"/);
  assert.match(preview, /"preview_completed"/);
  assert.match(preview, /"rate_limit"/);
  assert.match(preview, /"missing_prerequisite"/);
  assert.match(preview, /modelAnalyticsErrorCategory\(err\)/);
  assert.doesNotMatch(preview, /bumpUserDaily/);
});

test("packet records first start, completion, and bounded failures", () => {
  const packet = source("packet.ts");
  assert.match(packet, /"packet_started"/);
  assert.match(packet, /"packet_completed"/);
  assert.match(packet, /"missing_prerequisite"/);
  assert.match(packet, /modelAnalyticsErrorCategory\(err\)/);
});

test("upload, checkout, and paid funnel steps are first-per-case", () => {
  const cases = source("cases.ts");
  const payments = source("payments.ts");
  assert.match(cases, /recordFirstCaseAnalyticsEvent\(uid, caseRef, "uploaded"\)/);
  assert.doesNotMatch(cases, /bumpUserDaily/);
  assert.match(payments, /"checkout_started"/);
  assert.match(payments, /"paid"/);
  assert.doesNotMatch(payments, /"funnel\.checkout_started"/);
  assert.doesNotMatch(payments, /"funnel\.paid"/);
});
