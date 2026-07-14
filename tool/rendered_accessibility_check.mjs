import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const axeCliVersion = "4.12.1";
const projectRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const requestedRoot = process.argv[2] ?? "build/web";
const siteRoot = path.resolve(projectRoot, requestedRoot);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

async function htmlFiles(root) {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".html")) files.push(target);
  }
  return files.sort((a, b) => a.localeCompare(b));
}

function safeFileForUrl(url) {
  const decoded = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const resolved = path.resolve(siteRoot, relative);
  const prefix = `${siteRoot}${path.sep}`;
  return resolved === siteRoot || resolved.startsWith(prefix) ? resolved : null;
}

async function serveFile(request, response) {
  const file = safeFileForUrl(request.url ?? "/");
  if (!file) {
    response.writeHead(400).end("Bad request");
    return;
  }
  try {
    const details = await stat(file);
    if (!details.isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": mimeTypes.get(path.extname(file).toLowerCase())
        ?? "application/octet-stream",
    });
    createReadStream(file).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, NO_COLOR: "1" },
      shell: process.platform === "win32",
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`axe was terminated by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

const pages = await htmlFiles(siteRoot);
if (!pages.length) {
  throw new Error(`No built HTML pages found in ${requestedRoot}.`);
}

const server = createServer((request, response) => {
  void serveFile(request, response);
});
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

try {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not determine the local accessibility server port.");
  }
  const base = `http://127.0.0.1:${address.port}`;
  const urls = pages.map((file) => {
    const relative = path.relative(siteRoot, file).split(path.sep).join("/");
    return `${base}/${relative.split("/").map(encodeURIComponent).join("/")}`;
  });
  console.log(
    `[accessibility] Rendering ${urls.length} built pages with @axe-core/cli@${axeCliVersion}.`,
  );

  const executable = process.platform === "win32" ? "npx.cmd" : "npx";
  const exitCode = await run(executable, [
    "--yes",
    `@axe-core/cli@${axeCliVersion}`,
    ...urls,
    "--tags",
    "wcag2a,wcag2aa,wcag21a,wcag21aa,wcag22aa",
    "--load-delay",
    "250",
    "--timeout",
    "120",
    "--exit",
  ]);
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}
