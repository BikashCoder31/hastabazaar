import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { LocalMediaBucket } from '../lib/runtime/node-bindings';
import { categoryMediaDb } from './helpers/category-media-db';

const state = globalThis as typeof globalThis & {
  videoDb: D1Database; videoBucket: R2Bucket; videoSubject: string | null;
};
registerHooks({ resolve(specifier, context, next) {
  const source = specifier === 'cloudflare:workers'
    ? 'export const env={get DB(){return globalThis.videoDb},get MEDIA(){return globalThis.videoBucket}}'
    : specifier === '@/app/auth'
      ? 'export async function getAuthenticatedUser(){return globalThis.videoSubject?{userId:globalThis.videoSubject}:null}'
      : undefined;
  return source ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true } : next(specifier, context);
}});

async function fixture(size = 1024) {
  const database = await categoryMediaDb();
  const root = await mkdtemp(join(tmpdir(), 'hatskala-video-range-'));
  const bucket = new LocalMediaBucket(root) as unknown as R2Bucket;
  state.videoDb = database.db;
  state.videoBucket = bucket;
  state.videoSubject = null;
  for (const [id, role] of [['owner', 'seller'], ['other', 'customer'], ['reviewer', 'super_admin']]) {
    database.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES (?,?,?,'Fictional','active',1,1)").run(id, id, id + '@example.test');
    database.sqlite.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,?,1)').run(id, role);
  }
  database.sqlite.exec("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES ('s','owner','Fictional','Fictional','Local','REG','PAN','PAN','Fictional','9800000000','fixture@example.test','Madhesh','Dhanusha','Janakpur','Ward 1','approved',1,1);INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('c','c','Craft',1,1,1,1);INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) VALUES ('p','s','c','p','p','Fictional','Fictional',10000,2,'Maker','NP','Craft',1,'published',1,1);INSERT INTO product_media(id,product_id,object_key,original_name,mime_type,size_bytes,alt_en,sort_order,created_at) VALUES ('v','p','private/product-media/s/p/v','fixture.mp4','video/mp4',1024,'Fictional',0,1)");
  const bytes = Uint8Array.from({ length: size }, (_, index) => index % 251);
  await bucket.put('private/product-media/s/p/v', bytes, { httpMetadata: { contentType: 'video/mp4' } });
  return { ...database, root, bucket, bytes, async close() {
    database.dispose();
    await rm(root, { recursive: true, force: true });
  } };
}
async function get(headers: Record<string, string> = {}) {
  const { GET } = await import('../app/api/product-media/[id]/route');
  return GET(new Request('https://video.test/api/product-media/v', { headers }), { params: Promise.resolve({ id: 'v' }) });
}

void test('MP4 seeking transfers only requested native bytes with correct private response headers', async () => {
  const f = await fixture();
  try {
    const response = await get({ Range: 'bytes=100-199' });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('content-range'), 'bytes 100-199/1024');
    assert.equal(response.headers.get('content-length'), '100');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-type'), 'video/mp4');
    assert.match(response.headers.get('etag')!, /^"[a-f0-9]{64}"$/);
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes.slice(100, 200));
    const full = await get();
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-length'), '1024');
    assert.deepEqual(new Uint8Array(await full.arrayBuffer()), f.bytes);
  } finally { await f.close(); }
});

void test('MP4 range boundaries, suffixes, invalid ranges and multipart policy have bounded outcomes', async () => {
  const f = await fixture();
  try {
    for (const [range, contentRange, expected] of [
      ['bytes=1020-', 'bytes 1020-1023/1024', f.bytes.slice(1020)],
      ['bytes=-4', 'bytes 1020-1023/1024', f.bytes.slice(1020)],
      ['bytes=1020-9999', 'bytes 1020-1023/1024', f.bytes.slice(1020)],
      ['bytes=-9999', 'bytes 0-1023/1024', f.bytes],
    ] as const) {
      const response = await get({ Range: range });
      assert.equal(response.status, 206, range);
      assert.equal(response.headers.get('content-range'), contentRange);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), expected);
    }
    for (const range of ['bytes=1024-', 'bytes=8-7', 'bytes=-0', 'bytes=wat', 'bytes=9007199254740992-', 'bytes=' + '1'.repeat(300)]) {
      const response = await get({ Range: range });
      assert.equal(response.status, 416, range);
      assert.equal(response.headers.get('content-range'), 'bytes */1024');
      assert.equal((await response.arrayBuffer()).byteLength, 0);
      assert.equal(response.headers.get('cache-control'), 'private, no-store, max-age=0');
    }
    // Unsupported units and multipart are ignored; no multipart amplification.
    for (const range of ['items=0-1', 'bytes=0-1,4-5']) {
      const response = await get({ Range: range });
      assert.equal(response.status, 200, range);
      assert.equal(response.headers.get('content-range'), null);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
    }
  } finally { await f.close(); }
});

