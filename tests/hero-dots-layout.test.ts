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

void test('rendered hero reserves space after its dots beyond the overlapping category panel', async () => {
  const compiled = await build({
    entryPoints: ['components/homepage/homepage-hero-carousel.tsx'],
    bundle: true,
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
  const carouselTag = html.match(/<div\b[^>]*data-slot="carousel"[^>]*>/)?.[0];
  assert.ok(carouselTag);
  // Tailwind's numeric padding units are quarter-rem. Read the emitted ancestor
  // padding and compare with the actual desktop/mobile category overlaps.
  const paddingUnits = Number(
    carouselTag.match(/class="[^"]*\bpb-(\d+)\b/)?.[1] ?? 0,
  );
  const styles = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  const overlaps = [
    ...styles.matchAll(
      /\.homepage-category-wrap\s*\{[^}]*?margin-top:\s*-(\d+(?:\.\d+)?)rem/g,
    ),
  ].map((match) => Number(match[1]));
  assert.ok(overlaps.length > 0);
  assert.ok(
    paddingUnits / 4 > Math.max(...overlaps),
    'the category overlap must end below every hero dot hit area',
  );
});
