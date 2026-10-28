import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { hashOpaqueToken, RECEIPT_COOKIE } from '../lib/cart/session';

const fixture = {
  name: 'नेपाली.jpg',
  receiptHash: '',
  mimeType: 'image/jpeg',
  bytes: new Uint8Array([255, 216, 255, 217]),
};
(
  globalThis as typeof globalThis & { evidenceDownloadFixture: typeof fixture }
).evidenceDownloadFixture = fixture;
registerHooks({
  resolve(specifier, context, next) {
    const modules: Record<string, string> = {
      'cloudflare:workers': `export const env={DB:{prepare(){}},MEDIA:{async get(){return {body:new Response(globalThis.evidenceDownloadFixture.bytes).body}}}};`,
      '@/app/auth': 'export async function getAuthenticatedUser(){return null}',
      '@/lib/db/repositories/returns': `export async function getReturnEvidenceAccess(){const f=globalThis.evidenceDownloadFixture;return {objectKey:'private/evidence',originalName:f.name,mimeType:f.mimeType,receiptTokenHash:f.receiptHash,sellerId:'seller'}}`,
      '@/lib/db/repositories/staff-permissions':
        'export async function hasStaffPermissionBySubject(){return false}',
    };
    if (specifier in modules)
      return {
        url: 'data:text/javascript,' + encodeURIComponent(modules[specifier]),
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});

void test('authorized return evidence preserves Nepali names in a valid UTF-8 download header', async () => {
  fixture.receiptHash = await hashOpaqueToken('fictional-evidence-receipt');
  const { GET } = await import('../app/api/return-evidence/[id]/route');
  for (const name of [
    'नेपाली.jpg',
    "maker's (photo)*.jpg",
    'a'.repeat(500) + '.jpg',
    'bad\r\n"\\name.jpg',
  ]) {
    fixture.name = name;
    const response = await GET(
      new Request('https://example.test/api/return-evidence/e', {
        headers: { cookie: `${RECEIPT_COOKIE}=fictional-evidence-receipt` },
      }),
      { params: Promise.resolve({ id: 'e' }) },
    );
    assert.equal(response.status, 200);
    assert.deepEqual(
      new Uint8Array(await response.arrayBuffer()),
      fixture.bytes,
    );
    const disposition = response.headers.get('content-disposition')!;
    assert.match(
      disposition,
      /^inline; filename="[\x20-\x7e]+"; filename\*=UTF-8''/,
    );
    assert.ok(disposition.length < 2500);
    assert.doesNotMatch(disposition, /[\r\n]/);
    if (name === 'नेपाली.jpg')
      assert.equal(
        decodeURIComponent(disposition.split("UTF-8''")[1]),
        'नेपाली.jpg',
      );
    if (name.includes("maker's")) assert.match(disposition, /%27/);
    assert.match(response.headers.get('cache-control')!, /private, no-store/);
  }
  const denied = await GET(
    new Request('https://example.test/api/return-evidence/e'),
    { params: Promise.resolve({ id: 'e' }) },
  );
  assert.equal(denied.status, 403);
});

void test('private PDF evidence downloads with sandbox protection and unknown types never render as HTML', async () => {
  fixture.receiptHash = await hashOpaqueToken('fictional-evidence-receipt');
  const { GET } = await import('../app/api/return-evidence/[id]/route');
  try {
    fixture.name = 'certificate.cmd';
    for (const mime of ['application/pdf','text/html']) {
      fixture.mimeType = mime;
      const response = await GET(new Request('https://example.test/api/return-evidence/e', {
        headers:{cookie:`${RECEIPT_COOKIE}=fictional-evidence-receipt`},
      }), {params:Promise.resolve({id:'e'})});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-type'),mime === 'application/pdf' ? mime : 'application/octet-stream');
      assert.match(response.headers.get('content-disposition')!,/^attachment;/);
      assert.match(response.headers.get('content-disposition')!,mime === 'application/pdf' ? /certificate\.cmd\.pdf/ : /certificate\.cmd\.bin/);
      assert.match(response.headers.get('content-security-policy')!,/sandbox/);
      assert.equal(response.headers.get('x-content-type-options'),'nosniff');
    }
  } finally {fixture.mimeType='image/jpeg';}
});
