import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  INITIAL_HOMEPAGE_HERO_SLIDES,
  type HomepageHeroSlides,
} from '../lib/homepage/hero-slides';

void test('rendered hero keeps each story control above the overlapping category panel', async () => {
  const compiled = await build({
    entryPoints: ['components/homepage/homepage-hero-carousel.tsx'],
    bundle: true,
    loader: { '.module.css': 'empty' },
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*', 'next/router'],
    alias: {
      'next/link': path.resolve('node_modules/vinext/dist/shims/link.js'),
    },
  });
  const renderedModule = {
    exports: {} as {
      HomepageHeroCarousel: ComponentType<{ slides: HomepageHeroSlides }>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
    URL,
    console,
    setTimeout,
    clearTimeout,
  });
  const html = renderToStaticMarkup(
    createElement(renderedModule.exports.HomepageHeroCarousel, {
      slides: INITIAL_HOMEPAGE_HERO_SLIDES,
    }),
  );
  assert.match(html, /data-slider-dots/);
  assert.match(html, /aria-label="Pause featured stories"/);
  assert.equal((html.match(/aria-label="Show slide /g) ?? []).length, 3);
  const [homepageStyles, heroStyles] = await Promise.all([
    readFile(new URL('../components/homepage/homepage.module.css', import.meta.url), 'utf8'),
    readFile(new URL('../components/homepage/homepage-hero.module.css', import.meta.url), 'utf8'),
  ]);
  const overlap = Number(homepageStyles.match(/margin-top: -(\d+(?:\.\d+)?)rem/)?.[1]);
  const clearance = Number(heroStyles.match(/\.controls\s*\{[^}]*bottom: (\d+(?:\.\d+)?)rem/)?.[1]);
  assert.ok(overlap > 0 && clearance > overlap, 'the category panel must sit below the hero controls');
});
