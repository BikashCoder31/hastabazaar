import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { HomepageHeroPreview } from '../components/admin/homepage-hero-preview';
import { INITIAL_HOMEPAGE_HERO_SLIDES } from '../lib/homepage/hero-slides';

void test('seller product previews use explicit responsive media modes', async () => {
  const [form, sellerProducts, sellerLayout] = await Promise.all([
    readFile(
      new URL(
        '../components/seller/product-submission-form.tsx',
        import.meta.url,
      ),
      'utf8',
    ),
    readFile(
      new URL('../components/seller/product-catalogue.tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../app/seller/layout.tsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(form, /backgroundImage/);
  assert.equal((form.match(/data-media-mode="contain"/g) ?? []).length, 3);
  assert.equal(
    (form.match(/<img[\s\S]*?data-media-mode="contain"/g) ?? []).length,
    2,
  );
  assert.doesNotMatch(form, /data-media-mode="cover"/);
  assert.match(form, /fetch\('\/api\/seller\/product-photo-preview'/);
  assert.match(
    form,
    /data-media-mode="contain"[\s\S]*?<video|<video[\s\S]*?data-media-mode="contain"/,
  );
  assert.match(form, /controls/);
  assert.match(form, /preload="metadata"/);
  assert.match(form, /URL\.createObjectURL/);
  assert.match(form, /URL\.revokeObjectURL/);
  assert.match(form, /\/api\/product-media\/\$\{media\.id\}/);
  assert.match(sellerProducts, /data-media-mode="cover"/);
  assert.match(sellerLayout, /data-media-mode="contain"/);
});

void test('seller media routes retain upload type and content validation', async () => {
  const [form, createRoute, updateRoute, imageValidator, videoValidator] =
    await Promise.all([
      readFile(
        new URL(
          '../components/seller/product-submission-form.tsx',
          import.meta.url,
        ),
        'utf8',
      ),
      readFile(
        new URL('../app/api/seller/products/route.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../app/api/seller/products/[id]/route.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../lib/products/submission.ts', import.meta.url),
        'utf8',
      ),
      readFile(
        new URL('../lib/media/product-video.ts', import.meta.url),
        'utf8',
      ),
    ]);

  assert.equal(
    (form.match(/accept="image\/jpeg,image\/png,image\/webp"/g) ?? []).length,
    2,
  );
  assert.match(form, /accept="video\/mp4"/);
  assert.match(
    imageValidator,
    /new Set\(\['image\/jpeg', 'image\/png', 'image\/webp'\]\)/,
  );
  assert.match(videoValidator, /file\.type !== 'video\/mp4'/);

  for (const route of [createRoute, updateRoute]) {
    assert.match(route, /validateProductImage\(.*\)/);
    assert.match(route, /validateProductImageContent\(.*\)/);
    assert.match(route, /validateProductVideo\(.*\)/);
  }
});

void test('admin hero image and poster-bearing video preserve public cover geometry and authenticated URLs', () => {
  for (const mode of ['mobile', 'desktop'] as const) {
    for (const mediaType of ['image', 'video'] as const) {
      const html = renderToStaticMarkup(
        createElement(HomepageHeroPreview, {
          mode,
          slide: {
            ...INITIAL_HOMEPAGE_HERO_SLIDES[0]!,
            mediaType,
            mediaId: 'private hero/image',
            posterMediaId: 'private poster/image',
            imageAlt: 'Woven basket',
            videoDescription: 'A maker weaving a basket',
          },
        }),
      );
      assert.match(html, /data-media-frame="cover"/);
      assert.match(html, /media-frame-cover/);
      assert.match(html, /homepage-hero-frame/);
      assert.match(
        html,
        new RegExp(
          `data-hero-preview-viewport="${mode === 'mobile' ? 390 : 1440}"`,
        ),
      );
      assert.match(html, /homepage-hero-layout/);
      assert.match(html, /homepage-hero-visual/);
      for (const text of [
        'Product details',
        'Meet the seller',
        'Thoughtful choices',
        'Help with your order',
      ])
        assert.ok(html.includes(text));
      assert.doesNotMatch(html, /<a\b/); // Scaled draft actions cannot navigate away from the editor.
      const tag = html.match(
        new RegExp(`<${mediaType === 'image' ? 'img' : 'video'}\\b[^>]*>`),
      )?.[0];
      assert.ok(tag);
      assert.match(tag, /data-media-mode="cover"/);
      assert.match(tag, /media-object-cover/);
      assert.match(
        tag,
        /src="\/api\/admin\/homepage\/hero-media\/private%20hero%2Fimage"/,
      );
      if (mediaType === 'image') {
        assert.match(tag, /alt="Woven basket"/);
      } else {
        assert.match(
          tag,
          /poster="\/api\/admin\/homepage\/hero-media\/private%20poster%2Fimage"/,
        );
        for (const attribute of ['muted', 'loop', 'autoPlay', 'playsInline']) {
          assert.match(tag, new RegExp(`${attribute}=""`, 'i'));
        }
        assert.match(tag, /aria-label="A maker weaving a basket"/);
      }
    }
  }
});

void test('admin review keeps full product images and MP4 videos visible through the product media route', async () => {
  const review = await readFile(
    new URL('../app/admin/products/[id]/page.tsx', import.meta.url),
    'utf8',
  );
  assert.match(review, /media\.mimeType === 'video\/mp4'\s*\?\s*\(/);
  const video = review.match(/<video\b[^>]*\/>/)?.[0];
  const image = review.match(/<Image\b[^>]*\/>/)?.[0];
  for (const tag of [video, image]) {
    assert.ok(tag);
    assert.match(tag, /data-media-mode="contain"/);
    assert.match(tag, /mediaObjectClass\(\s*'contain'/);
    assert.match(tag, /src=\{`\/api\/product-media\/\$\{media\.id\}`\}/);
  }
  assert.match(review, /data-media-frame="contain"/);
  assert.match(video!, /\bcontrols\b/);
  assert.match(video!, /\bmuted\b/);
  assert.match(video!, /\bplaysInline\b/);
  assert.match(video!, /preload="metadata"/);
  assert.match(image!, /alt=\{media\.altEn\}/);
});

void test('admin product review wraps generated SKU text at the 320px boundary', async () => {
  const review = await readFile(
    new URL('../app/admin/products/[id]/page.tsx', import.meta.url),
    'utf8',
  );
  const sku = review.match(/<p\b[^>]*>Platform SKU: \{product\.sku\}<\/p>/)?.[0];
  assert.ok(sku, 'The product identifier remains visible for reviewers.');
  assert.match(
    sku,
    /break-all|\[overflow-wrap:anywhere\]/,
    'Long generated SKU text must wrap inside the phone viewport.',
  );
  const sellerSku=review.match(/<p\b[^>]*>Seller SKU: [\s\S]*?<\/p>/)?.[0];
  assert.ok(sellerSku,'The separate seller stock code remains visible.');
  assert.match(sellerSku,/break-all|\[overflow-wrap:anywhere\]/);
});

void test('seller product rows wrap into cards without a horizontal scroller', async () => {
  const source = await readFile(
    new URL('../components/seller/product-catalogue.tsx', import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(source, /overflow-x-auto/);
  assert.match(source, /<table aria-label="Products" className="[^"]*w-full min-w-0/);
  assert.match(source, /grid-cols-\[36px_minmax\(0,1fr\)_auto\]/);
  assert.match(source, /aria-label=\{'Select ' \+ product\.nameEn\}/);
});

void test('admin thumbnails crop in bounded cover frames and operations branding stays contained', async () => {
  for (const file of [
    '../app/admin/products/page.tsx',
    '../app/admin/homepage/page.tsx',
  ]) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(source, /data-media-frame="cover"/);
    assert.match(source, /data-media-mode="cover"/);
    assert.match(source, /sizes=\{mediaSizes\.adminThumbnail\}/);
    assert.match(source, /mediaObjectClass\('cover'/);
  }
  const navigation = await readFile(
    new URL('../components/admin/admin-navigation.tsx', import.meta.url),
    'utf8',
  );
  assert.match(navigation, /data-media-mode="contain"/);
  assert.match(navigation, /mediaObjectClass\('contain'/);
  assert.match(navigation, /media-shrink/);
});
