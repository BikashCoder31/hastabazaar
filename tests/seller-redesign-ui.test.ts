import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium, type Page } from 'playwright';
import { stubFixtureLink } from './helpers/browser-fixture-link';

const fixture = `
import React from 'react';
import { createRoot } from 'react-dom/client';
import { ProductReviewReadiness } from './components/seller/product-review-readiness';
import { PayoutRequestForm } from './components/seller/payout-request-form';
import { SellerActionOverview } from './components/seller/seller-action-overview';
import { SellerCaseResponseForm } from './components/seller/case-response-form';
import { WhoseTurn } from './components/ui/whose-turn';

const root = createRoot(document.getElementById('root'));
const view = location.pathname.slice(1);

if (view === 'turns') {
  root.render(<>
    <SellerActionOverview unavailable={false} first={{
      key: 'return:case-7', family: 'return', title: 'Reply to return', severity: 'overdue',
      dueAt: 1795219200000, href: '/seller/cases/returns/case-7', detail: 'Wool scarf', action: 'Open case',
    }} remaining={[{
      key: 'order:order-8', family: 'order', title: 'Prepare order TEST-0008', severity: 'normal',
      dueAt: null, href: '/seller/orders?order=order-8', detail: 'Tea tray', action: 'Open order',
    }]} waiting={[{
      key: 'payout:payout-7', family: 'payout', title: 'Payout request', severity: 'normal',
      dueAt: null, href: '/seller/finance', detail: 'Under review', action: 'Open payout',
    }]} />
    <WhoseTurn status="done" />
  </>);
} else if (view.startsWith('review-')) {
  const issue = view === 'review-incomplete'
    ? { field: 'coverImage', reason: 'Add a photo.', code: 'required' }
    : undefined;
  root.render(<ProductReviewReadiness checks={[{ label: 'At least one photo', issue }]}
    busy={false} onFocus={field => { document.body.dataset.focusedField = field; }}
    onReview={() => { throw new Error('Fixture must not send a product for review'); }} />);
} else if (view.startsWith('payout-')) {
  root.render(<PayoutRequestForm actorId="seller-user-7" sellerId="seller-7" availablePaisa={205000}
    readiness={{ ready: true, blocker: null, maskedBeneficiary: 'Example Bank ··1234' }}
    hasOpenRequest={view === 'payout-open'} />);
} else if (view === 'return-reply') {
  root.render(<SellerCaseResponseForm kind="return" id="case-7" disabled={false} />);
}
`;

void test('seller workspaces show current action and form readiness in isolated browser fixtures', async (t) => {
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'seller-redesign-fixture.tsx', loader: 'tsx', contents: fixture },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'seller-redesign-fixture',
      setup(bundler) {
        stubFixtureLink(bundler);
        bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'seller-fixture' }));
        bundler.onLoad({ filter: /^navigation$/, namespace: 'seller-fixture' }, () => ({
          contents: 'export function useRouter() { return { refresh() {} }; }',
        }));
      },
    }],
  });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH });
  t.after(() => browser.close());
  const origin = 'https://seller-redesign.test';

  async function mount(view: string, run: (page: Page) => Promise<void>) {
    const page = await browser.newPage();
    const unexpectedRequests: string[] = [];
    const errors: string[] = [];
    page.setDefaultTimeout(4000);
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', async route => {
      const request = route.request();
      const url = new URL(request.url());
      if (request.method() === 'GET' && url.origin === origin) {
        if (url.pathname === '/' + view) return route.fulfill({
          contentType: 'text/html',
          body: '<!doctype html><meta charset="utf-8"><title>Seller fixture</title><main id="root"></main>',
        });
        const formId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
        if (url.pathname.startsWith('/api/forms/') && ['seller.payout-request', 'seller.case-return-response'].includes(formId)) {
          return route.fulfill({ json: { config: { formId, version: 1, publishedAt: 1, fields: [
            { id: 'extra_detail', key: 'extra_detail', label: 'Extra detail', type: 'short_text', required: false, order: 0, status: 'active' },
          ] } } });
        }
      }
      unexpectedRequests.push(`${request.method()} ${request.url()}`);
      await route.abort();
    });
    try {
      await page.goto(origin + '/' + view);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      await run(page);
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpectedRequests, []);
    } finally {
      await page.close();
    }
  }

  await t.test('whose-turn tags label overdue, seller-owned, waiting and completed work', async () => {
    await mount('turns', async page => {
      await page.getByRole('region', { name: 'Do this first' }).getByText('Late', { exact: true }).waitFor();
      await page.getByRole('region', { name: 'Do these next' }).getByText('Your turn', { exact: true }).waitFor();
      await page.getByRole('region', { name: 'Nothing to do' }).getByText('With Hastabazaar', { exact: true }).waitFor();
      await page.getByText('Done', { exact: true }).waitFor();
    });
  });

  await t.test('Send for review is disabled until the readiness checks are complete', async () => {
    await mount('review-incomplete', async page => {
      const send = page.getByRole('button', { name: 'Send for review' });
      await send.waitFor();
      assert.equal(await send.isDisabled(), true);
      await page.getByText('1 check left. Open a check to find the field.').waitFor();
      await page.getByRole('button', { name: /At least one photo/ }).click();
      assert.equal(await page.locator('body').getAttribute('data-focused-field'), 'coverImage');
    });
    await mount('review-complete', async page => {
      const send = page.getByRole('button', { name: 'Send for review' });
      await send.waitFor();
      assert.equal(await send.isEnabled(), true);
    });
  });

  await t.test('an open payout request blocks a new request even with a positive available balance', async () => {
    await mount('payout-open', async page => {
      const ask = page.getByRole('button', { name: /^Ask for / });
      await ask.waitFor();
      assert.equal(await ask.isDisabled(), true);
      await page.getByText('Your payout request is with Hastabazaar. You can ask again once it’s reviewed.').waitFor();
      assert.equal(await page.getByLabel('Note (optional)').count(), 0);
    });
    await mount('payout-ready', async page => {
      await page.getByLabel('Extra detail').waitFor();
      assert.equal(await page.getByRole('button', { name: /^Ask for / }).isEnabled(), true);
    });
  });

  await t.test('a return reply requires a recommendation and at least 20 trimmed characters', async () => {
    await mount('return-reply', async page => {
      await page.getByLabel('Extra detail').waitFor();
      const send = page.getByRole('button', { name: 'Send reply to Hastabazaar' });
      const reply = page.getByRole('textbox', { name: 'Explain what you know' });
      assert.equal(await send.isDisabled(), true);

      const atMinimum = 'Packed in a new box.';
      await reply.fill(atMinimum);
      await page.getByText('20 / 20 min', { exact: true }).waitFor();
      assert.equal(await send.isDisabled(), true);

      await page.getByRole('radio', { name: 'Disagree' }).check();
      await reply.fill('  ' + atMinimum.slice(0, -1) + '  ');
      await page.getByText('19 / 20 min', { exact: true }).waitFor();
      assert.equal(await send.isDisabled(), true);

      await reply.fill(atMinimum);
      await page.getByText('20 / 20 min', { exact: true }).waitFor();
      assert.equal(await send.isEnabled(), true);
    });
  });
});
