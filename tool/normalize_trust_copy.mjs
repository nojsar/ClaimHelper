import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../web", import.meta.url)));
const checkOnly = process.argv.includes("--check");
const replacements = [
  ["Start my appeal — free preview", "See my free denial summary"],
  ["Start my appeal — free", "See my free denial summary"],
  ["Start my free preview", "See my free denial summary"],
  ["Start with the free preview", "See my free denial summary"],
  ["Start free preview", "See my free denial summary"],
  [
    "FREE PREVIEW · $39 FULL PACKET · NO SUBSCRIPTION. EVER.",
    "Free preview · $39 full packet · No subscription",
  ],
];
const retiredTone =
  /the insurer stamped no|draft the comeback|no subscription\. ever|deadlines are half the battle|different fight with a better weapon/i;

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(resolved));
    else if (entry.name.endsWith(".html")) files.push(resolved);
  }
  return files;
}

const changed = [];
const toneViolations = [];
for (const file of await htmlFiles(root)) {
  const before = await readFile(file, "utf8");
  const after = replacements.reduce(
    (value, [from, to]) => value.replaceAll(from, to),
    before,
  );
  if (retiredTone.test(after)) {
    toneViolations.push(path.relative(root, file).replaceAll("\\", "/"));
  }
  if (after === before) continue;
  changed.push(path.relative(root, file).replaceAll("\\", "/"));
  if (!checkOnly) await writeFile(file, after, "utf8");
}

if (toneViolations.length) {
  console.error(`[trust-copy] ${toneViolations.length} public pages use retired adversarial language:`);
  for (const file of toneViolations) console.error(`  - ${file}`);
  process.exitCode = 1;
}

if (checkOnly && changed.length) {
  console.error(`[trust-copy] ${changed.length} public pages use retired call-to-action copy:`);
  for (const file of changed) console.error(`  - ${file}`);
  process.exitCode = 1;
} else {
  console.log(`[trust-copy] ${checkOnly ? "Checked" : "Normalized"} ${changed.length} public pages.`);
}
