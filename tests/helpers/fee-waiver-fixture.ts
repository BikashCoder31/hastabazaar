import { commissionDatabase } from './commission-database';
import assert from 'node:assert/strict';
import { historicalCommissionFixture } from './historical-commission-fixture';
import { seedCheckoutBuyer, readyCheckoutSeller } from './checkout-contact';
import type {
  FeeWaiverContext,
  FeeWaiverTerms,
} from '../../lib/marketplace/fee-waivers';

/** Only an in-memory SQLite database; applies real migrations and real transaction rollback. */
export const feeWaiverFixture = commissionDatabase;
/** Fictional checkout prerequisites, on the same real in-memory migrated database. */
export async function feeWaiverCheckoutFixture() {
  const fixture = await commissionDatabase();
  // Match the controlled JS boundary clock for native session/commit checks.
  fixture.sqlite.function('strftime', { varargs: true }, (...args) => {
    if (args[1] !== 'now' || !['%s', '%f'].includes(String(args[0])))
      throw new Error('Unexpected fixture clock format.');
    const now = Date.now();
    return args[0] === '%s' ? String(Math.floor(now / 1000)) : (now % 60000 / 1000).toFixed(3).padStart(6, '0');
  });
  fixture.sqlite
    .exec(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
    VALUES('waiver-standard','independent_seller_commission_bps',1,'1000','published',1,'controlled',1,'Fictional standard terms','owner',1,'waiver-standard');`);
  historicalCommissionFixture(fixture.sqlite, 'owner', true);
  // Original fictional PAN identity must also support the mixed order's bill.
  fixture.sqlite.prepare("UPDATE seller_profiles SET tax_registration_number='123456789' WHERE id='seller-a'").run();
  await readyCheckoutSeller(fixture, 'seller-a', 'user-a', 'owner', 2);
  await seedCheckoutBuyer(fixture.database);
  fixture.sqlite
    .exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cat','craft','Craft',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
      VALUES('product','seller-a','cat','craft','SKU','Craft','Fictional craft',10000,10,'Maker','NP','Wood','published',1,1);
    INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES('cart','token','NPR',1,1);
    INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-a','cart','product',1,1,1);`);
  return {
    ...fixture,
    dispose: async () => {
      try { assert.deepEqual(fixture.sqlite.prepare('PRAGMA foreign_key_check').all(), []); }
      finally { await fixture.dispose(); }
    },
    input: {
      customerAuthSubject: 'checkout-buyer',
      customerEmail: 'buyer@example.test',
      customerPhone: '9811111111',
      locale: 'en-NP' as const,
      termsAccepted: true,
      idempotencyKey: crypto.randomUUID(),
      address: {
        recipientName: 'Fictional Buyer',
        phone: '9811111111',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        locality: 'Ward 1',
      },
    },
  };
}
export const feeWaiverTerms: FeeWaiverTerms = {
  name: 'Global launch',
  description: 'All marketplace sellers',
  startsAt: 10,
  endsAt: 1000,
};
export function feeWaiverContext(
  requestId: string,
  expectedRevision: number,
  overrides: Partial<FeeWaiverContext> = {},
): FeeWaiverContext {
  return {
    actorId: 'owner',
    authSubject: 'owner',
    requestId,
    expectedRevision,
    now: 100,
    ...overrides,
  };
}
/** Run a real competing transaction after the caller has read state, before its batch. */
export function interleaveFeeWaiverBatch(
  db: D1Database,
  action: () => Promise<unknown>,
): D1Database {
  let used = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          if (!used) {
            used = true;
            await action();
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** Commit a real winning request after receipt miss but before the snapshot query executes. */
export function interleaveFeeWaiverStateRead(
  db: D1Database,
  action: () => Promise<unknown>,
): D1Database {
  let used = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'prepare')
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.startsWith('SELECT ctl.revision AS controlRevision'))
            return statement;
          return new Proxy(statement, {
            get(prepared, property) {
              if (property === 'all')
                return async () => {
                  if (!used) {
                    used = true;
                    await action();
                  }
                  return prepared.all();
                };
              const value = Reflect.get(prepared, property);
              return typeof value === 'function' ? value.bind(prepared) : value;
            },
          });
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
