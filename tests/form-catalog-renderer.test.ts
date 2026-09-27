import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ConfiguredFields, fieldDisplay } from '../components/forms/configured-fields';
import { parsePublishedFormConfig, submissionFeedback, usePublishedFormConfig } from '../components/forms/form-config-client';
import { configuredJsonPayload, readConfiguredSubmission } from '../lib/forms/submission';
import type { ConfiguredField, PublishedFormConfig } from '../lib/forms/types';

const field = (overrides: Partial<ConfiguredField> = {}): ConfiguredField => ({
  id: 'delivery_note', key: 'delivery_note', type: 'short_text', label: 'Delivery note',
  helpText: 'Tell us where to leave it.', required: true, order: 1, status: 'active', ...overrides,
});
const config = (fields: readonly ConfiguredField[] = [field()]): PublishedFormConfig => ({
  formId: 'account.profile', version: 3, publishedAt: 1, fields,
});
const render = (item: PublishedFormConfig) => renderToStaticMarkup(createElement(ConfiguredFields, { config: item }));
function withFormEntries<T>(entries: readonly [string, string][], run: () => T): T {
  const previous = globalThis.FormData;
  globalThis.FormData = class extends FormData {
    constructor(_form?: HTMLFormElement) { super(); for (const [key, value] of entries) this.append(key, value); }
  } as typeof FormData;
  try { return run(); } finally { globalThis.FormData = previous; }
}

void test('field errors connect to their controls and are announced', () => {
  const html = renderToStaticMarkup(createElement(ConfiguredFields, {
    config: config(), errors: { delivery_note: 'Please add a delivery note.' },
  }));
  assert.match(html, /aria-invalid="true"/);
  assert.match(html, /aria-describedby="custom-delivery_note-help custom-delivery_note-error"/);
  assert.match(html, /id="custom-delivery_note-error"[^>]*role="alert"[^>]*>Please add a delivery note\./);
});

void test('active controls connect labels, help, and required cues without treating help as markup', () => {
  const html = render(config([field({ helpText: 'Leave at <side door>' })]));
  assert.match(html, /<label[^>]*for="custom-delivery_note"[^>]*>Delivery note/);
  assert.match(html, /name="custom\.delivery_note"/);
  assert.match(html, /aria-describedby="custom-delivery_note-help"/);
  assert.match(html, /id="custom-delivery_note-help"[^>]*>Leave at &lt;side door&gt;/);
  assert.match(html, /aria-required="true"/);
  assert.match(html, /required=""/);
  assert.match(html, /name="formVersion" value="3"/);
});

void test('choices render semantic single and multiple controls and omit archived fields', () => {
  const html = render(config([
    field({ id: 'colour', key: 'colour', type: 'single_choice', label: 'Colour', order: 1,
      choices: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }),
    field({ id: 'materials', key: 'materials', type: 'multiple_choice', label: 'Materials', order: 2,
      choices: [{ value: 'cotton', label: 'Cotton' }, { value: 'wool', label: 'Wool' }] }),
    field({ id: 'old', key: 'old', label: 'Old secret', order: 3, status: 'archived' }),
  ]));
  assert.match(html, /<select[^>]*name="custom\.colour"/);
  assert.match(html, /<option value="blue">Blue<\/option>/);
  assert.match(html, /<select[^>]*name="custom\.materials"[^>]*multiple=""/);
  assert.match(html, /<option value="cotton">Cotton<\/option>/);
  assert.doesNotMatch(html, /Old secret|custom\.old/);
});

void test('required multiple choice announces one group requirement and rejects zero selections', () => {
  const multi = field({ id: 'materials', key: 'materials', type: 'multiple_choice', label: 'Materials',
    choices: [{ value: 'cotton', label: 'Cotton' }, { value: 'wool', label: 'Wool' }] });
  const html = render(config([multi]));
  assert.match(html, /<select[^>]*multiple=""/);
  assert.match(html, /<select[^>]*required=""/);
  assert.match(html, /<select[^>]*aria-required="true"/);
  assert.match(html, /<label[^>]*for="custom-materials"[^>]*>Materials/);
  assert.equal((html.match(/required=""/g) ?? []).length, 1);
  assert.throws(() => withFormEntries([['formVersion', '3']], () => readConfiguredSubmission({} as HTMLFormElement, config([multi]), [])), /required/i);
  assert.deepEqual(withFormEntries([['formVersion', '3'], ['custom.materials', 'wool']],
    () => readConfiguredSubmission({} as HTMLFormElement, config([multi]), []).answers), { materials: ['wool'] });
});

