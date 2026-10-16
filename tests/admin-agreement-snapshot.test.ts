import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';

async function renderer() {
  const viewModule =
    await import('../components/admin/accepted-agreement-snapshot').catch(
      () => null,
    );
  assert.ok(
    viewModule?.AcceptedAgreementSnapshot,
    'Accepted historical terms need a readable renderer.',
  );
  return viewModule.AcceptedAgreementSnapshot;
}
void test('agreement review displays the accepted historical rate without using the current rate', async () => {
  const Component = await renderer();
  const markup = renderToStaticMarkup(
    createElement(Component, {
      json: JSON.stringify({
        version: 'historical-v1',
        platformRetentionBps: 1200,
        terms: ['Historical maker terms only.'],
      }),
    }),
  );
  assert.match(markup, /12%/);
  assert.match(markup, /Historical maker terms only\./);
  assert.match(markup, /historical-v1/);
  assert.doesNotMatch(markup, /9%/);
});
void test('malformed or unfamiliar snapshots remain inspectable and do not invent accepted terms', async () => {
  const Component = await renderer();
  for (const json of ['not JSON', '{"other":"legacy"}', 'null']) {
    const markup = renderToStaticMarkup(createElement(Component, { json }));
    assert.match(markup, /Original recorded snapshot/);
    assert.match(markup, /could not be displayed/);
  }
});
void test('historical terms render as escaped text even when they contain HTML', async () => {
  const Component = await renderer();
  const markup = renderToStaticMarkup(
    createElement(Component, {
      json: JSON.stringify({
        version: 'history',
        terms: ['<script>alert(1)</script>'],
      }),
    }),
  );
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});
