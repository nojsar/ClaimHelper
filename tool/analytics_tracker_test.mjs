import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const trackerSource = readFileSync(path.join(projectRoot, "web", "analytics.js"), "utf8");
const optOutKey = "getmyyes_admin_analytics_opt_out_v1";

function trackerHarness({
  pathname = "/",
  hash = "",
  staticMode = false,
  storedOptOut = false,
  beacon = true,
} = {}) {
  const beacons = [];
  const fetches = [];
  const storage = new Map(storedOptOut ? [[optOutKey, "1"]] : []);
  const timers = new Map();
  let nextTimer = 1;

  const context = {
    Boolean,
    JSON,
    Promise,
    String,
    console,
    document: {
      referrer: "https://search.example/results",
      currentScript: {
        hasAttribute: (name) => name === "data-static" && staticMode,
      },
    },
    location: { hostname: "getmyyes.com", pathname, hash },
    navigator: beacon
      ? {
          sendBeacon(url, body) {
            beacons.push({ url, body });
            return true;
          },
        }
      : {},
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
    fetch(url, options) {
      fetches.push({ url, options });
      return Promise.resolve({ status: 204 });
    },
    setTimeout(callback, _delay) {
      const id = nextTimer++;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  context.window = context;
  context.globalThis = context;
  vm.runInNewContext(trackerSource, context, { filename: "web/analytics.js" });
  return { context, beacons, fetches, storage, timers };
}

function eventOf(beacon) {
  return JSON.parse(beacon.body);
}

test("pure static pages retain immediate anonymous visit counting", () => {
  const result = trackerHarness({ pathname: "/appeals/", staticMode: true });
  assert.equal(result.beacons.length, 1);
  assert.deepEqual(eventOf(result.beacons[0]), {
    t: "visit",
    path: "/appeals/",
    ref: "https://search.example/results",
  });
  assert.equal(result.timers.size, 0);
});

test("Flutter landing queues traffic until auth resolves", () => {
  const result = trackerHarness();
  assert.equal(result.beacons.length, 0);
  assert.equal(result.timers.size, 1);

  result.context.__track("boot", "/upload");
  result.context.__resolveAnalyticsAuth();
  assert.deepEqual(result.beacons.map(eventOf).map((event) => event.t), [
    "visit",
    "boot",
  ]);
  result.context.__resolveAnalyticsAuth();
  assert.equal(result.beacons.length, 2);
});

test("app readiness keeps only a rounded timing for server-side bucketing", () => {
  const result = trackerHarness();
  result.context.__track("app_ready", "/upload", 1234.4);
  result.context.__resolveAnalyticsAuth();

  assert.deepEqual(eventOf(result.beacons[1]), {
    t: "app_ready",
    path: "/upload",
    ref: "https://search.example/results",
    ms: 1234,
  });
});

test("persisted owner opt-out suppresses all traffic", () => {
  const result = trackerHarness({ storedOptOut: true, staticMode: true });
  result.context.__track("pageview", "/appeals/step-therapy-denial");
  assert.equal(result.beacons.length, 0);
  assert.equal(result.fetches.length, 0);
  assert.equal(result.timers.size, 0);
});

test("the private stats route is suppressed without opting out a non-admin", () => {
  const result = trackerHarness({ hash: "#/stats" });
  assert.equal(result.storage.get(optOutKey), undefined);
  assert.equal(result.beacons.length, 0);
  assert.equal(result.timers.size, 0);

  // Route knowledge is not identity: an ordinary user who tries the private
  // URL must still be counted after they navigate back to the public product.
  result.context.__resolveAnalyticsAuth();
  result.context.__track("pageview", "/upload");
  assert.equal(result.beacons.length, 1);
});

test("verified admin exclusion clears queued events and requests cookie", () => {
  const result = trackerHarness();
  result.context.__track("boot", "/upload");
  result.context.__excludeAdminAnalytics("firebase-token");

  assert.equal(result.storage.get(optOutKey), "1");
  assert.equal(result.beacons.length, 0);
  assert.equal(result.timers.size, 0);
  assert.equal(result.fetches.length, 1);
  assert.equal(result.fetches[0].url, "/api/admin-analytics-exclusion");
  assert.equal(result.fetches[0].options.method, "POST");
  assert.equal(
    result.fetches[0].options.headers.Authorization,
    "Bearer firebase-token",
  );
  assert.equal(result.fetches[0].options.credentials, "same-origin");

  result.context.__track("pageview", "/case/:id/review");
  assert.equal(result.beacons.length, 0);
});

test("fetch fallback includes same-origin exclusion cookie credentials", () => {
  const result = trackerHarness({ pathname: "/codes/co-29", staticMode: true, beacon: false });
  assert.equal(result.fetches.length, 1);
  assert.equal(result.fetches[0].url, "/api/track");
  assert.equal(result.fetches[0].options.credentials, "same-origin");
  assert.equal(JSON.parse(result.fetches[0].options.body).t, "visit");
});

function htmlFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...htmlFiles(file));
    else if (entry.name.endsWith(".html")) files.push(file);
  }
  return files;
}

test("every tracked page uses the shared tracker contract", () => {
  const webRoot = path.join(projectRoot, "web");
  const tracked = [];
  for (const file of htmlFiles(webRoot)) {
    const html = readFileSync(file, "utf8");
    assert.equal(
      html.includes("sendBeacon('/api/track'") || html.includes('sendBeacon("/api/track"'),
      false,
      `${path.relative(webRoot, file)} still has an inline tracker`,
    );
    if (!html.includes('src="/analytics.js"')) continue;
    tracked.push(path.relative(webRoot, file));
    if (path.basename(file) === "index.html" && path.dirname(file) === webRoot) {
      assert.match(html, /<script src="\/analytics\.js"><\/script>/);
      assert.match(html, /typeof window\.__track === 'function'/);
    } else {
      assert.match(html, /<script src="\/analytics\.js" data-static><\/script>/);
    }
  }
  assert.ok(tracked.length >= 50, `expected at least 50 tracked pages, got ${tracked.length}`);
});
