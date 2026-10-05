/** Quick look: node shot.mjs <outDir> <route> [widths...] — full-page shots. */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
const [out, route, ...widths] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ["serve.mjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch();
try {
  for (const w of (widths.length ? widths : ["1440"]).map(Number)) {
    const page = await browser.newPage({ viewport: { width: w, height: w < 600 ? 844 : 900 }, reducedMotion: "reduce" });
    await page.goto(`http://127.0.0.1:4317${route}`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const name = `${route.replace(/\W+/g, "_") || "home"}-${w}.png`;
    await page.screenshot({ path: path.join(out, name), fullPage: true });
    console.log(name, await page.evaluate(() => document.documentElement.scrollHeight));
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
