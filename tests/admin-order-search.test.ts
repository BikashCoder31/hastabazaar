import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import test from 'node:test';
import {
  listOrdersForOperations,
  countOrdersForOperations,
} from '../lib/db/repositories/orders';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`CREATE TABLE orders(id TEXT,order_number TEXT,status TEXT,customer_email TEXT,customer_phone TEXT,current_total_paisa INTEGER,grand_total_paisa INTEGER,payment_mode TEXT,placed_at INTEGER,created_at INTEGER);
 CREATE TABLE order_items(order_id TEXT,quantity INTEGER);
 CREATE TABLE first_cod_reviews(order_id TEXT,status TEXT);
 INSERT INTO orders VALUES('older','HB-SEARCH-1','confirmed','buyer@fictional.test','98001',NULL,10000,'cod',1,1),('newer','HB-SEARCH-2','confirmed','second@fictional.test','98002',8000,10000,'cod',2,2),('delivered','HB-SEARCH-3','delivered','third@fictional.test','98003',NULL,12000,'cod',3,3);
 INSERT INTO order_items VALUES('older',1),('newer',2),('delivered',1);
 INSERT INTO first_cod_reviews VALUES('newer','pending');`);
  const database = {
    prepare(sql: string) {
      const statement = sqlite.prepare(sql);
      let values: SQLInputValue[] = [];
      return {
        bind(...args: SQLInputValue[]) {
          values = args;
          return this;
        },
        async all() {
          return { results: statement.all(...values) };
        },
        async first() {
          return statement.get(...values) ?? null;
        },
      };
    },
  } as unknown as D1Database;
  return { database, dispose: () => sqlite.close() };
}
void test('order reference search finds a record outside the first page', async () => {
  const s = fixture();
  try {
    assert.deepEqual(
      (await listOrdersForOperations(s.database, 1, { q: ' search-1 ' })).map(
        (o) => o.id,
      ),
      ['older'],
    );
  } finally {
    s.dispose();
  }
});
void test('order status filter distinguishes pending first COD confirmation from confirmed', async () => {
  const s = fixture();
  try {
    assert.deepEqual(
      (
        await listOrdersForOperations(s.database, 50, {
          status: 'awaiting_cod_confirmation',
        })
      ).map((o) => o.id),
      ['newer'],
    );
    assert.deepEqual(
      (
        await listOrdersForOperations(s.database, 50, { status: 'confirmed' })
      ).map((o) => o.id),
      ['older'],
    );
    assert.deepEqual(
      (
        await listOrdersForOperations(s.database, 50, { status: 'delivered' })
      ).map((o) => o.id),
      ['delivered'],
    );
  } finally {
    s.dispose();
  }
});
void test('order search treats SQL and wildcard characters as literal text', async () => {
  const s = fixture();
  try {
    for (const q of ["' OR 1=1 --", '%', '_'])
      assert.deepEqual(
        await listOrdersForOperations(s.database, 50, { q }),
        [],
      );
  } finally {
    s.dispose();
  }
});

void test('filtered order totals stay aligned with pagination and COD presentation', async () => {
  const s = fixture();
  try {
    assert.equal(
      await countOrdersForOperations(s.database, {
        q: 'SEARCH',
        status: 'confirmed',
      }),
      1,
    );
    assert.equal(
      await countOrdersForOperations(s.database, {
        status: 'awaiting_cod_confirmation',
      }),
      1,
    );
    assert.deepEqual(
      (await listOrdersForOperations(s.database, 1, {}, 2)).map((o) => o.id),
      ['newer'],
    );
  } finally {
    s.dispose();
  }
});
