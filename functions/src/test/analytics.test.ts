import assert from "node:assert/strict";
import test from "node:test";

import {
  analyticsSegmentDocumentId,
  filterSegmentableFields,
} from "../analytics";

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
