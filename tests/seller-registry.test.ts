import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import {
  getSellerRegistryCounts,
  listSellerRegistry,
} from '../lib/db/repositories/seller-applications';

class TestPreparedStatement {
  private values: SQLInputValue[] = [];

  constructor(private readonly statement: StatementSync) {}

  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }

  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }

  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }
}

class TestDatabase {
  constructor(private readonly sqlite: DatabaseSync) {}

  prepare(sql: string) {
    return new TestPreparedStatement(this.sqlite.prepare(sql));
  }
}

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      status TEXT NOT NULL
    );
    CREATE TABLE seller_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      application_reference TEXT,
      legal_name TEXT NOT NULL,
      trading_name TEXT NOT NULL,
      representative_name TEXT NOT NULL,
      support_email TEXT NOT NULL,
      support_phone TEXT NOT NULL,
      district TEXT NOT NULL,
      tax_mode TEXT NOT NULL,
      applicant_type TEXT,
      status TEXT NOT NULL,
      approved_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE seller_documents (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
    CREATE TABLE seller_participation_profiles (
      seller_id TEXT PRIMARY KEY,
      participation_route TEXT NOT NULL,
      application_stage TEXT NOT NULL,
      public_maker_name TEXT NOT NULL,
      public_city TEXT NOT NULL,
      legal_seller_ref TEXT,
      invoice_issuer_ref TEXT,
      payout_beneficiary_ref TEXT,
      return_destination_mode TEXT NOT NULL
    );
    CREATE TABLE products (id TEXT PRIMARY KEY, seller_id TEXT NOT NULL);
    CREATE TABLE order_items (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, seller_id TEXT NOT NULL);

    INSERT INTO users VALUES
      ('user-submitted', 'Submitted Owner', 'submitted@example.test', '9812345678', 'active'),
      ('user-approved', 'Approved Owner', 'approved@example.test', '9810000000', 'active'),
      ('user-rejected', 'Rejected Owner', 'rejected@example.test', '9810000000', 'disabled'),
      ('user-suspended', 'Suspended Owner', 'suspended@example.test', '9810000000', 'active');
    INSERT INTO seller_profiles VALUES
      ('seller-submitted', 'user-submitted', 'HB-S-1', 'Submitted Legal', 'Submitted Shop', 'Submitted Owner', 'submitted@shop.test', '9800000001', 'Kathmandu', 'PAN', 'individual', 'submitted', NULL, 100, 100),
      ('seller-approved', 'user-approved', 'HB-S-2', 'Approved Legal', 'Approved Shop', 'Approved Owner', 'approved@shop.test', '9800000002', 'Lalitpur', 'VAT', 'company', 'approved', 250, 200, 250),
      ('seller-rejected', 'user-rejected', 'HB-S-3', 'Rejected Legal', 'Rejected Shop', 'Rejected Owner', 'rejected@shop.test', '9800000003', 'Bhaktapur', 'BOTH', 'company', 'rejected', NULL, 300, 310),
      ('seller-suspended', 'user-suspended', 'HB-S-4', 'Suspended Legal', 'Suspended Shop', 'Suspended Owner', 'suspended@shop.test', '9800000004', 'Kaski', 'PAN', NULL, 'suspended', 350, 400, 450);
    INSERT INTO seller_documents VALUES
      ('document-1', 'seller-approved'),
      ('document-2', 'seller-approved');
    INSERT INTO seller_participation_profiles VALUES
      ('seller-submitted', 'registered_seller', 'submitted', 'Submitted Shop', 'Kathmandu', 'seller-submitted', 'seller-submitted', 'seller-submitted', 'seller_address'),
      ('seller-approved', 'registered_seller', 'active', 'Approved Shop', 'Lalitpur', 'seller-approved', 'seller-approved', 'seller-approved', 'seller_address'),
      ('seller-rejected', 'registered_seller', 'rejected', 'Rejected Shop', 'Bhaktapur', 'seller-rejected', 'seller-rejected', 'seller-rejected', 'seller_address'),
      ('seller-suspended', 'registered_seller', 'suspended', 'Suspended Shop', 'Kaski', 'seller-suspended', 'seller-suspended', 'seller-suspended', 'seller_address');
    INSERT INTO products VALUES
      ('product-1', 'seller-approved'),
      ('product-2', 'seller-approved');
    INSERT INTO order_items VALUES
      ('item-1', 'order-1', 'seller-approved'),
      ('item-2', 'order-1', 'seller-approved'),
      ('item-3', 'order-2', 'seller-approved');
  `);
  return {
    database: new TestDatabase(sqlite) as unknown as D1Database,
    dispose: () => sqlite.close(),
  };
}

void test('Super Admin seller registry counts every lifecycle status', async () => {
  const setup = fixture();
  try {
    assert.deepEqual(await getSellerRegistryCounts(setup.database), {
      total: 4,
      draft: 0,
      submitted: 1,
      underReview: 0,
      needsChanges: 0,
      approved: 1,
      rejected: 1,
      suspended: 1,
    });
  } finally {
    setup.dispose();
  }
});

void test('seller registry includes approved and closed applications with details and activity', async () => {
  const setup = fixture();
  try {
    const firstPage = await listSellerRegistry(setup.database, 1, 2);
    assert.deepEqual(
      firstPage.map((seller) => seller.id),
      ['seller-suspended', 'seller-rejected'],
    );
    assert.equal(firstPage[1].accountStatus, 'disabled');

    const secondPage = await listSellerRegistry(setup.database, 2, 2);
    assert.deepEqual(
      secondPage.map((seller) => seller.id),
      ['seller-approved', 'seller-submitted'],
    );
    assert.equal(secondPage[0].documentCount, 2);
    assert.equal(secondPage[0].productCount, 2);
    assert.equal(secondPage[0].orderCount, 2);
    assert.equal(secondPage[0].ownerEmail, 'approved@example.test');
  } finally {
    setup.dispose();
  }
});

void test('seller registry rejects invalid pagination', async () => {
  const setup = fixture();
  try {
    await assert.rejects(() => listSellerRegistry(setup.database, 0, 50));
    await assert.rejects(() => listSellerRegistry(setup.database, 1, 101));
  } finally {
    setup.dispose();
  }
});

void test('registry search finds an older record before pagination and matches references', async () => {
 const setup=fixture();
 try {
  assert.deepEqual((await listSellerRegistry(setup.database,1,1,{q:'  submitted shop  '})).map(s=>s.id),['seller-submitted']);
  assert.deepEqual((await listSellerRegistry(setup.database,1,50,{q:'HB-S-2',status:'approved'})).map(s=>s.id),['seller-approved']);
 } finally {setup.dispose();}
});
void test('registry totals and rows use the same status and literal search across pages', async () => {
 const setup=fixture();
 try {
  assert.equal((await getSellerRegistryCounts(setup.database,{q:'SHOP',status:'approved'})).total,1);
  assert.deepEqual((await listSellerRegistry(setup.database,1,1,{status:'awaiting_review'})).map(s=>s.id),['seller-submitted']);
  for(const q of ["' OR 1=1 --",'%','_']) {
   assert.equal((await getSellerRegistryCounts(setup.database,{q})).total,0);
   assert.deepEqual(await listSellerRegistry(setup.database,1,50,{q}),[]);
  }
 } finally {setup.dispose();}
});

void test('seller search includes the account owner phone separately from shop support phone',async()=>{
 const setup=fixture();
 try {
  assert.deepEqual((await listSellerRegistry(setup.database,1,1,{q:'9812345678'})).map(row=>row.id),['seller-submitted']);
  assert.equal((await getSellerRegistryCounts(setup.database,{q:'9812345678'})).total,1);
  assert.deepEqual((await listSellerRegistry(setup.database,1,1,{q:'9800000001'})).map(row=>row.id),['seller-submitted']);
 }finally{setup.dispose();}
});