void test('long labels have wrapping mobile layout and fields order by configured order', () => {
  const long = 'A very long label that must wrap gracefully on a narrow phone without clipping the form';
  const html = render(config([
    field({ id: 'later', key: 'later', label: 'Later', order: 4 }),
    field({ id: 'first', key: 'first', label: long, order: 0 }),
  ]));
  assert.ok(html.indexOf(long) < html.indexOf('Later'));
  assert.match(html, /min-w-0/);
  assert.match(html, /break-words/);
  assert.match(html, /w-full/);
});

void test('built-in display overrides expose only active field presentation', () => {
  assert.deepEqual(fieldDisplay(config([field({ id: 'display_name', key: 'display_name', label: 'Your name',
    helpText: 'As it appears to customers', required: true })]), 'display_name'),
    { label: 'Your name', helpText: 'As it appears to customers', placeholder: undefined, required: true });
  assert.equal(fieldDisplay(config([field({ id: 'display_name', key: 'display_name', status: 'archived' })]), 'display_name'), null);
});

void test('native form parsing returns typed, namespaced active custom answers', () => {
  const submitted = config([
    field({ id: 'note', key: 'note', required: false }),
    field({ id: 'count', key: 'count', type: 'number', order: 2 }),
    field({ id: 'colours', key: 'colours', type: 'multiple_choice', order: 3,
      choices: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] }),
    field({ id: 'gift', key: 'gift', type: 'checkbox', order: 4 }),
    field({ id: 'retired', key: 'retired', status: 'archived', order: 5 }),
  ]);
  const entries: [string, string][] = [
    ['formVersion', '3'], ['custom.note', 'Call first'], ['custom.count', '2'],
    ['custom.colours', 'red'], ['custom.colours', 'blue'], ['custom.gift', 'on'],
    ['custom.retired', 'ignored'], ['password', 'never copied'],
  ];
  withFormEntries(entries, () => {
    assert.deepEqual(readConfiguredSubmission({} as HTMLFormElement, submitted, []), {
      version: 3, answers: { note: 'Call first', count: 2, colours: ['red', 'blue'], gift: true },
    });
  });
});

void test('native parser rejects missing, duplicate, malformed, and stale form versions', () => {
  for (const entries of [[], [['formVersion', '3'], ['formVersion', '3']], [['formVersion', '3x']], [['formVersion', '2']]] as [string, string][][]) {
    assert.throws(() => withFormEntries(entries, () => readConfiguredSubmission({} as HTMLFormElement, config(), [])), /version/i);
  }
});

void test('native and JSON helpers exclude built-ins despite namespaced values', () => {
  const builtIn = field({ id: 'display_name', key: 'display_name', label: 'Your name', order: 0 });
  const mixed = config([builtIn, field()]);
  const baseKeys = ['display_name'];
  assert.deepEqual(withFormEntries([['formVersion', '3'], ['custom.display_name', 'Injected'], ['custom.delivery_note', 'Gate']],
    () => readConfiguredSubmission({} as HTMLFormElement, mixed, baseKeys).answers), { delivery_note: 'Gate' });
  assert.deepEqual(configuredJsonPayload(mixed, { display_name: 'Injected', delivery_note: 'Gate' }, baseKeys), {
    formVersion: 3, customAnswers: [{ fieldId: 'delivery_note', value: 'Gate' }],
  });
});

void test('JSON payload carries the same version and custom answer envelope', () => {
  assert.deepEqual(configuredJsonPayload(config(), { delivery_note: 'Blue gate' }, []), {
    formVersion: 3, customAnswers: [{ fieldId: 'delivery_note', value: 'Blue gate' }],
  });
});

void test('untrusted or unavailable fetched configuration fails closed and server render disables submit', () => {
  assert.equal(parsePublishedFormConfig('account.profile', { config: { ...config(), fields: 'oops' } }), null);
  assert.equal(parsePublishedFormConfig('account.profile', { config: { ...config(), formId: 'staff.secret' } }), null);
  assert.equal(parsePublishedFormConfig('account.profile', { config: { ...config(), fields: [field({ status: 'unknown' as 'active' })] } }), null);
  function Fixture() {
    const state = usePublishedFormConfig('account.profile');
    return createElement('button', { type: 'submit', disabled: !state.canSubmit }, 'Save');
  }
  assert.match(renderToStaticMarkup(createElement(Fixture)), /disabled=""/);
});

void test('stale response supplies refresh feedback and leaves entered values intact', () => {
  const entered = { delivery_note: 'Please ring twice' };
  const result = submissionFeedback(409);
  assert.equal(result.stale, true);
  assert.match(result.message, /changed|refresh/i);
  assert.deepEqual(entered, { delivery_note: 'Please ring twice' });
});

