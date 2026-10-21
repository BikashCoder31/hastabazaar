import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { bundledLegalDraft, legacyLegalProcedure } from '../lib/legal-procedures/content';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import { stubFixtureLink } from './helpers/browser-fixture-link';

void test('mounted Super Admin editor previews inert text, saves, retains failed edits and reads history', async () => {
  // oxlint-disable-next-line typescript/no-explicit-any -- Existing runtime-provided browser fixture convention.
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as any;
  const current = await bundledLegalDraft();
  const initial = { current, history: [], nextBeforeRevision: null, legacy: await legacyLegalProcedure() };
  const css = (await postcss([tailwindcss({ base: process.cwd() })]).process(await readFile('app/globals.css', 'utf8'), { from: 'app/globals.css' })).css;
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {LegalProcedureWorkspace} from './components/admin/legal-procedure-workspace';
    createRoot(document.getElementById('root')).render(<LegalProcedureWorkspace initial={${JSON.stringify(initial)}}/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-links', setup: stubFixtureLink }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const posts: Record<string, unknown>[] = [], errors: string[] = [];
  let shouldConflict = false;
  let temporaryFailures = 1;
  let savedSnapshot = current;
  page.on('pageerror', (error: Error) => errors.push(error.message));
  try {
    // Every request is intercepted; no retained server or database is contacted.
    // oxlint-disable-next-line typescript/no-explicit-any -- Runtime-supplied Playwright route.
    await page.route('**/*', async (route: any) => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, 'https://legal.fixture');
      if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
      if (url.pathname === '/api/admin/legal-procedures') {
        if (request.method() === 'POST') {
          const data = request.postDataJSON(); posts.push(data);
          if (temporaryFailures-- > 0) return route.fulfill({ status: 503, json: { error: 'Temporary fixture storage failure. Your edits are kept.' } });
          if (shouldConflict) return route.fulfill({ status: 409, json: { error: 'A newer draft exists. Your edits are kept.' } });
          savedSnapshot = { ...current, id: 'internal-legal-draft:1', revision: 1, sections: data.sections,
            actorId: 'fictional-super', actorName: 'Fictional Super Admin', reason: data.reason, savedAt: 1792324800000,
            previousRevision: 0, previousSha256: current.sha256 };
          const { sha256: _oldHash, ...snapshotData } = savedSnapshot;
          savedSnapshot.sha256 = createHash('sha256').update(JSON.stringify(snapshotData)).digest('hex');
          return route.fulfill({ json: { saved: savedSnapshot } });
        }
        if (url.searchParams.has('revision')) return route.fulfill({ json: { version: Number(url.searchParams.get('revision')) === 1 ? savedSnapshot : current } });
        return route.fulfill({ json: initial });
      }
      assert.equal(url.pathname, '/admin/legal-policies');
      return route.fulfill({ contentType: 'text/html', body: '<style>' + css + '</style><div id="root"></div><script src="/fixture.js"></script>' });
    });
    await page.goto('https://legal.fixture/admin/legal-policies');
    await page.getByRole('button', { name: 'Edit version', exact: true }).waitFor();
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `No page overflow at ${width}px`);
    }
    await page.getByRole('button', { name: 'Edit version', exact: true }).click();
    const activeTab = page.getByRole('button', { name: 'Edit version', exact: true });
    await activeTab.hover();
    const contrast = await activeTab.evaluate((element: HTMLElement) => {
      const style = getComputedStyle(element), canvas = document.createElement('canvas');
      canvas.width = canvas.height = 1; const ctx = canvas.getContext('2d')!;
      const luminances = [style.backgroundColor, style.color].map(color => {
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
        const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => v / 255)
          .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
      });
      const [background, foreground] = luminances;
      return (Math.max(background, foreground) + 0.05) / (Math.min(background, foreground) + 0.05);
    });
    assert.ok(contrast >= 4.5, `Selected view must remain readable on hover (contrast ${contrast})`);
    const body = page.getByLabel('Company and operational readiness', { exact: true });
    const malicious = '<script>window.UNSAFE_EXECUTED=true</script>\n[unsafe](javascript:alert(1))\nFictional procedure update.';
    await body.fill(malicious);
    await page.getByLabel('Reason for this version').fill('Fictional isolated editor test.');
    await page.getByRole('button', { name: 'Preview changes', exact: true }).click();
    await page.getByText(malicious, { exact: true }).waitFor();
    assert.equal(await page.locator('a[href^="javascript:"]').count(), 0);
    assert.equal(await page.evaluate(() => Object.hasOwn(window, 'UNSAFE_EXECUTED')), false);
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /Temporary fixture storage failure/ }).waitFor();
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /Version saved/ }).waitFor();
    assert.equal(posts.length, 2);
    assert.equal(posts[0].requestId, posts[1].requestId, 'Unchanged retries must use the same request reference');
    assert.equal(posts[0].expectedRevision, 0);
    assert.equal(Object.hasOwn(posts[0], 'status'), false);
    await page.getByRole('button', { name: 'Edit version', exact: true }).click();
    await body.fill('Unsaved fictional edits retained after a conflict.');
    await page.getByLabel('Reason for this version').fill('Another fictional review revision.');
    shouldConflict = true;
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: /newer draft/ }).waitFor();
    assert.equal(posts[2].expectedRevision, 1);
    assert.equal(posts[2].expectedSha256, savedSnapshot.sha256);
    assert.notEqual(posts[2].expectedSha256, current.sha256);
    assert.equal(await body.inputValue(), 'Unsaved fictional edits retained after a conflict.');
    await page.getByRole('button', { name: 'Version history', exact: true }).click();
    await page.getByRole('button', { name: 'View revision 1', exact: true }).click();
    await page.getByText('Historical saved version · read-only', { exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Draft version history' }).locator('textarea').count(), 0);
    await page.getByRole('button', { name: 'Edit version', exact: true }).click();
    assert.equal(await body.inputValue(), 'Unsaved fictional edits retained after a conflict.');
    await page.getByRole('button', { name: 'Version history', exact: true }).click();
    await page.getByRole('button', { name: 'View retained Draft 3.0', exact: true }).click();
    await page.getByText('Original source retained · read-only', { exact: true }).waitFor();
    assert.equal(posts.length, 3, 'History and preview never write');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
