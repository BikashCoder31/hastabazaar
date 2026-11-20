import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { SellerProductRevision } from '../lib/db/repositories/products';
import { parseProductSubmission } from '../lib/products/submission';
import { stubFixtureLink } from './helpers/browser-fixture-link';

function submission(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    categoryId: 'cat',
    occasionIds: 'gift',
    nameEn: 'Handmade cup',
    descriptionEn: 'A handmade cup.',
    price: '100',
    inventoryQuantity: '2',
    preparationDays: '1',
    returnEligible: 'no',
  }))
    form.set(key, value);
  return form;
}

void test('product dates reject calendar rollover instead of storing a different date', () => {
  for (const field of ['manufacturedAt', 'expiresAt']) {
    for (const date of ['2026-02-30', '2025-02-29', '2026-04-31']) {
      const form = submission();
      form.set(field, date);
      const result = parseProductSubmission(form);
      assert.equal(result.input, undefined, `${field}: ${date}`);
      assert.ok(
        result.errors.some((error) =>
          /valid manufacture and expiry dates/i.test(error),
        ),
      );
    }
  }
});

void test('valid product dates keep Nepal midnight timestamps and optional dates stay empty', () => {
  const form = submission();
  const empty = parseProductSubmission(form);
  assert.deepEqual(empty.errors, []);
  assert.equal(empty.input?.manufacturedAt, null);
  assert.equal(empty.input?.expiresAt, null);
  form.set('manufacturedAt', '2024-02-29');
  form.set('expiresAt', '2026-10-19');
  const result = parseProductSubmission(form);
  assert.deepEqual(result.errors, []);
  assert.equal(result.input?.manufacturedAt, 1709144100000);
  assert.equal(result.input?.expiresAt, 1792347300000);
});

function revision(): SellerProductRevision {
  return {
    id: 'product',
    categoryId: 'cat',
    occasionIds: ['gift'],
    sku: 'EXISTING-1',
    nameEn: 'Handmade cup',
    nameNe: null,
    descriptionEn: 'A handmade cup.',
    descriptionNe: null,
    pricePaisa: 10_000,
    compareAtPricePaisa: null,
    inventoryQuantity: 2,
    producer: '',
    materials: '',
    originStory: null,
    dimensions: null,
    size: null,
    colour: null,
    variations: null,
    specifications: null,
    careInstructions: null,
    safetyInformation: null,
    returnConditions: null,
    returnEligible: 0,
    warranty: null,
    madeToOrder: 0,
    preparationDays: 1,
    manufacturedAt: 1792347300000,
    expiresAt: 1792433700000,
    licenceReference: null,
    status: 'published',
    reviewNote: null,
    reviewRequestId: null,
    mediaCount: 0,
    videoCount: 0,
    media: [],
  };
}

void test('editing product dates preserves the submitted Nepal day through another submission', async () => {
  const compiled = await build({
    entryPoints: ['components/seller/product-submission-form.tsx'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{ name: 'product-date-form-fixture', setup: stubFixtureLink }],
  });
  const renderedModule = {
    exports: {} as {
      ProductSubmissionForm: ComponentType<{
        categories: unknown[];
        occasions: unknown[];
        initial: SellerProductRevision;
      }>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
  });
  for (const [manufacturedAt, expiresAt, manufactureDay, expiryDay] of [
    [1792347300000, 1792433700000, '2026-10-19', '2026-10-20'],
    [473364900000, 473451300000, '1985-01-01', '1985-01-02'],
    [0, null, '1970-01-01', ''],
    [null, 0, '', '1970-01-01'],
  ] as const) {
    const initial = { ...revision(), manufacturedAt, expiresAt };
    const html = renderToStaticMarkup(
      createElement(renderedModule.exports.ProductSubmissionForm, {
        categories: [{ id: 'cat', nameEn: 'Cups' }],
        occasions: [{ id: 'gift', nameEn: 'Gifts' }],
        initial,
      }),
    );
    const form = submission();
    for (const [field, expected] of [
      ['manufacturedAt', manufactureDay],
      ['expiresAt', expiryDay],
    ]) {
      const input = (html.match(/<input\b[^>]*>/g) ?? []).find((tag) =>
        tag.includes(`name="${field}"`),
      );
      assert.ok(input, field);
      const value = input.match(/\bvalue="([^"]*)"/)?.[1];
      assert.equal(value, expected, field);
      form.set(field, value!);
    }
    if (manufacturedAt !== 0 && expiresAt !== 0) {
      const savedAgain = parseProductSubmission(form);
      assert.deepEqual(savedAgain.errors, []);
      assert.equal(savedAgain.input?.manufacturedAt, initial.manufacturedAt);
      assert.equal(savedAgain.input?.expiresAt, initial.expiresAt);
    }
  }
});

