// Read-only local browser regression. Start local staging before running.
// PLAYWRIGHT_MODULE and CHROMIUM_PATH can select installed browser tooling.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RESPONSIVE_BASE_URL || 'http://localhost:3000';
assert.ok(
  ['localhost', '127.0.0.1'].includes(new URL(base).hostname),
  'Local staging only',
);
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const output = resolve('.staging/artifacts/responsive-layout-composition');
await mkdir(output, { recursive: true });
const widths = (
  process.env.RESPONSIVE_WIDTHS ||
  '232,320,360,390,430,640,722,768,1024,1440,1920'
)
  .split(',')
  .map(Number);
const failures = [];
const results = [];
const runtimeErrors = [];
const failedMedia = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  page.on('response', (response) => {
    if (
      response.status() >= 400 &&
      ['image', 'media'].includes(response.request().resourceType())
    )
      failedMedia.push({ url: response.url(), status: response.status() });
  });
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const logoVisible = await page.getByRole('link', { name: 'HastaBazaar home', exact: true }).locator('img').evaluate((logo) => {
      const r = logo.getBoundingClientRect();
      return logo.complete && logo.naturalWidth > 0 && r.width >= 24 && r.height >= 24 && r.left >= 0 && r.right <= innerWidth;
    });
    if (!logoVisible) failures.push(`${width}px: header logo is missing or clipped`);
    const nameVisible = await page.getByRole('link', { name: 'HastaBazaar home', exact: true }).locator('[aria-label="Hastabazaar"]').evaluate((name) => {
      const range = document.createRange();
      range.selectNodeContents(name);
      const r = range.getBoundingClientRect();
      const link = name.closest('a').getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.left >= link.left && r.right <= link.right + 1 && r.right <= innerWidth;
    });
    if (!nameVisible) failures.push(`${width}px: header name is missing or clipped`);
    if (width < 1024) {
      const aligned = await page.locator('header').evaluate((header) => {
        const parts = ['#mobile-navigation-trigger', '.site-header-brand', '.site-header-search', '.site-header-actions'].map((selector) => header.querySelector(selector).getBoundingClientRect());
        const centers = parts.map((r) => r.y + r.height / 2);
        return Math.max(...centers) - Math.min(...centers) <= 1 && parts.every((r) => r.width > 0 && r.left >= 0 && r.right <= innerWidth);
      });
      if (!aligned) failures.push(`${width}px: complete brand/menu/search/account header must share one row`);
    }
    const slides = page.locator(
      '.homepage-hero-carousel [aria-roledescription="slide"]',
    );
    const count = await slides.count();
    assert.ok(count, 'Hero slides must be rendered');
    for (let index = 0; index < count; index++) {
      await page
        .locator('.homepage-hero-carousel')
        .getByRole('button', { name: new RegExp(`^Show slide ${index + 1}:`) })
        .click();
      await page.waitForFunction((i) => {
        const hero = document.querySelector('.homepage-hero-carousel');
        const slide = hero.querySelectorAll('[aria-roledescription="slide"]')[
          i
        ];
        return (
          Math.abs(
            slide.getBoundingClientRect().x - hero.getBoundingClientRect().x,
          ) < 0.5
        );
      }, index);
      const geometry = await slides.nth(index).evaluate((slide) => {
        const box = (el) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            bottom: r.bottom,
            right: r.right,
          };
        };
        const heading = slide.querySelector('h2');
        const body =
          slide.querySelector('[data-hero-body]') ||
          [...slide.querySelectorAll('p')].find((p) =>
            /^(Discover|Find|Meet)/.test(p.textContent),
          );
        const media = slide.querySelector('[data-media-frame]');
        const note = slide.querySelector('.homepage-hero-image-note');
        return {
          heading: box(heading),
          body: body ? box(body) : null,
          media: box(media),
          visual: box(slide.querySelector('.homepage-hero-visual') || media),
          note: note ? box(note) : null,
          pageOverflow: document.documentElement.scrollWidth - innerWidth,
          noteOverflow: note ? note.scrollWidth - note.clientWidth : 0,
        };
      });
      const issues = [];
      if (geometry.pageOverflow > 1) issues.push('page horizontal overflow');
      if (width >= 300 && width < 1024) {
        if (geometry.media.y > geometry.heading.bottom)
          issues.push('image stranded below the headline');
        if (geometry.body && geometry.body.width < width * 0.75)
          issues.push('description squeezed into narrow column');
        if (Math.abs(geometry.media.width - geometry.media.height) > 2)
          issues.push('compact image is not square');
        if (geometry.body && geometry.body.y < geometry.visual.bottom)
          issues.push('description overlaps the visual row');
      }
      if (
        geometry.note &&
        (geometry.note.right > geometry.visual.right + 1 ||
          geometry.note.bottom > geometry.visual.bottom + 1 ||
          geometry.noteOverflow > 1)
      )
        issues.push('caption escapes visual column');
      results.push({ width, slide: index + 1, geometry, issues });
      failures.push(
        ...issues.map((issue) => `${width}px slide ${index + 1}: ${issue}`),
      );
      if ([232, 390, 722, 1440].includes(width))
        await page
          .locator('.homepage-hero-carousel')
          .screenshot({ path: `${output}/hero-${width}-${index + 1}.png` });
    }
    if ([232, 390, 722, 1440].includes(width)) {
      for (const id of [
        'categories',
        'offers',
        'latest-products',
        'top-products',
        'occasions',
        'makers',
        'our-standard',
        'customer-care',
      ]) {
        const section = page.locator(`#${id}`);
        if (await section.count()) {
          await section.scrollIntoViewIfNeeded();
          await section
            .locator('img')
            .evaluateAll((images) =>
              Promise.all(images.map((img) => img.decode().catch(() => {}))),
            );
          await section.screenshot({
            path: `${output}/${id}-${width}.png`,
            style: 'header { visibility: hidden !important; }',
          });
        }
      }
      await page
        .locator('footer')
        .screenshot({ path: `${output}/footer-${width}.png` });
    }
    console.log(`${width}px: ${count} hero slides checked`);
  }
  // Exercise allowed future copy lengths without saving any content. Long
  // captions must grow in flow instead of escaping an absolute mobile overlay.
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(base, { waitUntil: 'networkidle' });
  const stress = await page
    .locator('.homepage-hero-carousel [aria-roledescription="slide"]')
    .first()
    .evaluate((slide) => {
      const note = slide.querySelector('.homepage-hero-image-note');
      const body = slide.querySelector('[data-hero-body]');
      note.textContent =
        'Handcrafted meaningful memories from independent makers. '
          .repeat(2)
          .slice(0, 100);
      body.textContent =
        'Thoughtful handmade products with stories from our makers. '
          .repeat(5)
          .slice(0, 240);
      note.style.fontSize = '24px';
      const noteRect = note.getBoundingClientRect();
      const visual = slide
        .querySelector('.homepage-hero-visual')
        .getBoundingClientRect();
      return {
        noteBottom: noteRect.bottom,
        visualBottom: visual.bottom,
        bodyTop: body.getBoundingClientRect().top,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
  assert.ok(
    stress.noteBottom <= stress.visualBottom + 1 &&
      stress.bodyTop >= stress.visualBottom,
    'Expanded caption must remain in flow above the description',
  );
  assert.ok(stress.overflow <= 1, 'Expanded content must not overflow');
  await page.setViewportSize({ width: 232, height: 900 });
  const expandedDots = await page
    .getByLabel('Choose featured story', { exact: true })
    .evaluate((dots) => {
      while (dots.children.length < 8)
        dots.append(dots.firstElementChild.cloneNode(true));
      return [...dots.querySelectorAll('button')].every((button) => {
        const r = button.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth;
      });
    });
  assert.ok(
    expandedDots,
    'Eight future slide controls must remain reachable on narrow screens',
  );
  assert.deepEqual(runtimeErrors, [], 'No uncaught page errors');
  assert.deepEqual(failedMedia, [], 'No failed image/video responses');
} finally {
  await browser.close();
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ results, failures, runtimeErrors, failedMedia }, null, 2),
  );
}
assert.deepEqual(failures, [], failures.join('\n'));
console.log(`PASS: ${results.length} slide layouts. Screenshots: ${output}`);
