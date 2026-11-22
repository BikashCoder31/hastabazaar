import assert from 'node:assert/strict';
import test from 'node:test';
import { commissionDatabase } from './helpers/commission-database';
import { getBusinessSettingForManagement, getEffectiveBusinessSetting, saveBusinessSettingChange } from '../lib/db/repositories/business-settings';
import { calculateSellerCommissionPaisa } from '../lib/marketplace/policy';
import { calculateManagedSaleLinkedAmounts, calculateManagedSaleLinkedRefundAmounts } from '../lib/managed-makers/settlement';

const keys = ['independent_seller_commission_bps', 'managed_sale_linked_platform_retention_bps'] as const;

void test('unconfigured current rates never fall back to a launch percentage', async () => {
  const f = await commissionDatabase();
  try {
    for (const key of keys) await assert.rejects(getEffectiveBusinessSetting(f.database, key, 1000), /No effective published.*rate/i);
    const management = await getBusinessSettingForManagement(f.database, keys[0], 1000);
    assert.equal(management.source, 'unconfigured');
    assert.equal(management.value, null);
    assert.equal((await f.database.prepare('SELECT count(*) n FROM business_setting_versions').first<{n:number}>())?.n, 0);
  } finally { await f.dispose(); }
});

void test('a first scheduled rate is unavailable before its date and uses saved values thereafter', async () => {
  const f = await commissionDatabase();
  try {
    const effectiveFrom = 1000 + 16 * 86400000;
    for (const [i, key] of keys.entries()) {
      await saveBusinessSettingChange(f.database, {key, value: i === 0 ? 1375 : 1625, actorId:'owner', reason:'Isolated future commission configuration', requestId:'required-rate-'+i, now:1000, effectiveFrom, expectedVersion:0});
      await assert.rejects(getEffectiveBusinessSetting(f.database, key, effectiveFrom - 1), /No effective published.*rate/i);
      const current = await getEffectiveBusinessSetting(f.database, key, effectiveFrom);
      assert.equal(current.value, i === 0 ? 1375 : 1625);
      assert.equal(current.source, 'persisted');
    }
    const audit = await f.database.prepare('SELECT previous_json value FROM audit_logs WHERE request_id=?').bind('required-rate-0').first<{value:string}>();
    assert.equal(JSON.parse(audit!.value).source, 'unconfigured');
  } finally { await f.dispose(); }
});

void test('calculations require a supplied rate and never infer a current commission', () => {
  assert.throws(() => calculateSellerCommissionPaisa(100000, undefined as unknown as number), /basis points/i);
  assert.throws(() => calculateManagedSaleLinkedAmounts({eligibleBasePaisa:100000, platformRetentionBps:undefined as unknown as number}), /basis points/i);
  assert.equal(calculateSellerCommissionPaisa(100000, 1375), 13750);
  for (const [rate, amount] of [[0, 0], [725, 7250], [1200, 12000], [1250, 12500]]) assert.equal(calculateSellerCommissionPaisa(100000, rate), amount);
  assert.deepEqual(calculateManagedSaleLinkedAmounts({eligibleBasePaisa:100000, platformRetentionBps:1625}), {
    eligibleBasePaisa:100000, platformRetentionBps:1625, platformRetainedPaisa:16250, makerEntitlementPaisa:83750,
  });
  assert.deepEqual(calculateManagedSaleLinkedRefundAmounts({originalEligibleBasePaisa:100000, originalPlatformRetainedPaisa:9000, refundedEligibleBasePaisa:100000}), {
    refundedEligibleBasePaisa:100000, platformRetentionReversalPaisa:9000, makerEntitlementReversalPaisa:91000,
  });
});

void test('published zero is a real configured rate and invalid stored data is never treated as missing', async () => {
  const f = await commissionDatabase();
  try {
    const effectiveFrom = 1000 + 16 * 86400000;
    for (const [i,key] of keys.entries()) {
      await saveBusinessSettingChange(f.database,{key,value:0,actorId:'owner',reason:'Explicit zero commission in an isolated fixture',requestId:'zero-rate-'+i,now:1000,effectiveFrom,expectedVersion:0});
      assert.equal((await getEffectiveBusinessSetting(f.database,key,effectiveFrom)).value,0);
      const managed = await getBusinessSettingForManagement(f.database,key,effectiveFrom);
      assert.equal(managed.source,'persisted');
      assert.equal(managed.value,0);
      await f.database.prepare("UPDATE business_setting_versions SET value_json='\"invalid\"' WHERE setting_key=?").bind(key).run();
      await assert.rejects(getBusinessSettingForManagement(f.database,key,effectiveFrom),/basis|integer/i);
    }
  } finally { await f.dispose(); }
});
