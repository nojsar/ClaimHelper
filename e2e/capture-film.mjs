/**
 * Re-captures the real app screens the product film shows, from a mock-mode
 * build (canned fictional case: Jordan Sample, Sample Health Plan, Wegovy
 * step therapy; no Firebase, no AI call), into video/library/film/.
 *
 *   flutter build web --release --dart-define=USE_MOCKS=true --output build/mock-web
 *   node e2e/capture-film.mjs            (from claimhelper/, or cd e2e first)
 *   node video/render.mjs --film
 *
 * Run it after any change to the upload, processing or preview screens, so
 * the film never shows an app that no longer exists.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const filmDir = path.resolve(here, "..", "video", "library", "film");
const photo = path.resolve(here, "..", "video", "library", "stills", "letter-phone.jpg");
const PORT = 4320;

const server = spawn(process.execPath, [path.join(here, "serve.mjs"), "--root", "build/mock-web", "--port", String(PORT)], { stdio: "ignore" });
await new Promise((resolve) => setTimeout(resolve, 800));
const browser = await chromium.launch();
// 430 CSS px wide at 2x: a large phone, captured sharp enough to zoom into.
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 2 });
const tap = async (role, name, exact = false) => {
  const target = page.getByRole(role, { name, exact }).first();
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
};

try {
  await page.goto(`http://127.0.0.1:${PORT}/#/upload`, { waitUntil: "load" });
  // Flutter draws to a canvas; its semantics tree is what lets us find controls.
  await page.waitForSelector("flt-semantics-placeholder", { state: "attached", timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.$eval("flt-semantics-placeholder", (el) => el.click());
  await page.waitForTimeout(1000);

  // The file is offered under a neutral name, as a visitor's would be.
  const chooser = page.waitForEvent("filechooser");
  await tap("button", "Choose denial documents");
  const { readFile } = await import("node:fs/promises");
  await (await chooser).setFiles({ name: "denial-letter.jpg", mimeType: "image/jpeg", buffer: await readFile(photo) });
  await page.waitForTimeout(1200);
  await tap("checkbox", "I consent");
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(filmDir, "app-upload.png") });

  await tap("button", "Create my free summary");
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(filmDir, "app-processing.png") });

  await page.getByRole("button", { name: "Looks right" }).waitFor({ timeout: 20000 });
  await tap("button", "Looks right");
  await page.waitForTimeout(1200);
  await tap("checkbox", "Myself");
  await tap("button", "State");
  await page.waitForTimeout(800);
  await tap("menuitem", "CA", true);
  await page.waitForTimeout(500);
  await tap("checkbox", "Employer plan");
  await tap("checkbox", "Approve my treatment or medication");
  await tap("checkbox", "No", true);
  await tap("button", "See my free preview");
  await page.getByRole("button", { name: "Update my preview" }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(800);

  // A tall viewport renders the whole summary at once: no scroll stitching.
  await page.setViewportSize({ width: 430, height: 2880 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(filmDir, "app-summary.png") });
  console.log(`[film] captured upload, processing and summary into ${path.relative(process.cwd(), filmDir)}`);
} finally {
  await browser.close();
  server.kill();
}
