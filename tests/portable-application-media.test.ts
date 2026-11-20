import assert from 'node:assert/strict';
import test from 'node:test';
import { securityDatabase } from './helpers/security-database';
import { homepageHeroStaticAssets } from '../lib/db/repositories/homepage-hero';
import { homepageHeroApplicationMedia } from '../lib/portability/application-media';

function fixture() {
  const f = securityDatabase();
  f.sqlite.exec(
    'CREATE TABLE homepage_hero_media(id TEXT PRIMARY KEY,object_key TEXT,mime_type TEXT,size_bytes INTEGER)',
  );
  for (const asset of homepageHeroStaticAssets())
    f.sqlite
      .prepare('INSERT INTO homepage_hero_media VALUES (?,?,?,?)')
      .run(asset.id, asset.objectKey, 'image/webp', 3);
  return f;
}
void test('built-in homepage files use only the shared fixed registry and trusted application origin', async () => {
  const f = fixture(),
    calls: { url: string; init: RequestInit | undefined }[] = [];
  try {
    f.sqlite
      .prepare('INSERT INTO homepage_hero_media VALUES (?,?,?,?)')
      .run(
        'uploaded-fictional',
        'https://untrusted.example/secret',
        'image/webp',
        3,
      );
    const read: typeof fetch = async (input, init) => {
      calls.push({
        url: input instanceof Request ? input.url : input.toString(),
        init,
      });
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/webp' },
      });
    };
    const media = await homepageHeroApplicationMedia(
      f.db,
      'http://localhost:3018',
      read,
    );
    assert.equal(media.length, 3);
    for (const [index, file] of media.entries()) {
      assert.equal(
        file.metadata.key,
        homepageHeroStaticAssets()[index].objectKey,
      );
      const opened = await file.open();
      assert.deepEqual(
        [...new Uint8Array(await new Response(opened.body).arrayBuffer())],
        [1, 2, 3],
      );
      assert.equal(
        opened.customMetadata.portabilitySource,
        'application-static',
      );
    }
    assert.deepEqual(
      calls.map((call) => call.url),
      homepageHeroStaticAssets().map(
        (asset) => 'http://localhost:3018' + asset.path,
      ),
    );
    assert.ok(
      calls.every(
        (call) =>
          call.init?.redirect === 'manual' &&
          call.init.cache === 'no-store' &&
          !call.init.headers,
      ),
    );
  } finally {
    f.dispose();
  }
});
void test('built-in identity mismatches and unsafe origins fail without fetching arbitrary URLs', async () => {
  const f = fixture();
  let calls = 0;
  const read: typeof fetch = async () => {
    calls++;
    throw Error('must not fetch');
  };
  try {
    for (const origin of [
      'http://remote.example',
      'https://example.test/path',
      'https://user:pass@example.test',
      'file:///tmp/x',
      'https://example.test?x=1',
    ])
      await assert.rejects(
        () => homepageHeroApplicationMedia(f.db, origin, read),
        /origin/i,
      );
    f.sqlite
      .prepare('UPDATE homepage_hero_media SET object_key=? WHERE id=?')
      .run(
        'https://untrusted.example/secret',
        homepageHeroStaticAssets()[0].id,
      );
    await assert.rejects(
      () => homepageHeroApplicationMedia(f.db, 'http://localhost:3018', read),
      /built-in|identity/i,
    );
    assert.equal(calls, 0);
  } finally {
    f.dispose();
  }
});
void test('missing, redirected, oversized or changed built-in files cannot issue a complete backup', async () => {
  const f = fixture();
  try {
    const responses = [
      () => new Response(null, { status: 404 }),
      () =>
        new Response(null, {
          status: 302,
          headers: { location: 'https://untrusted.example' },
        }),
      () =>
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { 'content-type': 'text/html' },
        }),
      () =>
        new Response(new Uint8Array([1, 2]), {
          headers: { 'content-type': 'image/webp' },
        }),
      () =>
        new Response(new Uint8Array([1, 2, 3, 4]), {
          headers: { 'content-type': 'image/webp' },
        }),
      () =>
        new Response(new Uint8Array(2 * 1024 * 1024 + 1), {
          headers: { 'content-type': 'image/webp' },
        }),
    ];
    for (const response of responses) {
      const media = await homepageHeroApplicationMedia(
        f.db,
        'https://hastabazaar.example',
        async () => response(),
      );
      await assert.rejects(() => media[0].open(), /built-in/i);
    }
    f.sqlite.prepare('UPDATE homepage_hero_media SET size_bytes=0').run();
    await assert.rejects(
      () =>
        homepageHeroApplicationMedia(
          f.db,
          'http://localhost:3018',
          async () => new Response(),
        ),
      /size/i,
    );
  } finally {
    f.dispose();
  }
});
