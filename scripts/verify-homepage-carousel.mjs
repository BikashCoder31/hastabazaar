import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const origin = new URL(process.env.HOMEPAGE_QA_ORIGIN ?? 'http://localhost:3000');
const outputDirectory = path.resolve(
  process.argv[2] ??
    process.env.HOMEPAGE_QA_OUTPUT ??
    '.staging/artifacts/homepage-hero-carousel',
);

assert.ok(
  ['localhost', '127.0.0.1'].includes(origin.hostname),
  'Homepage carousel QA is restricted to a local server.',
);

const stagingMarker = JSON.parse(
  await readFile('.staging/staging-environment.json', 'utf8'),
);
assert.equal(stagingMarker.scopeId, 'hastabazaar-v1.2.1-local-staging');
assert.equal(stagingMarker.recordLabel, 'SIMULATED — NOT VALID FOR PRODUCTION');
await mkdir(outputDirectory, { recursive: true });

for (const id of [
  'system-nepal-craft-hero',
  'system-maker-hands-hero',
  'system-meaningful-gifts-hero',
]) {
  const response = await fetch(new URL(`/api/homepage/hero-media/${id}`, origin), {
    redirect: 'follow',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(
    response.status,
    200,
    `${id} is unavailable. Run the guarded local staging seed before browser QA.`,
  );
  assert.equal(response.headers.get('content-type'), 'image/webp');
}

const results = {
  checkedAt: new Date().toISOString(),
  environment: 'disposable local staging',
  origin: origin.origin,
  screenshots: [],
  checks: [],
  limitations: [
    'No video is published in the three-slide initial fixture; video upload/container checks remain automated and the browser video scenario is documented for Super Admin self-test.',
    'A headless browser cannot prove production storage, scheduler, or delivery-provider behavior.',
  ],
};

function currentSlide(page) {
  return page
    .locator('[aria-label="Choose featured story"] [aria-current="true"]')
    .getAttribute('aria-label');
}

async function expectSlide(page, number) {
  await page
    .locator(`[aria-label="Choose featured story"] button:nth-child(${number})`)
    .waitFor({ state: 'visible' });
  await page.waitForFunction(
    (expected) =>
      document
        .querySelector('[aria-label="Choose featured story"] [aria-current="true"]')
        ?.getAttribute('aria-label')
        ?.startsWith(`Show slide ${expected}:`) ?? false,
    number,
  );
}

async function leaveCarouselFocus(page) {
  await page.locator('header a').first().focus();
  await page.mouse.move(2, 2);
}

function observe(page) {
  const consoleErrors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({
        path: new URL(response.url()).pathname,
        status: response.status(),
      });
    }
  });
  return { consoleErrors, failedResponses };
}

