import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { ConfiguredField, FormDefinition, PublishedFormConfig } from '../lib/forms/types';
import type { CatalogVersion } from '../components/admin/form-catalog-editor';
import { adminNavigation } from '../lib/admin/navigation';

void test('Form catalog appears in Controls for Super Admin alone', () => {
  const superLink = adminNavigation('super_admin').find((item) => item.href === '/admin/forms');
  assert.ok(superLink);
  assert.equal(superLink.group, 'Controls');
  assert.equal(superLink.label, 'Form catalog');
  assert.equal(adminNavigation('admin').some((item) => item.href === '/admin/forms'), false);
  assert.equal(adminNavigation('admin', ['business_settings.manage']).some((item) => item.href === '/admin/forms'), false);
});

const definition: FormDefinition = {
  id: 'account.profile', audience: 'customer', mode: 'collection', route: '/api/account/profile', adapterId: 'profile',
  baseFields: [{ key: 'name', type: 'short_text', label: 'Name', capability: 'protected', required: true, status: 'active', explanation: 'Identity name is required by the profile adapter.' }],
  capabilities: { explanation: 'Profile answers attach to the customer record.', customFieldTypes: ['short_text', 'single_choice', 'number'], answerBehavior: 'record' },
};
const config: PublishedFormConfig = { formId: 'account.profile', version: 1, publishedAt: 1, fields: [
  { id: 'delivery_note', key: 'delivery_note', type: 'short_text', label: 'Delivery note', required: false, order: 0, status: 'active' },
] };

async function mountConcurrencyEditor(versions: readonly CatalogVersion[]) {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright lives in the bundled external runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'catalog-concurrency-fixture.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { FormCatalogEditor } from './components/admin/form-catalog-editor';
    createRoot(document.getElementById('root')!).render(<FormCatalogEditor form={${JSON.stringify(definition)}} versions={${JSON.stringify(versions)}} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  await page.route('https://form.test/', (route: { fulfill: (response: unknown) => Promise<void> }) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>' }));
  await page.goto('https://form.test/');
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  return { browser, page };
}

void test('publish conflict retains preview A until explicit reload adopts and publishes server draft B', async () => {
  const draftA: CatalogVersion = { id: 'draft-2', version: 2, revision: 1, status: 'draft', reason: 'Local draft A', updatedAt: 2, publishedAt: null,
    config: { formId: definition.id, fields: [{ ...config.fields[0], label: 'Local draft A' }] } };
  const draftB: CatalogVersion = { ...draftA, revision: 2, reason: 'Other admin draft B', config: { ...draftA.config, fields: [{ ...config.fields[0], label: 'Server draft B' }] } };
  const publishedB: CatalogVersion = { ...draftB, status: 'published', revision: 3, publishedAt: 3 };
  const { browser, page } = await mountConcurrencyEditor([draftA]);
  const publishBodies: { expectedDraftRevision: number; draftId: string }[] = [];
  let historyReads = 0;
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    await page.route('https://form.test/api/**', async (route: any) => {
      if (route.request().method() === 'GET') {
        historyReads++;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ versions: [publishBodies.length > 1 ? publishedB : draftB] }) });
      }
      publishBodies.push(route.request().postDataJSON());
      return route.fulfill(publishBodies.length === 1 ? { status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Another admin revised this draft.' }) } :
        { status: 200, contentType: 'application/json', body: JSON.stringify({ published: publishedB }) });
    });
    assert.match(await page.locator('[data-preview-mode="phone"]').textContent(), /Local draft A/);
    await page.getByLabel('Reason for change').fill('Publish reviewed draft');
    await page.getByRole('button', { name: 'Publish draft' }).click();
    await page.getByRole('button', { name: 'Confirm publish' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('alertdialog').getByText('Another admin revised this draft.').waitFor();
    assert.equal(await page.locator('#delivery_note-label').inputValue(), 'Local draft A');
    assert.match(await page.locator('[data-preview-mode="phone"]').textContent(), /Local draft A/);
    assert.equal(historyReads, 0, 'a conflict cannot silently replace the reviewed draft');
    assert.equal(await page.getByRole('button', { name: 'Confirm publish' }).isDisabled(), true, 'conflicted confirmation cannot publish again before reload');
    await page.getByRole('button', { name: 'Cancel', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Reload latest version' }).click();
    await page.getByText('Version 2 · revision 2').waitFor();
    assert.equal(await page.locator('#delivery_note-label').inputValue(), 'Server draft B');
    assert.match(await page.locator('[data-preview-mode="phone"]').textContent(), /Server draft B/);
    assert.doesNotMatch(await page.locator('[data-preview-mode="phone"]').textContent(), /Local draft A/);
    assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), false, 'displayed fields and saved baseline now match the server draft');
    await page.getByRole('button', { name: 'Publish draft' }).click();
    await page.getByRole('button', { name: 'Confirm publish' }).focus();
    await page.keyboard.press('Enter');
    await page.getByText('Form published.').waitFor();
    assert.deepEqual(publishBodies.map(({ draftId, expectedDraftRevision }) => [draftId, expectedDraftRevision]), [['draft-2', 1], ['draft-2', 2]]);
  } finally { await page.close(); await browser.close(); }
});

