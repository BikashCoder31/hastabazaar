import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { compileFunction } from 'node:vm';
import { build } from 'esbuild';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readProductPreview } from '../app/admin/products/preview/[id]/preview-data';
import { getPublishedProductBySlug } from '../lib/db/repositories/products';
import { saveProductWorkspace } from '../lib/products/intake-workspace';
import { productPublicationFixture, publicationSnapshot } from './helpers/product-publication-fixture';
import { stubFixtureImage, stubFixtureLink } from './helpers/browser-fixture-link';

void test('private storefront preview projects the exact owner draft and the submitted catalog candidate separately', async () => {
  const matrix = publicationSnapshot().offers;
  matrix.axes = [{ id: 'size', label: 'Size', values: [{ id: 'small', label: 'Small' }, { id: 'large', label: 'Large' }] }];
  matrix.offers = [
    { ...matrix.offers[0], selection: { size: 'small' } },
    { ...matrix.offers[0], id: 'large', price: '950', selection: { size: 'large' }, mediaId: 'large-photo' },
  ];
  const f = await productPublicationFixture('', undefined, true, matrix, ['large-photo']);
  try {
    const draftId = f.attached.id;
    const caseId = f.sent.caseId;
    f.sqlite.exec("UPDATE users SET auth_subject='seller-sign-in' WHERE id='registered-owner'; UPDATE users SET auth_subject='reviewer-sign-in' WHERE id='reviewer'; UPDATE staff_permission_profiles SET permissions_json='[\"product.publish\"]' WHERE user_id='delegate'");
    const later = await saveProductWorkspace(f.db, { ...f.ctx, requestId: 'preview-private-edit', expectedRevision: String(f.attached.revision), now: f.now + 4 }, {
      ...f.input, answers: { ...f.input.answers, nameEn: 'Updated private title' },
    });
    const current = await readProductPreview(f.db, 'seller-sign-in', draftId, 'draft');
    assert.ok(current);
    assert.equal(current.versionId, later.versionId);
    assert.equal(current.product.nameEn, 'Updated private title');
    assert.equal(current.product.preparationDays, 2);
    assert.deepEqual(current.product.media.map(photo => photo.id), ['photo', 'large-photo']);
    assert.equal(current.product.offerSet?.display.pricePaisa, 80000);
    assert.equal(current.product.offerSet?.display.maximumPricePaisa, 95000);
    assert.equal(current.product.offerSet?.offers[1].selection[0].value, 'Large');
    assert.equal(current.product.offerSet?.offers[1].mediaId, 'large-photo');
    assert.equal(current.product.purchasable, false);
    assert.doesNotMatch(JSON.stringify(current.product), /Private review note|Private licence reference|stockIntent/);

    const submitted = await readProductPreview(f.db, 'reviewer-sign-in', caseId, 'case');
    assert.ok(submitted);
    assert.equal(submitted.versionId, f.sent.versionId);
    assert.equal(submitted.product.nameEn, 'Fictional new cup');
    assert.equal(submitted.product.descriptionEn, 'One unused ceramic cup.');
    assert.equal(await readProductPreview(f.db, 'reviewer-sign-in', draftId, 'draft'), null);
    assert.equal(await readProductPreview(f.db, 'maker-user', draftId, 'draft'), null);
    assert.equal(await readProductPreview(f.db, 'delegate', caseId, 'case'), null);
    assert.equal(await readProductPreview(f.db, 'customer', caseId, 'case'), null);
    assert.equal(await readProductPreview(f.db, null, caseId, 'case'), null);
    assert.equal(await getPublishedProductBySlug(f.db, f.sqlite.prepare('SELECT slug FROM products WHERE name_en=?').get('Fictional new cup')?.slug as string), null);
  } finally {
    f.dispose();
  }
});

