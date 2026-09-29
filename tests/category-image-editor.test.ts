import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
(globalThis as unknown as { imageEditorReact: typeof React }).imageEditorReact =
  React;
registerHooks({
  resolve(specifier, context, next) {
    return specifier === 'next/image'
      ? {
          url:
            'data:text/javascript,' +
            encodeURIComponent(
              'export default function Image({unoptimized,...props}){return globalThis.imageEditorReact.createElement("img",props)}',
            ),
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
void test('optional category image editor provides an accessible file choice and explains save-time publication', async () => {
  const { CategoryImageEditor } =
    await import('../components/admin/category-image-editor');
  const html = renderToStaticMarkup(
    React.createElement(CategoryImageEditor, {
      value: null,
      onChange: () => {},
      onBusyChange: () => {},
    }),
  );
  assert.match(html, /type="file"/);
  assert.match(html, /accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(html, /Category image/);
  assert.match(html, /Save entry/);
  assert.doesNotMatch(html, /type="file"[^>]*required/);
});
void test('existing category image has an authenticated preview and explicit remove action', async () => {
  const { CategoryImageEditor } =
    await import('../components/admin/category-image-editor');
  const html = renderToStaticMarkup(
    React.createElement(CategoryImageEditor, {
      value: 'fixture-image',
      onChange: () => {},
      onBusyChange: () => {},
    }),
  );
  assert.match(html, /\/api\/admin\/catalog\/category-media\/fixture-image/);
  assert.match(html, /Remove image/);
});
