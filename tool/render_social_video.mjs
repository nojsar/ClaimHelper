import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

// Thin launcher so the social videos render with the same `node tool/<x>.mjs`
// shape as the rest of the marketing tooling. The renderer itself has to live
// in video/ because that is where Remotion is installed.

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = spawnSync(
  process.execPath,
  [path.join(projectRoot, "video", "render.mjs"), ...process.argv.slice(2)],
  // cwd matters: Remotion caches its headless browser next to the nearest
  // package.json, and only video/ has one; from the repo root it would
  // land in an untracked .remotion/ folder and re-download every clone.
  { stdio: "inherit", cwd: path.join(projectRoot, "video") },
);
process.exit(result.status ?? 1);
