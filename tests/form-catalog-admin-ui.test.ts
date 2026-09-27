import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import type { FormDefinition, PublishedFormConfig } from '../lib/forms/types';
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
  capabilities: { explanation: 'Profile answers attach to the customer record.', customFieldTypes: ['short_text', 'single_choice'], answerBehavior: 'record' },
};
const config: PublishedFormConfig = { formId: 'account.profile', version: 1, publishedAt: 1, fields: [
  { id: 'delivery_note', key: 'delivery_note', type: 'short_text', label: 'Delivery note', required: false, order: 0, status: 'active' },
] };

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
        const draft = { id: 'draft-1', version: 1, revision: 1, status: 'draft', reason: body.reason, updatedAt: 1, publishedAt: null, config: body.config };
        versions = [draft];
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ draft }) });
      }
      if (action === 'publish') {
        const published = { ...versions[0], status: 'published', publishedAt: 2, updatedAt: 2 };
        versions = [published];
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ published }) });
      }
      const published = { ...versions[0], id: 'published-2', version: 2, reason: body.reason, updatedAt: 3, publishedAt: 3 };
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
    await page.locator('[data-editor-field="gift_color"]').getByRole('button', { name: 'Archive' }).click();
    assert.match(await page.locator('[data-editor-field="gift_color"]').textContent(), /archived/);
    await page.locator('[data-editor-field="gift_color"]').getByRole('button', { name: 'Reactivate' }).click();
    await page.getByRole('tab', { name: 'Desktop' }).click();
    assert.equal(await page.locator('[data-preview-mode="desktop"] input[name="custom.gift_color"]').count(), 1);
    await page.getByRole('tab', { name: 'Phone' }).click();
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
    await page.getByLabel('Reason for change').fill('Restore prior layout');
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm restore' }).focus();
    await page.keyboard.press('Enter');
    assert.deepEqual(operations.map((item) => item.action), ['draft', 'draft', 'publish', 'restore']);
    assert.equal(operations[1].body.config.fields[0].key, 'gift_color');
    assert.equal(operations[1].body.config.fields[0].required, true);
    assert.equal(operations[2].body.reason, 'Publish recipient context');
    assert.equal(operations[3].body.sourceVersion, 1);
  } finally { await page.close(); await browser.close(); }
});
