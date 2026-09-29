import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
(globalThis as unknown as { taxonomyReact: typeof React }).taxonomyReact =
  React;
registerHooks({
  resolve(specifier, context, next) {
    const body =
      specifier === 'next/link'
        ? 'export default function Link(p){return globalThis.taxonomyReact.createElement("a",p)}'
        : specifier === 'next/image'
          ? 'export default function Image({fill,priority,unoptimized,...p}){return globalThis.taxonomyReact.createElement("img",p)}'
          : null;
    return body
      ? {
          url: 'data:text/javascript,' + encodeURIComponent(body),
          shortCircuit: true,
        }
      : next(specifier, context);
  },
});
void test('new active categories without stock or built-in artwork remain discoverable and link to their exact filter', async () => {
  const { TaxonomyDirectory } =
    await import('../components/catalog/taxonomy-directory');
  const html = renderToStaticMarkup(
    React.createElement(TaxonomyDirectory, {
      kind: 'category',
      entries: [
        {
          id: 'food-id',
          slug: 'food',
          nameEn: 'Food',
          nameNe: null,
          imageId: null,
        },
      ],
    }),
  );
  assert.match(html, /Food/);
  assert.match(html, /href="\/shop\?category=food"/);
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /All categories/);
});
void test('assigned image overrides legacy artwork while unknown categories have a usable fallback', async () => {
  const { categoryImage } =
    await import('../lib/catalog/category-presentation');
  assert.deepEqual(
    categoryImage({ slug: 'food', nameEn: 'Food', imageId: 'image-123' }),
    { src: '/api/categories/image/image-123', alt: 'Food category' },
  );
  assert.match(
    categoryImage({ slug: 'pottery', nameEn: 'Pottery' })!.src,
    /category-pottery.webp$/,
  );
  assert.equal(categoryImage({ slug: 'food', nameEn: 'Food' }), null);
});
void test('gift occasion directory includes newly created birthdays without inventing available products', async () => {
  const { TaxonomyDirectory } =
    await import('../components/catalog/taxonomy-directory');
  const html = renderToStaticMarkup(
    React.createElement(TaxonomyDirectory, {
      kind: 'occasion',
      entries: [
        { id: 'birthday', slug: 'birthday', nameEn: 'Birthday', nameNe: null },
      ],
    }),
  );
  assert.match(html, /All gift occasions/);
  assert.match(html, /href="\/shop\?occasion=birthday"/);
  assert.match(html, /Birthday/);
  assert.doesNotMatch(html, /products available|in stock/i);
});
