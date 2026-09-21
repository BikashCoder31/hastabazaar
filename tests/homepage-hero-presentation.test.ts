import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

void test('homepage resolves the effective hero carousel with an explicit recovery fallback', async () => {
  const page = await readFile(new URL('../app/page.tsx', import.meta.url), 'utf8');
  assert.match(page, /getEffectiveBusinessSetting/);
  assert.match(page, /'homepage_hero_slides'/);
  assert.match(page, /CURRENT_HERO_RECOVERY_SLIDES/);
  assert.match(page, /<HomepageHeroCarousel slides=\{heroSlides\}/);
  assert.doesNotMatch(page, /<section className="homepage-hero"/);
  assert.doesNotMatch(page, /src="\/homepage\/nepal-craft-hero\.webp"/);
});

void test('category overlap and established homepage anchors remain intact', async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);
  assert.ok(page.indexOf('<HomepageHeroCarousel') < page.indexOf('id="categories"'));
  for (const anchor of [
    'categories',
    'offers',
    'latest-products',
    'top-products',
    'occasions',
    'makers',
  ]) {
    assert.match(page, new RegExp(`id=\\"${anchor}\\"`));
  }
  assert.match(styles, /\.homepage-category-wrap\s*\{[\s\S]*?margin-top:\s*-3\.4rem/);
  assert.match(styles, /\.homepage-hero-carousel/);
});

void test('every carousel image preserves its full editorial composition', async () => {
  const carousel = await readFile(
    new URL('../components/homepage/homepage-hero-carousel.tsx', import.meta.url),
    'utf8',
  );
  assert.match(carousel, /object-contain/);
  assert.match(carousel, /aspect-\[8\/5\]/);
  assert.match(
    carousel,
    /alt=\{slide\.imageAlt \?\? ''\}[\s\S]*?className="[^"]*object-contain[^"]*"/,
  );
  assert.match(carousel, /homepage-hero-media-backdrop/);
});

void test('two face-free editorial hero assets are project-bound WebP files and registered additively', async () => {
  const assets = [
    '../public/homepage/maker-hands-hero.webp',
    '../public/homepage/meaningful-gifts-hero.webp',
  ];
  for (const asset of assets) {
    const url = new URL(asset, import.meta.url);
    const [bytes, metadata] = await Promise.all([readFile(url), stat(url)]);
    assert.equal(String.fromCharCode(...bytes.subarray(0, 4)), 'RIFF');
    assert.equal(String.fromCharCode(...bytes.subarray(8, 12)), 'WEBP');
    assert.ok(metadata.size > 50_000);
    assert.ok(metadata.size < 5 * 1024 * 1024);
  }
  const [d1, maria] = await Promise.all([
    readFile(
      new URL('../drizzle/0055_homepage_hero_carousel.sql', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL(
        '../deployment/babal/mariadb-homepage-hero-carousel.sql',
        import.meta.url,
      ),
      'utf8',
    ),
  ]);
  for (const source of [d1, maria]) {
    assert.match(source, /system-maker-hands-hero/);
    assert.match(source, /system-meaningful-gifts-hero/);
    assert.doesNotMatch(source, /DROP TABLE/i);
  }
});
