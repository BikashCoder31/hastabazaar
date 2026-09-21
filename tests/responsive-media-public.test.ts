import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

void test('homepage hero media states share one responsive cover contract', async () => {
  const hero = await readFile(
    new URL(
      '../components/homepage/homepage-hero-carousel.tsx',
      import.meta.url,
    ),
    'utf8',
  );

  assert.match(hero, /data-media-frame="cover"/);
  assert.equal((hero.match(/data-media-mode="cover"/g) ?? []).length, 3);
  assert.match(hero, /mediaFrameClass\(\s*'cover'/);
  assert.match(hero, /mediaObjectClass\('cover'/);
  assert.match(hero, /loading=\{index === 0 \? 'eager' : 'lazy'\}/);
  assert.match(hero, /poster=\{posterUrl\}/);
  assert.match(hero, /preload=\{index === current \? 'metadata' : 'none'\}/);
  assert.match(
    hero,
    /const mediaUrl = `\/api\/homepage\/hero-media\/\$\{encodeURIComponent\(slide\.mediaId\)\}`;/,
  );
  assert.match(
    hero,
    /`\/api\/homepage\/hero-media\/\$\{encodeURIComponent\(slide\.posterMediaId\)\}`/,
  );
});

void test('homepage editorial fill media uses responsive cover frames and purpose sizes', async () => {
  const [occasion, homepage, styles] = await Promise.all([
    readFile(
      new URL(
        '../components/homepage/homepage-occasion-carousel.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);

  assert.match(occasion, /data-media-frame="cover"/);
  assert.match(occasion, /data-media-mode="cover"/);
  assert.match(occasion, /sizes=\{mediaSizes\.occasion\}/);
  assert.match(occasion, /mediaObjectClass\('cover'/);

  assert.equal((homepage.match(/data-media-frame="cover"/g) ?? []).length, 2);
  assert.equal((homepage.match(/data-media-mode="cover"/g) ?? []).length, 2);
  assert.match(homepage, /sizes="112px"/);
  assert.match(homepage, /sizes=\{mediaSizes\.editorial\}/);
  assert.match(homepage, /mediaObjectClass\('cover'/);

  assert.match(styles, /\.homepage-hero-grid\s*\{[\s\S]*?max-width:\s*96rem/);
  assert.match(
    styles,
    /\.homepage-category-list\s*\{[\s\S]*?overflow-x:\s*auto/,
  );
  assert.match(
    styles,
    /\.homepage-maker-media\s*\{[\s\S]*?min-height:\s*clamp\(/,
  );
  assert.match(styles, /\.homepage-hero-media\s*\{[\s\S]*?object-position:/);
  assert.doesNotMatch(styles, /\.homepage-hero-media img/);
});