const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const viewport of [
    { name: 'desktop', width: 1536, height: 960 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height },
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin.origin
        ? route.continue()
        : route.abort(),
    );
    const page = await context.newPage();
    const observed = observe(page);
    await page.goto(origin.origin, { waitUntil: 'networkidle' });
    const carousel = page.locator('.homepage-hero-carousel');
    await carousel.waitFor({ state: 'visible' });
    assert.equal(
      await carousel.locator('[aria-label^="Slide "]').count(),
      3,
      `${viewport.name} must start with exactly three slides`,
    );

    const categoryTop = await page
      .locator('#categories')
      .evaluate((element) => element.getBoundingClientRect().top + scrollY);
    for (let slide = 1; slide <= 3; slide += 1) {
      await page
        .locator(`[aria-label="Choose featured story"] button:nth-child(${slide})`)
        .click();
      await expectSlide(page, slide);
      const image = carousel
        .locator(`[aria-label="Slide ${slide} of 3"] img`)
        .first();
      await image.waitFor({ state: 'visible' });
      await page.waitForFunction(
        (selector) => {
          const candidate = document.querySelector(selector);
          return (
            candidate instanceof HTMLImageElement &&
            candidate.complete &&
            candidate.naturalWidth > 0
          );
        },
        `[aria-label="Slide ${slide} of 3"] img`,
      );
      if (viewport.name === 'desktop') {
        await page.waitForTimeout(500);
        const slideScreenshot = path.join(
          outputDirectory,
          `homepage-carousel-desktop-slide-${slide}.png`,
        );
        await carousel.screenshot({ path: slideScreenshot });
        results.screenshots.push(slideScreenshot);
      }
    }
    assert.equal(
      Math.round(
        await page
          .locator('#categories')
          .evaluate((element) => element.getBoundingClientRect().top + scrollY),
      ),
      Math.round(categoryTop),
      'Changing slides must not shift the category panel',
    );

    await page.getByRole('button', { name: 'Previous featured story' }).click();
    await expectSlide(page, 2);
    await page.getByRole('button', { name: 'Next featured story' }).click();
    await expectSlide(page, 3);
    await page.getByRole('button', { name: 'Next featured story' }).press('ArrowRight');
    await expectSlide(page, 1);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.scrollTo(0, 0));

    const screenshot = path.join(
      outputDirectory,
      `homepage-carousel-${viewport.name}.png`,
    );
    await page.screenshot({ path: screenshot, fullPage: false });
    results.screenshots.push(screenshot);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
      false,
      `${viewport.name} must not overflow horizontally`,
    );
    assert.deepEqual(observed.consoleErrors, []);
    assert.deepEqual(observed.failedResponses, []);
    results.checks.push({
      viewport: viewport.name,
      pageIdentity: (await page.title()).includes('HastaBazaar'),
      slides: 3,
      imagesDecoded: 3,
      controls: 'previous, next, numbered selection, keyboard',
      noHorizontalOverflow: true,
      noConsoleErrors: true,
    });

    if (viewport.name === 'desktop') {
      await page
        .locator('[aria-label="Choose featured story"] button:nth-child(3)')
        .click();
      await leaveCarouselFocus(page);
      await page.waitForTimeout(6_500);
      await expectSlide(page, 1);

      await carousel.hover();
      const hoverStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(await currentSlide(page), hoverStart, 'hover must pause rotation');
      await page.mouse.move(2, 2);

      const nextButton = page.getByRole('button', {
        name: 'Next featured story',
      });
      await nextButton.focus();
      const focusStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(await currentSlide(page), focusStart, 'focus must pause rotation');

      const pause = page.getByRole('button', { name: 'Pause featured stories' });
      await pause.click();
      await leaveCarouselFocus(page);
      const pauseStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(await currentSlide(page), pauseStart, 'manual pause must stop rotation');
      await page.getByRole('button', { name: 'Play featured stories' }).click();

      await leaveCarouselFocus(page);
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'hidden',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      const hiddenStart = await currentSlide(page);
      await page.waitForTimeout(6_500);
      assert.equal(
        await currentSlide(page),
        hiddenStart,
        'hidden document must pause rotation',
      );
      await page.evaluate(() => {
        Object.defineProperty(document, 'visibilityState', {
          configurable: true,
          value: 'visible',
        });
        document.dispatchEvent(new Event('visibilitychange'));
      });
      results.checks.push({
        behavior: 'autoplay',
        wrap: 'slide 3 to slide 1',
        pausedBy: ['hover', 'focus', 'manual control', 'document hidden'],
      });
    }
    await context.close();
  }

  const reducedContext = await browser.newContext({
    reducedMotion: 'reduce',
    viewport: { width: 1024, height: 768 },
  });
  await reducedContext.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin.origin
      ? route.continue()
      : route.abort(),
  );
  const reducedPage = await reducedContext.newPage();
  await reducedPage.goto(origin.origin, { waitUntil: 'networkidle' });
  await leaveCarouselFocus(reducedPage);
  const reducedStart = await currentSlide(reducedPage);
  await reducedPage.waitForTimeout(6_500);
  assert.equal(
    await currentSlide(reducedPage),
    reducedStart,
    'reduced motion must disable automatic rotation',
  );
  results.checks.push({ behavior: 'reduced motion', autoplay: false });
  await reducedContext.close();
} finally {
  await browser.close();
}

await writeFile(
  path.join(outputDirectory, 'homepage-carousel-results.json'),
  `${JSON.stringify(results, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
