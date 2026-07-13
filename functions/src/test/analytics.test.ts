import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_ANALYTICS_COOKIE,
  ANALYTICS_DAILY_COLLECTION,
  ANALYTICS_SEGMENT_DAILY_COLLECTION,
  UNIQUE_VISITOR_REGISTER_COUNT,
  UNIQUE_VISITOR_SKETCH_VERSION,
  adminAnalyticsCookieHeader,
  analyticsSegmentDocumentId,
  bearerToken,
  clientNetworkAddress,
  cookieValue,
  estimateUniqueVisitors,
  filterSegmentableFields,
  isAdminAnalyticsUid,
  isExcludedAnalyticsPath,
  normalizeUniqueVisitorRegisters,
  prepareUniqueVisitorSketchUpdate,
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
