/**
 * Design scan: full-page screenshots of representative pages at desktop and
 * phone width, so a redesign is judged on what actually renders.
 *   node scan.mjs <outDir>
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const out = process.argv[2];
mkdirSync(out, { recursive: true });
const server = spawn(process.execPath, ["serve.mjs"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 900));

const pages = {
  home: "/",
  hub: "/appeals/",
  guide: "/appeals/how-to-appeal-health-insurance-denial",
  guide2: "/appeals/glp1-weight-loss-medication-denial",
  codes: "/codes/",
  code: "/codes/co-50",
  insurer: "/insurers/aetna",
  rates: "/insurer-denial-rates",
  calc: "/tools/appeal-deadline-calculator",
  privacy: "/privacy",
};
const viewports = { d: { width: 1440, height: 900 }, m: { width: 390, height: 844 } };

const browser = await chromium.launch();
try {
  for (const [vk, vp] of Object.entries(viewports)) {
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    for (const [name, route] of Object.entries(pages)) {
      await page.goto(`http://127.0.0.1:4317${route}`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.screenshot({ path: path.join(out, `${name}-${vk}.png`), fullPage: true });
      console.log(`${name}-${vk}`.padEnd(12), `${vp.width}x${h}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