void test('If-Range only honors a matching strong validator and otherwise sends the complete representation', async () => {
  const f = await fixture();
  try {
    const metadata = await f.bucket.head('private/product-media/s/p/v');
    assert.ok(metadata);
    const matched = await get({ Range: 'bytes=0-3', 'If-Range': metadata.httpEtag });
    assert.equal(matched.status, 206);
    assert.deepEqual(new Uint8Array(await matched.arrayBuffer()), new Uint8Array([0, 1, 2, 3]));
    for (const validator of ['"stale"', 'W/' + metadata.httpEtag, metadata.uploaded.toUTCString(), 'invalid']) {
      const response = await get({ Range: 'bytes=0-3', 'If-Range': validator });
      assert.equal(response.status, 200);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), f.bytes);
    }
    const path = join(f.root, 'private/product-media/s/p/v.metadata.json');
    const legacy = JSON.parse(await readFile(path, 'utf8'));
    delete legacy.etag;
    await writeFile(path, JSON.stringify(legacy));
    const old = await f.bucket.head('private/product-media/s/p/v');
    assert.match(old!.httpEtag, /^W\//);
    const oldResponse = await get({ Range: 'bytes=0-3', 'If-Range': old!.httpEtag });
    assert.equal(oldResponse.status, 200);
    assert.deepEqual(new Uint8Array(await oldResponse.arrayBuffer()), f.bytes);
  } finally { await f.close(); }
});

void test('video authorization precedes every native head or body access for unpublished and ineligible media', async () => {
  const f = await fixture();
  try {
    state.videoBucket = new Proxy(f.bucket, { get(target, property, receiver) {
      if (property === 'get' || property === 'head') return () => { throw new Error('Unauthorized media access'); };
      return Reflect.get(target, property, receiver);
    } });
    f.sqlite.exec("UPDATE products SET status='draft'");
    assert.equal((await get({ Range: 'bytes=0-3' })).status, 404);
    state.videoSubject = 'other';
    assert.equal((await get({ Range: 'bytes=0-3' })).status, 404);
    state.videoBucket = f.bucket;
    for (const subject of ['owner', 'reviewer']) {
      state.videoSubject = subject;
      const response = await get({ Range: 'bytes=0-3' });
      assert.equal(response.status, 206);
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()), new Uint8Array([0, 1, 2, 3]));
    }
    state.videoSubject = null;
    f.sqlite.exec("UPDATE products SET status='published';UPDATE users SET status='disabled' WHERE id='owner'");
    assert.equal((await get({ Range: 'bytes=0-3' })).status, 404);
  } finally { await f.close(); }
});

void test('synthetic 8 MiB video measurement records full versus 64 KiB seek transfer', async () => {
  const f = await fixture(8 * 1024 * 1024);
  try {
    const full = await get();
    const fullBytes = (await full.arrayBuffer()).byteLength;
    const seek = await get({ Range: 'bytes=1048576-1114111' });
    const seekBytes = (await seek.arrayBuffer()).byteLength;
    console.log(JSON.stringify({ videoTransferMeasurement: { fullStatus: full.status, seekStatus: seek.status, fullBytes, seekBytes } }));
    assert.equal(fullBytes, 8388608);
    assert.equal(seekBytes, 65536);
  } finally { await f.close(); }
});

void test('empty and missing native video objects do not create invalid streams or partial responses', async () => {
  const f = await fixture(0);
  try {
    const full = await get();
    assert.equal(full.status, 200);
    assert.equal(full.headers.get('content-length'), '0');
    assert.equal((await full.arrayBuffer()).byteLength, 0);
    const range = await get({ Range: 'bytes=0-' });
    assert.equal(range.status, 416);
    assert.equal(range.headers.get('content-range'), 'bytes */0');
    await f.bucket.delete('private/product-media/s/p/v');
    assert.equal((await get({ Range: 'bytes=0-3' })).status, 404);
    assert.equal((await get()).status, 404);
  } finally { await f.close(); }
});

void test('native R2 structured ranges preserve full size while streaming offset, length and suffix bytes', async () => {
  const f = await fixture();
  try {
    for (const [range, expected] of [
      [{ offset: 1020 }, f.bytes.slice(1020)],
      [{ length: 4 }, new Uint8Array([0, 1, 2, 3])],
      [{ suffix: 4 }, f.bytes.slice(1020)],
    ] as const) {
      const object = await f.bucket.get('private/product-media/s/p/v', { range });
      assert.equal(object!.size, 1024);
      assert.deepEqual(new Uint8Array(await new Response(object!.body).arrayBuffer()), expected);
    }
    await assert.rejects(f.bucket.get('private/product-media/s/p/v', { range: { offset: -1, length: 4 } }), /Invalid media byte range/);
    await assert.rejects(f.bucket.get('private/product-media/s/p/v', { range: { offset: 1024 } }), /Invalid media byte range/);
  } finally { await f.close(); }
});
