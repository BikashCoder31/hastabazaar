import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { createCustomerReturnRequest } from '../lib/db/repositories/returns';
import { commerceOrderFixture } from './helpers/commerce-order-fixture';

type Seller = { userId: string; sellerId: string; authSubject: string };
declare global {
  var dispatchEvidenceFixture: { db: D1Database; bucket: R2Bucket; seller: Seller | null; staff: boolean };
}
const stub = (source: string) => ({ url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true });
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === 'cloudflare:workers') return stub(`export const env={
    get DB(){return globalThis.dispatchEvidenceFixture.db},get MEDIA(){return globalThis.dispatchEvidenceFixture.bucket},
    APP_ORIGIN:'https://dispatch-evidence.test',HASTABAZAAR_RUNTIME_ENV:'test',HASTABAZAAR_RELEASE_ID:'fictional-dispatch-evidence'
  };`);
  if (specifier === '@/lib/auth/seller') return stub(`
    export class SellerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status;}}
    export async function requireSellerApi(){const seller=globalThis.dispatchEvidenceFixture.seller;
      if(!seller)throw new SellerAuthorizationError('Authentication required',401);return seller;}
  `);
  if (specifier === '@/lib/auth/staff') return stub(`
    export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status;}}
    export async function requireStaffApi(permission){if(permission!=='support.manage'||!globalThis.dispatchEvidenceFixture.staff)
      throw new StaffAuthorizationError('Evidence permission required',403);return {id:'owner',role:'super_admin'};}
  `);
  return nextResolve(specifier, context);
} });

const png = (colour: 'black' | 'white') => Buffer.from(colour === 'black'
  ? 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWNgYGAAAAAEAAGjChXjAAAAAElFTkSuQmCC'
  : 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAADElEQVQImWP4//8/AAX+Av5Y8msOAAAAAElFTkSuQmCC', 'base64');

void test('dispatch photos require the exact seller/item before handoff and remain privately readable after uploads stop', async () => {
  const { SELLER_DISPATCH_PHOTO_UPLOAD, SELLER_DISPATCH_PHOTO_READ } = await import('../lib/orders/seller-dispatch-evidence');
  const upload = await import('../app/api/seller/orders/[id]/dispatch-evidence/route');
  const download = await import('../app/api/admin/returns/[id]/dispatch-evidence/[photoId]/route');
  const f = await commerceOrderFixture(true);
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    const objects = new Map<string, ArrayBuffer>();
    const reads: string[] = [];
    let afterPut: (() => void) | undefined;
    const bucket = {
      async put(key: string, body: ReadableStream) {
        objects.set(key, await new Response(body).arrayBuffer());
        afterPut?.();
      },
      async delete(key: string) { objects.delete(key); },
      async get(key: string) { reads.push(key); return objects.has(key) ? { body: objects.get(key) } : null; },
    } as unknown as R2Bucket;
    const owner = (sellerId: string) => f.sqlite.prepare(`SELECT s.id AS sellerId,u.id AS userId,u.auth_subject AS authSubject
      FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=?`).get(sellerId) as Seller;
    globalThis.dispatchEvidenceFixture = { db: f.database, bucket, seller: owner('seller-a'), staff: false };
    const itemId = String(f.sqlite.prepare("SELECT id FROM order_items WHERE seller_id='seller-a'").get()?.id);
    const origin = 'https://dispatch-evidence.test';
    const post = (requestId: string, colour: 'black' | 'white' = 'black', type = 'image/png') => {
      const body = new FormData();
      body.set('orderItemId', itemId);
      body.set('requestId', requestId);
      body.set('file', new File([new Uint8Array(png(colour))], 'private-original-name.png', { type }));
      return upload.POST(new Request(`${origin}/api/seller/orders/${f.orderId}/dispatch-evidence`, {
        method: 'POST', headers: { origin }, body,
      }), { params: Promise.resolve({ id: f.orderId }) });
    };

    assert.equal((await post('dispatch-photo-original')).status, 404);
    Object.assign(f.database, { [SELLER_DISPATCH_PHOTO_UPLOAD]: true });
    globalThis.dispatchEvidenceFixture.seller = owner('seller-b');
    assert.equal((await post('dispatch-photo-cross-seller')).status, 404);
    assert.equal(objects.size, 0);
    globalThis.dispatchEvidenceFixture.seller = owner('seller-a');
    assert.equal((await post('dispatch-photo-false-video', 'black', 'video/mp4')).status, 400);
    assert.equal(objects.size, 0);

    const response = await post('dispatch-photo-original');
    const saved = await response.json() as { id: string };
    assert.equal(response.status, 201, JSON.stringify(saved));
    assert.equal(typeof saved.id, 'string');
    assert.match(response.headers.get('cache-control') ?? '', /no-store/);
    assert.equal(objects.size, 1);
    assert.equal((await (await post('dispatch-photo-original')).json() as { id: string }).id, saved.id);
    assert.equal((await post('dispatch-photo-original', 'white')).status, 409);
    assert.equal(objects.size, 1);

    const originalSubject = owner('seller-a').authSubject;
    afterPut = () => f.sqlite.prepare("UPDATE users SET auth_subject='changed-fictional-seller' WHERE id='user-a'").run();
    assert.equal((await post('dispatch-photo-authority-race')).status, 409);
    afterPut = undefined;
    f.sqlite.prepare("UPDATE users SET auth_subject=? WHERE id='user-a'").run(originalSubject);
    assert.equal(objects.size, 1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seller_dispatch_evidence').get()?.n, 1);

    await f.deliver();
    assert.equal((await post('dispatch-photo-after-handoff')).status, 409);
    const claim = await createCustomerReturnRequest(f.database, {
      ...f.access, receiptTokenHash: null, orderItemId: itemId, quantity: 1, reason: 'defective',
      requestedResolution: 'refund', detail: 'The fictional received item needs an independent return review.',
      locale: 'en-NP', idempotencyKey: 'dispatch-photo-return-case', evidence: [], now: Date.now(),
    });
    Reflect.deleteProperty(f.database, SELLER_DISPATCH_PHOTO_UPLOAD);
    assert.equal((await post('dispatch-photo-disabled')).status, 404);
    const get = (id: string) => download.GET(new Request(`${origin}/api/admin/returns/${id}/dispatch-evidence/${saved.id}`),
      { params: Promise.resolve({ id, photoId: saved.id }) });
    globalThis.dispatchEvidenceFixture.staff = true;
    assert.equal((await get(claim.id)).status, 404);
    Object.assign(f.database, { [SELLER_DISPATCH_PHOTO_READ]: true });
    globalThis.dispatchEvidenceFixture.staff = false;
    assert.equal((await get(claim.id)).status, 403);
    globalThis.dispatchEvidenceFixture.staff = true;
    assert.equal((await get('unrelated-case')).status, 404);
    assert.equal(reads.length, 0);
    const retained = await get(claim.id);
    assert.equal(retained.status, 200, retained.status === 200 ? '' : await retained.text());
    assert.equal(retained.headers.get('cache-control'), 'private, no-store');
    assert.equal(retained.headers.get('x-content-type-options'), 'nosniff');
    assert.doesNotMatch(retained.headers.get('content-disposition') ?? '', /private-original-name/);
    assert.deepEqual(Buffer.from(await retained.arrayBuffer()), png('black'));
    assert.equal(reads.length, 1);
  } finally {
    await f.dispose();
  }
});