void test('product preview pages and photos have the same current access boundary and leave the storefront unpublished', async () => {
  const f = await productPublicationFixture('', undefined, true);
  try {
    const paths = {
      page: 'app/admin/products/preview/[id]/page.tsx',
      media: 'app/admin/products/preview/[id]/media/[mediaId]/route.ts',
    };
    const stubs: Record<string, string> = {
      'cloudflare:workers': 'exports.env=fixture.env;',
      '@/app/auth': 'exports.getAuthenticatedUser=async()=>fixture.subject?{userId:fixture.subject}:null;',
      'next/navigation': 'exports.notFound=()=>{throw Object.assign(new Error("Not found"),{status:404});};',
    };
    const compiled = await build({
      entryPoints: paths, outdir: 'product-preview-test-fixture', jsx: 'automatic',
      platform: 'node', format: 'cjs', bundle: true, write: false,
      external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
      plugins: [{
        name: 'product-preview-test-runtime',
        setup(builder) {
          stubFixtureLink(builder);
          stubFixtureImage(builder);
          builder.onResolve({ filter: /.*/ }, ({ path }) => path in stubs ? { path, namespace: 'product-preview-test-runtime' } : undefined);
          builder.onLoad({ filter: /.*/, namespace: 'product-preview-test-runtime' }, ({ path }) => ({ contents: stubs[path], loader: 'js' }));
        },
      }],
    });
    let bucketReads = 0;
    const fixture = {
      subject: null as string | null,
      env: {
        DB: f.db,
        MEDIA: {
          async get(key: string) {
            bucketReads++;
            assert.equal(key, 'private/fictional-cup.png');
            return { body: new Response(new Uint8Array(100)).body, size: 100, customMetadata: { contentDigest: 'fixture-digest', uploadId: 'photo' } };
          },
        },
      },
    };
    const require = createRequire(import.meta.url);
    function load<T>(file: 'page' | 'media') {
      const source = compiled.outputFiles.find(output => output.path.endsWith(`/${file}.js`));
      assert.ok(source);
      const loaded = { exports: {} as T };
      const run = compileFunction(source.text, ['require', 'module', 'exports', 'fixture']);
      run(require, loaded, loaded.exports, fixture);
      return loaded.exports;
    }
    const page = load<{
      default: (props: { params: Promise<{ id: string }>; searchParams: Promise<{ source?: string }> }) => Promise<ReactNode>;
      metadata: { robots: { index: boolean; follow: boolean; nocache: boolean }; referrer: string };
      dynamic: string; revalidate: number;
    }>('page');
    const media = load<{
      GET: (request: Request, context: { params: Promise<{ id: string; mediaId: string }> }) => Promise<Response>;
    }>('media');
    const draftId = f.attached.id;
    const caseId = f.sent.caseId;
    const render = (id: string, source?: string) => page.default({ params: Promise.resolve({ id }), searchParams: Promise.resolve({ source }) });
    const photo = (id: string, version: string, source = '') => media.GET(
      new Request(`http://localhost:3018/admin/products/preview/${id}/media/photo?version=${version}${source}`),
      { params: Promise.resolve({ id, mediaId: 'photo' }) },
    );
    const notFound = { status: 404 };

    await assert.rejects(render(caseId, 'case'), notFound);
    assert.equal((await photo(caseId, f.sent.versionId, '&source=case')).status, 404);
    fixture.subject = 'maker-user';
    await assert.rejects(render(draftId), notFound);
    assert.equal((await photo(draftId, f.attached.versionId)).status, 404);
    assert.equal(bucketReads, 0);

    fixture.subject = 'registered-owner';
    const ownerHtml = renderToStaticMarkup(await render(draftId));
    assert.match(ownerHtml, /Preview — not live/);
    assert.match(ownerHtml, /Fictional new cup/);
    assert.match(ownerHtml, /Delivery estimate/);
    assert.match(ownerHtml, /\/seller\/products\/new\?draftId=/);
    assert.doesNotMatch(ownerHtml, /Add to cart|Buy now|Review this item|\/checkout|application\/ld\+json|Private review note/);
    const ownerPhoto = await photo(draftId, f.attached.versionId);
    assert.equal(ownerPhoto.headers.get('cache-control'), 'private, no-store');
    assert.equal(ownerPhoto.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(ownerPhoto.headers.get('content-type'), 'image/png');
    assert.equal((await ownerPhoto.arrayBuffer()).byteLength, 100);
    assert.equal((await photo(draftId, 'an-earlier-source-version')).status, 404);

    fixture.subject = 'delegate';
    const staffHtml = renderToStaticMarkup(await render(caseId, 'publication'));
    assert.match(staffHtml, /Fictional new cup/);
    assert.match(staffHtml, /\/admin\/products\/publications\?case=/);
    assert.equal((await photo(caseId, f.sent.versionId, '&source=publication')).status, 200);
    f.sqlite.exec("UPDATE staff_permission_profiles SET permissions_json='[\"support.manage\"]' WHERE user_id='delegate'");
    await assert.rejects(render(caseId, 'case'), notFound);
    assert.equal((await photo(caseId, f.sent.versionId, '&source=case')).status, 404);
    assert.equal(bucketReads, 2);
    assert.deepEqual(page.metadata.robots, { index: false, follow: false, nocache: true });
    assert.equal(page.metadata.referrer, 'no-referrer');
    assert.equal(page.dynamic, 'force-dynamic');
    assert.equal(page.revalidate, 0);
  } finally {
    f.dispose();
  }
});
