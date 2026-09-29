import assert from 'node:assert/strict';
import test from 'node:test';
import { categoryMediaDb } from './helpers/category-media-db';
import { listActiveOccasions, listPublicDiscoveryCategories } from '../lib/db/repositories/products';
import { FORM_REGISTRY } from '../lib/forms/registry';
import { saveTaxonomy } from '../lib/db/repositories/catalog-admin';

async function imageFixture() {
  const fixture = await categoryMediaDb();
  for (const id of ['staff-one', 'staff-two']) {
    await fixture.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES (?,?,'Fictional staff','active',1,1)").bind(id, `${id}@example.invalid`).run();
    await fixture.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'super_admin',1)").bind(id).run();
  }
  await fixture.db.prepare(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
    VALUES ('food','food','Food',1,20,1,1),('other','other','Other',1,30,1,1)`).run();
  await fixture.db.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES ('catalog-v1','staff.catalog',1,'published','{"formId":"staff.catalog","fields":[]}','Fixture configuration','staff-one',1,'staff-one',1,'staff-one',1,'fixture-config')`).run();
  for (const [id, actor, category] of [['image-one', 'staff-one', null], ['image-two', 'staff-one', null], ['foreign-image', 'staff-two', null], ['other-image', 'staff-one', 'other']] as const) {
    await fixture.db.prepare(`INSERT INTO category_media(id,category_id,object_key,original_name,mime_type,size_bytes,width,height,content_hash,created_by,request_id,created_at)
      VALUES (?,?,?,'fixture.webp','image/webp',100,100,100,?,?,?,1)`).bind(id, category, `private/category-images/${id}`, '0'.repeat(64), actor, `upload-${id}`).run();
  }
  const save = (requestId: string, imageId: string | null, expectedImageId: string | null, id = 'food') => {
    const input = { slug: id, nameEn: id === 'food' ? 'Food' : 'Other', nameNe: '', isActive: true, sortOrder: 20, imageId, expectedImageId };
    return saveTaxonomy(fixture.db, { kind: 'category', id, actorId: 'staff-one', input, requestId, now: 10,
      form: { requestId, versionId: 'catalog-v1', answers: { formId: 'staff.catalog', version: 1, answers: [] } } });
  };
  return { ...fixture, save };
}

void test('category image assignment, replacement, removal and exact replay preserve assets and form history', async () => {
  const fixture = await imageFixture();
  try {
    await fixture.save('attach-first', 'image-one', null);
    assert.equal((await fixture.db.prepare('SELECT media_id AS id FROM category_image_assignments WHERE category_id=?').bind('food').first<{ id: string }>())?.id, 'image-one');
    await fixture.save('attach-first', 'image-one', null);
    await fixture.save('replace-second', 'image-two', 'image-one');
    await fixture.save('remove-second', null, 'image-two');
    assert.equal((await listPublicDiscoveryCategories(fixture.db)).find((row) => row.id === 'food')?.imageId, null);
    assert.equal((await fixture.db.prepare('SELECT COUNT(*) AS count FROM category_media').first<{ count: number }>())?.count, 4);
    assert.equal((await fixture.db.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.catalog'").first<{ count: number }>())?.count, 3);
    assert.equal((await fixture.db.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action='catalog.category.updated'").first<{ count: number }>())?.count, 3);
    const audit = await fixture.db.prepare('SELECT previous_json AS previous,next_json AS next FROM audit_logs WHERE request_id=?').bind('replace-second').first<{ previous: string; next: string }>();
    assert.equal(JSON.parse(audit!.previous).imageId, 'image-one');
    assert.equal(JSON.parse(audit!.next).imageId, 'image-two');
    await assert.rejects(fixture.save('attach-first', 'image-two', null), /different catalogue details/);
  } finally { fixture.dispose(); }
});

void test('category save rejects foreign uploads, cross-category reuse and stale image baselines atomically', async () => {
  const fixture = await imageFixture();
  try {
    await assert.rejects(fixture.save('foreign-upload', 'foreign-image', null), /image|upload/i);
    await assert.rejects(fixture.save('cross-category', 'other-image', null), /image|category/i);
    await fixture.save('valid-attach', 'image-one', null);
    await assert.rejects(fixture.save('stale-replace', 'image-two', null), /changed|refresh/i);
    assert.equal((await fixture.db.prepare('SELECT media_id AS id FROM category_image_assignments WHERE category_id=?').bind('food').first<{ id: string }>())?.id, 'image-one');
    assert.equal((await fixture.db.prepare("SELECT COUNT(*) AS count FROM form_answer_sets WHERE form_id='staff.catalog'").first<{ count: number }>())?.count, 1);
  } finally { fixture.dispose(); }
});

void test('category image migration only adds empty media and assignment tables', async () => {
  const fixture = await categoryMediaDb();
  try {
    const rows = await fixture.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('category_media','category_image_assignments') ORDER BY name").all<{ name: string }>();
    assert.deepEqual(rows.results.map((row) => row.name), ['category_image_assignments', 'category_media']);
    const media = await fixture.db.prepare('SELECT COUNT(*) AS count FROM category_media').first<{ count: number }>();
    const assignments = await fixture.db.prepare('SELECT COUNT(*) AS count FROM category_image_assignments').first<{ count: number }>();
    assert.equal(media?.count, 0);
    assert.equal(assignments?.count, 0);
  } finally { fixture.dispose(); }
});

void test('public discovery includes newly created active taxonomy without products and excludes retired entries', async () => {
  const fixture = await categoryMediaDb();
  try {
    await fixture.db.prepare(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
      VALUES ('food','food','Food',1,20,1,1),('hidden-food','hidden-food','Retired food',0,10,1,1)`).run();
    await fixture.db.prepare(`INSERT INTO occasions(id,slug,name_en,is_active,sort_order,created_at,updated_at)
      VALUES ('birthday','birthday','Birthday',1,10,1,1),('hidden-birthday','hidden-birthday','Retired birthday',0,1,1,1)`).run();
    const categories = await listPublicDiscoveryCategories(fixture.db);
    assert.deepEqual(categories.map((row) => row.slug), ['food', 'others']);
    assert.equal(categories[0].imageId, null);
    assert.deepEqual((await listActiveOccasions(fixture.db)).map((row) => row.slug), ['birthday', 'others']);
  } finally { fixture.dispose(); }
});

void test('category image assignment and optimistic baseline are protected catalogue inputs', () => {
  const protectedKeys = FORM_REGISTRY['staff.catalog'].baseFields.filter((field) => field.capability === 'protected').map((field) => field.key);
  assert.ok(protectedKeys.includes('imageId'));
  assert.ok(protectedKeys.includes('expectedImageId'));
});
