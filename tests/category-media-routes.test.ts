import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import sharp from 'sharp';
import type { SharpConstructor } from '../node_modules/sharp/dist/index.d.mts';
import { can, type PermissionSubject } from '../lib/marketplace/permissions';
import { categoryMediaDb } from './helpers/category-media-db';

const globals = globalThis as typeof globalThis & {
  categoryRouteDb: D1Database;
  categoryRouteBucket: R2Bucket;
  categoryRouteActor: (PermissionSubject & { id: string }) | null;
  categoryRouteCan: typeof can;
};
globals.categoryRouteCan = can;
registerHooks({ resolve(specifier, context, nextResolve) {
  const stubs: Record<string, string> = {
    'cloudflare:workers': 'export const env={get DB(){return globalThis.categoryRouteDb},get MEDIA(){return globalThis.categoryRouteBucket}}',
    '@/lib/auth/staff': 'export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){const actor=globalThis.categoryRouteActor;if(!actor)throw new StaffAuthorizationError("Authentication required",401);if(!globalThis.categoryRouteCan(actor,permission))throw new StaffAuthorizationError("Staff permission required",403);return actor}',
  };
  return stubs[specifier] ? { url: `data:text/javascript,${encodeURIComponent(stubs[specifier])}`, shortCircuit: true } : nextResolve(specifier, context);
} });

async function fixture() {
  const f = await categoryMediaDb();
  for (const id of ['staff-one', 'staff-two']) {
    await f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,'Fictional staff','active',1,1)").bind(id, `${id}@example.invalid`).run();
    await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'super_admin',1)").bind(id).run();
  }
  await f.db.prepare("INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('food','food','Food',1,1,1,1)").run();
  await f.db.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('catalog-v1','staff.catalog',1,'published','{"formId":"staff.catalog","fields":[]}','Fixture configuration','staff-one',1,'staff-one',1,'staff-one',1,'fixture-config')`).run();
  const objects = new Map<string, Uint8Array>();
  const gets: string[] = [];
  const bucket = {
    async put(key: string, bytes: Uint8Array) { objects.set(key, new Uint8Array(bytes)); },
    async delete(key: string) { objects.delete(key); },
    async get(key: string) { gets.push(key); const bytes = objects.get(key); return bytes ? { body: new Blob([new Uint8Array(bytes)]).stream(), httpEtag: '"fixture"' } : null; },
  } as unknown as R2Bucket;
  globals.categoryRouteDb = f.db;
  globals.categoryRouteBucket = bucket;
  globals.categoryRouteActor = { id: 'staff-one', role: 'super_admin' };
  return { ...f, objects, gets };
}

async function imageFile(colour = '#ba4128') {
  const bytes = await (sharp as SharpConstructor)({ create: { width: 80, height: 60, channels: 3, background: colour } }).png().toBuffer();
  return new File([new Uint8Array(bytes)], 'fictional-category.png', { type: 'image/png' });
}

async function upload(file: File, requestId: string, origin = 'https://category.test') {
  const { POST } = await import('../app/api/admin/catalog/category-media/route');
  const form = new FormData(); form.set('file', file); form.set('requestId', requestId);
  return POST(new Request('https://category.test/api/admin/catalog/category-media', { method: 'POST', headers: { Origin: origin }, body: form }));
}

async function saved(body: Record<string, unknown>) {
  const { POST } = await import('../app/api/admin/catalog/route');
  return POST(new Request('https://category.test/api/admin/catalog', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://category.test' },
    body: JSON.stringify({ kind: 'category', id: 'food', slug: 'food', nameEn: 'Food', nameNe: 'Food', sortOrder: 1, isActive: true, formVersion: 1, customAnswers: [], ...body }) }));
}

async function publicImage(id: string) {
  const { GET } = await import('../app/api/categories/image/[id]/route');
  return GET(new Request(`https://category.test/api/categories/image/${id}`), { params: Promise.resolve({ id }) });
}

