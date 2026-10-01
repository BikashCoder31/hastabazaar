import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import {
  customerRiderCodeJobs,
  requestCustomerRiderCode,
  parseRiderCodeRequest,
} from '../lib/riders/customer-code';
import { verifyRiderOtp } from '../lib/riders/repository';
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(
    "CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);CREATE TABLE orders(id TEXT PRIMARY KEY,order_number TEXT,customer_id TEXT,receipt_token_hash TEXT,payment_mode TEXT,status TEXT);CREATE TABLE shipping_jobs(id TEXT PRIMARY KEY,order_id TEXT,status TEXT);CREATE TABLE shipping_parcels(shipping_job_id TEXT PRIMARY KEY,rider_user_id TEXT,version INTEGER,method TEXT);CREATE TABLE rider_profiles(user_id TEXT PRIMARY KEY,status TEXT);CREATE TABLE rider_policy(id TEXT PRIMARY KEY,version INTEGER,open_box INTEGER,otp_scope TEXT);CREATE TABLE rider_otp_challenges(shipping_job_id TEXT PRIMARY KEY,rider_user_id TEXT,assignment_version INTEGER,code_hash TEXT,expires_at INTEGER,attempts INTEGER DEFAULT 0,consumed_at INTEGER);CREATE TABLE operation_transaction_guards(id TEXT PRIMARY KEY,valid INTEGER CHECK(valid=1));CREATE TABLE audit_logs(id TEXT,actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,created_at INTEGER);CREATE TABLE rider_events(id TEXT,user_id TEXT,actor_id TEXT,action TEXT,report_id TEXT,note TEXT,created_at INTEGER);INSERT INTO users VALUES ('customer','active'),('rider','active'),('other','active');INSERT INTO orders VALUES ('order','ORDER-1','customer','exact-receipt-hash','prepaid','dispatched'),('other-order','ORDER-2','customer','other-receipt','prepaid','dispatched');INSERT INTO shipping_jobs VALUES ('job','order','dispatched'),('other-job','other-order','dispatched');INSERT INTO shipping_parcels VALUES ('job','rider',1,'own_rider'),('other-job','rider',1,'own_rider');INSERT INTO rider_profiles VALUES ('rider','approved');INSERT INTO rider_policy VALUES ('current',0,0,'off')",
  );
  const db = {
    prepare(sql: string) {
      let values: SQLInputValue[] = [];
      const st = sqlite.prepare(sql);
      return {
        bind(...v: SQLInputValue[]) {
          values = v;
          return this;
        },
        async first() {
          return st.get(...values) ?? null;
        },
        async all() {
          return { results: st.all(...values) };
        },
        async run() {
          return { meta: { changes: Number(st.run(...values).changes) } };
        },
      };
    },
    async batch(statements: { run: () => Promise<unknown> }[]) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const s of statements) results.push(await s.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}
const owner = {
  orderNumber: 'ORDER-1',
  customerId: 'customer',
  receiptTokenHash: null,
};
void test('protected customer code discovery is off by default and rejects COD, wrong owner, stale rider and wrong-order parcel', async () => {
  const { sqlite, db } = fixture();
  try {
    assert.deepEqual((await customerRiderCodeJobs(db, owner)).map(row=>({...row})), []);
    sqlite.exec("UPDATE rider_policy SET otp_scope='prepaid_only'");
    assert.deepEqual((await customerRiderCodeJobs(db, owner)).map(row=>({...row})), [
      { id: 'job', version: 1 },
    ]);
    await assert.rejects(() =>
      requestCustomerRiderCode(db, { ...owner, jobId: 'other-job', now: 1 }),
    );
    assert.deepEqual(
      await customerRiderCodeJobs(db, { ...owner, customerId: 'other' }),
      [],
    );
    assert.deepEqual(
      await customerRiderCodeJobs(db, {
        ...owner,
        customerId: null,
        receiptTokenHash: 'wrong',
      }),
      [],
    );
    sqlite.exec("UPDATE orders SET payment_mode='cod' WHERE id='order'");
    assert.deepEqual(await customerRiderCodeJobs(db, owner), []);
    sqlite.exec(
      "UPDATE orders SET payment_mode='prepaid';UPDATE rider_profiles SET status='suspended'",
    );
    assert.deepEqual(await customerRiderCodeJobs(db, owner), []);
  } finally {
    sqlite.close();
  }
});
void test('exact receipt holder gets one ten-minute code, only current approved rider verifies, and no delivery transition occurs', async () => {
  const { sqlite, db } = fixture();
  try {
    sqlite.exec(
      "UPDATE rider_policy SET otp_scope='prepaid_only';UPDATE orders SET customer_id=NULL WHERE id='order'",
    );
    const guest = {
      ...owner,
      customerId: null,
      receiptTokenHash: 'exact-receipt-hash',
    };
    const code = await requestCustomerRiderCode(db, {
      ...guest,
      jobId: 'job',
      now: 100,
    });
    assert.equal(code.expiresAt, 600100);
    assert.match(code.code, /^\d{6}$/);
    assert.ok(
      !String(
        sqlite.prepare('SELECT code_hash FROM rider_otp_challenges').get()
          ?.code_hash,
      ).includes(code.code),
    );
    await assert.rejects(() =>
      requestCustomerRiderCode(db, { ...guest, jobId: 'job', now: 101 }),
    );
    assert.equal(
      await verifyRiderOtp(db, {
        jobId: 'job',
        riderId: 'other',
        version: 1,
        code: code.code,
        now: 102,
      }),
      false,
    );
    assert.equal(
      await verifyRiderOtp(db, {
        jobId: 'job',
        riderId: 'rider',
        version: 1,
        code: code.code,
        now: 103,
      }),
      true,
    );
    assert.equal(
      await verifyRiderOtp(db, {
        jobId: 'job',
        riderId: 'rider',
        version: 1,
        code: code.code,
        now: 104,
      }),
      false,
    );
    assert.equal(
      sqlite.prepare("SELECT status FROM shipping_jobs WHERE id='job'").get()
        ?.status,
      'dispatched',
    );
    assert.ok(
      !JSON.stringify(
        sqlite.prepare('SELECT * FROM audit_logs').all(),
      ).includes(code.code),
    );
  } finally {
    sqlite.close();
  }
});
void test('code request validation rejects malformed parcel IDs and non-six-digit verification without coercing numbers', () => {
  assert.throws(() => parseRiderCodeRequest({ jobId: '../../other' }));
  assert.throws(() =>
    parseRiderCodeRequest({ jobId: 'job', version: 1, code: 123456 }, true),
  );
  assert.throws(() =>
    parseRiderCodeRequest({ jobId: 'job', version: -1, code: '123456' }, true),
  );
  assert.deepEqual(
    parseRiderCodeRequest({ jobId: 'job', version: 2, code: '001234' }, true),
    { jobId: 'job', version: 2, code: '001234' },
  );
});
