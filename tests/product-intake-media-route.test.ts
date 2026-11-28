import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { AuthenticatedUser } from '../app/auth';
import { productPublicationFixture } from './helpers/product-publication-fixture';

declare global {
  var intakeMediaRouteDb: D1Database;
  var intakeMediaRouteBucket: R2Bucket;
  var intakeMediaRouteIdentity: AuthenticatedUser | null;
}

registerHooks({
  resolve(specifier, context, next) {
    let source: string | undefined;
    if (specifier === 'cloudflare:workers') {
      source = 'export const env={get DB(){return globalThis.intakeMediaRouteDb},get MEDIA(){return globalThis.intakeMediaRouteBucket}}';
    } else if (specifier === '@/app/auth') {
      source = 'export async function getAuthenticatedUser(){return globalThis.intakeMediaRouteIdentity}';
    }
    return source
      ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true }
      : next(specifier, context);
  },
});

function signIn(subject: string) {
  globalThis.intakeMediaRouteIdentity = {
    userId: subject,
    displayName: 'Fictional QA account',
    email: 'qa@example.test',
    fullName: null,
  };
}

void test('private intake media resolves the sign-in subject before checking file ownership', async () => {
  const fixture = await productPublicationFixture();
  const bytes = new Uint8Array(100).fill(23);
  let storageReads = 0;
  globalThis.intakeMediaRouteDb = fixture.db;
  globalThis.intakeMediaRouteBucket = {
    async get() {
      storageReads++;
      return {
        body: new Blob([bytes]).stream(),
        size: bytes.length,
        customMetadata: { contentDigest: 'fixture-digest', uploadId: 'photo' },
      };
    },
  } as unknown as R2Bucket;
  try {
    fixture.sqlite.exec(`
      UPDATE users SET auth_subject='provider:qa-owner' WHERE id='registered-owner';
      UPDATE users SET auth_subject='provider:qa-reviewer' WHERE id='delegate';
    `);
    const { GET } = await import('../app/api/seller/product-intakes/media/[id]/route');
    const url = 'http://localhost:3018/api/seller/product-intakes/media/photo';
    const get = (suffix = '') => GET(new Request(url + suffix), { params: Promise.resolve({ id: 'photo' }) });

    globalThis.intakeMediaRouteIdentity = null;
    assert.equal((await get()).status, 401);
    signIn('foreign');
    assert.equal((await get()).status, 403);
    signIn('provider:qa-reviewer');
    assert.equal((await get()).status, 403, 'Staff need the case the seller shared.');
    assert.equal(storageReads, 0);

    signIn('provider:qa-owner');
    const ownerResponse = await get();
    assert.equal(ownerResponse.status, 200, await ownerResponse.clone().text());
    assert.equal(ownerResponse.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(new Uint8Array(await ownerResponse.arrayBuffer()), bytes);

    signIn('provider:qa-reviewer');
    const reviewerResponse = await get('?caseId=' + fixture.sent.caseId);
    assert.equal(reviewerResponse.status, 200, await reviewerResponse.clone().text());
    assert.deepEqual(new Uint8Array(await reviewerResponse.arrayBuffer()), bytes);
  } finally {
    fixture.dispose();
  }
});
