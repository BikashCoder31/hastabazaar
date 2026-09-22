import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
      new URL('../app/seller/products/page.tsx', import.meta.url),
      'utf8',
    ),
    readFile(new URL('../app/seller/layout.tsx', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(form, /backgroundImage/);
  assert.equal((form.match(/data-media-mode="cover"/g) ?? []).length, 2);
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
