import assert from 'node:assert/strict';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';

import type { RecentlyViewedPolicy } from '../lib/configuration/types';
import {
  clearRecentlyViewed,
  listRecentlyViewedProducts,
  recordRecentlyViewedProduct,
} from '../lib/db/repositories/recently-viewed';
import {
  normalizeGuestHistory,
  recordGuestProductView,
} from '../lib/recently-viewed/history';

const day = 86_400_000;
const policy: RecentlyViewedPolicy = { maxItems: 12, retentionDays: 90 };

async function fixture() {
  const {sqlite,db}=await incentiveReportDatabase();
  sqlite.exec(`
    INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES ('owner','owner@local.hastabazaar.test','Fictional owner','active',1,1),('u1','u1@local.hastabazaar.test','Fictional buyer one','active',1,1),('u2','u2@local.hastabazaar.test','Fictional buyer two','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('owner','seller',1),('u1','customer',1),('u2','customer',1);
    INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES ('cat','pottery','Pottery',1,0,1,1);
    INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES ('seller','owner','Fictional Clay Studio','Clay Studio','Fixture','FIX-REG','PAN','FIX-PAN','Fictional owner','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional workshop','approved',1,1);
    INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,created_at,updated_at) VALUES ('seller','registered_seller','active','Clay Studio','Kathmandu',1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,compare_at_price_paisa,inventory_quantity,status,producer,materials,created_at,updated_at) VALUES
      ('p1','seller','cat','cup','FIX-CUP','Cup','Fictional cup.',100000,120000,4,'published','Fictional maker','Clay',1,1),
      ('p2','seller','cat','bowl','FIX-BOWL','Bowl','Fictional bowl.',80000,NULL,0,'published','Fictional maker','Clay',1,1),
      ('p3','seller','cat','draft','FIX-DRAFT','Draft','Fictional draft.',50000,NULL,3,'draft','Fictional maker','Clay',1,1);
    INSERT INTO product_media(id,product_id,object_key,alt_en,mime_type,sort_order,created_at) VALUES ('m1','p1','fictional/cup.jpg','Fictional cup','image/jpeg',0,1),('m2','p2','fictional/bowl.jpg','Fictional bowl','image/jpeg',0,1),('m3','p3','fictional/draft.jpg','Fictional draft','image/jpeg',0,1);
  `);
  return { sqlite, database:db };
}

void test('guest history is recent-first, deduplicated, individually expired and bounded', () => {
  const now = 100 * day;
  let history = recordGuestProductView([], 'p1', now - 2 * day, policy);
  history = recordGuestProductView(history, 'p2', now - day, policy);
  history = recordGuestProductView(history, 'p1', now, policy);
  history.push({ productId: 'expired', lastViewedAt: now - 91 * day });
  assert.deepEqual(normalizeGuestHistory(history, now, policy), [
    { productId: 'p1', lastViewedAt: now },
    { productId: 'p2', lastViewedAt: now - day },
  ]);
});

void test('account history is owner-isolated, uses current catalogue truth and can be cleared', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p1', now, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p2', now: now + 1, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u2', productId: 'p1', now: now + 2, policy });
    sqlite.prepare("UPDATE products SET price_paisa=95000, inventory_quantity=0 WHERE id='p1'").run();
    const first = await listRecentlyViewedProducts(database, { userId: 'u1', now: now + 3, policy });
    assert.deepEqual(first.map((item) => [item.slug, item.pricePaisa, item.available]), [
      ['bowl', 80000, false],
      ['cup', 95000, false],
    ]);
    assert.equal((await listRecentlyViewedProducts(database, { userId: 'u2', now: now + 3, policy })).length, 1);
    await clearRecentlyViewed(database, 'u1');
    assert.equal((await listRecentlyViewedProducts(database, { userId: 'u1', now: now + 4, policy })).length, 0);
    assert.equal((await listRecentlyViewedProducts(database, { userId: 'u2', now: now + 4, policy })).length, 1);
  } finally { sqlite.close(); }
});

void test('expired, unpublished and deleted account entries never appear', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p1', now: now - 91 * day, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p3', now, policy });
    sqlite.prepare("INSERT INTO product_deletions(product_id,deleted_by,deleted_at,request_id) VALUES ('p1','owner',1,'fictional-history-removal')").run();
    assert.deepEqual(await listRecentlyViewedProducts(database, { userId: 'u1', now, policy }), []);
  } finally { sqlite.close(); }
});

void test('a smaller configured limit applies prospectively without rewriting view timestamps', async () => {
  const { sqlite, database } = await fixture();
  try {
    const now = 200 * day;
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p1', now, policy });
    await recordRecentlyViewedProduct(database, { userId: 'u1', productId: 'p2', now: now + 1, policy });
    await recordRecentlyViewedProduct(database, {
      userId: 'u1', productId: 'p1', now: now + 2,
      policy: { maxItems: 1, retentionDays: 90 },
    });
    const stored = (sqlite.prepare('SELECT product_id AS productId,last_viewed_at AS lastViewedAt FROM recently_viewed_products WHERE user_id=?').all('u1') as Array<{ productId: string; lastViewedAt: number }>).map((row) => ({ ...row }));
    assert.deepEqual(stored, [{ productId: 'p1', lastViewedAt: now + 2 }]);
  } finally { sqlite.close(); }
});
