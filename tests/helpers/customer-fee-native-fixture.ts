import assert from 'node:assert/strict';
import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';
import { stagingNativeFixture } from './staging-native-fixture';
import { customerFeeCheckoutFixture, addManaged } from './customer-fee-waiver-fixture';
import { seedLegacyPublishedCampaign, seedLegacyReceipt, seedLegacyOrderFees } from './legacy-fee-history-fixture';
import { AT, terms, feeWaiverContext } from './customer-fee-waiver-fixture';

type Trace = { thread: number; sql: string; complete: boolean };

/** Materialize a separate original historical order; never rewrite a corrected checkout. */
export async function seedNativeLegacyHistory(db: D1Database) {
  const campaign = await seedLegacyPublishedCampaign(db, 'native-retained-seller-history', { ...terms, name: 'Retained historical seller campaign' }, AT);
  await seedLegacyReceipt(db, feeWaiverContext('native-retained-create', 0, { now: AT }), { type: 'create', terms }, { ...campaign, revision: 1, state: 'draft' });
  await seedLegacyReceipt(db, feeWaiverContext('native-retained-publish', 1, { now: AT }), { type: 'publish', campaignId: campaign.id }, campaign);
  const orderId = 'native-original-legacy-order', itemId = 'native-original-legacy-line';
  await db.prepare(`INSERT INTO orders(id,order_number,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,buyer_platform_fee_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
    VALUES(?,'native-original-legacy-order','history@example.test','9811111111','confirmed','en-NP','historical','{}',10000,0,1000,11000,'cod','pending',1,1)`).bind(orderId).run();
  await db.prepare(`INSERT INTO order_items(id,order_id,product_id,seller_id,seller_name_snapshot,product_name_snapshot,sku_snapshot,unit_price_paisa,quantity,commission_bps,commission_paisa,line_total_paisa,created_at)
    VALUES(?,?,'product','seller-a','Historical fictional shop','Historical craft','OLD-SKU',10000,1,900,900,10000,1)`).bind(itemId, orderId).run();
  await seedLegacyOrderFees(db, orderId, campaign, 1);
  return { campaign, orderId, itemId };
}

/** Instrumentation observes actual driver statements; it never substitutes results or transactions. */
export async function customerFeeNativeFixture(managed = false) {
  const scope = await stagingNativeFixture();
  const monitor = await mysql.createConnection(scope);
  const blocker = await mysql.createConnection(scope).catch(async error => { await monitor.end(); throw error; });
  const original = mysql.createPool;
  const pools: Pool[] = [], traces: Trace[] = [];
  const wrapped = new WeakSet<PoolConnection>();
  const leaseStart = new WeakMap<PoolConnection, number>();
  let gate: { matches: RegExp; claimed: boolean; enter(thread: number): void; released: Promise<void> } | undefined;
  mysql.createPool = ((...args: Parameters<typeof original>) => {
    const pool = Reflect.apply(original, mysql, args) as Pool;
    pools.push(pool);
    const get = pool.getConnection.bind(pool);
    pool.getConnection = async () => {
      const c = await get();
      leaseStart.set(c, traces.length);
      if (!wrapped.has(c)) {
        wrapped.add(c);
        const execute = c.execute.bind(c);
        c.execute = (async (...parameters: Parameters<typeof execute>) => {
          const first = parameters[0];
          const event = { thread: c.threadId, sql: typeof first === 'string' ? first : first.sql, complete: false };
          traces.push(event);
          try { return await Reflect.apply(execute, c, parameters); }
          finally { event.complete = true; }
        }) as typeof execute;
        const commit = c.commit.bind(c);
        c.commit = async () => {
          if (gate && !gate.claimed && traces.slice(leaseStart.get(c)).some(e => e.thread === c.threadId && gate!.matches.test(e.sql))) {
            gate.claimed = true;
            gate.enter(c.threadId);
            await gate.released;
          }
          await commit();
        };
      }
      return c;
    };
    return pool;
  }) as typeof original;
  async function close() {
    mysql.createPool = original;
    const rollback = await Promise.allSettled([blocker.rollback()]);
    const closed = await Promise.allSettled([blocker.end(), monitor.end(), ...pools.map(pool => pool.end())]);
    const failures = [...rollback, ...closed].filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, 'Native fixture cleanup failed');
  }
  try {
  const { env } = await import('../../lib/runtime/node-bindings');
  const db = env.DB;
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM users').first<{ n: number }>())?.n, 0, 'Runner must supply its empty owned fixture');
  const fixture = await customerFeeCheckoutFixture();
  try {
    if (managed) await addManaged(fixture);
    for (const table of ['users', 'user_roles', 'seller_profiles', 'business_setting_versions',
      'seller_agreement_acceptance_history', 'account_email_verifications', 'account_phone_verifications',
      'form_config_versions', 'seller_documents', 'managed_maker_application_details', 'seller_participation_profiles',
      'categories', 'products']) {
      const rows = fixture.sqlite.prepare(`SELECT * FROM ${table}${table === 'categories' ? " WHERE id='cat'" : ''}`).all();
      for (const row of rows) {
        const columns = Object.keys(row);
        await db.prepare(`INSERT INTO ${table} (${columns.map(c => '`' + c + '`').join(',')}) VALUES (${columns.map(() => '?').join(',')})`).bind(...Object.values(row)).run();
      }
    }
  } finally { await fixture.dispose(); }
  await db.prepare('UPDATE products SET inventory_quantity=100,return_eligible=1').run();
  await db.prepare("UPDATE seller_profiles SET approved_at=0,tax_registration_number=CASE WHEN id='seller-a' THEN '123456789' ELSE '987654321' END").run();
  return {
    db, monitor, blocker, traces, input: fixture.input,
    /** Pause only at COMMIT after the real adapter has executed every statement and holds its actual row locks. */
    holdCommit(matches: RegExp) {
      assert.ok(!gate || gate.claimed, 'Only one transaction gate at a time');
      let enter!: (thread: number) => void, release!: () => void;
      const entered = new Promise<number>(resolve => { enter = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      gate = { matches, claimed: false, enter, released };
      return { entered, release };
    },
    async waitForBlocked(sql: RegExp, since = 0, holder = blocker.threadId) {
      const deadline = performance.now() + 10000;
      while (performance.now() < deadline) {
        const [rows] = await monitor.query<RowDataPacket[]>(`SELECT waiting.trx_mysql_thread_id AS thread,holding.trx_mysql_thread_id AS holder
          FROM information_schema.INNODB_LOCK_WAITS w
          JOIN information_schema.INNODB_TRX waiting ON waiting.trx_id=w.requesting_trx_id
          JOIN information_schema.INNODB_TRX holding ON holding.trx_id=w.blocking_trx_id`);
        const event = traces.slice(since).find(e => !e.complete && sql.test(e.sql) && rows.some(r => Number(r.thread) === e.thread && Number(r.holder) === holder));
        if (event) {
          assert.notEqual(event.thread, holder, 'Competitor uses a different real MariaDB connection');
          console.log('NATIVE LOCK WAIT: ' + JSON.stringify({ waiter: event.thread, holder, statement: event.sql.slice(0, 100) }));
          return event;
        }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      throw new Error('Expected independent MariaDB lock wait was not observed: ' + sql);
    },
    close,
  };
  } catch (error) {
    try { await close(); }
    catch (cleanup) { throw new AggregateError([error, cleanup], 'Native fixture setup and cleanup failed'); }
    throw error;
  }
}
