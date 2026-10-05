import { expect, test } from "@playwright/test";

const PAGES = ["/", "/appeals/", "/appeals/how-to-appeal-health-insurance-denial",
  "/appeals/external-review", "/codes/co-50", "/insurers/aetna", "/insurer-denial-rates",
  "/tools/appeal-deadline-calculator", "/privacy"];

/** Visible text only: no scripts, styles, JSON-LD, or hidden nodes. */
const visibleText = (page) => page.evaluate(() => document.body.innerText);

test.describe("layout holds at every width", () => {
  for (const width of [320, 390, 768, 1024, 1440]) {
    test(`no horizontal page scroll at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const route of PAGES) {
        await page.goto(route);
        const overflow = await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${route} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe("homepage", () => {
  test("hero CTA is visible without scrolling on desktop and phone", async ({ page }) => {
    for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.goto("/");
      const box = await page.locator(".hero-actions .button-primary").boundingBox();
      expect(box, "hero CTA missing").not.toBeNull();
      expect(box.y + box.height, `CTA below the fold at ${vp.width}px`).toBeLessThanOrEqual(vp.height);
    }
  });

  test("no CTA label wraps to a second line at desktop widths", async ({ page }) => {
    for (const width of [1024, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const wrapped = await page.evaluate(() =>
        [...document.querySelectorAll(".button")]
          .filter((b) => b.offsetParent !== null)
          .filter((b) => b.getBoundingClientRect().height > 64)
          .map((b) => b.textContent.trim()));
      expect(wrapped, `wrapped buttons at ${width}px`).toEqual([]);
    }
  });

  test("one label for the start-free intent", async ({ page }) => {
    await page.goto("/");
    const labels = await page.locator('[data-boot^="/upload"]').allTextContents();
    const distinct = [...new Set(labels.map((l) => l.trim()))].sort();
    // The nav carries the condensed form of the same label; nothing else may differ.
    expect(distinct).toEqual(["Free denial summary", "See my free denial summary"]);
  });

  test("no em or en dashes in visible homepage text", async ({ page }) => {
    await page.goto("/");
    const text = await visibleText(page);
    expect(text.match(/[\u2013\u2014]/g) ?? []).toEqual([]);
  });

  test("keyboard reaches the primary action from the top of the page", async ({ page, browserName }) => {
    test.skip(browserName === "webkit", "WebKit does not tab to buttons unless the OS setting is on");
    await page.goto("/");
    let reached = false;
    for (let i = 0; i < 20 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() =>
        document.activeElement?.matches(".hero-actions .button-primary") ?? false);
    }
    expect(reached, "hero CTA not reachable within 20 tabs").toBe(true);
  });

  test("deadline check answers a recent date and an expired one", async ({ page }) => {
    await page.goto("/");
    const iso = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
    const form = page.locator("#hero-deadline-form");
    await page.locator("#hero-denial-date").fill(iso(30));
    await form.locator("button[type=submit]").click();
    const result = page.locator("#hero-deadline-result");
    await expect(result).toContainText("150 days left");
    await expect(result).toContainText("letter always controls");
    await page.locator("#hero-denial-date").fill(iso(200));
    await form.locator("button[type=submit]").click();
    await expect(result).toContainText("likely passed");
    await expect(result.locator('a[href="/appeals/external-review"]')).toBeVisible();
  });

  test("every required trust proof is still on the page", async ({ page }) => {
    await page.goto("/");
    const text = await visibleText(page);
    for (const proof of ["No credit card required", "No subscription", "Never used to train AI",
      "Guest files normally delete in 24 hours", "Stripe processes payments"]) {
      expect(text.toLowerCase()).toContain(proof.toLowerCase());
    }
  });
});

test.describe("guides", () => {
  test("the ornament gives way to the journey map, and stays elsewhere", async ({ page }) => {
    await page.goto("/appeals/how-to-appeal-health-insurance-denial");
    await expect(page.locator(".flow")).toBeVisible();
    await expect(page.locator(".guide-motion")).toBeHidden();
    await page.goto("/appeals/external-review");
    await expect(page.locator(".guide-motion")).toBeVisible();
  });

  test("body copy holds a readable measure", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/appeals/external-review");
    const { width, size } = await page.evaluate(() => {
      const p = document.querySelector("article > p:not(.updated):not(.lede)");
      return { width: p.getBoundingClientRect().width, size: parseFloat(getComputedStyle(p).fontSize) };
    });
    // 36em of Inter is ~70 characters per line. The column itself is ~41em, so
    // this fails if the measure ever stops applying (as 68ch silently did).
    expect(width / size).toBeLessThanOrEqual(37);
  });

  test("decorative motion stops under reduced motion", async ({ page }) => {
    await page.goto("/appeals/external-review");
    const anim = await page.locator(".gm-dot").first().evaluate((n) => getComputedStyle(n).animationName);
    expect(anim).toBe("none");
  });
});
