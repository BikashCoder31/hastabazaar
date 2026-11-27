import assert from 'node:assert/strict';
import test from 'node:test';
import mysql, { type Pool } from 'mysql2/promise';
import { stagingNativeFixture } from './helpers/staging-native-fixture';
import { getProductWorkspace } from '../lib/products/intake-workspace';
import { inspectLegacyProduct, openLegacyProductWorkspace } from '../lib/products/legacy-workspace';

void test('MariaDB opens and replays a legacy workspace while retaining the original price and stock', {
  skip: process.env.HATSKALA_STAGING_NATIVE !== '1',
}, async () => {
  await stagingNativeFixture();
  const pools: Pool[] = [];
  const createPool = mysql.createPool;
  mysql.createPool = ((...args: Parameters<typeof createPool>) => {
    const pool = createPool(...args);
    pools.push(pool);
    return pool;
  }) as typeof createPool;
  try {
    const { env } = await import('../lib/runtime/node-bindings');
    const db = env.DB;
    assert.equal(Number((await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())?.n), 0);
    const actorId = 'qa-legacy-workspace-owner';
    const productId = 'qa-legacy-workspace-product';
    await db.batch([
      db.prepare(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
        VALUES(?,'legacy-owner@local.hastabazaar.test','Fictional owner','active',1,1)`).bind(actorId),
      db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'seller',1)").bind(actorId),
      db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,
        tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
        status,created_at,updated_at)
        VALUES('qa-legacy-shop',?,'Fictional owner','Fictional shop','Fixture','QA-LEGACY-REG',
        'PAN','QA-LEGACY-PAN','Fictional owner','9800000000','legacy-owner@local.hastabazaar.test',
        'Bagmati','Kathmandu','Kathmandu','Fictional locality','approved',1,1)`).bind(actorId),
      db.prepare(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
        VALUES('qa-legacy-category','qa-legacy-category','Fictional cups',1,0,1,1)`),
      db.prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,compare_at_price_paisa,
        inventory_quantity,producer,materials,status,created_at,updated_at)
        VALUES(?,'qa-legacy-shop','qa-legacy-category','fictional-legacy-cup','QA-LEGACY-CUP','Fictional cup','Recorded legacy details',
        39900,NULL,7,'Fictional maker','Clay','published',1,1)`).bind(productId),
    ]);

    const observed = await inspectLegacyProduct(db, actorId, productId);
    const context = { actorId, requestId: 'qa-open-legacy-workspace', expectedRevision: null, now: Date.now() };
    const input = { productId, sourceFingerprint: observed.sourceFingerprint, retainObserved: true };
    const opened = await openLegacyProductWorkspace(db, context, input);

    assert.deepEqual(await openLegacyProductWorkspace(db, context, input), opened);
    assert.equal((await inspectLegacyProduct(db, actorId, productId)).existingDraftId, opened.id);
    const draft = await getProductWorkspace(db, actorId, opened.id);
    assert.equal(draft.legacy?.baseline, 'unreconciled_observation');
    assert.equal(draft.answers.price, '399.00');

    const retained = await db.prepare(`SELECT status,price_paisa AS price,compare_at_price_paisa AS compareAt,
      inventory_quantity AS stock FROM products WHERE id=?`)
      .bind(productId).first<{ status: string; price: number; compareAt: number | null; stock: number }>();
    assert.deepEqual(retained, { status: 'published', price: 39900, compareAt: null, stock: 7 });
    assert.equal(await db.prepare('SELECT 1 FROM product_publication_heads WHERE product_id=?').bind(productId).first(), null);
  } finally {
    mysql.createPool = createPool;
    for (const pool of pools) await pool.end();
  }
});
