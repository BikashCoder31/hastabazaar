import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import type { Page } from "playwright";

let assets: Promise<{ js: string; css: string }> | undefined;
function fixtureAssets() {
  return (assets ??= (async () => {
    const built = await build({
      stdin: {
        resolveDir: process.cwd(),
        sourcefile: "homepage-motion-fixture.tsx",
        loader: "tsx",
        contents: `
      import React from 'react';import {createRoot} from 'react-dom/client';
      import {HomepageHeroCarousel} from './components/homepage/homepage-hero-carousel';
      import {CraftDetails} from './components/homepage/craft-details';
      import {INITIAL_HOMEPAGE_HERO_SLIDES,SELLER_REGISTRATION_HERO_SLIDE} from './lib/homepage/hero-slides';
      const slides=[INITIAL_HOMEPAGE_HERO_SLIDES[0],{...INITIAL_HOMEPAGE_HERO_SLIDES[1],mediaType:'video'}, {...SELLER_REGISTRATION_HERO_SLIDE,position:3}];
      createRoot(document.getElementById('root')).render(<><HomepageHeroCarousel slides={slides}/><div style={{height:900}}/><CraftDetails/><div style={{height:900}}/></>);
    `,
      },
      bundle: true,
      write: false,
      outfile: "homepage-motion-fixture.js",
      platform: "browser",
      format: "iife",
      loader: { ".css": "local-css" },
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [
        {
          name: "homepage-motion-shell",
          setup(b) {
            b.onResolve({ filter: /^next\/(link|image)$/ }, (args) => ({
              path: args.path,
              namespace: "motion-shell",
            }));
            b.onLoad({ filter: /.*/, namespace: "motion-shell" }, (args) => ({
              contents:
                args.path === "next/image"
                  ? 'import React from "react";export default function Image({fill,priority,...props}){return React.createElement("img",props)}'
                  : 'import React from "react";export default function Link(props){return React.createElement("a",props)}',
              loader: "js",
              resolveDir: process.cwd(),
            }));
          },
        },
      ],
    });
    const globals = await postcss([
      tailwindcss({ base: process.cwd() }),
    ]).process(await readFile(resolve("app/globals.css"), "utf8"), {
      from: resolve("app/globals.css"),
    });
    return {
      js: built.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
      css:
        globals.css +
        "\n" +
        built.outputFiles
          .filter((file) => file.path.endsWith(".css"))
          .map((file) => file.text)
          .join("\n"),
    };
  })());
}
async function mounted(
  width = 1440,
  reducedMotion: "reduce" | "no-preference" = "no-preference",
) {
  const { chromium } = (await import(
    process.env.PLAYWRIGHT_MODULE ?? "playwright"
  )) as typeof import("playwright");
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      "C:/Program Files/Google/Chrome/Application/chrome.exe",
  });
  try {
    const page = await browser.newPage({
      viewport: { width, height: 900 },
      reducedMotion,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const { js, css } = await fixtureAssets();
    await page.route("**/*", (route) =>
      route.fulfill(
        route.request().resourceType() === "image"
          ? {
              status: 200,
              contentType: "image/svg+xml",
              body: '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000"><rect width="1000" height="1000" fill="#b68c5a"/><path d="M0 250H1000M0 500H1000M0 750H1000" stroke="#fff" stroke-width="20"/></svg>',
            }
          : {
              status: 200,
              contentType: "text/html",
              body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style></head><body><div id="root"></div></body></html>`,
            },
      ),
    );
    await page.goto("https://homepage-motion.test/");
    await page.addScriptTag({ content: js });
    await page.locator("#craft-details-heading").waitFor();
    // Hover preserves the existing carousel's own pause behavior during geometry checks.
    await page.mouse.move(width / 2, 100);
    return {
      page,
      close: async () => {
        await browser.close();
        assert.deepEqual(errors, []);
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
async function geometry(page: Page, kind: "hero" | "maker") {
  return page
    .locator(`[data-homepage-parallax="${kind}"]`)
    .first()
    .evaluate((root) => {
      const frame = root.parentElement!;
      const image = root.querySelector("img")!;
      const text =
        root.closest("figure")?.querySelector("figcaption") ??
        root
          .closest(".homepage-hero-layout")
          ?.querySelector(".homepage-hero-heading");
      const rect = frame.getBoundingClientRect();
      const photograph = image.getBoundingClientRect();
      return {
        offset: Number.parseFloat(
          (root as HTMLElement).style.getPropertyValue("--parallax-offset") ||
            "0",
        ),
        active: (root as HTMLElement).dataset.parallaxActive,
        transform: getComputedStyle(root.firstElementChild!).transform,
        frameTop: rect.top,
        frameBottom: rect.bottom,
        height: rect.height,
        imageTop: photograph.top,
        imageBottom: photograph.bottom,
        textTop: text!.getBoundingClientRect().top,
        scroll: scrollY,
        pageWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
      };
    });
}
for (const width of [1440, 390])
  void test(`homepage imagery has bounded parallax at ${width}px without moving copy or exposing edges`, async () => {
    const h = await mounted(width);
    try {
      assert.equal(
        await h.page.locator('[data-homepage-parallax="hero"]').count(),
        1,
        "Only the photo slide needs a parallax layer",
      );
      await h.page.waitForFunction(
        () =>
          document
            .querySelector('[data-homepage-parallax="hero"]')
            ?.getAttribute("data-parallax-active") === "true",
      );
      const before = await geometry(h.page, "hero");
      await h.page.mouse.wheel(0, 150);
      await h.page.waitForFunction(
        (previous) =>
          Number.parseFloat(
            (
              document.querySelector(
                '[data-homepage-parallax="hero"]',
              ) as HTMLElement
            ).style.getPropertyValue("--parallax-offset"),
          ) !== previous,
        before.offset,
      );
      const after = await geometry(h.page, "hero");
      assert.ok(Math.abs(after.offset) <= (width < 768 ? 8 : 16));
      assert.notEqual(after.offset, before.offset);
      assert.equal(after.height, before.height, "No layout shift");
      assert.ok(
        Math.abs(
          after.textTop - before.textTop + (after.scroll - before.scroll),
        ) < 1,
        "Copy follows ordinary scrolling only",
      );
      assert.ok(
        after.imageTop <= after.frameTop &&
          after.imageBottom >= after.frameBottom,
        "The photo covers the clipped frame at both edges",
      );
      assert.ok(after.pageWidth <= after.viewport, "No horizontal overflow");
      await h.page.locator("#craft-guide").scrollIntoViewIfNeeded();
      await h.page.waitForFunction(
        () =>
          document
            .querySelector('[data-homepage-parallax="maker"]')
            ?.getAttribute("data-parallax-active") === "true",
      );
      const makerBefore = await geometry(h.page, "maker");
      await h.page.mouse.wheel(0, 100);
      await h.page.waitForFunction(
        (previous) =>
          Number.parseFloat(
            (
              document.querySelector(
                '[data-homepage-parallax="maker"]',
              ) as HTMLElement
            ).style.getPropertyValue("--parallax-offset"),
          ) !== previous,
        makerBefore.offset,
      );
      const maker = await geometry(h.page, "maker");
      assert.notEqual(
        maker.offset,
        makerBefore.offset,
        "The maker photograph also moves with scrolling",
      );
      assert.equal(
        maker.height,
        makerBefore.height,
        "The maker frame stays the same size",
      );
      assert.ok(
        Math.abs(
          maker.textTop -
            makerBefore.textTop +
            (maker.scroll - makerBefore.scroll),
        ) < 1,
        "The maker caption follows ordinary scrolling only",
      );
      assert.ok(Math.abs(maker.offset) <= (width < 768 ? 8 : 12));
      assert.ok(
        maker.imageTop <= maker.frameTop &&
          maker.imageBottom >= maker.frameBottom,
      );
      await h.page.waitForFunction(
        () =>
          document
            .querySelector('[data-homepage-parallax="hero"]')
            ?.getAttribute("data-parallax-active") === "false",
      );
    } finally {
      await h.close();
    }
  });
void test("reduced motion starts static and a live preference change clears parallax immediately", async () => {
  const h = await mounted(1440, "reduce");
  try {
    assert.equal(
      await h.page.locator('[data-homepage-parallax="hero"]').count(),
      1,
    );
    const still = await geometry(h.page, "hero");
    assert.equal(still.transform, "none");
    assert.equal(still.offset, 0);
    await h.page.emulateMedia({ reducedMotion: "no-preference" });
    await h.page.waitForFunction(
      () =>
        document
          .querySelector('[data-homepage-parallax="hero"]')
          ?.getAttribute("data-parallax-active") === "true",
    );
    await h.page.emulateMedia({ reducedMotion: "reduce" });
    await h.page.waitForFunction(
      () =>
        document
          .querySelector('[data-homepage-parallax="hero"]')
          ?.getAttribute("data-parallax-active") === "false",
    );
    const reset = await geometry(h.page, "hero");
    assert.equal(reset.transform, "none");
    assert.equal(reset.offset, 0);
    await h.page.mouse.wheel(0, 100);
    assert.equal((await geometry(h.page, "hero")).transform, "none");
  } finally {
    await h.close();
  }
});
void test("video controls and the native seller-registration panel remain outside parallax", async () => {
  const h = await mounted();
  try {
    assert.equal(
      await h.page.locator('[data-homepage-parallax="hero"]').count(),
      1,
    );
    await h.page.waitForFunction(
      () =>
        document
          .querySelector('[data-homepage-parallax="hero"]')
          ?.getAttribute("data-parallax-active") === "true",
    );
    await h.page.locator("[data-slider-dots] button").nth(1).click();
    await h.page.waitForFunction(
      () =>
        document
          .querySelector('[data-homepage-parallax="hero"]')
          ?.getAttribute("data-parallax-active") === "false",
    );
    const inactive = await geometry(h.page, "hero");
    assert.equal(
      inactive.offset,
      0,
      "Selecting away clears the previous photo offset",
    );
    assert.equal(inactive.transform, "none");
    const video = h.page.locator(
      '[data-slot="carousel-item"]:not([inert]) video',
    );
    assert.equal(await video.count(), 1);
    assert.equal(await video.getAttribute("controls"), "");
    assert.equal(
      await video.locator("xpath=ancestor::*[@data-homepage-parallax]").count(),
      0,
    );
    await h.page.locator("[data-slider-dots] button").nth(0).click();
    await h.page.waitForFunction(
      () =>
        document
          .querySelector('[data-homepage-parallax="hero"]')
          ?.getAttribute("data-parallax-active") === "true",
    );
    assert.notEqual(
      (await geometry(h.page, "hero")).transform,
      "none",
      "Returning to the photo resumes parallax",
    );
    await h.page.locator("[data-slider-dots] button").nth(2).click();
    const registration = h.page.locator(
      '[data-slot="carousel-item"]:not([inert])',
    );
    assert.equal(
      await registration.locator("[data-homepage-parallax]").count(),
      0,
    );
    assert.match(await registration.innerText(), /seller|store/i);
  } finally {
    await h.close();
  }
});
