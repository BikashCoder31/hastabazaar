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
  assert.equal((hero.match(/data-media-mode="cover"/g) ?? []).length, 2);
  assert.match(hero, /mediaFrameClass\(\s*'cover'/);
  assert.match(hero, /mediaObjectClass\('cover'/);
  assert.equal(
    (hero.match(/loading=\{index === 0 \? 'eager' : 'lazy'\}/g) ?? []).length,
    1,
  );
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
  const [occasion, homepage, craftDetails, styles] = await Promise.all([
    readFile(
      new URL(
        '../components/homepage/homepage-occasion-carousel.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(new URL('../app/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/homepage/craft-details.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ]);

  assert.match(occasion, /data-media-frame="cover"/);
  assert.match(occasion, /data-media-mode="cover"/);
  assert.match(occasion, /sizes="\(min-width: 640px\) 174px, 168px"/);
  assert.match(occasion, /mediaObjectClass\('cover'/);

  const editorialSources = homepage + craftDetails;
  assert.equal((editorialSources.match(/data-media-frame="cover"/g) ?? []).length, 3);
  assert.equal((editorialSources.match(/data-media-mode="cover"/g) ?? []).length, 3);
  assert.match(homepage, /sizes="\(min-width: 1440px\) 190px, [^"]+132px"/);
  assert.match(craftDetails, /sizes="\(min-width: 1024px\) 34vw, [^"]+calc\(100vw - 32px\)"/);
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

void test('catalogue media keeps authenticated sources and uses purpose-specific responsive contracts', async () => {
  const [productCard, productSlider, recentlyViewed, shop, maker, gallery] =
    await Promise.all([
      readFile(
        new URL('../components/catalog/product-card.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../components/catalog/product-slider.tsx', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../components/catalog/recently-viewed.tsx', import.meta.url),
        'utf8',
      ),
      readFile(new URL('../app/shop/page.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../app/makers/[id]/page.tsx', import.meta.url), 'utf8'),
      readFile(
        new URL('../components/catalog/product-gallery.tsx', import.meta.url),
        'utf8',
      ),
    ]);

  assert.match(productCard, /sizes = mediaSizes\.productGrid/);
  assert.match(productCard, /data-media-frame="cover"/);
  assert.match(productCard, /data-media-mode="cover"/);
  assert.match(productCard, /src=\{product\.image\}/);
  assert.match(productCard, /alt=\{product\.imageAlt\}/);
  assert.match(
    productSlider,
    /wideDesktop\s*\?\s*mediaSizes\.productSliderWide\s*:\s*mediaSizes\.productSlider/,
  );
  assert.match(recentlyViewed, /sizes=\{mediaSizes\.productGrid\}/);

  assert.match(shop, /sizes=\{mediaSizes\.shopGrid\}/);
  assert.match(shop, /data-media-frame="cover"/);
  assert.match(shop, /data-media-mode="cover"/);
  assert.match(
    shop,
    /src=\{`\/api\/product-media\/\$\{product\.primaryMediaId\}`\}/,
  );
  assert.match(shop, /alt=\{product\.nameEn\}/);

  assert.match(maker, /sizes=\{mediaSizes\.makerGrid\}/);
  assert.match(maker, /data-media-frame="cover"/);
  assert.match(maker, /data-media-mode="cover"/);
  assert.match(
    maker,
    /src=\{`\/api\/product-media\/\$\{product\.primaryMediaId\}`\}/,
  );
  assert.match(maker, /alt=\{product\.nameEn\}/);

  assert.match(gallery, /sizes=\{mediaSizes\.productGallery\}/);
  assert.match(gallery, /sizes=\{mediaSizes\.galleryThumbnail\}/);
  assert.match(gallery, /data-media-frame="contain"/);
  assert.match(gallery, /data-media-frame="cover"/);
  assert.match(gallery, /src=\{active\.src \?\? '\/api\/product-media\/' \+ active\.id\}/);
  assert.match(gallery, /src=\{photo\.src \?\? '\/api\/product-media\/' \+ photo\.id\}/);
  assert.match(gallery, /src=\{video\.src \?\? '\/api\/product-media\/' \+ video\.id\}/);
  assert.match(gallery, /alt=\{active\.altEn \|\| productName\}/);
});
