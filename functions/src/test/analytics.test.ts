import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ANALYTICS_COOKIE,
  ANALYTICS_DAILY_COLLECTION,
  ANALYTICS_SEGMENT_DAILY_COLLECTION,
  adminAnalyticsCookieHeader,
  analyticsSegmentDocumentId,
  bearerToken,
  cookieValue,
  filterSegmentableFields,
  isAdminAnalyticsUid,
  isExcludedAnalyticsPath,
} from "../analytics";
import { ADMIN_UID } from "../config";

test("clean analytics use dedicated customer-only collections", () => {
  assert.equal(ANALYTICS_DAILY_COLLECTION, "analytics_customer_daily");
  assert.equal(
    ANALYTICS_SEGMENT_DAILY_COLLECTION,
    "analytics_customer_segment_daily",
  );
});

test("admin uid exclusion has one exact identity", () => {
  assert.equal(isAdminAnalyticsUid(ADMIN_UID), true);
  assert.equal(isAdminAnalyticsUid(`${ADMIN_UID}-other`), false);
  assert.equal(isAdminAnalyticsUid(null), false);
  assert.equal(isAdminAnalyticsUid(undefined), false);
});

test("private stats routes are always excluded without false prefix matches", () => {
  for (const path of [
    "/stats",
    "/stats/",
    "/stats/details",
    "/stats?range=30",
    "#/stats",
    "https://getmyyes.com/stats",
    "https://getmyyes.com/#/stats",
  ]) {
    assert.equal(isExcludedAnalyticsPath(path), true, path);
  }
  for (const path of ["/", "/status", "/stats-guide", "/appeals/stats"]) {
    assert.equal(isExcludedAnalyticsPath(path), false, path);
  }
});

test("cookie helper extracts only the named signed session", () => {
  assert.equal(
    cookieValue(
      `theme=dark; ${ADMIN_ANALYTICS_COOKIE}=signed%2Evalue; other=1`,
      ADMIN_ANALYTICS_COOKIE,
    ),
    "signed.value",
  );
  assert.equal(cookieValue("excluded=true", ADMIN_ANALYTICS_COOKIE), null);
  assert.equal(cookieValue(undefined, ADMIN_ANALYTICS_COOKIE), null);
  assert.equal(
    cookieValue(`${ADMIN_ANALYTICS_COOKIE}=%E0%A4%A`, ADMIN_ANALYTICS_COOKIE),
    null,
  );
});

test("admin exclusion cookie is Hosting-forwarded, host-only, and secure", () => {
  const header = adminAnalyticsCookieHeader("signed.value");
  assert.match(header, /^__session=/);
  assert.match(header, /Max-Age=1209600/);
  assert.match(header, /Path=\//);
  assert.match(header, /HttpOnly/);
  assert.match(header, /Secure/);
  assert.match(header, /SameSite=Strict/);
  assert.doesNotMatch(header, /Domain=/);
  assert.equal(cookieValue(header, ADMIN_ANALYTICS_COOKIE), "signed.value");
});

test("bearer token parser accepts only a single Firebase bearer token", () => {
  assert.equal(bearerToken("Bearer firebase-token"), "firebase-token");
  assert.equal(bearerToken("bearer firebase-token"), "firebase-token");
  assert.equal(bearerToken("Basic abc"), null);
  assert.equal(bearerToken("Bearer one two"), null);
  assert.equal(bearerToken(undefined), null);
});

test("analytics segment ids are deterministic and URL-safe", () => {
  assert.equal(
    analyticsSegmentDocumentId("2026-07-13", "country", "FR"),
    "2026-07-13__country__RlI",
  );
  assert.equal(
    analyticsSegmentDocumentId("2026-07-13", "path", "/appeals/start"),
    "2026-07-13__path__L2FwcGVhbHMvc3RhcnQ",
  );
});

test("segmented analytics reject funnel and revenue attribution", () => {
  assert.deepEqual(
    filterSegmentableFields({
      visits: 1,
      pageviews: 1,
      boots: 1,
      "countries.FR": 1,
      "referrers.google_com": 1,
      "campaigns.search | cpc | launch": 1,
      "paths./appeals": 1,
      "funnel.paid": 1,
      revenueCents: 3900,
    }),
    {
      visits: 1,
      pageviews: 1,
      boots: 1,
      "countries.FR": 1,
      "referrers.google_com": 1,
      "campaigns.search | cpc | launch": 1,
      "paths./appeals": 1,
    },
  );
});