void test('history request generations preserve newer mutation state and warnings when GETs finish out of order', async (t) => {
  for (const action of ['draft', 'publish', 'restore'] as const) await t.test(action, async () => {
    const published: CatalogVersion = { id: 'published-1', version: 1, revision: 1, status: 'published', reason: 'Initial', updatedAt: 1, publishedAt: 1, config: { formId: definition.id, fields: config.fields } };
    const draft: CatalogVersion = { ...published, id: 'draft-2', version: 2, status: 'draft', publishedAt: null };
    const { browser, page } = await mountConcurrencyEditor([draft, published]);
    let versions = [draft, published];
    // oxlint-disable-next-line typescript/no-explicit-any -- Deferred routes represent real HTTP response boundaries.
    let receiveHistory: ((route: any) => void) | undefined;
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    const nextHistory = () => new Promise<any>((resolve) => { receiveHistory = resolve; });
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    async function finishHistory(route: any, responseVersions: CatalogVersion[] | null) {
      await route.fulfill(responseVersions ? { status: 200, contentType: 'application/json', body: JSON.stringify({ versions: responseVersions }) } :
        { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'History unavailable.' }) });
      await (await route.request().response()).finished();
      await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    }
    try {
      // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
      await page.route('https://form.test/api/**', async (route: any) => {
        if (route.request().method() === 'GET') { receiveHistory?.(route); receiveHistory = undefined; return; }
        const body = route.request().postDataJSON();
        const mutation = route.request().url().split('/').at(-1);
        const result: CatalogVersion = mutation === 'draft' ? { ...draft, revision: versions[0].revision + 1, config: body.config } :
          mutation === 'publish' ? { ...versions[0], status: 'published', revision: versions[0].revision + 1, publishedAt: 3 } :
            { ...published, id: 'restored-3', version: 3, reason: body.reason, updatedAt: 3, publishedAt: 3 };
        versions = [result, ...versions.filter((entry) => entry.id !== result.id)];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mutation === 'draft' ? { draft: result } : { published: result }) });
      });
      await page.getByLabel('Reason for change').fill('Seed refresh warning');
      const seedHistory = nextHistory();
      await page.getByRole('button', { name: 'Save draft' }).click();
      await finishHistory(await seedHistory, null);
      await page.getByRole('button', { name: 'Retry history refresh' }).waitFor();
      const staleVersions = structuredClone(versions);
      const oldSuccessPending = nextHistory();
      await page.getByRole('button', { name: 'Retry history refresh' }).click();
      const oldSuccess = await oldSuccessPending;
      const oldFailurePending = nextHistory();
      await page.getByRole('button', { name: 'Retry history refresh' }).click();
      const oldFailure = await oldFailurePending;
      const oldWarningClearPending = nextHistory();
      await page.getByRole('button', { name: 'Retry history refresh' }).click();
      const oldWarningClear = await oldWarningClearPending;

      await page.getByLabel('Reason for change').fill(`Newest ${action}`);
      const mutationHistory = nextHistory();
      if (action === 'draft') {
        await page.locator('#delivery_note-label').fill('Newest saved label');
        await page.getByRole('button', { name: 'Save draft' }).click();
      } else {
        await page.getByRole('button', { name: action === 'publish' ? 'Publish draft' : 'Restore', exact: true }).click();
        await page.getByRole('button', { name: action === 'publish' ? 'Confirm publish' : 'Confirm restore' }).focus();
        await page.keyboard.press('Enter');
      }
      const latestHistory = await mutationHistory;
      const latestVersion = action === 'restore' ? 'Version 3 · revision 1' : 'Version 2 · revision 3';
      await page.getByText(latestVersion).waitFor();
      const success = action === 'draft' ? 'Draft saved.' : action === 'publish' ? 'Form published.' : 'Historical version restored as a new publication.';
      await page.getByText(success, { exact: true }).waitFor();
      await finishHistory(oldSuccess, staleVersions);
      assert.equal(await page.getByText(latestVersion).count(), 1, 'mutation response wins even while its follow-up GET is pending');
      assert.equal(await page.getByText(success, { exact: true }).count(), 1);
      assert.equal(await page.locator('#delivery_note-label').inputValue(), action === 'draft' ? 'Newest saved label' : 'Delivery note');
      assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), action !== 'draft', 'old GET cannot resurrect a published or stale draft');

      await finishHistory(latestHistory, null);
      const warning = `The ${action === 'draft' ? 'draft was saved' : action === 'publish' ? 'form was published' : 'form was restored'}, but version history could not refresh.`;
      await page.getByText(warning, { exact: true }).waitFor();
      await finishHistory(oldWarningClear, staleVersions);
      assert.equal(await page.getByText(warning, { exact: true }).count(), 1, 'older successful retry cannot clear the newer mutation warning');
      await finishHistory(oldFailure, null);
      assert.equal(await page.getByText(warning, { exact: true }).count(), 1, 'older failed retry cannot replace the newer mutation warning');

      const earlierRetryPending = nextHistory();
      await page.getByRole('button', { name: 'Retry history refresh' }).click();
      const earlierRetry = await earlierRetryPending;
      const newerRetryPending = nextHistory();
      await page.getByRole('button', { name: 'Retry history refresh' }).click();
      await finishHistory(await newerRetryPending, versions);
      assert.equal(await page.getByRole('button', { name: 'Retry history refresh' }).count(), 0);
      await finishHistory(earlierRetry, staleVersions);
      assert.equal(await page.getByText(latestVersion).count(), 1, 'newer GET wins over older GET');
      assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), action !== 'draft');
      assert.equal(await page.getByRole('button', { name: 'Retry history refresh' }).count(), 0, 'older response cannot change the newer warning state');
    } finally { await page.close(); await browser.close(); }
  });
});

