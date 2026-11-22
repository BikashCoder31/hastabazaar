import assert from 'node:assert/strict';
import test from 'node:test';
import { payoutTransferFixture } from './helpers/payout-transfer-fixture';
import { operatePayout, prepareSellerPayout } from '../lib/db/repositories/payouts';
import { validateSellerFormSubmission } from '../lib/forms/submission';

void test('actual registered payout preparation and one eligible SA approval retain exact native core replay and original earnings', async () => {
  const f = await payoutTransferFixture();
  try {
    f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('native-core-preparer','native-core-preparer@local.hastabazaar.test','Fictional eligible preparer','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES('native-core-preparer','admin',1);
      INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('native-core-preparer','["payout.prepare"]',1,'reviewer',1);
      INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('native-core-second-earned','payout-seller','sale',20000,1,'Independent second fictional original earning, separate from the already reserved source',1);`);
    const form = await validateSellerFormSubmission(f.db, 'staff.payout-1', 1, []);
    const requestId = 'native-core-registered-prepare';
    const input = { sellerId: f.sellerId, actorId: 'native-core-preparer', actorRole: 'admin' as const,
      note: 'Prepare the exact original independently earned registered balance.', requestId, now: Date.now(),
      form: { formId:'staff.payout-1' as const, requestId, versionId: form.versionId, answers: form.answers } };
    const prepared = await prepareSellerPayout(f.db, input);
    assert.equal((await prepareSellerPayout(f.db, input)).id, prepared.id);
    await assert.rejects(prepareSellerPayout(f.db, { ...input, note: 'Changed original preparation content must not replay.' }));
    const action = await validateSellerFormSubmission(f.db, 'staff.payout-2', 1, []);
    const approvalId = 'native-core-registered-approval';
    const command = { payoutId: prepared.id, actorId: 'reviewer', actorRole: 'super_admin' as const, action: 'approve' as const,
      note: 'One independent eligible SA approves the exact unchanged original preparation.', requestId: approvalId, now: Date.now(),
      form: { formId: 'staff.payout-2' as const, requestId: approvalId, versionId: action.versionId, answers: action.answers } };
    await operatePayout(f.db, command); await operatePayout(f.db, command);
    assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(prepared.id)?.status, 'approved');
    assert.equal(f.sqlite.prepare('SELECT status FROM payouts WHERE id=?').get(f.payoutId)?.status, 'approved', 'The unaffected original reservation remains valid.');
    assert.equal(f.sqlite.prepare("SELECT amount_paisa FROM seller_ledger_entries WHERE id='payout-earned'").get()?.amount_paisa, 20000);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_config_versions WHERE form_id IN('staff.payout-1','staff.payout-2')").get()?.n, 0);
    await assert.rejects(operatePayout(f.db, { ...command, actorId: 'payout-owner' }));
  } finally { f.dispose(); }
});