void test('public product dates display the Nepal calendar day on a UTC host', async () => {
  const product = {
    ...revision(),
    slug: 'handmade-cup',
    sellerId: 'seller',
    tradingName: 'Cup maker',
    categoryName: 'Cups',
    purchasable: false,
  };
  const stubs: Record<string, string> = {
    'cloudflare:workers': 'exports.env={};',
    'next/navigation':
      'exports.notFound=()=>{throw Error("Unexpected missing product")};',
    '@/lib/db/d1': 'exports.requireDatabase=()=>({});',
    '@/lib/db/repositories/products':
      'exports.getPublishedProductBySlug=async()=>fixture.product;exports.getUnavailablePublishedProductBySlug=async()=>null;',
    '@/lib/db/repositories/delivery-rates':
      'exports.getDeliveryRates=async()=>[];',
    '@/lib/auth/customer': 'exports.getCustomerReadContext=async()=>({customer:null,authenticated:false});',
    '@/lib/db/repositories/customers':
      'exports.listPublishedReviews=async()=>[];exports.isWishlisted=async()=>false;exports.getReviewableOrderItem=async()=>null;',
    '@/lib/db/repositories/review-extras':
      'exports.getReviewExtras=async()=>({photos:[],replies:[]});',
    '@/lib/seo/discovery':
      'exports.publicUrl=path=>path;exports.productStructuredData=()=>({});exports.safeJsonLd=JSON.stringify;exports.publishedRating=async()=>({count:0,average:null});',
    '@/app/auth': 'exports.signInPath=path=>path;',
  };
  const compiled = await build({
    entryPoints: ['app/products/[slug]/page.tsx'],
    jsx: 'automatic',
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [
      {
        name: 'product-date-page-fixture',
        setup(builder) {
          stubFixtureLink(builder);
          builder.onResolve({ filter: /.*/ }, ({ path }) =>
            path in stubs
              ? { path, namespace: 'product-date-fixture' }
              : undefined,
          );
          builder.onLoad(
            { filter: /.*/, namespace: 'product-date-fixture' },
            ({ path }) => ({ contents: stubs[path], loader: 'js' }),
          );
          builder.onResolve({ filter: /^@\/components\// }, ({ path }) => ({
            path,
            namespace: 'product-date-components',
          }));
          builder.onLoad(
            { filter: /.*/, namespace: 'product-date-components' },
            () => ({
              contents:
                'exports.ProductOfferProvider=({children})=>children;exports.ProductOfferPrice=exports.OfferAddToCart=exports.ProductDelivery=exports.ProductGallery=exports.SiteFooter=exports.SiteHeader=exports.WishlistButton=exports.ReviewForm=exports.ReviewPhotos=exports.PublicSellerReply=exports.RecentlyViewed=()=>null;',
              loader: 'js',
            }),
          );
        },
      },
    ],
  });
  class UtcHostDate extends Date {
    override toLocaleDateString(
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): string {
      return super.toLocaleDateString(locales, { timeZone: 'UTC', ...options });
    }
  }
  const renderedModule = {
    exports: {} as {
      default: (props: {
        params: Promise<{ slug: string }>;
      }) => Promise<ReactNode>;
    },
  };
  runInNewContext(compiled.outputFiles[0].text, {
    require: createRequire(import.meta.url),
    module: renderedModule,
    exports: renderedModule.exports,
    process,
    Date: UtcHostDate,
    fixture: { product },
  });
  product.preparationDays = 0;
  const waitingHtml = renderToStaticMarkup(await renderedModule.exports.default({ params: Promise.resolve({ slug: product.slug }) }));
  assert.match(waitingHtml, /Ordering is not available yet\./);
  assert.doesNotMatch(waitingHtml, /Ready to dispatch|Delivery estimate/);
  for (const [manufacturedAt, expiresAt, manufactureDay, expiryDay] of [
    [1792347300000, 1792433700000, '10/19/2026', '10/20/2026'],
    [473364900000, 473451300000, '1/1/1985', '1/2/1985'],
    [0, 86400000, '1/1/1970', '1/2/1970'],
    [86400000, 0, '1/2/1970', '1/1/1970'],
  ] as const) {
    product.manufacturedAt = manufacturedAt;
    product.expiresAt = expiresAt;
    const html = renderToStaticMarkup(
      await renderedModule.exports.default({
        params: Promise.resolve({ slug: product.slug }),
      }),
    );
    const details =
      html.match(/<dt\b[^>]*>[\s\S]*?<\/dt>\s*<dd\b[^>]*>[\s\S]*?<\/dd>/g) ??
      [];
    assert.ok(
      details
        .find((detail) => />Manufactured<\/dt>/.test(detail))
        ?.includes(`>${manufactureDay}<`),
      manufactureDay,
    );
    assert.ok(
      details
        .find((detail) => />Expiry<\/dt>/.test(detail))
        ?.includes(`>${expiryDay}<`),
      expiryDay,
    );
  }
});
