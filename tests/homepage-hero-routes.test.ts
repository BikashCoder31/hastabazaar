import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { can } from '../lib/marketplace/permissions';

const route = (path: string) => readFile(new URL(path, import.meta.url), 'utf8');

void test('homepage hero media management remains Super-Admin-only', () => {
  for (const permission of [
    'business_settings.view',
    'business_settings.manage',
  ] as const) {
    assert.equal(can({ role: 'super_admin' }, permission), true);
    for (const role of ['customer', 'seller', 'admin'] as const) {
      assert.equal(can({ role }, permission), false);
      assert.equal(can({ role, permissions: [permission] }, permission), false);
    }
  }
});

void test('admin upload and archive routes enforce trust, bounds, authority, and rollback', async () => {
  const [collection, item] = await Promise.all([
    route('../app/api/admin/homepage/hero-media/route.ts'),
    route('../app/api/admin/homepage/hero-media/[id]/route.ts'),
  ]);
  assert.match(collection, /requireStaffApi\('business_settings\.view'\)/);
  assert.match(collection, /requireStaffApi\('business_settings\.manage'\)/);
  assert.match(item, /requireStaffApi\('business_settings\.view'\)/);
  assert.match(item, /requireStaffApi\('business_settings\.manage'\)/);
  assert.match(`${collection}\n${item}`, /isTrustedMutationRequest\(request\)/);
  assert.match(collection, /readBoundedForm\(request,\s*22 \* 1024 \* 1024\)/);
  assert.match(collection, /BodyTooLargeError/);
  assert.match(collection, /prepareHomepageHeroUpload/);
  assert.match(collection, /await bucket\.delete\(objectKey\)/);
  assert.match(item, /archiveHomepageHeroMedia/);
  assert.match(item, /requestId/);
  assert.match(item, /reason/);
});

void test('public serving uses only effective registry references and safe media headers', async () => {
  const [publicRoute, adminRoute] = await Promise.all([
    route('../app/api/homepage/hero-media/[id]/route.ts'),
    route('../app/api/admin/homepage/hero-media/[id]/route.ts'),
  ]);
  assert.match(publicRoute, /getPublishedHomepageHeroMedia/);
  assert.match(publicRoute, /homepageHeroStaticAssetPath/);
  assert.match(publicRoute, /X-Content-Type-Options['"]?:\s*['"]nosniff/);
  assert.match(publicRoute, /ETag/);
  assert.match(publicRoute, /public, max-age=300/);
  assert.doesNotMatch(
    publicRoute,
    /new URL\(request\.url\)\.searchParams|request\.url.*searchParams/,
  );
  assert.match(adminRoute, /private, no-store/);
  assert.match(adminRoute, /homepageHeroStaticAssetPath/);
});

void test('hero publication and approval run database-backed slide and media readiness checks', async () => {
  const [changes, repository] = await Promise.all([
    route('../app/api/admin/business-settings/changes/[id]/route.ts'),
    route('../lib/db/repositories/business-settings.ts'),
  ]);
  assert.match(repository, /export async function getBusinessSettingVersionById/);
  assert.match(changes, /getBusinessSettingVersionById/);
  assert.match(changes, /assertHomepageHeroPublicationReady/);
  assert.match(changes, /assertHomepageHeroMediaReady/);
  assert.match(changes, /action === 'publish'/);
  assert.match(changes, /action === 'approve'/);
  assert.match(changes, /version\.key !== 'homepage_hero_slides'/);
});