void test('protected field controls explain their lock and preview uses the shared renderer with base keys', async () => {
  const { FormCatalogEditor } = await import('../components/admin/form-catalog-editor');
  const { FormCatalogPreview } = await import('../components/admin/form-catalog-preview');
  const html = renderToStaticMarkup(createElement(FormCatalogEditor, { form: definition, versions: [] }));
  assert.match(html, /Identity name is required by the profile adapter/);
  assert.match(html, /Required for Name[^<]*<\/button>|aria-label="Required for Name"[^>]*disabled/);
  const preview = renderToStaticMarkup(createElement(FormCatalogPreview, { form: definition, config, mode: 'phone' }));
  assert.match(preview, /name="custom\.delivery_note"/);
  assert.doesNotMatch(preview, /name="custom\.name"/);
  assert.match(preview, /data-preview-mode="phone"/);
});

void test('both admin pages deny ordinary Admin before reading catalog data', async () => {
  const require = createRequire(import.meta.url);
  for (const entry of ['app/admin/forms/page.tsx', 'app/admin/forms/[formId]/page.tsx']) {
    let reads = 0;
    const output = await build({ entryPoints: [entry], absWorkingDir: process.cwd(), bundle: true, write: false,
      platform: 'node', format: 'cjs', packages: 'external', plugins: [{ name: 'page-boundary', setup(plugin) {
        plugin.onResolve({ filter: /^(cloudflare:workers|next\/navigation|next\/link|@\/lib\/auth\/staff|@\/lib\/db\/d1)$/ }, (args) => ({ path: args.path, namespace: 'page-stub' }));
        plugin.onLoad({ filter: /.*/, namespace: 'page-stub' }, (args) => ({ contents:
          args.path === 'cloudflare:workers' ? 'export const env = {};' :
          args.path === 'next/navigation' ? 'export function redirect(){throw new Error("ACCESS_DENIED")}; export function notFound(){throw new Error("NOT_FOUND")}' :
          args.path === 'next/link' ? 'export default function Link(){return null}' :
          args.path === '@/lib/auth/staff' ? 'export async function requireStaffPage(){return {role:globalThis.catalogPageRole,id:"staff"}}' :
          'export function requireDatabase(){globalThis.catalogPageRead();return globalThis.catalogPageDb}', loader: 'js' }));
      } }] });
    const pageModule = { exports: {} as { default: (props?: unknown) => Promise<unknown> } };
    const context = { require, module: pageModule, exports: pageModule.exports, catalogPageRole: 'admin', catalogPageRead: () => { reads++; }, catalogPageDb: { prepare() { return { bind() { return this; }, async all() { return { results: [] }; } }; } } };
    runInNewContext(output.outputFiles[0].text, context);
    await assert.rejects(pageModule.exports.default({ params: Promise.resolve({ formId: 'account.profile' }) }), /ACCESS_DENIED/);
    assert.equal(reads, 0, entry);
    context.catalogPageRole = 'super_admin';
    const html = renderToStaticMarkup(await pageModule.exports.default({ params: Promise.resolve({ formId: 'account.profile' }) }) as React.ReactElement);
    assert.match(html, entry.includes('[formId]') ? /Form capability/ : /Form catalog/);
    if (entry.includes('[formId]')) {
      assert.match(html, /Super Admin · Form editor/);
      assert.match(html, /customer · collection · \/api\/account\/profile/);
      assert.doesNotMatch(html, /Â/);
    }
    assert.equal(reads, 1, entry);
  }
});

