import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { NativeReviewTask } from '../lib/admin/review-queue-view';
import { stubFixtureLink } from './helpers/browser-fixture-link';

void test('saved Gregorian queue bounds use AD by default and offer Bikram Sambat', async () => {
  const navigation = `export const usePathname = () => '/admin';
    export const useSearchParams = () => new URLSearchParams('reviewFrom=2026-11-18&reviewTo=2026-11-19');
    export const useRouter = () => ({refresh() {}});`;
  const hooks = registerHooks({
    resolve(specifier, context, next) {
      const contents = specifier === 'next/navigation' ? navigation
        : specifier === 'next/link' ? 'export default function Link() { return null; }'
        : null;
      return contents ? { url: 'data:text/javascript,' + encodeURIComponent(contents), shortCircuit: true }
        : next(specifier, context);
    },
  });
  try {
    const { SharedReviewQueue } = await import('../components/admin/shared-review-queue');
    const html = renderToStaticMarkup(createElement(SharedReviewQueue, { tasks: [], actorId: 'fixture-reviewer' }));
    assert.match(html, /value="ad" selected=""/);
    assert.match(html, /value="bs">Nepali Bikram Sambat \(BS\)/);
    for (const [bound, date] of [['from', '2026-11-18'], ['to', '2026-11-19']]) {
      const input = html.match(new RegExp(`<input\\b[^>]*id="review-${bound}"[^>]*>`))?.[0];
      assert.ok(input?.includes('type="date"'));
      assert.ok(input?.includes(`value="${date}"`));
    }
    assert.ok(html.includes('२ मंसिर २०८३ BS'));
    assert.match(html, /Nepal time \(UTC\+05:45\)/);
  } finally {
    hooks.deregister();
  }
});

const chromePath = process.env.CHROME_PATH;
void test('the shared review queue uses AD by default and filters the same Nepal day in either calendar', {
  skip: !chromePath && 'Set CHROME_PATH to run the isolated browser fixture.',
}, async () => {
  const opened = Date.parse('2026-11-17T18:15:00.000Z');
  const tasks: NativeReviewTask[] = Object.entries({
    before: opened - 1,
    first: opened,
    last: opened + 86_400_000 - 1,
    after: opened + 86_400_000,
  }).map(([id, startedAt]) => ({
    id, startedAt, sourceId: id, sourceType: 'seller_document',
    sourceRevision: 'v1', dueAt: null, calendarVersion: 'continuous-v1',
    hasDeadline: 0, ownerId: null, revision: 0, orderId: null, priority: false,
    backupId: null, status: 'awaiting_review', sourceStatus: 'submitted',
    triagedAt: null, nextActor: 'Hastabazaar', sellerId: null, sellerName: null,
    nextUpdateAt: null,
  }));
  const bundle = await build({
    stdin: {
      sourcefile: 'review-queue-calendar-fixture.tsx',
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import {createRoot} from 'react-dom/client';
        import {SharedReviewQueue} from './components/admin/shared-review-queue';
        createRoot(document.getElementById('root')).render(
          <SharedReviewQueue tasks={${JSON.stringify(tasks)}} actorId="fixture-reviewer" />
        );`,
    },
    bundle: true,
    jsx: 'automatic',
    platform: 'browser',
    write: false,
    plugins: [{
      name: 'review-queue-calendar-navigation',
      setup(builder) {
        stubFixtureLink(builder);
        builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
          path: 'navigation', namespace: 'review-calendar-fixture',
        }));
        builder.onLoad({ filter: /.*/, namespace: 'review-calendar-fixture' }, () => ({
          contents: `export const usePathname = () => location.pathname;
            export const useSearchParams = () => new URLSearchParams(location.search);
            export const useRouter = () => ({refresh() {}});`,
        }));
      },
    }],
  });
  const browser = await chromium.launch({ executablePath: chromePath });
  try {
    const page = await browser.newPage({ locale: 'en-US', timezoneId: 'America/Los_Angeles' });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => route.request().url().startsWith('https://review-calendar.test/admin?')
      ? route.fulfill({ body: '<!doctype html><div id="root"></div>', contentType: 'text/html' })
      : route.abort());
    await page.goto('https://review-calendar.test/admin?period=month&reviewFrom=2026-11-18&reviewTo=2026-11-18');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const query = () => new URL(page.url()).searchParams;
    const calendar = page.getByRole('combobox', { name: 'Date calendar', exact: true });
    const rows = () => page.locator('li[id^="review-task-"]').evaluateAll((elements) => elements.map((row) => row.id));
    try {
      await page.getByRole('heading', { name: 'Shared review queue', exact: true }).waitFor({ timeout: 5_000 });
    } catch (error) {
      assert.deepEqual(errors, []);
      throw error;
    }
    assert.equal(await calendar.count(), 1, 'The queue should offer a date calendar choice.');
    assert.equal(await calendar.inputValue(), 'ad');
    assert.equal(await page.getByLabel('Opened from (AD)', { exact: true }).inputValue(), '2026-11-18');
    assert.equal(await page.getByLabel('Opened through (AD)', { exact: true }).inputValue(), '2026-11-18');
    assert.deepEqual(await rows(), ['review-task-first', 'review-task-last']);

    await calendar.selectOption('bs');
    assert.equal(await calendar.inputValue(), 'bs');
    assert.equal(await page.getByRole('combobox', { name: 'Opened from BS year' }).inputValue(), '2083');
    assert.equal(await page.getByRole('combobox', { name: 'Opened from BS month' }).inputValue(), '8');
    assert.equal(await page.getByRole('combobox', { name: 'Opened from BS day' }).inputValue(), '2');
    assert.deepEqual(await rows(), ['review-task-first', 'review-task-last']);

    await page.getByRole('button', { name: 'Clear start date', exact: true }).click();
    await page.getByRole('button', { name: 'Clear end date', exact: true }).click();
    assert.equal(query().get('reviewFrom'), null);
    assert.equal(query().get('reviewTo'), null);
    assert.equal((await rows()).length, 4);
    for (const [label, key] of [['Opened from', 'reviewFrom'], ['Opened through', 'reviewTo']] as const) {
      await page.getByRole('combobox', { name: `${label} BS year` }).selectOption('2083');
      await page.getByRole('combobox', { name: `${label} BS month` }).selectOption('8');
      assert.equal(query().get(key), null);
      await page.getByRole('combobox', { name: `${label} BS day` }).selectOption('2');
      assert.equal(query().get(key), '2026-11-18');
    }
    assert.equal(query().get('period'), 'month');
    assert.deepEqual(await rows(), ['review-task-first', 'review-task-last']);
    await calendar.selectOption('ad');
    assert.equal(await page.getByLabel('Opened from (AD)', { exact: true }).inputValue(), '2026-11-18');
    assert.equal(await page.getByLabel('Opened through (AD)', { exact: true }).inputValue(), '2026-11-18');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
