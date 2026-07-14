import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ANALYTICS_COOKIE,
  ANALYTICS_DAILY_COLLECTION,
  ANALYTICS_OTHER_PATH,
  ANALYTICS_SEGMENT_DAILY_COLLECTION,
  MAX_ANALYTICS_SEGMENTS_PER_EVENT,
  MAX_TRAFFIC_COUNTER_FIELDS_PER_EVENT,
  UNIQUE_VISITOR_REGISTER_COUNT,
  UNIQUE_VISITOR_SKETCH_VERSION,
  adminAnalyticsCookieHeader,
  analyticsPathCategory,
  appReadyBucket,
  analyticsSegmentDocumentId,
  bearerToken,
  boundedAnalyticsSegments,
  campaignAnalyticsCategory,
  caseAnalyticsCounterFields,
  caseAnalyticsErrorEvent,
  caseOutcomeAnalyticsCounterFields,
  clientNetworkAddress,
  cookieValue,
  countryAnalyticsCategory,
  estimateUniqueVisitors,
  filterSegmentableFields,
  filterTrafficCounterFields,
  isAdminAnalyticsUid,
  isExcludedAnalyticsPath,
  isFirstPartyAnalyticsUrl,
  isTrustedAnalyticsRequest,
  modelAnalyticsErrorCategory,
  normalizeTrafficEvent,
  normalizeUniqueVisitorRegisters,
  prepareUniqueVisitorSketchUpdate,
  referrerAnalyticsCategory,
  updateUniqueVisitorRegisters,
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

test("browser provenance accepts only first-party browser requests", () => {
  assert.equal(
    isTrustedAnalyticsRequest({
      origin: "https://getmyyes.com",
      referer: "https://getmyyes.com/appeals/prior-authorization-denied",
      "sec-fetch-site": "same-origin",
    }),
    true,
  );
  assert.equal(
    isTrustedAnalyticsRequest({
      origin: "https://www.getmyyes.com",
      "sec-fetch-site": "same-site",
    }),
    true,
  );
  assert.equal(
    isTrustedAnalyticsRequest({ "sec-fetch-site": "same-origin" }),
    true,
  );
  assert.equal(
    isTrustedAnalyticsRequest({
      referer: "https://claimhelper-38152.web.app/upload",
    }),
    true,
  );
  assert.equal(isTrustedAnalyticsRequest({}), false);
});

test("browser provenance rejects cross-site, malformed, and conflicting claims", () => {
  for (const headers of [
    {
      origin: "https://evil.example",
      "sec-fetch-site": "cross-site",
    },
    {
      origin: "https://getmyyes.com",
      "sec-fetch-site": "cross-site",
    },
    {
      origin: "null",
      "sec-fetch-site": "same-origin",
    },
    {
      origin: "https://getmyyes.com/path",
      "sec-fetch-site": "same-origin",
    },
    {
      origin: "https://getmyyes.com.evil.example",
      "sec-fetch-site": "same-origin",
    },
    {
      referer: "https://getmyyes.com.evil.example/",
    },
    {
      origin: ["https://getmyyes.com", "https://evil.example"],
    },
    {
      "sec-fetch-site": ["same-origin", "cross-site"],
    },
    {
      origin: "https://evil.example",
      "sec-fetch-site": "same-origin",
    },
  ]) {
    assert.equal(isTrustedAnalyticsRequest(headers), false, JSON.stringify(headers));
  }
});

test("path normalization retains only a finite route taxonomy", () => {
  assert.equal(analyticsPathCategory("/"), "/");
  assert.equal(analyticsPathCategory("/privacy.html?from=test"), "/privacy");
  assert.equal(
    analyticsPathCategory("https://getmyyes.com/case/patient@example.com/preview?x=1"),
    "/case/:id/preview",
  );
  assert.equal(
    analyticsPathCategory("#/appeals/not-medically-necessary"),
    "/appeals/:article",
  );
  assert.equal(analyticsPathCategory("/codes/co-197"), "/codes/:code");
  assert.equal(analyticsPathCategory("/insurers/aetna"), "/insurers/:insurer");
  assert.equal(
    analyticsPathCategory("/tools/appeal-deadline-calculator"),
    "/tools/:tool",
  );
  assert.equal(analyticsPathCategory("/attacker/unique-value"), ANALYTICS_OTHER_PATH);
  assert.equal(analyticsPathCategory("not a valid / route"), ANALYTICS_OTHER_PATH);
  assert.equal(isExcludedAnalyticsPath("/%73tats/private"), true);
});

