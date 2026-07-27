import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { codes } from "./codes_data.mjs";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const html = await readFile(path.join(projectRoot, "web", "codes", "index.html"), "utf8");
const source = await readFile(path.join(projectRoot, "web", "codes", "code-finder.js"), "utf8");

function assert(condition, message) {
  if (!condition) throw new Error(`[code finder] ${message}`);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "web/codes/code-finder.js" });
const finder = sandbox.__getMyYesCodeFinder;
assert(finder, "The browser script did not expose its regression-test helpers.");

const rows = [...html.matchAll(
  /<tr\b[^>]*\bdata-code-row\b[^>]*\bdata-code-search="([^"]+)"[^>]*>[\s\S]*?<a\b[^>]*\bhref="\/codes\/([^"]+)"[^>]*>([^<]+)<\/a>/gi,
)].map((match) => ({ search: match[1], slug: match[2], code: match[3] }));

assert(rows.length === codes.length, `Expected ${codes.length} searchable rows; found ${rows.length}.`);
assert(/<div\b[^>]*\bclass="code-finder"[^>]*\brole="search"[^>]*\baria-label="Search denial codes"/i.test(html), "Search landmark is missing.");
assert(/<label\b[^>]*\bfor="code-query"/i.test(html), "The search field has no explicit label.");
assert(/id="code-results-status"[^>]*\brole="status"[^>]*\baria-live="polite"/i.test(html), "The result count is not announced.");
assert(/id="code-no-results"[^>]*\bhidden\b/i.test(html), "The progressive no-results message is not hidden initially.");
assert(/<script\b[^>]*\bsrc="\/codes\/code-finder\.js"[^>]*\bdefer\b/i.test(html), "The deferred finder script is missing.");

const matches = (query) => rows.filter((row) => finder.codeSearchMatches(row.search, query));
const co50 = matches("CO50");
assert(co50.length === 1 && co50[0].slug === "co-50", "CO50 must resolve exactly to the CO-50 page.");
assert(matches("co 50")[0]?.slug === "co-50", "A spaced code must resolve to the same page.");
assert(matches("prior auth").some((row) => row.slug === "co-197"), "Keyword search must find the prior-authorization denial.");
assert(matches("definitely-not-a-code").length === 0, "An unknown query must expose the no-results path.");
assert(
  finder.codeSearchResultLabel(1, rows.length, "CO50") === "1 code matches “CO50”.",
  "The singular live-region result label is incorrect.",
);
assert(
  finder.codeSearchResultLabel(rows.length, rows.length, "") === `Showing all ${rows.length} codes.`,
  "The reset live-region result label is incorrect.",
);

console.log(`[code finder] Passed ${rows.length}-row markup and search-behavior checks.`);
process.exitCode = 0;