void test('category upload enforces staff permission, trusted origin, bounded raster content and exact replay', async () => {
  const f = await fixture();
  try {
    const file = await imageFile();
    globals.categoryRouteActor = null;
    assert.equal((await upload(file, 'upload-no-auth')).status, 401);
    for (const role of ['customer', 'seller'] as const) {
      globals.categoryRouteActor = { id: 'staff-one', role };
      assert.equal((await upload(file, `upload-${role}`)).status, 403);
    }
    globals.categoryRouteActor = { id: 'staff-one', role: 'admin', permissions: [] };
    assert.equal((await upload(file, 'upload-revoked-admin')).status, 403);
    globals.categoryRouteActor = { id: 'staff-one', role: 'super_admin' };
    assert.equal((await upload(file, 'upload-cross-site', 'https://external.invalid')).status, 403);
    assert.equal((await upload(new File(['<svg/>'], 'fixture.svg', { type: 'image/svg+xml' }), 'upload-svg')).status, 400);
    assert.equal((await upload(new File([await file.arrayBuffer()], 'wrong.jpg', { type: 'image/jpeg' }), 'upload-mime-mismatch')).status, 400);
    assert.equal((await upload(new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }), 'upload-large')).status, 400);
    assert.equal(f.objects.size, 0);
    const first = await upload(file, 'upload-valid');
    assert.equal(first.status, 201);
    const result = await first.json() as { media: { id: string } };
    assert.match(result.media.id, /^[0-9a-f-]{36}$/);
    const replay = await upload(file, 'upload-valid');
    assert.equal(replay.status, 201);
    assert.equal((await replay.json() as { media: { id: string } }).media.id, result.media.id);
    assert.equal((await upload(await imageFile('#103456'), 'upload-valid')).status, 400);
    assert.equal(f.objects.size, 1);
    const metadata = await (sharp as SharpConstructor)([...f.objects.values()][0]).metadata();
    assert.equal(metadata.format, 'webp');
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='catalog.category.image_uploaded'").first<{ count: number }>())?.count, 1);
  } finally { f.dispose(); }
});

void test('category image remains private until saved, supports legacy saves and revokes removed or inactive public access', async () => {
  const f = await fixture();
  try {
    const first = await upload(await imageFile(), 'upload-first');
    assert.equal(first.status, 201);
    const imageId = (await first.json() as { media: { id: string } }).media.id;
    assert.equal((await publicImage(imageId)).status, 404);
    assert.equal(f.gets.length, 0, 'Unattached upload must not touch public storage.');
    const { GET: preview } = await import('../app/api/admin/catalog/category-media/[id]/route');
    assert.equal((await preview(new Request('https://category.test/preview'), { params: Promise.resolve({ id: imageId }) })).status, 200);
    globals.categoryRouteActor = { id: 'staff-two', role: 'super_admin' };
    assert.equal((await preview(new Request('https://category.test/preview'), { params: Promise.resolve({ id: imageId }) })).status, 404);
    assert.equal((await saved({ idempotencyKey: 'foreign-attach', imageId, expectedImageId: null })).status, 409);
    globals.categoryRouteActor = { id: 'staff-one', role: 'super_admin' };
    assert.equal((await saved({ idempotencyKey: 'attach-one', imageId, expectedImageId: null })).status, 201);
    assert.equal((await saved({ idempotencyKey: 'legacy-edit', nameEn: 'Food selection' })).status, 201);
    assert.equal((await publicImage(imageId)).status, 200);
    const response = await publicImage(imageId);
    assert.equal(response.headers.get('Content-Type'), 'image/webp');
    assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal((await saved({ idempotencyKey: 'retire-category', isActive: false })).status, 201);
    assert.equal((await publicImage(imageId)).status, 404);
    assert.equal((await saved({ idempotencyKey: 'reactivate-category', isActive: true })).status, 201);
    const second = await upload(await imageFile('#203040'), 'upload-second');
    const nextId = (await second.json() as { media: { id: string } }).media.id;
    assert.equal((await saved({ idempotencyKey: 'replace-image', imageId: nextId, expectedImageId: imageId })).status, 201);
    assert.equal((await publicImage(imageId)).status, 404);
    assert.equal((await publicImage(nextId)).status, 200);
    assert.equal((await saved({ idempotencyKey: 'stale-remove', imageId: null, expectedImageId: imageId })).status, 409);
    assert.equal((await saved({ idempotencyKey: 'remove-image', imageId: null, expectedImageId: nextId })).status, 201);
    assert.equal((await publicImage(nextId)).status, 404);
    assert.equal(f.objects.size, 2, 'Retain previous assets for audited history.');
  } finally { f.dispose(); }
});

