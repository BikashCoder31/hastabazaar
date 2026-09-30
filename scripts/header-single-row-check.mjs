// Local-only regression for the complete header and compact search interaction.
import assert from 'node:assert/strict';
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH,
});
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  for (const width of [
    232, 280, 320, 360, 390, 430, 639, 640, 768, 1023, 1024, 1440, 1920,
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const result = await page
      .locator('.site-header-main')
      .evaluate((header) => {
        const selectors = [
          '.site-header-brand',
          '.site-header-search',
          '.site-header-actions',
        ];
        if (innerWidth < 1024) selectors.unshift('#mobile-navigation-trigger');
        const boxes = selectors.map((s) =>
          header.querySelector(s).getBoundingClientRect(),
        );
        const centers = boxes.map((r) => r.y + r.height / 2);
        const brand = header.querySelector('.site-header-brand');
        const name = brand.querySelector('[aria-label="Hastabazaar"]');
        const range = document.createRange();
        range.selectNodeContents(name);
        const text = range.getBoundingClientRect();
        const logo = brand.querySelector('img');
        const sorted = [...boxes].sort((a, b) => a.left - b.left);
        return {
          aligned: Math.max(...centers) - Math.min(...centers) <= 1,
          contained: boxes.every(
            (r) => r.width > 0 && r.left >= 0 && r.right <= innerWidth,
          ),
          separate: sorted.every(
            (r, i) => !i || r.left >= sorted[i - 1].right - 1,
          ),
          brandVisible:
            text.width > 0 &&
            text.right <= brand.getBoundingClientRect().right + 1 &&
            logo.complete &&
            logo.naturalWidth > 0,
          overflow: document.documentElement.scrollWidth - innerWidth,
        };
      });
    assert.ok(
      result.aligned,
      `${width}px: brand, menu, search, cart and account must share one row`,
    );
    assert.ok(
      result.contained && result.separate && result.brandVisible,
      `${width}px: controls/brand clipped or overlapping: ${JSON.stringify(result)}`,
    );
    assert.ok(result.overflow <= 1, `${width}px: page overflow`);
    if (width < 640) {
      const trigger = page.getByRole('button', {
        name: 'Open product search',
        exact: true,
      });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Search products' });
      await dialog.waitFor({ state: 'visible' });
      const input = dialog.getByRole('searchbox');
      await input.fill('handmade');
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.ok(
        await trigger.evaluate((el) => el === document.activeElement),
        'Search must restore focus',
      );
      if (width === 320) {
        await trigger.click();
        await dialog.getByRole('searchbox').fill('handmade');
        await dialog
          .getByRole('button', { name: 'Search', exact: true })
          .click();
        await page.waitForURL('**/shop?q=handmade');
        await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
      }
    }
    if (process.env.HEADER_SCREENSHOT_DIR && [232, 390, 1440].includes(width)) {
      await page
        .locator('header')
        .screenshot({
          path: `${process.env.HEADER_SCREENSHOT_DIR}/single-row-header-${width}.png`,
        });
    }
    console.log(`${width}px: PASS`);
  }
  assert.deepEqual(errors, [], 'Browser runtime errors');
} finally {
  await browser.close();
}
