// Local-only geometry regression. Switches a disposable browser session role,
// but never uploads, saves, publishes, or changes business records.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const base = process.env.RESPONSIVE_BASE_URL || 'http://localhost:3000';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(base).hostname));
const { chromium } = await import(
  process.env.PLAYWRIGHT_MODULE || 'playwright'
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
});
const output = resolve('.staging/artifacts/responsive-layout-routes');
await mkdir(output, { recursive: true });
const results = [];
try {
  const page = await browser.newPage({ reducedMotion: 'reduce' });
  await page.goto(`${base}/local-testing`, { waitUntil: 'networkidle' });
  await Promise.all([
    page.waitForURL(`${base}/admin`),
    page
      .getByRole('button', { name: 'Open Super Admin interface', exact: true })
      .click(),
  ]);
  for (const width of [232, 320, 390, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/admin/homepage`, { waitUntil: 'networkidle' });
    assert.equal(
      new URL(page.url()).pathname,
      '/admin/homepage',
      'Must verify the editor, not an access-denied page',
    );
    assert.equal(
      await page
        .getByRole('heading', { name: 'Hero slides', exact: true })
        .count(),
      1,
    );
    const issues = await page.locator('main').evaluate((main) => {
      const issues = [];
      for (const el of main.querySelectorAll(
        'h1,h2,h3,p,button,label,input,select,textarea,code',
      )) {
        if (el.closest('[inert],[aria-hidden="true"],.sr-only')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        let clipped = r.left < -1 || r.right > innerWidth + 1;
        for (
          let parent = el.parentElement;
          parent && parent !== main;
          parent = parent.parentElement
        ) {
          const style = getComputedStyle(parent);
          if (['hidden', 'clip'].includes(style.overflowX)) {
            const b = parent.getBoundingClientRect();
            if (r.left < b.left - 1 || r.right > b.right + 1) clipped = true;
          }
        }
        if (clipped)
          issues.push({
            tag: el.tagName,
            text: (el.textContent || el.getAttribute('aria-label') || '')
              .trim()
              .slice(0, 90),
            x: r.x,
            width: r.width,
          });
      }
      if (document.documentElement.scrollWidth > innerWidth + 1)
        issues.push({ error: 'page overflow' });
      return issues;
    });
    // Preview mode changes are browser-only, not saves. Compare unscaled frame
    // dimensions to a public 390px viewport via the same shared CSS contract.
    await page
      .getByRole('button', { name: 'Mobile preview', exact: true })
      .first()
      .click();
    const preview = page.locator('[data-hero-preview-viewport="390"]');
    await preview.waitFor();
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-hero-preview-viewport="390"]');
      return (
        el?.offsetWidth === 390 &&
        el.querySelector('.homepage-hero-frame').offsetWidth < 200 &&
        el.getBoundingClientRect().height > 10
      );
    });
    const geometry = await preview.evaluate((el) => {
      const frame = el.querySelector('.homepage-hero-frame');
      const visual = el.querySelector('.homepage-hero-visual');
      const body = el.querySelector('[data-hero-body]');
      return {
        width: frame.offsetWidth,
        height: frame.offsetHeight,
        bodyBelow:
          body.getBoundingClientRect().top >=
          visual.getBoundingClientRect().bottom - 1,
      };
    });
    results.push({ width, issues, preview: geometry });
    assert.ok(
      Math.abs(geometry.width - geometry.height) <= 1 && geometry.bodyBelow,
      `Editor must reproduce compact public composition: ${JSON.stringify(geometry)}`,
    );
    console.log(`${width}px admin editor: ${issues.length} clipped elements`);
  }
} finally {
  await browser.close();
  await writeFile(
    `${output}/admin-final-results.json`,
    JSON.stringify(results, null, 2),
  );
}
assert.ok(
  results.every((row) => row.issues.length === 0),
  JSON.stringify(
    results.filter((row) => row.issues.length),
    null,
    2,
  ),
);
