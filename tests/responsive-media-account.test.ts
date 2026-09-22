import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = (path: string) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8');

void test('customer commerce thumbnails declare their responsive purpose', async () => {
  const [cart, saved] = await Promise.all([
    source('components/commerce/cart-view.tsx'),
    source('components/account/saved-product-grid.tsx'),
  ]);

  assert.match(cart, /data-media-mode="cover"/);
  assert.match(cart, /sizes=\{mediaSizes\.cartThumbnail\}/);
  assert.match(
    cart,
    /src=\{`\/api\/product-media\/\$\{item\.primaryMediaId\}`\}/,
  );
  assert.match(cart, /alt=""/);

  assert.match(saved, /data-media-mode="cover"/);
  assert.match(saved, /data-media-frame="cover"/);
  assert.match(saved, /sizes=\{mediaSizes\.savedProduct\}/);
  assert.match(
    saved,
    /src=\{`\/api\/product-media\/\$\{item\.primaryMediaId\}`\}/,
  );
  assert.match(saved, /alt=\{item\.nameEn\}/);
});

void test('customer review photos remain contained, lazy, and independently openable', async () => {
  const reviews = await source('components/commerce/review-attachments.tsx');

  assert.match(reviews, /data-media-mode="contain"/);
  assert.match(reviews, /sizes=\{mediaSizes\.reviewAttachment\}/);
  assert.match(reviews, /loading="lazy"/);
  assert.match(reviews, /target="_blank"/);
  assert.match(reviews, /rel="noopener noreferrer"/);
  assert.match(
    reviews,
    /alt=\{`Customer submission \$\{index \+ 1\} for this purchase`\}/,
  );
});

void test('document QR retains its intrinsic code geometry in a shrink-safe contained image', async () => {
  const qr = await source('components/commerce/document-machine-codes.tsx');

  assert.match(qr, /data-media-mode="contain"/);
  assert.match(qr, /sizes=\{mediaSizes\.qr\}/);
  assert.match(qr, /width=\{192\}/);
  assert.match(qr, /height=\{192\}/);
  assert.match(qr, /media-shrink/);
  assert.match(qr, /src=\{qrSource\}/);
  assert.match(qr, /alt=\{`QR code for invoice \$\{invoiceNumber\}`\}/);
});

void test('shared brand marks and footer lockup retain their semantics', async () => {
  const [header, footer, staffDenied, sellerDenied] = await Promise.all([
    source('components/layout/site-header.tsx'),
    source('components/layout/site-footer.tsx'),
    source('app/staff-access-denied/page.tsx'),
    source('app/seller-access-denied/page.tsx'),
  ]);

  for (const brandMark of [header, staffDenied, sellerDenied]) {
    assert.match(brandMark, /data-media-mode="contain"/);
    assert.match(brandMark, /sizes=\{mediaSizes\.brandMark\}/);
    assert.match(brandMark, /alt=""/);
  }
  assert.match(header, /priority/);
  assert.doesNotMatch(staffDenied, /priority/);
  assert.doesNotMatch(sellerDenied, /priority/);

  assert.match(footer, /data-media-mode="natural"/);
  assert.match(footer, /sizes=\{mediaSizes\.footerLogo\}/);
  assert.match(
    footer,
    /alt="Hastabazaar — Handmade Nepal\. For a Sustainable World\."/,
  );
});

void test('404 artwork declares the shared responsive image contract', async () => {
  const notFound = await source('app/not-found.tsx');

  assert.match(notFound, /sizes=\{mediaSizes\.notFound\}/);
  assert.match(notFound, /data-media-frame="cover"/);
  assert.match(notFound, /mediaFrameClass\(\s*'cover'/);
  assert.match(notFound, /mediaObjectClass\('cover', 'opacity-35'\)/);
});