test("country, referrer, and campaign inputs collapse to allowlisted labels", () => {
  assert.equal(countryAnalyticsCategory("lt"), "LT");
  assert.equal(countryAnalyticsCategory("US"), "US");
  assert.equal(countryAnalyticsCategory("ZZ"), null);
  assert.equal(countryAnalyticsCategory(["LT", "US"]), null);

  assert.equal(referrerAnalyticsCategory("https://www.google.com/search?q=x"), "google");
  assert.equal(referrerAnalyticsCategory("https://old.reddit.com/r/insurance"), "reddit");
  assert.equal(referrerAnalyticsCategory("https://chatgpt.com/c/123"), "chatgpt");
  assert.equal(referrerAnalyticsCategory("https://google.com.evil.test"), "other");
  assert.equal(referrerAnalyticsCategory("https://unique-attacker.example/x"), "other");
  assert.equal(referrerAnalyticsCategory("https://getmyyes.com/appeals"), null);
  assert.equal(referrerAnalyticsCategory("javascript:alert(1)"), null);

  assert.equal(
    campaignAnalyticsCategory(
      "https://getmyyes.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=Launch-123",
    ),
    "meta|paid_search|tagged",
  );
  assert.equal(
    campaignAnalyticsCategory(
      "https://getmyyes.com/?utm_source=unique.person%40example.com&utm_medium=custom.value&utm_campaign=secret",
    ),
    "other|other|tagged",
  );
  assert.equal(
    campaignAnalyticsCategory("https://evil.example/?utm_source=google"),
    null,
  );
  assert.equal(campaignAnalyticsCategory("https://getmyyes.com/"), null);
  assert.equal(isFirstPartyAnalyticsUrl("https://getmyyes.com/appeals"), true);
  assert.equal(isFirstPartyAnalyticsUrl("https://getmyyes.com.evil.test/"), false);
});

test("segment documents are allowlisted, deduplicated, and hard-capped", () => {
  const segments = boundedAnalyticsSegments([
    { type: "path", key: "/" },
    { type: "path", key: "/" },
    { type: "path", key: "/upload" },
    { type: "country", key: "LT" },
    { type: "referrer", key: "google" },
    { type: "campaign", key: "google|paid_search|tagged" },
    { type: "path", key: "/attacker-unique" },
    { type: "country", key: "ZZ" },
  ]);
  assert.equal(segments.length, MAX_ANALYTICS_SEGMENTS_PER_EVENT);
  assert.deepEqual(segments, [
    { type: "path", key: "/" },
    { type: "path", key: "/upload" },
    { type: "country", key: "LT" },
    { type: "referrer", key: "google" },
  ]);
  assert.equal(JSON.stringify(segments).includes("attacker"), false);
});

test("public traffic fields discard arbitrary keys, counts, and overflow", () => {
  const filtered = filterTrafficCounterFields({
    visits: 1,
    pageviews: 1,
    boots: 1,
    "paths./": 1,
    "paths./upload": 1,
    "countries.LT": 1,
    "referrers.google": 1,
    "campaigns.google|paid_search|tagged": 1,
    "performance.app_ready.under_1s": 1,
    "paths./unique-attacker": 1,
    "referrers.person@example.com": 1,
    "countries.ZZ": 1,
    "paths./privacy": 99,
    "patient.secret": 1,
  });
  assert.equal(
    Object.keys(filtered).length,
    MAX_TRAFFIC_COUNTER_FIELDS_PER_EVENT,
  );
  assert.equal(Object.values(filtered).every((value) => value === 1), true);
  assert.equal(JSON.stringify(filtered).includes("attacker"), false);
  assert.equal(JSON.stringify(filtered).includes("patient"), false);
  assert.equal(JSON.stringify(filtered).includes("example.com"), false);
});

