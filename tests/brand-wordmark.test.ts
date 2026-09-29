import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BrandWordmark } from '../components/layout/brand-wordmark';

void test('shared wordmark matches homepage red bazaar while retaining its accessible name and navy Hasta', async () => {
  const styles = await readFile(new URL('../components/layout/site-header.module.css', import.meta.url), 'utf8');
  const homepageRed = styles.match(/span:last-child\s*\{\s*color:\s*(#[a-f0-9]+);/i)?.[1];
  assert.equal(homepageRed, '#a5121c');
  const html = renderToStaticMarkup(createElement(BrandWordmark, { className: 'block text-xl' }));
  assert.match(html, /aria-label="Hastabazaar"/);
  assert.match(html, /class="[^"]*block text-xl/);
  const parts = [...html.matchAll(/<span aria-hidden="true" class="([^"]+)">([^<]+)<\/span>/g)];
  assert.equal(parts.length, 2);
  assert.equal(parts[0][2], 'Hasta');
  assert.equal(parts[0][1], 'text-[#0b2c4a]');
  assert.equal(parts[1][2], 'bazaar');
  assert.equal(parts[1][1], `text-[${homepageRed}]`);
});
