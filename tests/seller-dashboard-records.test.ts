import assert from 'node:assert/strict';
import test from 'node:test';
import { earnedMaker } from './helpers/company-store-financial-fixture';
import { getSellerEarnings } from '../lib/seller/earnings';
import { commissionDatabase, historicalCommissionDatabase } from './helpers/commission-database';
import {
  getSellerActionCaseCounts,
  getSellerWorkSummary,
} from '../lib/db/repositories/seller-workspace';

function snapshot(sqlite: Awaited<ReturnType<typeof earnedMaker>>['sqlite']) {
  return JSON.stringify(
    sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )
      .all()
      .map(({ name }) => [
        name,
        sqlite
          .prepare(
            'SELECT * FROM "' +
              String(name).replaceAll('"', '""') +
              '" ORDER BY rowid',
          )
          .all(),
      ]),
  );
}
function readOnly(database: D1Database): D1Database {
  return {
    prepare(sql: string) {
      assert.match(
        sql,
        /^\s*SELECT\b/i,
        'Seller earnings must issue SELECT-only reads',
      );
      return database.prepare(sql);
    },
    batch() {
      throw new Error('Seller earnings must not execute a batch');
    },
  } as unknown as D1Database;
}

// Copy complete isolated rows so ownership/stage tests retain all current schema fields.
function clone(
  f: Awaited<ReturnType<typeof earnedMaker>>,
  table: string,
  id: string,
  changes: Record<string, string | number | null>,
) {
  const columns = f.sqlite
    .prepare(`PRAGMA table_info("${table}")`)
    .all()
    .map((row) => String(row.name));
  const values = columns
    .filter((name) => Object.hasOwn(changes, name))
    .map((name) => changes[name]);
  f.sqlite
    .prepare(
      `INSERT INTO "${table}" (${columns.map((name) => `"${name}"`).join(',')}) SELECT ${columns.map((name) => (Object.hasOwn(changes, name) ? '?' : `"${name}"`)).join(',')} FROM "${table}" WHERE id=?`,
    )
    .run(...values, id);
}
function secondShop(f: Awaited<ReturnType<typeof earnedMaker>>) {
  const owner = String(
    f.sqlite
      .prepare('SELECT user_id FROM seller_profiles WHERE id=?')
      .get(f.sellerId)?.user_id,
  );
  clone(f, 'users', owner, {
    id: 'other-user',
    auth_subject: 'other-user',
    email: 'other@local.hastabazaar.test',
    phone: null,
  });
  clone(f, 'seller_profiles', f.sellerId, {
    id: 'other-shop',
    user_id: 'other-user',
    registration_number: 'OTHER-REG',
    tax_registration_number: 'OTHER-PAN',
    application_reference: 'OTHER-APPLICATION',
  });
  clone(f, 'order_items', f.itemId, {
    id: 'other-item',
    seller_id: 'other-shop',
    fulfillment_status: 'confirmed',
  });
}

void test('registered earnings use accepted saved rate and isolate two populated sellers', async () => {
  // Explicit historical baseline: a missing current configuration is not an offer.
  const f = await historicalCommissionDatabase(false);
  try {
    await f.database
      .prepare(`INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at)
      VALUES('saved-725',725,1296000001,'fixture','Fixture terms','Isolated accepted rate','owner',1)`)
      .run();
    await f.database
      .prepare(
        "INSERT INTO commission_rate_acceptances VALUES('saved-725','seller-a','user-a',1296000002)",
      )
      .run();
    for (const [id, seller, kind, amount] of [
      ['a-sale', 'seller-a', 'sale', 100000],
      ['a-fee', 'seller-a', 'commission', -9000],
      ['b-sale', 'seller-b', 'sale', 700000],
    ] as const) {
      await f.database
        .prepare(
          'INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES(?,?,?,?,1,?,1)',
        )
        .bind(id, seller, kind, amount, 'Isolated historical amount')
        .run();
    }
    const a = await getSellerEarnings(
      readOnly(f.database),
      'seller-a',
      1296000003,
    );
    const b = await getSellerEarnings(
      readOnly(f.database),
      'seller-b',
      1296000003,
    );
    assert.equal(a.commission?.basisPoints, 725);
    assert.equal(a.registered.commissionPaisa, -9000);
    assert.equal(a.registered.availablePaisa, 91000);
    assert.equal(a.registered.grossSalesPaisa, 100000);
    assert.equal(b.commission?.basisPoints, 725);
    assert.equal(b.commission?.acceptedAt, null, 'Another seller cannot inherit the original acceptance');
    assert.equal(b.currentRateUnavailable, false);
    assert.equal(b.registered.grossSalesPaisa, 700000);
    assert.equal(a.managed, null);
  } finally {
    await f.dispose();
  }
});