test("normal traffic produces a bounded write plan", () => {
  const event = normalizeTrafficEvent(
    {
      t: "visit",
      path: "/case/user@example.com/preview?token=secret",
      ref: "https://www.google.com/search?q=appeal",
    },
    {
      "x-country-code": "lt",
      referer:
        "https://getmyyes.com/?utm_source=facebook&utm_medium=cpc&utm_campaign=launch",
    },
  );
  assert.deepEqual(event, {
    type: "visit",
    country: "LT",
    fields: {
      visits: 1,
      pageviews: 1,
      "paths./case/:id/preview": 1,
      "countries.LT": 1,
      "campaigns.meta|paid_search|tagged": 1,
      "referrers.google": 1,
    },
    segments: [
      { type: "path", key: "/case/:id/preview" },
      { type: "country", key: "LT" },
      { type: "campaign", key: "meta|paid_search|tagged" },
      { type: "referrer", key: "google" },
    ],
  });
  assert.equal(JSON.stringify(event).includes("user@example.com"), false);
  assert.equal(JSON.stringify(event).includes("secret"), false);
});

test("poisoning attempts can reach only shared other buckets", () => {
  const event = normalizeTrafficEvent(
    {
      t: "visit",
      path: "/a-unique-path/user@example.com",
      ref: "https://a-unique-referrer.example/private",
    },
    {
      "x-country-code": "ZZ",
      referer:
        "https://getmyyes.com/?utm_source=a-unique-source&utm_medium=a-unique-medium&utm_campaign=a-unique-name",
    },
  );
  assert.deepEqual(event, {
    type: "visit",
    country: null,
    fields: {
      visits: 1,
      pageviews: 1,
      "paths./other": 1,
      "campaigns.other|other|tagged": 1,
      "referrers.other": 1,
    },
    segments: [
      { type: "path", key: "/other" },
      { type: "campaign", key: "other|other|tagged" },
      { type: "referrer", key: "other" },
    ],
  });
  const serialized = JSON.stringify(event);
  for (const sensitive of ["user@example.com", "a-unique", "private", "ZZ"]) {
    assert.equal(serialized.includes(sensitive), false, sensitive);
  }
});

