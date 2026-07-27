import { rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const buildRoot = path.resolve(projectRoot, "build", "web");
const relative = path.relative(projectRoot, buildRoot);

if (
  relative !== path.join("build", "web") ||
  relative.startsWith("..") ||
  path.isAbsolute(relative)
) {
  throw new Error(`Refusing to clean unexpected path: ${buildRoot}`);
}

await rm(buildRoot, { recursive: true, force: true });
console.log("[release] Removed the previous web artifact before rebuilding.");
