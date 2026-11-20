import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { completeVersionFixture } from './helpers/complete-version-fixture';
import { incentiveReportDatabase } from './helpers/incentive-report-database';

async function contracts() {
  const path = '../lib/workflows/contracts';
  const loadedContract = await import(path).catch(() => null);
  assert.equal(typeof loadedContract?.commandReceipt, 'function', 'shared command receipt contract must exist');
  return loadedContract!;
}

void test('replayed commands bind actor, action, subject, revision and canonical payload to one audit receipt', async () => {
  const c = await contracts();
  const f = await companyStoreMakerFixture();
  try {
    const context = { actorId: 'reviewer', requestId: 'contract-one', expectedRevision: '1', now: f.now };
    const identity = { action: 'seller.contract_test', subjectType: 'seller', subjectId: 'maker' };
    const receipt = await c.commandReceipt(f.db, context, identity, { name: 'A', value: 20 });
    assert.equal(receipt.replayed, false);
    await f.db.batch([receipt.insert({ revision: '2' })]);
    const replay = await c.commandReceipt(f.db, { ...context, now: f.now + 100 }, identity, { value: 20, name: 'A' });
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.result, { revision: '2' });
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()?.n, 1);
    for (const [changedIdentity, payload, revision] of [
      [identity, { value: 21, name: 'A' }, '1'],
      [{ ...identity, subjectId: 'foreign' }, { value: 20, name: 'A' }, '1'],
      [{ ...identity, action: 'seller.other' }, { value: 20, name: 'A' }, '1'],
      [identity, { value: 20, name: 'A' }, '2'],
    ] as const) await assert.rejects(c.commandReceipt(f.db, { ...context, expectedRevision: revision }, changedIdentity, payload), /request.*used/i);
    assert.throws(() => f.sqlite.prepare("UPDATE audit_logs SET command_result_json='{}' WHERE command_key IS NOT NULL").run());
    assert.throws(() => f.sqlite.prepare('DELETE FROM audit_logs WHERE command_key IS NOT NULL').run());
  } finally { f.dispose(); }
});

void test('competing writers use existing transaction guards and roll back business, audit and notification effects together', async () => {
  const c = await contracts();
  const f = await companyStoreMakerFixture();
  try {
    const context = { actorId: 'reviewer', requestId: 'writer-one', expectedRevision: String(f.now), now: f.now + 1 };
    const identity = { action: 'seller.contract_test', subjectType: 'seller', subjectId: 'maker' };
    const receipt = await c.commandReceipt(f.db, context, identity, { name: 'Changed' });
    const command = (r: typeof receipt) => [
      f.db.prepare("INSERT INTO operation_transaction_guards(id,valid) SELECT 'contract-guard',CASE WHEN updated_at=? THEN 1 ELSE 0 END FROM seller_profiles WHERE id='maker'").bind(f.now),
      f.db.prepare("UPDATE seller_profiles SET legal_name='Changed',updated_at=? WHERE id='maker'").bind(f.now + 1),
      r.insert({ revision: String(f.now + 1) }),
      f.db.prepare("INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,request_id,created_at,source_event_id,source_revision) VALUES('contract-notice','reviewer','staff','in_app','contract','Update','Update','Review','Review','contract-notice',1,'contract-event','1')"),
      f.db.prepare("DELETE FROM operation_transaction_guards WHERE id='contract-guard'"),
    ];
    const competing = await c.commandReceipt(f.db, { ...context, requestId: 'writer-two' }, identity, { name: 'Changed' });
    await f.db.batch(command(receipt));
    await assert.rejects(f.db.batch(command(competing)));
    const third = await c.commandReceipt(f.db, { ...context, requestId: 'writer-three' }, identity, { name: 'Other' });
    await assert.rejects(f.db.batch([
      f.db.prepare("UPDATE seller_profiles SET legal_name='Must rollback' WHERE id='maker'"), third.insert({ revision: 'bad' }),
      f.db.prepare("INSERT INTO operation_transaction_guards(id,valid) VALUES('failure',0)"),
    ]));
    assert.equal(f.sqlite.prepare("SELECT legal_name FROM seller_profiles WHERE id='maker'").get()?.legal_name, 'Changed');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL').get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE source_event_id='contract-event'").get()?.n, 1);
    assert.throws(() => f.sqlite.prepare("INSERT INTO notification_messages SELECT 'duplicate',recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,related_type,related_id,status,provider_reference,failure_reason,'different-request',created_at,sent_at,read_at,business_event_key,required_permission,delivery_attempts,delivery_next_attempt_at,delivery_lease_until,delivery_claim_token,guest_email,guest_order_id,source_event_id,source_revision FROM notification_messages WHERE id='contract-notice'").run());
  } finally { f.dispose(); }
});

