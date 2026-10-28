import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import { legalProcedureFixture } from './helpers/legal-procedure-fixture';
import { getLegalDraftWorkspace, saveLegalDraft, getLegalProcedureControl, changeLegalProcedureControl } from '../lib/legal-procedures/repository';

void test('mounted management uses completed wording, explicit approval, recoverable retries and staff activation', async () => {
  const f = await legalProcedureFixture();
  const { chromium } = createRequire(import.meta.url)('playwright');
  const initial = await getLegalDraftWorkspace(f.db), control = await getLegalProcedureControl(f.db, Date.now());
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react';import {createRoot} from 'react-dom/client';
    import {LegalProcedureWorkspace} from './components/admin/legal-procedure-workspace';
    createRoot(document.getElementById('root')).render(<LegalProcedureWorkspace initial={${JSON.stringify(initial)}} initialControl={${JSON.stringify(control)}}/>);
  ` }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-links', setup: stubFixtureLink }] });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const errors: string[] = [], posts: { path: string; body: Record<string, unknown> }[] = [];
  let lostApprovalResponse = true;
  let replaceAfterWithdrawal = true;
  page.on('pageerror', (error: Error) => errors.push(error.message));
  try {
    await page.route('**/*', async (route: { request(): { url(): string; method(): string; postDataJSON(): Record<string, unknown> }; fulfill(input: unknown): Promise<void> }) => {
      const request = route.request(), url = new URL(request.url());
      assert.equal(url.origin, 'https://policy.fixture');
      if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: bundle.outputFiles[0].text });
      if (url.pathname === '/api/admin/legal-procedures/control') {
        if (request.method() === 'POST') {
          const body = request.postDataJSON(); posts.push({ path: url.pathname, body });
          const event = await changeLegalProcedureControl(f.db, f.actor, body, Date.now());
          if (lostApprovalResponse) { lostApprovalResponse = false; return route.fulfill({ status: 503, json: { error: 'The approval response was lost. Retry the same action.' } }); }
          if (body.operation === 'withdraw' && replaceAfterWithdrawal) {
            replaceAfterWithdrawal = false;
            const source = (await getLegalDraftWorkspace(f.db)).current;
            const document = await saveLegalDraft(f.db, f.actor, { expectedRevision: source.revision, expectedSha256: source.sha256,
              sections: source.sections, reason: 'A different tab prepared a replacement procedure.', requestId: crypto.randomUUID() }, Date.now());
            let state = await getLegalProcedureControl(f.db, Date.now());
            const input = { operation: 'approve', expectedSequence: state.sequence, expectedSha256: state.sha256,
              revision: document.revision, documentSha256: document.sha256, approvalSequence: null, effectiveFrom: null,
              confirmed: true, reason: 'Another tab approved the replacement version.', requestId: crypto.randomUUID() };
            const approved = await changeLegalProcedureControl(f.db, f.actor, input, Date.now());
            state = await getLegalProcedureControl(f.db, Date.now());
            await changeLegalProcedureControl(f.db, f.actor, { ...input, operation: 'activate', expectedSequence: state.sequence,
              expectedSha256: state.sha256, approvalSequence: approved.sequence, requestId: crypto.randomUUID() }, Date.now());
            return route.fulfill({ status: 503, json: { error: 'The withdrawal response was lost. Retry the same action.' } });
          }
          return route.fulfill({ json: { event, control: await getLegalProcedureControl(f.db, Date.now()) } });
        }
        return route.fulfill({ json: await getLegalProcedureControl(f.db, Date.now()) });
      }
      if (url.pathname === '/api/admin/legal-procedures') {
        const body = request.postDataJSON(); posts.push({ path: url.pathname, body });
        return route.fulfill({ json: { saved: await saveLegalDraft(f.db, f.actor, body, Date.now()) } });
      }
      assert.equal(url.pathname, '/admin/legal-policies');
      return route.fulfill({ contentType: 'text/html', body: '<style>*{box-sizing:border-box}body{margin:8px}button,input,textarea{max-width:100%}p,pre,code{overflow-wrap:anywhere;white-space:pre-wrap}</style><div id="root"></div><script src="/fixture.js"></script>' });
    });
    await page.goto('https://policy.fixture/admin/legal-policies');
    await page.getByRole('button', { name: 'Use completed procedure', exact: true }).waitFor({ timeout: 5000 });
    const approve = page.getByRole('button', { name: 'Approve saved version', exact: true });
    assert.equal(await approve.isDisabled(), true);
    await page.getByRole('button', { name: 'Use completed procedure', exact: true }).click();
    assert.equal(posts.length, 0, 'Loading complete wording must not save or adopt anything.');
    assert.match(await page.getByLabel('Responsibilities and contacts', { exact: true }).inputValue(), /Super Admin is accountable/);
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /Version saved/ }).waitFor();
    const reason = page.getByLabel('Reason for approval or activation', { exact: true });
    const confirm = page.getByRole('checkbox', { name: /I reviewed this saved version/ });
    await reason.fill('Reviewed the completed operating procedure.'); await confirm.check();
    await page.getByRole('button', { name: 'Edit version', exact: true }).click();
    const body = page.getByLabel('Company and operational readiness', { exact: true });
    await body.fill((await body.inputValue()) + '\nA second reviewed working version.');
    await page.getByLabel('Reason for this version', { exact: true }).fill('Save a second version after checking the first.');
    await page.getByRole('button', { name: 'Save version', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /Version saved\. Revision 2/ }).waitFor();
    assert.equal(await confirm.isChecked(), false, 'A checked review of version A cannot approve version B.');
    assert.equal(await approve.isDisabled(), true);
    await confirm.check();
    await approve.click();
    await page.getByRole('alert').filter({ hasText: /response was lost/ }).waitFor();
    assert.equal(await confirm.isChecked(), true);
    await approve.click();
    await page.getByRole('status').filter({ hasText: /Approval recorded/ }).waitFor();
    assert.equal(posts[2].body.requestId, posts[3].body.requestId);
    assert.equal((await getLegalProcedureControl(f.db, Date.now())).sequence, 1);
    assert.equal((await getLegalProcedureControl(f.db, Date.now())).active, null);
    await reason.fill('Activate this procedure for authorized staff.'); await confirm.check();
    await page.getByRole('button', { name: 'Activate approved version', exact: true }).click();
    await page.getByRole('status').filter({ hasText: /Activation recorded/ }).waitFor();
    assert.equal((await getLegalProcedureControl(f.db, Date.now())).active?.document.revision, 2);
    assert.equal(await page.getByRole('link', { name: 'Open active staff procedure', exact: true }).getAttribute('href'), '/admin/legal-policies/active');
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    }
    await reason.fill('Withdraw the original active procedure.'); await confirm.check();
    const withdraw = page.getByRole('button', { name: 'Withdraw active and scheduled versions', exact: true });
    await withdraw.click();
    await page.getByRole('alert').filter({ hasText: /withdrawal response was lost/ }).waitFor();
    await withdraw.click();
    const withdrawalNotice = page.getByRole('status').filter({ hasText: /Withdrawal recorded/ });
    await withdrawalNotice.waitFor();
    assert.match(await withdrawalNotice.innerText(), /Current staff version: 3/);
    assert.doesNotMatch(await withdrawalNotice.innerText(), /versions have stopped/);
    await reason.fill('Review withdrawal of the currently active version.'); await confirm.check();
    const state = await getLegalProcedureControl(f.db, Date.now());
    await changeLegalProcedureControl(f.db, f.actor, { operation: 'withdraw', expectedSequence: state.sequence,
      expectedSha256: state.sha256, revision: state.active!.document.revision, documentSha256: state.active!.document.sha256,
      approvalSequence: null, effectiveFrom: null, confirmed: true, reason: 'Another tab withdrew the active procedure.', requestId: crypto.randomUUID() }, Date.now());
    await page.getByRole('button', { name: 'Refresh approval state', exact: true }).click();
    await page.getByText('No active procedure', { exact: true }).waitFor();
    assert.equal(await confirm.isChecked(), false, 'A refreshed approval or activation context requires a fresh confirmation.');
    assert.equal(await page.getByRole('status').filter({ hasText: /Current staff version: 3/ }).count(), 0, 'Refreshing state must remove an obsolete success-status message.');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); f.dispose(); }
});