void test('current 12% registered offer requires renewal while old 9% ledger amounts stay unchanged', async () => {
  const f = await commissionDatabase();
  try {
    await f.database.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES('new-base','independent_seller_commission_bps',1,'1200','published',1,'controlled',2,'New initial terms','owner',2,'new-base')`).run();
    await f.database.prepare(`INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_bps,acceptance_request_id,accepted_by,accepted_at)
      VALUES('old-terms','seller-a','original','en',900,'old-terms','user-a',1)`).run();
    for (const [id, type, amount] of [['old-sale','sale',100000],['old-fee','commission',-9000]] as const)
      await f.database.prepare('INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES(?,\'seller-a\',?,?,1,\'Historical sale\',1)').bind(id,type,amount).run();
    const data = await getSellerEarnings(readOnly(f.database),'seller-a',3);
    assert.equal(data.commission?.basisPoints,1200);
    assert.equal(data.commissionAccepted,false);
    assert.equal(data.registered.commissionPaisa,-9000);
    assert.equal(data.registered.availablePaisa,91000);
    assert.equal((await f.database.prepare('SELECT commission_bps bps FROM seller_agreement_acceptance_history').first<{bps:number}>())?.bps,900);
    await f.database.prepare(`INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at)
      VALUES('accepted-supplement',725,1296000001,'original','Original supplement','Accepted historical supplement','owner',1)`).run();
    await f.database.prepare("INSERT INTO commission_rate_acceptances VALUES('accepted-supplement','seller-a','user-a',1296000002)").run();
    const withSupplement=await getSellerEarnings(readOnly(f.database),'seller-a',1296000003);
    assert.equal(withSupplement.commission?.basisPoints,725);
    assert.equal(withSupplement.offeredCommissionBps,1200);
    assert.equal(withSupplement.commissionAccepted,false,'An accepted fee supplement does not accept a changed base agreement');
    assert.equal(withSupplement.registered.availablePaisa,91000);
  } finally { await f.dispose(); }
});

void test('current unaccepted 12% maker offer is separate from historical 9% earnings', async () => {
  const f = await earnedMaker();
  try {
    const key='managed_sale_linked_platform_retention_bps';
    const version=Number(f.sqlite.prepare('SELECT COALESCE(MAX(version),0)+1 v FROM business_setting_versions WHERE setting_key=?').get(key)?.v);
    f.sqlite.prepare(`UPDATE business_setting_versions SET effective_until=? WHERE setting_key=? AND status='published' AND effective_until IS NULL`).run(f.financialNow,key);
    f.sqlite.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES('offered-12',?,?,'1200','published',1,'controlled',?,'New maker offer','reviewer',?,'offered-12')`).run(key,version,f.financialNow,f.financialNow);
    const before=snapshot(f.sqlite);
    const data=await getSellerEarnings(readOnly(f.db),f.sellerId,f.financialNow);
    assert.equal(data.managed?.retentionBps,null);
    assert.equal(data.managed?.offeredRetentionBps,1200);
    assert.equal(data.managed?.summary.payablePaisa,91000);
    assert.equal(snapshot(f.sqlite),before);
  } finally { f.sqlite.close(); }
});

void test('seller earnings reads saved maker terms and balances without changing any fixture record', async () => {
  const f = await earnedMaker();
  try {
    const before = snapshot(f.sqlite);
    const workspace = await getSellerEarnings(
      readOnly(f.db),
      f.sellerId,
      f.financialNow,
    );
    assert.equal(workspace.participationRoute, 'managed_maker');
    assert.equal(workspace.managed?.summary.payablePaisa, 91000);
    assert.equal(workspace.managed?.retentionBps, 900);
    assert.equal(workspace.registered.availablePaisa, 0);
    assert.equal(workspace.registered.grossSalesPaisa, 0);
    assert.equal(workspace.hasRegisteredRecords, false);
    assert.equal(snapshot(f.sqlite), before);
    const other = await getSellerEarnings(
      readOnly(f.db),
      'another-shop',
      f.financialNow,
    );
    assert.equal(other.managed, null);
    assert.equal(other.registered.grossSalesPaisa, 0);
    assert.equal(snapshot(f.sqlite), before);
  } finally {
    f.sqlite.close();
  }
});

void test('missing current rates leave historical maker earnings readable without replacement terms', async () => {
  const f = await earnedMaker();
  try {
    f.sqlite.prepare("UPDATE business_setting_versions SET effective_until=? WHERE setting_key IN ('independent_seller_commission_bps','managed_sale_linked_platform_retention_bps')").run(f.financialNow);
    const before = snapshot(f.sqlite);
    const data = await getSellerEarnings(readOnly(f.db), f.sellerId, f.financialNow);
    assert.equal(data.commission, null);
    assert.equal(data.currentRateUnavailable, true);
    assert.equal(data.offeredCommissionBps, undefined);
    assert.equal(data.managed?.retentionBps, null);
    assert.equal(data.managed?.offeredRetentionBps, null);
    assert.equal(data.managed?.summary.balancePaisa, 91000);
    assert.equal(snapshot(f.sqlite), before);
  } finally { f.dispose(); }
});