void test('offer snapshots reject unsafe money and detach immutable selections from mutable catalogue input', async () => {
  const c = await contracts();
  const input = { offerId: 'offer', productId: 'product', revision: '1', selection: [{ name: 'Size', value: 'Small' }], currency: 'NPR', sellingPaisa: 12550, compareAtPaisa: 15000 };
  const snapshot = c.captureOfferSnapshot(input);
  input.selection[0].value = 'Large'; input.sellingPaisa = 999;
  assert.equal(snapshot.sellingPaisa, 12550);
  assert.equal(snapshot.selection[0].value, 'Small');
  assert.ok(Object.isFrozen(snapshot.selection[0]));
  for (const invalid of [NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => c.captureOfferSnapshot({ ...input, sellingPaisa: invalid }));
  assert.throws(() => c.captureOfferSnapshot({ ...input, currency: 'USD' }));
});

void test('additive foundation retains pre-existing audit, notification and order facts', async () => {
  const f = await incentiveReportDatabase(async (name, sqlite) => {
    if (name !== '0079_complete_version_foundation.sql') return;
    sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('legacy-user','legacy@local.hastabazaar.test','Fictional legacy','active',1,1);
      INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,next_json,created_at) VALUES('legacy-audit','legacy-user','old.action','order','legacy-order','{"amountPaisa":12550}',1);
      INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at)
      VALUES('legacy-order','LEGACY','legacy-user','legacy@local.hastabazaar.test','9800000000','placed','en-NP','original-terms','{"locality":"Original"}',12550,500,13050,'cod','unpaid',1,1);
      INSERT INTO notification_messages(id,recipient_user_id,audience_role,channel,template_key,subject_en,subject_ne,body_en,body_ne,status,request_id,created_at,read_at)
      VALUES('legacy-message','legacy-user','customer','in_app','old','Old','Old','Old','Old','read','legacy-message',1,2);`);
  });
  try {
    assert.equal(f.sqlite.prepare("SELECT grand_total_paisa FROM orders WHERE id='legacy-order'").get()?.grand_total_paisa, 13050);
    assert.equal(f.sqlite.prepare("SELECT policy_version FROM orders WHERE id='legacy-order'").get()?.policy_version, 'original-terms');
    assert.equal(f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE id='legacy-audit'").get()?.next_json, '{"amountPaisa":12550}');
    assert.equal(f.sqlite.prepare("SELECT command_key FROM audit_logs WHERE id='legacy-audit'").get()?.command_key, null);
    assert.equal(f.sqlite.prepare("SELECT read_at FROM notification_messages WHERE id='legacy-message'").get()?.read_at, 2);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.dispose(); }
});

void test('complete version fixtures include isolated roles and historical work without granting broad staff authority', async () => {
  const f = await completeVersionFixture();
  try {
    assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row => row.file === ''));
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE role='super_admin'").get()?.n, 1);
    assert.equal(f.sqlite.prepare("SELECT permissions_json FROM staff_permission_profiles WHERE user_id='delegate'").get()?.permissions_json, '["product.review"]');
    for (const table of ['seller_documents', 'seller_application_drafts', 'seller_restrictions', 'orders', 'payout_requests', 'commission_rate_changes'])
      assert.ok(Number(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()?.n) > 0, table);
    assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.dispose(); }
});
