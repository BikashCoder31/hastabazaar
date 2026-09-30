// Focused browser geometry regression for the homepage craft-details grid.
// Uses the component's real CSS module in a minimal layout fixture, without a DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(modulePath);
const css = await readFile(new URL('../components/homepage/craft-details.module.css', import.meta.url), 'utf8');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
});
try {
  for (const width of [1280, 3117, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 1600px; }
      .shell { width: 100%; max-width: 90rem; margin-inline: auto; padding-inline: 3rem; }
      .media-frame { position: relative; min-inline-size: 0; overflow: hidden; }
      .aspect-ratio { aspect-ratio: 16 / 11; }
      ${css}
      </style></head><body><section class="shell"><div class="layout">
        <figure class="figure"><div class="media media-frame aspect-ratio">
          <img alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" />
        </div><figcaption class="caption">A closer look at the making process.</figcaption></figure>
        <div class="content"><h2 class="heading">The beauty is in the details.</h2></div>
      </div></section></body></html>`);
    const bounds = await page.evaluate(() => {
      const rect = selector => {
        const { left, right, width } = document.querySelector(selector).getBoundingClientRect();
        return { left, right, width };
      };
      return { figure: rect('.figure'), frame: rect('.media'), content: rect('.content') };
    });
    assert.ok(bounds.frame.width <= bounds.figure.width + 1,
      `${width}px: media frame exceeds figure by ${(bounds.frame.width - bounds.figure.width).toFixed(1)}px`);
    if (width >= 1024) {
      assert.ok(bounds.frame.right <= bounds.content.left + 1,
        `${width}px: media frame overlaps content by ${(bounds.frame.right - bounds.content.left).toFixed(1)}px`);
    }
    console.log(`${width}px craft-details frame stays in its grid track`);
    await page.close();
  }
} finally {
  await browser.close();
}