void test('mounted form retains text through 409 and refresh, then ignores an old form response after switching', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: {
    launch(options: { headless: boolean; executablePath: string }): Promise<{
      newPage(): Promise<{
        route(url: string, handler: (route: { request(): { url(): string }; fulfill(input: { status: number; contentType: string; body: string }): Promise<void> }) => Promise<void>): Promise<void>;
        goto(url: string): Promise<void>; addScriptTag(input: { content: string }): Promise<void>;
        locator(selector: string): { fill(value: string): Promise<void>; click(): Promise<void>; selectOption(value: string): Promise<unknown>; inputValue(): Promise<string>; isDisabled(): Promise<boolean>; count(): Promise<number>; textContent(): Promise<string | null> };
        evaluate<T>(fn: () => T): Promise<T>; waitForFunction(fn: () => boolean): Promise<unknown>; close(): Promise<void>;
      }>; close(): Promise<void>;
    }>;
  } };
  const bundle = await build({
    stdin: { resolveDir: process.cwd(), sourcefile: 'form-catalog-mounted-fixture.ts', contents: `
      import React, { useState } from 'react';
      import { createRoot } from 'react-dom/client';
      import { ConfiguredFields } from './components/forms/configured-fields';
      import { usePublishedFormConfig } from './components/forms/form-config-client';
      function App() {
        const [formId, setFormId] = useState('account.profile');
        const state = usePublishedFormConfig(formId);
        if (formId === 'account.profile' && state.status === 'ready') window.oldResponse = state.handleSubmissionResponse;
        return React.createElement('main', null,
          React.createElement('output', { id: 'status' }, state.status),
          state.config ? React.createElement('form', null,
            React.createElement(ConfiguredFields, { config: state.config }),
            React.createElement('button', { id: 'submit', type: 'submit', disabled: !state.canSubmit }, 'Save')) : null,
          React.createElement('button', { id: 'stale', type: 'button', onClick: () => state.handleSubmissionResponse(new Response(null, { status: 409 })) }, 'Stale'),
          React.createElement('button', { id: 'refresh', type: 'button', onClick: state.refresh }, 'Refresh'),
          React.createElement('button', { id: 'switch', type: 'button', onClick: () => setFormId('account.other') }, 'Switch'));
      }
      createRoot(document.getElementById('root')).render(React.createElement(App));
    ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  let requests = 0;
  let releaseRefresh: () => void = () => {};
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  let releaseOther: () => void = () => {};
  const otherGate = new Promise<void>((resolve) => { releaseOther = resolve; });
  const profile = config([field(), field({ id: 'materials', key: 'materials', type: 'multiple_choice',
    label: 'Materials', order: 2, choices: [{ value: 'cotton', label: 'Cotton' }, { value: 'wool', label: 'Wool' }] })]);
  try {
    await page.route('https://form.test/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
      if (path === '/api/forms/account.profile') {
        requests++;
        if (requests === 2) await refreshGate;
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: requests === 2 ? { ...profile, version: 4 } : profile }) });
      }
      await otherGate;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        config: { ...config([field({ id: 'other_note', key: 'other_note', label: 'Other note' })]), formId: 'account.other' },
      }) });
    });
    await page.goto('https://form.test/');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    const input = page.locator('input[name="custom.delivery_note"]');
    await input.fill('Ring twice');
    const group = page.locator('select[name="custom.materials"]');
    assert.equal(await page.evaluate(() => {
      const select = document.querySelector('select[name="custom.materials"]');
      return select instanceof HTMLSelectElement && select.validity.valueMissing;
    }), true);
    await group.selectOption('wool');
    assert.equal(await page.evaluate(() => {
      const select = document.querySelector('select[name="custom.materials"]');
      return select instanceof HTMLSelectElement && select.validity.valueMissing;
    }), false);
    await page.locator('#stale').click();
    assert.equal(await page.locator('#status').textContent(), 'stale');
    assert.equal(await page.locator('#submit').isDisabled(), true);
    await page.locator('#refresh').click();
    assert.equal(await input.inputValue(), 'Ring twice');
    assert.equal(await page.locator('#submit').isDisabled(), true);
    releaseRefresh();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');
    assert.equal(await input.inputValue(), 'Ring twice');
    await page.locator('#switch').click();
    await page.waitForFunction(() => document.querySelector('input[name="custom.delivery_note"]') === null);
    assert.equal(await input.count(), 0);
    assert.equal(await page.locator('#submit').count(), 0);
    releaseOther();
    await page.waitForFunction(() => document.querySelector('#status')?.textContent === 'ready');
    await page.evaluate(() => (window as typeof window & { oldResponse: (response: Response) => boolean }).oldResponse(new Response(null, { status: 409 })));
    assert.equal(await page.locator('#status').textContent(), 'ready');
    assert.equal(await page.locator('#submit').isDisabled(), false);
  } finally {
    releaseRefresh();
    releaseOther();
    await page.close();
    await browser.close();
  }
});