void test('editor keeps edits on 409, reloads history, and confirms publish and restore', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright lives in the bundled external runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'catalog-editor-fixture.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { FormCatalogEditor } from './components/admin/form-catalog-editor';
    const form = ${JSON.stringify(definition)};
    createRoot(document.getElementById('root')!).render(<FormCatalogEditor form={form} versions={[]} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  // oxlint-disable-next-line typescript/no-explicit-any -- Captured request bodies vary by action.
  const operations: { action: string; body: any }[] = [];
  // oxlint-disable-next-line typescript/no-explicit-any -- The route fixture serializes API version records.
  let versions: any[] = [];
  let rejectDraft = true;
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    await page.route('https://form.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><p id="fixture-heading">Super Admin · Form editor</p><p id="fixture-metadata">customer · collection · /api/account/profile</p><div id="root"></div></body></html>' });
      if (url.pathname === '/api/admin/forms/account.profile' && route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ form: definition, versions }) });
      const action = url.pathname.split('/').at(-1)!;
      const body = route.request().postDataJSON();
      operations.push({ action, body });
      if (action === 'draft' && rejectDraft) { rejectDraft = false; return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'Form configuration changed.' }) }); }
      if (action === 'draft') {
        const nextVersion = Math.max(0, ...versions.map((item) => item.version)) + 1;
        const draft = { id: `draft-${nextVersion}`, version: nextVersion, revision: 1, status: 'draft', reason: body.reason, updatedAt: nextVersion, publishedAt: null, config: body.config };
        versions = [draft, ...versions];
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ draft }) });
      }
      if (action === 'publish') {
        const published = { ...versions.find((item) => item.id === body.draftId), status: 'published', publishedAt: 2, updatedAt: 2 };
        versions = [published, ...versions.filter((item) => item.id !== body.draftId)];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ published }) });
      }
      const source = versions.find((item) => item.status === 'published' && item.version === body.sourceVersion);
      const published = { ...source, id: 'published-restore', version: Math.max(...versions.map((item) => item.version)) + 1, reason: body.reason, updatedAt: 3, publishedAt: 3 };
      versions = [published, ...versions];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ published }) });
    });
    await page.goto('https://form.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    assert.equal(await page.locator('#fixture-heading').textContent(), 'Super Admin · Form editor');
    assert.equal(await page.locator('#fixture-metadata').textContent(), 'customer · collection · /api/account/profile');
    assert.doesNotMatch(await page.locator('body').textContent(), /Â/);
    await page.getByRole('button', { name: 'Save draft' }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'catalog-reason');
    assert.match(await page.getByRole('alert').last().textContent(), /Enter a reason/);
    await page.getByLabel('New field key').fill('Bad Key');
    await page.getByLabel('Label', { exact: true }).last().fill('Bad field');
    await page.getByRole('button', { name: 'Add field' }).click();
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'new-field-key');
    await page.getByLabel('New field key').fill('delivery_note');
    await page.getByLabel('Label', { exact: true }).last().fill('Drop-off note');
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.getByLabel('New field key').fill('gift_color');
    await page.getByLabel('Label', { exact: true }).last().fill('Gift colour');
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.getByRole('button', { name: 'Move Gift colour up' }).click();
    assert.deepEqual(await page.locator('[data-editor-field]').evaluateAll((nodes: Element[]) => nodes.map((node) => node.getAttribute('data-editor-field'))), ['gift_color', 'delivery_note']);
    await page.getByRole('button', { name: 'Required for Gift colour' }).click();
    await page.getByRole('button', { name: 'Required for Gift colour' }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 1, 'making a required field optional needs confirmation');
    assert.equal(await page.locator('[aria-label="Required for Gift colour"]').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Required for Gift colour' }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Required for Gift colour' }).click();
    await page.getByRole('button', { name: 'Confirm optional' }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.getByRole('button', { name: 'Required for Gift colour' }).getAttribute('aria-pressed'), 'false');
    await page.getByRole('button', { name: 'Required for Gift colour' }).click();
    await page.locator('[data-editor-field="gift_color"]').getByRole('button', { name: 'Archive' }).click();
    assert.equal(await page.getByRole('alertdialog').count(), 1, 'archiving a required field needs confirmation');
    assert.match(await page.locator('[data-editor-field="gift_color"]').textContent(), /active/);
    await page.getByRole('button', { name: 'Cancel' }).focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('[data-editor-field="gift_color"]').textContent(), /active/);
    await page.locator('[data-editor-field="gift_color"]').getByRole('button', { name: 'Archive' }).click();
    await page.getByRole('button', { name: 'Confirm archive' }).focus();
    await page.keyboard.press('Enter');
    assert.match(await page.locator('[data-editor-field="gift_color"]').textContent(), /archived/);
    await page.locator('[data-editor-field="gift_color"]').getByRole('button', { name: 'Reactivate' }).click();
    await page.getByLabel('New field key').fill('gift_wrap');
    await page.getByLabel('Label', { exact: true }).last().fill('Gift wrap');
    await page.getByLabel('Type').selectOption('single_choice');
    await page.getByRole('button', { name: 'Add field' }).click();
    const choices = page.locator('#gift_wrap-choices');
    await choices.focus();
    await page.keyboard.press('ControlOrMeta+End');
    await page.keyboard.press('Enter');
    assert.equal((await choices.inputValue()).endsWith('\n'), true, 'Enter leaves a new editable choice line');
    await choices.pressSequentially('third | Third option');
    assert.match(await choices.inputValue(), /second \| Second option\nthird \| Third option$/);
    await page.getByLabel('New field key').fill('quantity_hint');
    await page.getByLabel('Label', { exact: true }).last().fill('Quantity hint');
    await page.getByLabel('Type').selectOption('number');
    await page.getByRole('button', { name: 'Add field' }).click();
    await page.locator('#quantity_hint-min').fill('0');
    await page.locator('#quantity_hint-max').fill('5');
    await page.locator('#quantity_hint-min').fill('');
    assert.equal(await page.locator('#quantity_hint-min').inputValue(), '', 'empty bound remains undefined instead of zero');
    await page.locator('#quantity_hint-min').fill('0');
    await page.getByRole('checkbox', { name: 'Whole numbers only' }).focus();
    await page.keyboard.press('Space');
    await page.getByRole('tab', { name: 'Desktop' }).click();
    assert.equal(await page.locator('[data-preview-mode="desktop"] input[name="custom.gift_color"]').count(), 1);
    await page.getByRole('tab', { name: 'Phone' }).click();
    const numberPreview = page.locator('[data-preview-mode="phone"] input[name="custom.quantity_hint"]');
    assert.equal(await numberPreview.getAttribute('min'), '0');
    assert.equal(await numberPreview.getAttribute('max'), '5');
    assert.equal(await numberPreview.getAttribute('step'), '1');
    await page.getByRole('checkbox', { name: 'Whole numbers only' }).focus();
    await page.keyboard.press('Space');
    assert.equal(await numberPreview.getAttribute('step'), 'any');
    await numberPreview.fill('1.5');
    assert.equal(await numberPreview.evaluate((input: HTMLInputElement) => input.checkValidity()), true);
    await page.getByRole('checkbox', { name: 'Whole numbers only' }).focus();
    await page.keyboard.press('Space');
    await page.getByLabel('Reason for change').fill('Improve recipient context');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('button', { name: 'Reload latest version' }).click();
    assert.equal(await page.locator('[data-editor-field="gift_color"]').count(), 1);
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('status').getByText('Draft saved.').waitFor();
    await page.getByLabel('Reason for change').fill('Publish recipient context');
    await page.getByRole('button', { name: 'Publish draft' }).click();
    assert.equal(await page.getByText('Publish this form draft?').count(), 1, await page.locator('body').innerText());
    await page.getByRole('button', { name: 'Confirm publish' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('status').getByText('Form published.').waitFor();
    await page.locator('#gift_color-label').fill('Temporary gift colour');
    await page.getByLabel('Reason for change').fill('Save a newer draft');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('status').getByText('Draft saved.').waitFor();
    await page.getByLabel('Reason for change').fill('Restore prior layout');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm restore' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('status').getByText('Historical version restored as a new publication.').waitFor();
    assert.equal(await page.locator('#gift_color-label').inputValue(), 'Gift colour');
    assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), true);
    assert.match(await page.getByText('Version 2 · revision 1').textContent(), /stale draft/);
    assert.match(await page.locator('[data-preview-mode="phone"]').textContent(), /Gift colour/);
    await page.locator('#gift_color-label').fill('After restore colour');
    await page.getByLabel('Reason for change').fill('New edit after restore');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByRole('status').getByText('Draft saved.').waitFor();
    assert.deepEqual(operations.map((item) => item.action), ['draft', 'draft', 'publish', 'draft', 'restore', 'draft']);
    assert.equal(operations[1].body.config.fields[0].key, 'gift_color');
    assert.equal(operations[1].body.config.fields[0].required, true);
    assert.deepEqual(operations[1].body.config.fields.find((field: { key: string }) => field.key === 'gift_wrap').choices[2], { value: 'third', label: 'Third option' });
    const numberField = operations[1].body.config.fields.find((field: { key: string }) => field.key === 'quantity_hint');
    assert.equal(numberField.min, 0);
    assert.equal(numberField.max, 5);
    assert.equal(numberField.integerOnly, true);
    assert.equal(operations[2].body.reason, 'Publish recipient context');
    assert.equal(operations[4].body.sourceVersion, 1);
    assert.equal(operations[5].body.expectedPublishedVersion, 3);
    assert.equal(operations[5].body.draftId, undefined);
    assert.equal(versions[0].version, 4);
  } finally { await page.close(); await browser.close(); }
});

