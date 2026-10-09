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

/**
 * WCAG contrast of every visible text node whose background resolves to solid
 * colours. Text over a gradient panel is skipped rather than guessed at; the
 * panels are fixed brand values, checked by hand once in the design notes.
 */
const lowContrastText = (page) => page.evaluate(() => {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage.includes("gradient")) return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a === 1) break; }
    }
    return layers.reverse().reduce((acc, c) => over(c, acc), { r: 255, g: 255, b: 255, a: 1 });
  };
  const failures = [];
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const el = walker.currentNode.parentElement;
    if (!walker.currentNode.textContent.trim() || seen.has(el)) continue;
    seen.add(el);
    if (!el.getClientRects().length || el.closest("[aria-hidden='true'], .skip-link, #app-loader")) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || Number(cs.opacity) === 0) continue;
    const bg = backdrop(el);
    if (!bg) continue;
    const fg = over(parse(cs.color), bg);
    const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x);
    const ratio = (hi + 0.05) / (lo + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    if (ratio < (large ? 3 : 4.5)) failures.push(`${walker.currentNode.textContent.trim().slice(0, 40)} (${ratio.toFixed(2)}:1)`);
  }
  return failures;
});

test.describe("appearance follows the system (dark mode)", () => {
  test.use({ colorScheme: "dark" });
  for (const route of ["/", "/appeals/external-review", "/tools/appeal-deadline-calculator", "/insurer-denial-rates", "/privacy", "/codes/co-50"]) {
    test(`text stays readable in dark mode on ${route}`, async ({ page }) => {
      await page.goto(route);
      // Open every collapsible so hidden copy is checked too.
      await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
      expect(await lowContrastText(page)).toEqual([]);
    });
  }

  test("the page itself turns dark, not just the text", async ({ page }) => {
    for (const route of ["/", "/appeals/external-review"]) {
      await page.goto(route);
      const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      const [r, g, b] = bg.match(/\d+/g).map(Number);
      expect(r + g + b, `${route} background ${bg}`).toBeLessThan(120);
    }
  });
});

test("text stays readable in light mode on the homepage and a guide", async ({ page }) => {
  for (const route of ["/", "/appeals/external-review"]) {
    await page.goto(route);
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    expect(await lowContrastText(page), route).toEqual([]);
  }
});

test.describe("glass header (functional layer only)", () => {
  test("clear over the hero, glass once content scrolls beneath it", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto("/");
    const header = page.locator(".site-header");
    await expect(header).toHaveAttribute("data-at-top", "");
    await page.mouse.wheel(0, 900);
    await expect(header).not.toHaveAttribute("data-at-top", "");
    const filter = await header.evaluate((h) => getComputedStyle(h).backdropFilter || getComputedStyle(h).webkitBackdropFilter);
    expect(filter).toContain("blur");
  });

  test("glass stays on its few floating surfaces", async ({ page }) => {
    // The owner chose more visible glass than Apple's controls-only rule:
    // the hero card's frame, the reassurance strip and the motion control
    // float over the aurora. Anything else picking up the material is drift.
    await page.goto("/");
    const glassy = await page.evaluate(() =>
      [...document.querySelectorAll("main *")]
        .filter((el) => /blur/.test(getComputedStyle(el).backdropFilter || ""))
        .map((el) => el.className.toString()));
    expect(glassy.sort()).toEqual(["glass-stage", "motion-toggle", "reassurance-list"]);
  });

  test("increased contrast gets an opaque bar", async ({ browser }) => {
    const context = await browser.newContext({ contrast: "more" });
    const page = await context.newPage();
    await page.goto("/");
    await page.mouse.wheel(0, 900);
    const filter = await page.locator(".site-header").evaluate((h) => getComputedStyle(h).backdropFilter);
    expect(filter === "none" || filter === "").toBe(true);
    await context.close();
  });
});

test("standalone links are at least 44px tall on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, selector] of [
    ["/", ".footer-links a, .proof-action, .preview-card-foot a, .resource-links a, .brand"],
    ["/appeals/external-review", ".related a, .brand"],
  ]) {
    await page.goto(route);
    await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; }));
    const short = await page.evaluate((sel) =>
      [...document.querySelectorAll(sel)]
        .filter((a) => a.getClientRects().length)
        .filter((a) => a.getBoundingClientRect().height < 43.5)
        .map((a) => `${a.textContent.trim().slice(0, 30)} ${Math.round(a.getBoundingClientRect().height)}px`), selector);
    expect(short, route).toEqual([]);
  }
});

test.describe("glass motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the drifting light can be paused, and the choice is kept", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator("[data-animation-control]");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toHaveText("Play motion");
    const state = () => page.locator(".hero-aurora span").first().evaluate((el) => getComputedStyle(el).animationPlayState);
    expect(await state()).toBe("paused");
    await page.reload();
    expect(await state()).toBe("paused");
    await page.locator("[data-animation-control]").click();
    expect(await state()).toBe("running");
  });

  test("below-the-fold sections come into focus as they arrive", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 860 });
    await page.goto("/");
    const waiting = await page.locator("[data-reveal]:not(.is-revealed)").count();
    expect(waiting, "nothing was set up to reveal").toBeGreaterThan(0);
    // Nothing on the first screen ever starts hidden.
    const hiddenOnArrival = await page.evaluate(() =>
      [...document.querySelectorAll("[data-reveal]")].filter((el) => el.getBoundingClientRect().top < innerHeight).length);
    expect(hiddenOnArrival).toBe(0);
    for (let y = 0; y < 12; y += 1) await page.mouse.wheel(0, 900);
    await expect(page.locator("[data-reveal]:not(.is-revealed)")).toHaveCount(0, { timeout: 5000 });
  });
});

test("reduced motion hides nothing and stills the light", async ({ page }) => {
  // The suite's default context asks for reduced motion.
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.classList.contains("reveal-ready"))).toBe(false);
  expect(await page.locator(".hero-aurora span").first().evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await expect(page.locator("[data-animation-control]")).toBeHidden();
});

test.describe("product film", () => {
  test("has controls, a transcript, and waits under reduced motion", async ({ page }) => {
    await page.goto("/");
    const video = page.locator(".film-video");
    await expect(video).toHaveAttribute("controls", "");
    await expect(video).not.toHaveAttribute("autoplay", /.*/);
    const described = await video.getAttribute("aria-describedby");
    await expect(page.locator(`#${described}`)).toContainText("fictional");
    // Narration means captions, straight from the script.
    await expect(page.locator(".film-video track[kind='captions']")).toHaveAttribute("src", /product-film-v\d+\.vtt$/);
    await video.scrollIntoViewIfNeeded();
    await page.waitForTimeout(600);
    expect(await video.evaluate((v) => v.paused)).toBe(true);
  });

  test.describe("with motion welcome", () => {
    test.use({ reducedMotion: "no-preference" });
    test("starts muted once in view, and phones get the vertical cut", async ({ page, browserName }) => {
      test.skip(browserName === "webkit", "Playwright's WebKit build ships without H.264 playback.");
      await page.goto("/");
      const video = page.locator(".film-video");
      await video.scrollIntoViewIfNeeded();
      await expect.poll(() => video.evaluate((v) => !v.paused && v.muted), { timeout: 8000 }).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      expect(await page.locator(".film-video").evaluate((v) => v.currentSrc || v.src)).toMatch(/product-film-v\d+-vertical\.mp4$/);
    });
  });
});
