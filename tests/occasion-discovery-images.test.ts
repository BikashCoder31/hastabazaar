import assert from 'node:assert/strict';
import test from 'node:test';
import { listManagedTaxonomy, saveTaxonomy } from '../lib/db/repositories/catalog-admin';
import { readDiscoveryOccasions } from '../lib/catalog/taxonomy-discovery';
import { nepaliTaxonomyName } from '../lib/catalog/taxonomy-names';
import { categoryMediaDb, declareOccasionImageFixtureStorage } from './helpers/category-media-db';

async function fixture() {
  const database = await categoryMediaDb();
  const { sqlite } = database;
  sqlite.exec(`
    INSERT INTO users(id,email,display_name,status,created_at,updated_at)
      VALUES ('review-staff','staff@example.invalid','Review staff','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('review-staff','super_admin',1);
    INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('review-catalog-v1','staff.catalog',1,'published','{"formId":"staff.catalog","fields":[]}',
        'Fixture configuration','review-staff',1,'review-staff',1,'review-staff',1,'review-config');
  `);
  const save = (kind: 'category' | 'occasion', requestId: string, input: Partial<Parameters<typeof saveTaxonomy>[1]['input']>, id?: string) =>
    saveTaxonomy(database.db, {
      kind, id, actorId: 'review-staff', requestId, now: 10,
      input: { slug: `review-${kind}`, nameEn: 'Review label', nameNe: '', isActive: true, sortOrder: 10, ...input },
      form: { requestId, versionId: 'review-catalog-v1', answers: { formId: 'staff.catalog', version: 1, answers: [] } },
    });
  return { ...database, save };
}

void test('taxonomy saves an independent Nepali name and leaves the field empty when cleared', async () => {
  const f = await fixture();
  try {
    for (const kind of ['category', 'occasion'] as const) {
      const id = await f.save(kind, `create-${kind}`, { nameNe: 'उपहार' });
      const rows = (await listManagedTaxonomy(f.db))[kind === 'category' ? 'categories' : 'occasions'];
      assert.equal(rows.find(row => row.id === id)?.nameNe, 'उपहार');
      await f.save(kind, `clear-${kind}`, { nameNe: '   ' }, id);
      const stored = f.sqlite.prepare(`SELECT name_ne AS nameNe FROM ${kind === 'category' ? 'categories' : 'occasions'} WHERE id=?`).get(id);
      assert.equal(stored?.nameNe, '');
      assert.equal(nepaliTaxonomyName({ nameEn: 'Review label', nameNe: '' }), null);
      assert.equal(nepaliTaxonomyName({ nameEn: 'Review label', nameNe: ' Review label ' }), null);
      assert.equal(nepaliTaxonomyName({ nameEn: 'Review label', nameNe: 'उपहार' }), 'उपहार');
    }
  } finally { f.dispose(); }
});

void test('occasion saves continue without storage and guarded image requests create no image link', async () => {
  const f = await fixture();
  try {
    const id = await f.save('occasion', 'without-image-storage', { imageId: 'old-client-image', expectedImageId: null });
    const managed = await listManagedTaxonomy(f.db);
    assert.equal(managed.occasionImagesAvailable, false);
    assert.equal(managed.occasions.find(row => row.id === id)?.imageId, null);
    assert.equal((await readDiscoveryOccasions(f.db)).entries.find(row => row.id === id)?.imageId, undefined);
  } finally { f.dispose(); }
});

void test('occasion images are public only while attached to an active occasion, with optimistic editing and audit history', async () => {
  const f = await fixture();
  try {
    // Declare the optional tables in this disposable fixture without executing 0170.
    declareOccasionImageFixtureStorage(f.sqlite);
    f.sqlite.exec(`
      INSERT INTO occasion_media(id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at)
        VALUES ('occasion-first','private/occasion-images/occasion-first','first.webp','image/webp',100,100,100,'00','review-staff','upload-first',1),
          ('occasion-second','private/occasion-images/occasion-second','second.webp','image/webp',100,100,100,'01','review-staff','upload-second',1);
    `);
    assert.equal((await listManagedTaxonomy(f.db)).occasionImagesAvailable, true);
    const id = await f.save('occasion', 'attach-occasion', { imageId: 'occasion-first', expectedImageId: null });
    assert.equal((await readDiscoveryOccasions(f.db)).entries.find(row => row.id === id)?.imageId, 'occasion-first');
    await assert.rejects(f.save('occasion', 'stale-occasion', { imageId: 'occasion-second', expectedImageId: null }, id), /occasion image changed/i);
    await f.save('occasion', 'replace-occasion', { imageId: 'occasion-second', expectedImageId: 'occasion-first' }, id);
    assert.equal((await listManagedTaxonomy(f.db)).occasions.find(row => row.id === id)?.imageId, 'occasion-second');
    await f.save('occasion', 'retire-occasion', { isActive: false }, id);
    assert.equal((await readDiscoveryOccasions(f.db)).entries.some(row => row.id === id), false);
    await f.save('occasion', 'clear-occasion', { imageId: null, expectedImageId: 'occasion-second' }, id);
    assert.equal((await readDiscoveryOccasions(f.db)).entries.find(row => row.id === id)?.imageId, null);
    const audit = f.sqlite.prepare('SELECT previous_json AS previous, next_json AS next FROM audit_logs WHERE request_id=?').get('replace-occasion');
    assert.equal(JSON.parse(String(audit?.previous)).imageId, 'occasion-first');
    assert.equal(JSON.parse(String(audit?.next)).imageId, 'occasion-second');
  } finally { f.dispose(); }
});
