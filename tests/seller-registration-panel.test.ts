import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { addSellerRegistrationSlide } from '../lib/homepage/hero-editor';
import { INITIAL_HOMEPAGE_HERO_SLIDES, isNativeSellerRegistrationSlide, type HomepageHeroSlides } from '../lib/homepage/hero-slides';

void test('native seller panel replaces artwork without fetching seller media and preserves all three original images', async () => {
  const compiled = await build({
    entryPoints: ['components/homepage/homepage-hero-carousel.tsx'], bundle: true,
    write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next/router'],
    alias: { 'next/link': path.resolve('node_modules/vinext/dist/shims/link.js') },
  });
  const renderedModule = { exports: {} as {
    HomepageHeroCarousel: ComponentType<{ slides: HomepageHeroSlides }>;
  } };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url), module: renderedModule,
    exports: renderedModule.exports, process, URL, console, setTimeout, clearTimeout,
  });
  const slides = addSellerRegistrationSlide(INITIAL_HOMEPAGE_HERO_SLIDES);
  const html = renderToStaticMarkup(createElement(renderedModule.exports.HomepageHeroCarousel, { slides }));
  const first = html.match(/<div role="group"[^>]*aria-label="Slide 1 of 4"[\s\S]*?<div role="group"/)?.[0];
  assert.ok(first);
  assert.match(first, /data-seller-registration-panel/);
  assert.match(first, /Seller application/);
  assert.match(first, /Admin review/);
  assert.match(first, /Approval required/);
  assert.doesNotMatch(first, /<img\b|<video\b|AI-generated|workbench|\/api\/homepage\/hero-media/);
  assert.equal((html.match(/<img\b/g) ?? []).length, 3);
  for (const id of ['system-nepal-craft-hero', 'system-maker-hands-hero', 'system-meaningful-gifts-hero']) {
    assert.match(html, new RegExp('/api/homepage/hero-media/' + id));
  }
  assert.match(first, /href="\/sell#seller-application"/);
});

void test('native media exception requires the exact seller slide, panel identifier and image type', () => {
  assert.equal(isNativeSellerRegistrationSlide({ id: 'hero-seller-registration', mediaId: 'system-seller-registration-panel', mediaType: 'image' }), true);
  assert.equal(isNativeSellerRegistrationSlide({ id: 'custom-slide', mediaId: 'system-seller-registration-panel', mediaType: 'image' }), false);
  assert.equal(isNativeSellerRegistrationSlide({ id: 'hero-seller-registration', mediaId: 'custom-media', mediaType: 'image' }), false);
  assert.equal(isNativeSellerRegistrationSlide({ id: 'hero-seller-registration', mediaId: 'system-seller-registration-panel', mediaType: 'video' }), false);
});