void test('restore commits before history refresh and keeps POST errors inside its dialog', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright lives in the bundled external runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const restoredFields = [{ id: 'gift_color', key: 'gift_color', type: 'short_text', label: 'Original colour', required: false, order: 0, status: 'active' }];
  const draftFields = [{ ...restoredFields[0], label: 'Unsaved newer colour' }];
  const published = { id: 'published-1', version: 1, revision: 1, status: 'published', reason: 'Initial', updatedAt: 1, publishedAt: 1, config: { formId: definition.id, fields: restoredFields } };
  const draft = { id: 'draft-2', version: 2, revision: 1, status: 'draft', reason: 'Newer draft', updatedAt: 2, publishedAt: null, config: { formId: definition.id, fields: draftFields } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'catalog-restore-fixture.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { FormCatalogEditor } from './components/admin/form-catalog-editor';
    createRoot(document.getElementById('root')!).render(<FormCatalogEditor form={${JSON.stringify(definition)}} versions={${JSON.stringify([draft, published])}} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  let versions = [draft, published];
  let restoreRequests = 0;
  let successfulRestores = 0;
  let historyRequests = 0;
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    await page.route('https://form.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><html><head><meta charset="utf-8"></head><body><div id="root"></div></body></html>' });
      if (route.request().method() === 'GET') {
        historyRequests++;
        return route.fulfill(historyRequests === 1 ? { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'History service unavailable.' }) } :
          { status: 200, contentType: 'application/json', body: JSON.stringify({ form: definition, versions }) });
      }
      restoreRequests++;
      if (restoreRequests === 1) return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Restore unavailable.' }) });
      successfulRestores++;
      const restored = { ...published, id: 'published-3', version: 3, revision: 1, reason: 'Restore baseline', updatedAt: 3, publishedAt: 3 };
      versions = [restored, ...versions];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ published: restored }) });
    });
    await page.goto('https://form.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByLabel('Reason for change').fill('Restore baseline');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm restore' }).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.body.textContent?.includes('Restore unavailable.'));
    assert.equal(await page.getByRole('alertdialog').getByRole('alert').count(), 1, 'POST failure is announced inside the focus trap');
    assert.equal(await page.evaluate(() => document.activeElement?.closest('[role="alertdialog"]') !== null), true);
    assert.equal(await page.locator('#gift_color-label').inputValue(), 'Unsaved newer colour');
    await page.getByRole('button', { name: 'Confirm restore' }).focus();
    await page.keyboard.press('Enter');
    await page.getByText('Historical version restored as a new publication.').waitFor();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.locator('#gift_color-label').inputValue(), 'Original colour');
    assert.equal(await page.getByLabel('Reason for change').inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Confirm restore' }).count(), 0);
    assert.equal(successfulRestores, 1);
    assert.equal(restoreRequests, 2, 'failed POST plus one successful POST; refresh never re-posts');
    assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), true);
    assert.match(await page.getByRole('alert').last().textContent(), /history.*refresh|refresh.*history/i);
    await page.getByRole('button', { name: 'Retry history refresh' }).click();
    await page.getByText('Latest version loaded.').waitFor();
    assert.equal(restoreRequests, 2);
    assert.equal(historyRequests, 2);
    assert.equal(await page.locator('#gift_color-label').inputValue(), 'Original colour');
  } finally { await page.close(); await browser.close(); }
});

