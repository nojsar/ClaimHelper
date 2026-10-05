/**
 * Serves build/web the way Firebase Hosting does for this site: cleanUrls
 * (/appeals/x -> /appeals/x.html) and directory index files. Playwright drives
 * the real built artifact, so the checks see exactly what deploy ships.
 */
import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("../build/web", import.meta.url)));
const port = Number(process.env.PORT || 4317);
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript",
  ".mjs": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml",
  ".png": "image/png", ".webp": "image/webp", ".woff2": "font/woff2", ".mp4": "video/mp4",
  ".xml": "application/xml", ".txt": "text/plain", ".wasm": "application/wasm",
};

function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]);
  const base = path.join(root, clean);
  if (!base.startsWith(root)) return null;
  for (const candidate of [base, `${base}.html`, path.join(base, "index.html")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  return null;
}

createServer((req, res) => {
  const file = resolve(req.url) ?? path.join(root, "404.html");
  const status = resolve(req.url) ? 200 : 404;
  res.writeHead(status, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => console.log(`serving build/web on http://127.0.0.1:${port}`));
