import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const checkOnly = process.argv.includes("--check-only");
const projectFlag = process.argv.indexOf("--project");
const requestedProject = projectFlag >= 0 ? process.argv[projectFlag + 1] : "production";
if (!requestedProject) {
  throw new Error("--project requires the production Firebase alias.");
}
if (requestedProject !== "production") {
  throw new Error(
    "This release command is production-only so its artifact verification cannot target the wrong site.",
  );
}
const project = "production";

function run(command, args) {
  const printable = [command, ...args].join(" ");
  console.log(`\n[release] ${printable}`);
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${printable} failed with exit code ${result.status}.`);
  }
}

const checks = [
  ["flutter", ["pub", "get"]],
  ["flutter", ["analyze"]],
  ["flutter", ["test"]],
  ["npm", ["ci", "--prefix", "functions"]],
  ["npm", ["--prefix", "functions", "audit", "--omit=dev", "--audit-level=high"]],
  ["npm", ["--prefix", "functions", "run", "build"]],
  ["npm", ["--prefix", "functions", "test"]],
  ["node", ["tool/rules_test.mjs"]],
  ["node", ["tool/analytics_tracker_test.mjs"]],
  ["node", ["--test", "tool/email_link_boot_test.mjs"]],
  ["node", ["tool/code_finder_test.mjs"]],
  ["node", ["tool/marketing_build.mjs"]],
  ["node", ["tool/accessibility_check.mjs", "web"]],
  ["npx", ["--yes", "html-validate@10.10.0", "web/**/*.html"]],
  ["node", ["tool/clean_web_build.mjs"]],
  ["flutter", ["build", "web"]],
  ["node", ["tool/marketing_build.mjs", "--stage-build"]],
  ["node", ["tool/marketing_build.mjs", "--verify-build"]],
  ["node", ["tool/accessibility_check.mjs", "build/web"]],
  ["node", ["tool/rendered_accessibility_check.mjs", "build/web"]],
];

for (const [command, args] of checks) run(command, args);

if (checkOnly) {
  console.log("\n[release] Checks passed. --check-only prevented deployment.");
  process.exit(0);
}

// Deploy every Firebase resource represented in firebase.json so a frontend,
// callable function, analytics rewrite, and security rules cannot drift apart.
// The paid-packet Firestore trigger deliberately enables retry. Its
// generation lease and fulfillment state machine make overlapping deliveries
// idempotent, so production releases explicitly acknowledge the failure policy.
run("firebase", ["deploy", "--project", project, "--force"]);
run("node", ["tool/production_verify.mjs", "--artifact", "build/web"]);

console.log("\n[release] Production deployment and artifact verification passed.");