void test('action case counts include only owned cases still awaiting seller response', async () => {
  const f = await earnedMaker();
  try {
    secondShop(f);
    f.sqlite
      .prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at)
      VALUES('needs-response',?,'damaged','Isolated return request','requested',?)`)
      .run(f.itemId, f.financialNow);
    f.sqlite
      .prepare(
        `INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at,seller_response) VALUES('already-answered',?,'damaged','Isolated answered return','requested',?,'Already answered')`,
      )
      .run(f.itemId, f.financialNow);
    f.sqlite
      .prepare(
        `INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at) VALUES('other-return','other-item','damaged','Other shop return','requested',?)`,
      )
      .run(f.financialNow);
    for (let index = 0; index < 16; index++)
      f.sqlite
        .prepare(
          `INSERT INTO complaints(id,reference_number,seller_id,category,subject,detail,status,created_at,updated_at) VALUES(?,?,?,'product','Fixture issue','Isolated complaint','open',1,1)`,
        )
        .run('owned-complaint-' + index, 'CMP-' + index, f.sellerId);
    for (const [id, seller, status, response] of [
      ['responded', f.sellerId, 'open', 'Answered'],
      ['closed', f.sellerId, 'closed', null],
      ['resolved', f.sellerId, 'resolved', null],
      ['other', 'other-shop', 'open', null],
    ] as const) {
      f.sqlite
        .prepare(
          `INSERT INTO complaints(id,reference_number,seller_id,category,subject,detail,status,seller_response,created_at,updated_at) VALUES(?,?,?,'product','Fixture issue','Isolated complaint',?,?,1,1)`,
        )
        .run(id, 'CMP-' + id, seller, status, response);
    }
    f.sqlite
      .prepare(`INSERT INTO return_requests(id,order_item_id,reason,detail,status,requested_at)
      VALUES('waiting-admin',?,'damaged','Isolated admin review','under_investigation',?)`)
      .run(f.itemId, f.financialNow);
    const before = snapshot(f.sqlite);
    assert.deepEqual(
      await getSellerActionCaseCounts(readOnly(f.db), f.sellerId),
      { returns: 1, complaints: 16 },
    );
    assert.deepEqual(
      await getSellerActionCaseCounts(readOnly(f.db), 'other-shop'),
      { returns: 1, complaints: 1 },
    );
    assert.equal(snapshot(f.sqlite), before);
  } finally {
    f.sqlite.close();
  }
});

void test('work summary counts complete owned orders once per packing stage', async () => {
  const f = await earnedMaker();
  try {
    secondShop(f);
    f.sqlite
      .prepare("UPDATE order_items SET fulfillment_status='packing' WHERE id=?")
      .run(f.itemId);
    clone(f, 'order_items', f.itemId, {
      id: 'same-order-second-line',
      fulfillment_status: 'packing',
    });
    for (let index = 0; index < 6; index++) {
      clone(f, 'orders', f.orderId, {
        id: 'owned-order-' + index,
        order_number: 'OWN-' + index,
        idempotency_key: 'owned-key-' + index,
        receipt_token_hash: 'owned-receipt-' + index,
      });
      clone(f, 'order_items', f.itemId, {
        id: 'owned-item-' + index,
        order_id: 'owned-order-' + index,
        fulfillment_status: 'confirmed',
      });
    }
    f.sqlite
      .prepare(
        "UPDATE orders SET grand_total_paisa=600000 WHERE id='owned-order-0'",
      )
      .run();
    f.sqlite
      .prepare(
        "INSERT INTO first_cod_reviews(order_id,customer_id,total_paisa,status,created_at) SELECT id,customer_id,grand_total_paisa,'pending',1 FROM orders WHERE id='owned-order-0'",
      )
      .run();
    const before = snapshot(f.sqlite);
    assert.deepEqual(await getSellerWorkSummary(readOnly(f.db), f.sellerId), {
      toPack: 5,
      packing: 1,
      ready: 0,
      needsChanges: 0,
      awaitingConfirmation: 1,
    });
    assert.deepEqual(await getSellerWorkSummary(readOnly(f.db), 'other-shop'), {
      toPack: 1,
      packing: 0,
      ready: 0,
      needsChanges: 0,
      awaitingConfirmation: 0,
    });
    assert.equal(snapshot(f.sqlite), before);
  } finally {
    f.sqlite.close();
  }
});
