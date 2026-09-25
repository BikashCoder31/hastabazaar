import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

void test('homepage resolves the effective hero carousel with an explicit recovery fallback', async () => {
  const page = await readFile(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(page, /getEffectiveBusinessSetting/);
  assert.match(page, /'homepage_hero_slides'/);
  assert.match(page, /CURRENT_HERO_RECOVERY_SLIDES/);
  assert.match(page, /<HomepageHeroCarousel slides=\{heroSlides\}/);
  assert.doesNotMatch(page, /<section className="homepage-hero"/);
  assert.doesNotMatch(page, /src="\/homepage\/nepal-craft-hero\.webp"/);
});

void test('category overlap and established homepage anchors remain intact', async () => {
  const [page, occasionCarousel, styles] = await Promise.all([
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../components/homepage/homepage-occasion-carousel.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);
  const homepageSources = `${page}\n${occasionCarousel}`;
  assert.ok(
    page.indexOf('<HomepageHeroCarousel') < page.indexOf('id="categories"'),
  );
  for (const anchor of [
    'categories',
    'offers',
    'latest-products',
    'top-products',
    'occasions',
    'makers',
  ]) {
    assert.match(homepageSources, new RegExp(`id=\\"${anchor}\\"`));
  }
  assert.match(
    styles,
    /\.homepage-category-wrap\s*\{[\s\S]*?margin-top:\s*-3\.4rem/,
  );
  assert.match(styles, /\.homepage-hero-carousel/);
});

void test('hero media is full bleed, calmer, and uses readable captions with dot navigation', async () => {
  const [carouselSource, styles, presentation] = await Promise.all([
    readFile(
      new URL(
        '../components/homepage/homepage-hero-carousel.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
    readFile(
      new URL('../lib/homepage/hero-presentation.ts', import.meta.url),
      'utf8',
    ),
  ]);
  const carousel = `${carouselSource}\n${presentation}`;
  assert.match(carousel, /data-media-frame="cover"/);
  assert.equal((carousel.match(/data-media-mode="cover"/g) ?? []).length, 3);
  assert.match(carousel, /mediaFrameClass\(\s*'cover'/);
  assert.match(carousel, /mediaObjectClass\('cover'/);
  assert.match(carousel, /aspect-\[4\/3\]/);
  assert.match(carousel, /@\[640px\]\/hero:aspect-\[8\/5\]/);
  assert.match(
    carousel,
    /@\[1024px\]\/hero:min-h-\[clamp\(32rem,42cqw,40rem\)\]/,
  );
  assert.match(carousel, /min-h-0[^"]*@\[1024px\]\/hero:min-h-\[36rem\]/);
  assert.match(carousel, /brightness-\[0\.82\]/);
  assert.match(carousel, /saturate-\[0\.82\]/);
  assert.match(carousel, /alt=\{slide\.imageAlt \?\? ''\}/);
  assert.match(styles, /\.homepage-hero-media\s*\{[\s\S]*?object-position:/);
  assert.doesNotMatch(styles, /\.homepage-hero-media img/);
  assert.doesNotMatch(carousel, /homepage-hero-media-backdrop/);
  assert.match(carousel, /homepage-hero-image-note/);
  assert.match(carousel, /left-\[16%\][^\n]*top-\[16%\]/);
  assert.match(carousel, /bg-\[#eee5d8\]\/2[05]/);
  assert.match(carousel, /backdrop-blur-(?:sm|\[\d+px\])/);
  assert.match(carousel, /drop-shadow/);
  assert.doesNotMatch(carousel, /bg-\[#eee5d8\]\/85/);
  assert.equal((carousel.match(/homepage-hero-image-note/g) ?? []).length, 1);
  assert.match(carousel, /homepage-hero-dot/);
  assert.match(carousel, /<span className="sr-only">\{index \+ 1\}<\/span>/);
  assert.doesNotMatch(carousel, />\s*\{index \+ 1\}\s*<\/button>/);
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
  const [d1, maria, manifestSource, manifestGenerator] = await Promise.all([
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
    readFile(
      new URL('../deployment/babal/release-manifest.json', import.meta.url),
      'utf8',
    ),
    readFile(
      new URL('../scripts/generate-release-manifest.mjs', import.meta.url),
      'utf8',
    ),
  ]);
  for (const source of [d1, maria]) {
    assert.match(source, /system-maker-hands-hero/);
    assert.match(source, /system-meaningful-gifts-hero/);
    assert.doesNotMatch(source, /DROP TABLE/i);
  }
  const manifest = JSON.parse(manifestSource) as {
    migrations: readonly { path: string; usage: string }[];
  };
  assert.deepEqual(
    manifest.migrations.find(
      (migration) =>
        migration.path ===
        'deployment/babal/mariadb-homepage-hero-carousel.sql',
    ),
    {
      path: 'deployment/babal/mariadb-homepage-hero-carousel.sql',
      sha256:
        '7016236fcd6fce388b50f2afd8f6dcee6c8b3199e6e15c9d3e6bfb23ece6b4ac',
      usage: 'additive-maintenance',
    },
  );
  assert.match(manifestGenerator, /'mariadb-homepage-hero-carousel\.sql'/);
});
