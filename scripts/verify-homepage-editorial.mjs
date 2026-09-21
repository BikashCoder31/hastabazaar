import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const origin = process.env.HOMEPAGE_QA_ORIGIN ?? 'http://localhost:3000';
const outputDirectory = path.resolve(
  process.argv[2] ?? process.env.HOMEPAGE_QA_OUTPUT ?? 'artifacts/homepage-qa',
);
const parsedOrigin = new URL(origin);

assert.ok(
  ['localhost', '127.0.0.1'].includes(parsedOrigin.hostname),
  'Homepage visual QA is restricted to a local server.',
);

await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];

try {
  for (const viewport of [
    { name: 'desktop', width: 1536, height: 1024 },
    { name: 'mobile', width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: viewport.width, height: viewport.height },
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === parsedOrigin.origin
        ? route.continue()
        : route.abort(),
    );

    const page = await context.newPage();
    const consoleErrors = [];
    const failedResponses = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => consoleErrors.push(error.message));
    page.on('response', (response) => {
      if (response.status() >= 400) {
        failedResponses.push({
          path: new URL(response.url()).pathname,
          status: response.status(),
        });
      }
    });

    await page.goto(parsedOrigin.origin, { waitUntil: 'networkidle' });
    const maker = page.locator('#makers');
    const footer = page.locator('footer');
    await maker.waitFor({ state: 'visible' });
    await footer.waitFor({ state: 'visible' });
    await page.screenshot({
      path: path.join(outputDirectory, `homepage-${viewport.name}.png`),
    });
    await page.addStyleTag({
      content: 'header { position: static !important; }',
    });
    await maker.scrollIntoViewIfNeeded();
    await maker.locator('img').waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const image = document.querySelector('#makers img');
      return (
        image instanceof HTMLImageElement &&
        image.complete &&
        image.naturalWidth > 0
      );
    });

    await maker.screenshot({
      path: path.join(outputDirectory, `maker-section-${viewport.name}.png`),
    });
    await footer.scrollIntoViewIfNeeded();
    await footer.screenshot({
      path: path.join(outputDirectory, `footer-${viewport.name}.png`),
    });

    const dimensions = await page.evaluate(() => ({
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      width: window.innerWidth,
    }));
    const oldMakerImages = await page
      .locator('img[src*="macrame-shelf"]')
      .count();
    const makerAlt = await maker.locator('img').getAttribute('alt');
    const internalFooterLinks = await footer
      .locator('a[href="/admin"], a[href="/local-testing"]')
      .count();

    assert.equal(
      dimensions.scrollWidth > dimensions.width,
      false,
      `${viewport.name} homepage must not overflow horizontally`,
    );
    assert.equal(oldMakerImages, 0);
    assert.equal(internalFooterLinks, 0);
    assert.match(makerAlt ?? '', /artisan’s hands/i);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(failedResponses, []);

    results.push({
      consoleErrors,
      dimensions,
      failedResponses,
      internalFooterLinks,
      makerAlt,
      viewport: viewport.name,
    });
    await context.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify({ outputDirectory, results }, null, 2));
