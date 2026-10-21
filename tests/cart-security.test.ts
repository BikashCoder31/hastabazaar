import assert from 'node:assert/strict';
import test from 'node:test';
import { cartCookie, receiptCookie } from '../lib/cart/session';
import {
  addCartItem,
  updateCartItem,
  removeCartItem,
  CartConflictError,
} from '../lib/db/repositories/cart';
import { commissionDatabase } from './helpers/commission-database';

void test('cart and receipt cookies are Secure behind the configured HTTPS proxy', () => {
  const environment = process.env as Record<string, string | undefined>;
  const oldOrigin = environment.APP_ORIGIN,
    oldMode = environment.NODE_ENV;
  try {
    const request = new Request('http://127.0.0.1:3000/api/checkout');
    for (const [origin, mode] of [
      ['https://shop.example.test', 'development'],
      ['http://shop.example.test', 'production'],
    ]) {
      environment.APP_ORIGIN = origin;
      environment.NODE_ENV = mode;
      for (const cookie of [
        cartCookie(request, 'fictional-token'),
        receiptCookie(request, 'fictional-token'),
      ]) {
        assert.match(cookie, /; Secure(?:;|$)/);
        assert.match(cookie, /HttpOnly; SameSite=Lax/);
      }
    }
    environment.NODE_ENV = 'development';
    environment.APP_ORIGIN = 'http://localhost:3018';
    const local = new Request('http://localhost:3018/api/cart', {
      headers: { 'x-forwarded-proto': 'https', forwarded: 'proto=https' },
    });
    assert.doesNotMatch(cartCookie(local, 'fictional-token'), /; Secure/);
    assert.match(
      receiptCookie(
        new Request('https://hastabazaar.com/orders/test'),
        'fictional-token',
      ),
      /; Secure/,
    );
  } finally {
    if (oldOrigin === undefined) delete environment.APP_ORIGIN;
    else environment.APP_ORIGIN = oldOrigin;
    if (oldMode === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = oldMode;
  }
});

async function fixture(lines: number, quantity = 1) {
  const f = await commissionDatabase();
  f.sqlite.exec(
    "INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('security-cat','security-cat','Fixture',1,1,1,1); INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES('security-cart','security-token','NPR',253402300799999,1,1)",
  );
  for (let i = 0; i < 22; i++) {
    f.sqlite
      .prepare(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
      VALUES(?,'seller-a','security-cat',?,?,'Fixture product','Isolated security fixture',10000,10,'Fixture','NP','Wood','published',1,1)`)
      .run('security-product-' + i, 'security-product-' + i, 'SECURITY-' + i);
    if (i < lines)
      f.sqlite
        .prepare(
          'INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES(?,?,?,?,1,1)',
        )
        .run(
          'security-line-' + i,
          'security-cart',
          'security-product-' + i,
          quantity,
        );
  }
  // Force two legacy read/check/write callers to see the same pre-write state.
  // Real D1 serializes write batches; model that separately from concurrent reads.
  let arrivals = 0,
    release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let tail: Promise<unknown> = Promise.resolve();
  const db = {
    prepare(sql: string) {
      const prepared = f.database.prepare(sql);
      return {
        bind(...args: unknown[]) {
          prepared.bind(...args);
          return this;
        },
        async first<T>() {
          const result = await prepared.first<T>();
          if (
            /^SELECT id, quantity FROM cart_items|^SELECT COUNT\(\*\) AS count FROM cart_items/.test(
              sql.trim(),
            )
          ) {
            if (++arrivals === 2) release();
            await gate;
          }
          return result;
        },
        all: prepared.all.bind(prepared),
        run: prepared.run.bind(prepared),
      };
    },
    batch(statements: D1PreparedStatement[]) {
      const result = tail.then(() => f.database.batch(statements));
      tail = result.catch(() => {});
      return result;
    },
  } as unknown as D1Database;
  return { ...f, db };
}

void test('parallel additions preserve every accepted quantity increment', async () => {
  const f = await fixture(1);
  try {
    await Promise.all([
      addCartItem(f.db, 'security-token', 'security-product-0', 1, 10),
      addCartItem(f.db, 'security-token', 'security-product-0', 1, 11),
    ]);
    assert.equal(
      f.sqlite
        .prepare("SELECT quantity q FROM cart_items WHERE id='security-line-0'")
        .get()?.q,
      3,
    );
  } finally {
    await f.dispose();
  }
});

void test('parallel additions cannot exceed twenty different products', async () => {
  const f = await fixture(19);
  try {
    const results = await Promise.allSettled([
      addCartItem(f.db, 'security-token', 'security-product-19', 1, 10),
      addCartItem(f.db, 'security-token', 'security-product-20', 1, 11),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      f.sqlite
        .prepare(
          "SELECT count(*) n FROM cart_items WHERE cart_id='security-cart'",
        )
        .get()?.n,
      20,
    );
    const rejected = results.find((r) => r.status === 'rejected');
    assert.ok(
      rejected?.status === 'rejected' &&
        rejected.reason instanceof CartConflictError,
    );
  } finally {
    await f.dispose();
  }
});

void test('parallel additions cannot exceed the per-item limit', async () => {
  const f = await fixture(1, 9);
  try {
    f.sqlite.exec(
      "UPDATE products SET inventory_quantity=100 WHERE id='security-product-0'",
    );
    const results = await Promise.allSettled([
      addCartItem(f.db, 'security-token', 'security-product-0', 1, 10),
      addCartItem(f.db, 'security-token', 'security-product-0', 1, 11),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      f.sqlite
        .prepare("SELECT quantity q FROM cart_items WHERE id='security-line-0'")
        .get()?.q,
      10,
    );
  } finally {
    await f.dispose();
  }
});

void test('parallel additions cannot exceed stock below the per-item limit', async () => {
  const f = await fixture(1, 2);
  try {
    f.sqlite.exec(
      "UPDATE products SET inventory_quantity=3 WHERE id='security-product-0'",
    );
    const results = await Promise.allSettled([
      addCartItem(f.db, 'security-token', 'security-product-0', 1, 10),
      addCartItem(f.db, 'security-token', 'security-product-0', 1, 11),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(
      f.sqlite
        .prepare("SELECT quantity q FROM cart_items WHERE id='security-line-0'")
        .get()?.q,
      3,
    );
  } finally {
    await f.dispose();
  }
});

void test('stock and seller eligibility are checked again inside the cart transaction', async () => {
  for (const change of [
    "UPDATE products SET inventory_quantity=1 WHERE id='security-product-0'",
    "UPDATE seller_profiles SET status='suspended' WHERE id='seller-a'",
  ]) {
    const f = await fixture(1);
    try {
      const racing = {
        prepare: f.db.prepare.bind(f.db),
        batch: async (statements: D1PreparedStatement[]) => {
          f.sqlite.exec(change);
          return f.db.batch(statements);
        },
      } as D1Database;
      await assert.rejects(
        addCartItem(racing, 'security-token', 'security-product-0', 1, 10),
        CartConflictError,
      );
      assert.equal(
        f.sqlite
          .prepare(
            "SELECT quantity q FROM cart_items WHERE id='security-line-0'",
          )
          .get()?.q,
        1,
      );
      assert.equal(
        f.sqlite
          .prepare('SELECT count(*) n FROM operation_transaction_guards')
          .get()?.n,
        0,
      );
    } finally {
      await f.dispose();
    }
  }
});

void test('cart updates recheck stock at commit and cannot edit or remove another cart line', async () => {
  const f = await fixture(1);
  try {
    f.sqlite.exec(
      "INSERT INTO carts(id,anonymous_token_hash,currency,expires_at,created_at,updated_at) VALUES('other-cart','other-token','NPR',253402300799999,1,1); INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('other-line','other-cart','security-product-0',1,1,1)",
    );
    await assert.rejects(
      updateCartItem(f.db, 'security-token', 'other-line', 2, 10),
      CartConflictError,
    );
    await removeCartItem(f.db, 'security-token', 'other-line');
    assert.equal(
      f.sqlite
        .prepare("SELECT quantity q FROM cart_items WHERE id='other-line'")
        .get()?.q,
      1,
    );
    const racing = {
      prepare: f.db.prepare.bind(f.db),
      batch: async (statements: D1PreparedStatement[]) => {
        f.sqlite.exec(
          "UPDATE products SET inventory_quantity=1 WHERE id='security-product-0'",
        );
        return f.db.batch(statements);
      },
    } as D1Database;
    await assert.rejects(
      updateCartItem(racing, 'security-token', 'security-line-0', 2, 10),
      CartConflictError,
    );
    assert.equal(
      f.sqlite
        .prepare("SELECT quantity q FROM cart_items WHERE id='security-line-0'")
        .get()?.q,
      1,
    );
  } finally {
    await f.dispose();
  }
});