void test('category image upload cleans storage when the guarded database transaction fails', async () => {
  const f = await fixture();
  try {
    f.db.batch = async () => { throw new Error('Simulated storage failure'); };
    assert.equal((await upload(await imageFile(), 'upload-db-failure')).status, 500);
    assert.equal(f.objects.size, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM category_media').first<{ count: number }>())?.count, 0);
  } finally { f.dispose(); }
});

void test('category upload rechecks current authority inside the transaction and removes the pending object on revocation', async () => {
  const f = await fixture();
  try {
    const originalBatch = f.db.batch.bind(f.db);
    f.db.batch = async (statements) => {
      await f.db.prepare("UPDATE users SET status='disabled' WHERE id='staff-one'").run();
      return originalBatch(statements);
    };
    assert.equal((await upload(await imageFile(), 'upload-authority-race')).status, 500);
    assert.equal(f.objects.size, 0);
    assert.equal((await f.db.prepare('SELECT COUNT(*) AS count FROM category_media').first<{ count: number }>())?.count, 0);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='catalog.category.image_uploaded'").first<{ count: number }>())?.count, 0);
  } finally { f.dispose(); }
});

void test('new category can atomically claim its pending uploaded image with the existing catalogue form', async () => {
  const f = await fixture();
  try {
    const uploaded = await upload(await imageFile(), 'upload-new-category');
    const imageId = (await uploaded.json() as { media: { id: string } }).media.id;
    const result = await saved({ id: undefined, slug: 'fictional-category', nameEn: 'Fictional category', idempotencyKey: 'create-with-image', imageId, expectedImageId: null });
    assert.equal(result.status, 201);
    const id = (await result.json() as { id: string }).id;
    assert.equal((await f.db.prepare('SELECT category_id AS categoryId FROM category_media WHERE id=?').bind(imageId).first<{ categoryId: string }>())?.categoryId, id);
    assert.equal((await publicImage(imageId)).status, 200);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE request_id='create-with-image'").first<{ count: number }>())?.count, 1);
  } finally { f.dispose(); }
});

void test('image assignment honors current catalogue form version and required custom answers', async () => {
  const f = await fixture();
  try {
    const uploaded = await upload(await imageFile(), 'upload-required-review');
    const imageId = (await uploaded.json() as { media: { id: string } }).media.id;
    const config = JSON.stringify({ formId: 'staff.catalog', fields: [{ id: 'review_note', key: 'review_note', label: 'Review note', type: 'short_text', required: true, order: 0, status: 'active' }] });
    await f.db.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('catalog-v2','staff.catalog',2,'published',?,'Required review fixture','staff-one',2,'staff-one',2,'staff-one',2,'fixture-config-v2')`).bind(config).run();
    assert.equal((await saved({ idempotencyKey: 'stale-form-image', imageId, expectedImageId: null })).status, 409);
    assert.equal((await saved({ idempotencyKey: 'missing-review-image', formVersion: 2, imageId, expectedImageId: null })).status, 400);
    assert.equal((await publicImage(imageId)).status, 404);
    assert.equal((await saved({ idempotencyKey: 'reviewed-image', formVersion: 2, customAnswers: [{ fieldId: 'review_note', value: 'Fictional visual review' }], imageId, expectedImageId: null })).status, 201);
    const stored = await f.db.prepare('SELECT config_version_id AS versionId,answers_json AS answers FROM form_answer_sets WHERE request_id=?').bind('reviewed-image').first<{ versionId: string; answers: string }>();
    assert.equal(stored?.versionId, 'catalog-v2');
    assert.match(stored!.answers, /Fictional visual review/);
  } finally { f.dispose(); }
});
