import assert from 'node:assert/strict';
import test from 'node:test';

import { publishedOfferFixture } from './helpers/public-offer-fixture';

void test('discovery uses public catalogue data and tolerates unapplied occasion storage', async () => {
  const { readDiscoveryCategories, readDiscoveryOccasions } = await import('../lib/catalog/taxonomy-discovery');
  const fixture = await publishedOfferFixture();
  try {
    const { db, sqlite, now, productId } = fixture;
    assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    sqlite.exec(`
      INSERT INTO occasions(id,slug,name_en,name_ne,is_active,sort_order,created_at,updated_at) VALUES
        ('fictional-future','fictional-future','Future festival',NULL,1,0,1,1),
        ('fictional-current','fictional-current','Current celebration','उत्सव',1,1,1,1),
        ('fictional-ungrouped','fictional-ungrouped','Other celebration',NULL,1,2,1,1),
        ('fictional-hidden','fictional-hidden','Inactive event',NULL,0,3,1,1)
    `);
    const category = sqlite.prepare('SELECT category_id AS id FROM products WHERE id=?').get(productId);
    assert.ok(category);
    const before = await readDiscoveryCategories(db);
    assert.ok(before.some(entry => entry.id === category.id));
    assert.ok(before.every(entry => entry.productCount === undefined));
    const occasionsBefore = await readDiscoveryOccasions(db, now);
    assert.ok(occasionsBefore.entries.some(entry => entry.nameNe === 'उत्सव'));
    assert.equal(occasionsBefore.groups.length, 0);
    assert.equal(occasionsBefore.featured, null);
    assert.equal(occasionsBefore.priceCaps.length, 1);
    assert.ok(occasionsBefore.priceCaps[0] > 0);

    // Model optional storage independently on this disposable fixture.
    sqlite.exec(`CREATE TABLE occasion_discovery (
      occasion_id TEXT PRIMARY KEY,
      group_name TEXT,
      group_sort_order INTEGER DEFAULT 0 NOT NULL,
      season_starts_at INTEGER,
      season_ends_at INTEGER
    )`);
    const save = sqlite.prepare('INSERT INTO occasion_discovery VALUES (?, ?, ?, ?, ?)');
    save.run('fictional-future', 'Fictional festivals', 10, now + 1, now + 5000);
    save.run('fictional-current', 'Fictional life events', 20, now - 100, now + 200);
    save.run('fictional-hidden', 'Hidden group', 0, now - 100, now + 200);

    const categories = await readDiscoveryCategories(db);
    assert.equal(categories.find(entry => entry.id === category.id)?.productCount, 1);
    sqlite.prepare("UPDATE products SET status='draft' WHERE id=?").run(productId);
    assert.equal((await readDiscoveryCategories(db)).find(entry => entry.id === category.id)?.productCount, 0);
    const occasions = await readDiscoveryOccasions(db, now);
    assert.equal(occasions.featured?.slug, 'fictional-current');
    assert.deepEqual(occasions.groups.slice(0, 2).map(group => group.name), ['Fictional festivals', 'Fictional life events']);
    assert.ok(occasions.groups.at(-1)?.entries.some(entry => entry.id === 'fictional-ungrouped'));
    assert.ok(occasions.groups.every(group => group.name !== 'Hidden group'));
    assert.equal((await readDiscoveryOccasions(db, now + 5000)).featured, null);
  } finally {
    fixture.dispose();
  }
});