void test('custom reorder crosses a built-in override without losing it from the saved order', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright lives in the bundled external runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const form: FormDefinition = { ...definition, baseFields: [...definition.baseFields,
    { key: 'display_name', type: 'short_text', label: 'Display name', capability: 'display_editable', required: false, status: 'active', explanation: 'Display-only override.' }] };
  const fields = [
    { id: 'a', key: 'a', type: 'short_text', label: 'Custom A', required: false, order: 0, status: 'active' },
    { id: 'display_name', key: 'display_name', type: 'short_text', label: 'Display name', required: false, order: 1, status: 'active' },
    { id: 'b', key: 'b', type: 'short_text', label: 'Custom B', required: false, order: 2, status: 'active' },
  ];
  const draft = { id: 'draft-1', version: 1, revision: 1, status: 'draft', reason: 'Initial', updatedAt: 1, publishedAt: null, config: { formId: form.id, fields } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'catalog-reorder-fixture.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { FormCatalogEditor } from './components/admin/form-catalog-editor';
    createRoot(document.getElementById('root')!).render(<FormCatalogEditor form={${JSON.stringify(form)}} versions={${JSON.stringify([draft])}} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  // oxlint-disable-next-line typescript/no-explicit-any -- Test captures serialized API payload.
  let saved: any = null;
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    await page.route('https://form.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (route.request().method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ form, versions: [draft] }) });
      saved = route.request().postDataJSON();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ draft: { ...draft, revision: 2, config: saved.config } }) });
    });
    await page.goto('https://form.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByRole('button', { name: 'Move Custom A down' }).click();
    assert.deepEqual(await page.locator('[data-editor-field]').evaluateAll((nodes: Element[]) => nodes.map((node) => node.getAttribute('data-editor-field'))), ['b', 'a']);
    await page.getByLabel('Reason for change').fill('Reorder custom questions');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.getByText('Draft saved.').waitFor();
    assert.deepEqual(saved.config.fields.map((item: { key: string; order: number }) => [item.key, item.order]), [['b', 0], ['display_name', 1], ['a', 2]]);
  } finally { await page.close(); await browser.close(); }
});