test("invalid, admin, and performance payloads preserve exclusion semantics", () => {
  assert.equal(normalizeTrafficEvent({ t: "visit", path: "/stats" }, {}), null);
  assert.equal(normalizeTrafficEvent({ t: "arbitrary", path: "/" }, {}), null);
  assert.equal(normalizeTrafficEvent([], {}), null);
  assert.equal(normalizeTrafficEvent({ t: "app_ready", ms: -1 }, {}), null);
  assert.deepEqual(normalizeTrafficEvent({ t: "app_ready", ms: 2500 }, {}), {
    type: "app_ready",
    country: null,
    fields: { "performance.app_ready.2_to_4s": 1 },
    segments: [],
  });
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

test("app-ready timings collapse into fixed non-identifying buckets", () => {
  assert.equal(appReadyBucket(0), "under_1s");
  assert.equal(appReadyBucket(999), "under_1s");
  assert.equal(appReadyBucket(1000), "1_to_2s");
  assert.equal(appReadyBucket(2500), "2_to_4s");
  assert.equal(appReadyBucket(4000), "4_to_8s");
  assert.equal(appReadyBucket(8000), "over_8s");
  assert.equal(appReadyBucket(120000), "over_8s");
  assert.equal(appReadyBucket(-1), null);
  assert.equal(appReadyBucket(120001), null);
  assert.equal(appReadyBucket("1000"), null);
  assert.equal(appReadyBucket(Number.NaN), null);
});

test("segmented analytics reject funnel and revenue attribution", () => {
  assert.deepEqual(
    filterSegmentableFields({
      visits: 1,
      pageviews: 1,
      boots: 1,
      "countries.FR": 1,
      "referrers.google": 1,
      "campaigns.google|paid_search|tagged": 1,
      "paths./appeals": 1,
      "funnel.paid": 1,
      revenueCents: 3900,
    }),
    {
      visits: 1,
      pageviews: 1,
      boots: 1,
      "countries.FR": 1,
      "referrers.google": 1,
      "campaigns.google|paid_search|tagged": 1,
      "paths./appeals": 1,
    },
  );
});

test("case product events map only to fixed aggregate counter paths", () => {
  assert.deepEqual(caseAnalyticsCounterFields("uploaded"), {
    "funnel.upload": 1,
  });
  assert.deepEqual(caseAnalyticsCounterFields("extraction_started"), {
    "product.extraction.started": 1,
  });
  assert.deepEqual(caseAnalyticsCounterFields("preview_completed"), {
    "product.preview.completed": 1,
    "funnel.preview": 1,
  });
  assert.deepEqual(caseAnalyticsCounterFields("submitted"), {
    "product.case.submitted": 1,
  });
  assert.deepEqual(caseAnalyticsCounterFields("checkout_started"), {
    "funnel.checkout_started": 1,
  });
  assert.deepEqual(caseAnalyticsCounterFields("paid"), {
    "funnel.paid": 1,
  });

  for (const invalid of [
    null,
    "",
    "pending",
    "product.arbitrary",
    "submitted.user@example.com",
  ]) {
    assert.equal(caseAnalyticsCounterFields(invalid), null);
  }
});

test("product error events are bounded by stage and category", () => {
  const stages = ["extraction", "preview", "packet"] as const;
  const categories = [
    "validation",
    "rate_limit",
    "missing_prerequisite",
    "model_failure",
  ] as const;

  for (const stage of stages) {
    for (const category of categories) {
      const event = caseAnalyticsErrorEvent(stage, category);
      assert.equal(event, `${stage}_error_${category}`);
      const fields = caseAnalyticsCounterFields(event);
      assert.deepEqual(fields, {
        [`product.${stage}.errors.${category}`]: 1,
      });
    }
  }

  assert.equal(
    caseAnalyticsErrorEvent(
      "unknown" as typeof stages[number],
      "validation",
    ),
    null,
  );
});

test("only a fixed final outcome category can reach aggregate analytics", () => {
  for (const outcome of [
    "approved",
    "partially_approved",
    "denied",
    "withdrawn",
  ]) {
    assert.deepEqual(caseOutcomeAnalyticsCounterFields(outcome), {
      [`product.outcomes.${outcome}`]: 1,
    });
  }
  assert.equal(caseOutcomeAnalyticsCounterFields("pending"), null);
  assert.equal(caseOutcomeAnalyticsCounterFields("approved.user-123"), null);
  assert.equal(caseOutcomeAnalyticsCounterFields({ outcome: "denied" }), null);
});

test("model exceptions collapse to bounded categories without raw messages", () => {
  assert.equal(modelAnalyticsErrorCategory({ status: 429 }), "rate_limit");
  assert.equal(
    modelAnalyticsErrorCategory({ code: "rate_limit_exceeded" }),
    "rate_limit",
  );
  assert.equal(
    modelAnalyticsErrorCategory({ code: "resource-exhausted" }),
    "rate_limit",
  );
  assert.equal(
    modelAnalyticsErrorCategory({
      status: 500,
      message: "patient name, denial notes, or any raw provider error",
    }),
    "model_failure",
  );
  assert.equal(modelAnalyticsErrorCategory("raw error text"), "model_failure");
});

test("network address parser selects the GCLB-appended client slot", () => {
  assert.equal(
    clientNetworkAddress(
      "198.18.0.99, 203.0.113.7, 35.191.0.2",
    ),
    "203.0.113.7",
  );
  assert.equal(
    clientNetworkAddress([
      "198.18.0.99",
      "2001:DB8::2, 2001:4860:4802:32::a",
    ]),
    "2001:db8::2",
  );
  assert.equal(clientNetworkAddress("203.0.113.8"), "203.0.113.8");
});

test("malformed proxy slots never shift a spoofed prefix into trust", () => {
  assert.equal(
    clientNetworkAddress("198.18.0.99, not-an-ip, 35.191.0.2"),
    null,
  );
  assert.equal(clientNetworkAddress("not-an-ip, 35.191.0.2"), null);
  assert.equal(
    clientNetworkAddress("203.0.113.7, malformed-load-balancer"),
    "203.0.113.7",
  );
  assert.equal(clientNetworkAddress("spoofed.example"), null);
  assert.equal(clientNetworkAddress(undefined), null);
});

test("unique visitor sketch deduplicates without retaining identity", () => {
  const salt = "test-only-secret-salt";
  const first = updateUniqueVisitorRegisters([], "FR", "203.0.113.7", salt);
  const repeat = updateUniqueVisitorRegisters(
    first,
    "FR",
    "203.0.113.7",
    salt,
  );
  const independentlySalted = updateUniqueVisitorRegisters(
    [],
    "FR",
    "203.0.113.7",
    "different-test-only-secret-salt",
  );

  assert.equal(first.length, UNIQUE_VISITOR_REGISTER_COUNT);
  assert.deepEqual(repeat, first);
  assert.notDeepEqual(independentlySalted, first);
  assert.equal(estimateUniqueVisitors(first), 1);
  assert.equal(first.includes(0), true);
  assert.equal(JSON.stringify(first).includes("203.0.113.7"), false);
  assert.equal(JSON.stringify(first).includes(salt), false);
  assert.throws(
    () => updateUniqueVisitorRegisters([], "FR", "203.0.113.7", ""),
    /requires a secret salt/,
  );
});

test("sketch update skips unchanged repeats at the current version", () => {
  const salt = "test-only-secret-salt";
  const first = prepareUniqueVisitorSketchUpdate(
    null,
    null,
    "FR",
    "203.0.113.7",
    salt,
  );
  assert.equal(first.reset, true);
  assert.equal(first.changed, true);
  assert.equal(estimateUniqueVisitors(first.registers), 1);

  const repeat = prepareUniqueVisitorSketchUpdate(
    first.registers,
    UNIQUE_VISITOR_SKETCH_VERSION,
    "FR",
    "203.0.113.7",
    salt,
  );
  assert.equal(repeat.reset, false);
  assert.equal(repeat.changed, false);
  assert.deepEqual(repeat.registers, first.registers);
});

test("stale sketch versions reset instead of merging incompatible state", () => {
  const incompatible = Array<number>(UNIQUE_VISITOR_REGISTER_COUNT).fill(12);
  const update = prepareUniqueVisitorSketchUpdate(
    incompatible,
    UNIQUE_VISITOR_SKETCH_VERSION - 1,
    "US",
    "198.51.100.8",
    "rotated-test-salt",
  );

  assert.equal(update.reset, true);
  assert.equal(update.changed, true);
  assert.equal(estimateUniqueVisitors(update.registers), 1);
  assert.equal(update.registers.filter((value) => value > 0).length, 1);
});

test("unique visitor sketch estimates many distinct networks", () => {
  let registers: unknown = normalizeUniqueVisitorRegisters(null);
  for (let index = 1; index <= 1000; index++) {
    const third = Math.floor(index / 250);
    const fourth = (index % 250) + 1;
    registers = updateUniqueVisitorRegisters(
      registers,
      "US",
      `198.51.${third}.${fourth}`,
      "test-only-secret-salt",
    );
  }

  const estimate = estimateUniqueVisitors(registers);
  assert.ok(estimate >= 850 && estimate <= 1150, `${estimate}`);
});

test("malformed stored registers are normalized to bounded aggregate state", () => {
  const normalized = normalizeUniqueVisitorRegisters([
    -4,
    3.9,
    999,
    Number.NaN,
    "identity",
  ]);
  assert.equal(normalized.length, UNIQUE_VISITOR_REGISTER_COUNT);
  assert.deepEqual(normalized.slice(0, 5), [0, 3, 64, 0, 0]);
});
