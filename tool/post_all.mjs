import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Runs every network's poster in sequence and summarizes. Each poster exits 0
// and logs a "not configured" line when its secrets are absent, so this one
// workflow carries all networks and each activates when its secrets are set.
// A single network failing must not silence the others — failures are
// collected and reported at the end.

const platforms = ["bluesky", "mastodon", "x", "threads", "linkedin", "facebook", "instagram", "youtube"];
const args = process.argv.slice(2);
const failed = [];

for (const platform of platforms) {
  console.log(`\n=== ${platform} ===`);
  const script = fileURLToPath(new URL(`./post_${platform}.mjs`, import.meta.url));
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit" });
  if (result.status !== 0) failed.push(platform);
}

console.log(`\n[marketing] Done. ${failed.length ? `Failed: ${failed.join(", ")}` : "No failures."}`);
if (failed.length) process.exit(1);