void test('ambiguous save retries one request while busy edits lock and successful draft/publish survive history failure', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  // oxlint-disable-next-line typescript/no-explicit-any -- Playwright lives in the bundled external runtime.
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<any> } };
  const initialFields: ConfiguredField[] = [{ id: 'gift_color', key: 'gift_color', type: 'short_text', label: 'Gift colour', required: false, order: 0, status: 'active' }];
  const published: CatalogVersion = { id: 'published-1', version: 1, revision: 1, status: 'published', reason: 'Initial', updatedAt: 1, publishedAt: 1, config: { formId: definition.id, fields: initialFields } };
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'catalog-mutation-fixture.tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { FormCatalogEditor } from './components/admin/form-catalog-editor';
    createRoot(document.getElementById('root')!).render(<FormCatalogEditor form={${JSON.stringify(definition)}} versions={${JSON.stringify([published])}} />);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  // oxlint-disable-next-line typescript/no-explicit-any -- Test captures serialized API payloads.
  const draftBodies: any[] = [];
  let versions: CatalogVersion[] = [published];
  let historyRequests = 0;
  let publishRequests = 0;
  let writes = 0;
  let releaseSave: () => void = () => {};
  const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
  let releaseDraftHistory: () => void = () => {};
  const draftHistoryGate = new Promise<void>((resolve) => { releaseDraftHistory = resolve; });
  let releasePublishHistory: () => void = () => {};
  const publishHistoryGate = new Promise<void>((resolve) => { releasePublishHistory = resolve; });
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Playwright route type is external to this package.
    await page.route('https://form.test/**', async (route: any) => {
      const url = new URL(route.request().url());
      if (url.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (route.request().method() === 'GET') {
        historyRequests++;
        if (historyRequests === 1) await draftHistoryGate;
        if (historyRequests === 3) await publishHistoryGate;
        return route.fulfill(historyRequests === 1 || historyRequests === 3 ?
          { status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'History unavailable.' }) } :
          { status: 200, contentType: 'application/json', body: JSON.stringify({ form: definition, versions }) });
      }
      const body = route.request().postDataJSON();
      if (url.pathname.endsWith('/draft')) {
        draftBodies.push(body);
        if (draftBodies.length === 1) return route.abort('failed');
        await saveGate;
        writes++;
        const draft: CatalogVersion = { id: 'draft-2', version: 2, revision: 1, status: 'draft', reason: body.reason, updatedAt: 2, publishedAt: null, config: body.config };
        versions = [draft, ...versions];
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ draft }) });
      }
      publishRequests++;
      writes++;
      const next: CatalogVersion = { ...versions[0], status: 'published', reason: body.reason, revision: 2, publishedAt: 3 };
      versions = [next, ...versions.slice(1)];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ published: next }) });
    });
    await page.goto('https://form.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.locator('#gift_color-label').fill('Edited colour');
    await page.getByLabel('Reason for change').fill('Save colour edit');
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.waitForFunction(() => document.body.textContent?.includes('Failed to fetch'));
    await page.getByRole('button', { name: 'Save draft' }).click();
    await page.waitForFunction(() => document.querySelector('#gift_color-label')?.matches(':disabled'));
    assert.equal(await page.locator('#gift_color-label').isDisabled(), true);
    assert.equal(await page.getByLabel('New field key').isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Required for Edited colour' }).isDisabled(), true);
    assert.equal(await page.locator('[data-editor-field="gift_color"]').getByRole('button', { name: 'Archive' }).isDisabled(), true);
    assert.equal(await page.getByLabel('Reason for change').isDisabled(), true);
    await page.keyboard.insertText('SHOULD NOT APPLY');
    assert.equal(await page.locator('#gift_color-label').inputValue(), 'Edited colour');
    releaseSave();
    await page.getByText('Draft saved.').waitFor({ timeout: 3000 });
    assert.equal(await page.locator('#gift_color-label').isDisabled(), false, 'successful save unlocks editing before history GET finishes');
    releaseDraftHistory();
    await page.getByRole('button', { name: 'Retry history refresh' }).waitFor();
    assert.equal(await page.locator('#gift_color-label').inputValue(), 'Edited colour');
    assert.equal(draftBodies[0].requestId, draftBodies[1].requestId, 'uncertain retry reuses idempotency key');
    assert.equal(writes, 1);
    await page.getByRole('button', { name: 'Retry history refresh' }).click();
    await page.getByText('Latest version loaded.').waitFor();
    assert.equal(draftBodies.length, 2);
    await page.getByLabel('Reason for change').fill('Publish colour edit');
    await page.getByRole('button', { name: 'Publish draft' }).click();
    await page.getByRole('button', { name: 'Confirm publish' }).focus();
    await page.keyboard.press('Enter');
    await page.getByText('Form published.').waitFor({ timeout: 3000 });
    assert.equal(await page.getByRole('alertdialog').count(), 0, 'successful publish closes confirmation before history GET finishes');
    releasePublishHistory();
    await page.getByRole('button', { name: 'Retry history refresh' }).waitFor();
    assert.equal(await page.getByRole('alertdialog').count(), 0);
    assert.equal(await page.getByLabel('Reason for change').inputValue(), '');
    assert.equal(await page.getByRole('button', { name: 'Publish draft' }).isDisabled(), true);
    assert.equal(publishRequests, 1);
    assert.equal(writes, 2);
    await page.getByRole('button', { name: 'Retry history refresh' }).click();
    await page.getByText('Latest version loaded.').waitFor();
    assert.equal(historyRequests, 4);
    assert.equal(publishRequests, 1);
  } finally { releaseSave(); releaseDraftHistory(); releasePublishHistory(); await page.close(); await browser.close(); }
});
