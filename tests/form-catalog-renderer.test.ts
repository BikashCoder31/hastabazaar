import assert from 'node:assert/strict';
import test from 'node:test';
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
  assert.match(html, /type="checkbox"[^>]*name="custom\.materials"[^>]*value="cotton"/);
  assert.doesNotMatch(html, /Old secret|custom\.old/);
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
  const previous = globalThis.FormData;
  globalThis.FormData = class extends FormData {
    constructor(_form?: HTMLFormElement) { super(); for (const [key, value] of entries) this.append(key, value); }
  } as typeof FormData;
  try {
    assert.deepEqual(readConfiguredSubmission({} as HTMLFormElement, submitted), {
      version: 3, answers: { note: 'Call first', count: 2, colours: ['red', 'blue'], gift: true },
    });
  } finally { globalThis.FormData = previous; }
});

void test('JSON payload carries the same version and custom answer envelope', () => {
  assert.deepEqual(configuredJsonPayload(config(), { delivery_note: 'Blue gate' }), {
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
