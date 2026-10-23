import assert from 'node:assert/strict';
import test from 'node:test';
import type { FeeWaiverCampaign } from '../lib/marketplace/fee-waivers';
import type { PlatformServiceFeePolicy } from '../lib/checkout/platform-service-fee';

const campaign: FeeWaiverCampaign = {
  id: 'customer-launch',
  revision: 3,
  name: 'Customer launch waiver',
  description: 'Fictional automatic customer fee waiver',
  startsAt: 10,
  endsAt: 1000,
  state: 'published',
};

async function snapshot(
  policy: PlatformServiceFeePolicy,
  versionId: string | null,
  selected: FeeWaiverCampaign | null,
) {
  const customer = await import('../lib/checkout/customer-service-fee').catch(() => null);
  assert.ok(customer, 'Customer fee snapshots need a typed factory that preserves the enabled standard fee.');
  return customer.customerServiceFeeSnapshot(policy, versionId, selected);
}

void test('customer_fee_waiver_preserves_enabled_standard', async () => {
  assert.deepEqual(await snapshot({ enabled: true, amountPaisa: 1000 }, 'fee-v1', campaign), {
    enabled: true,
    amountPaisa: 1000,
    chargedPaisa: 0,
    versionId: 'fee-v1',
    rule: 'non_refundable_except_law_v1',
    schemaVersion: 2,
    standardPaisa: 1000,
    waivedPaisa: 1000,
    campaign: { id: 'customer-launch', revision: 3, name: 'Customer launch waiver' },
  });
  assert.deepEqual(await snapshot({ enabled: true, amountPaisa: 1000 }, null, null), {
    enabled: true,
    amountPaisa: 1000,
    chargedPaisa: 1000,
    versionId: null,
    rule: 'non_refundable_except_law_v1',
    schemaVersion: 2,
    standardPaisa: 1000,
    waivedPaisa: 0,
    campaign: null,
  });
});

void test('customer fee waiver follows an explicit 1500 paisa policy', async () => {
  const saved = await snapshot({ enabled: true, amountPaisa: 1500 }, 'fee-v2', campaign);
  assert.equal(saved.amountPaisa, 1500);
  assert.equal(saved.standardPaisa, 1500);
  assert.equal(saved.waivedPaisa, 1500);
  assert.equal(saved.chargedPaisa, 0);
});

void test('disabled and zero customer fees cannot claim a campaign waiver', async () => {
  for (const policy of [
    { enabled: false, amountPaisa: 1000 },
    { enabled: true, amountPaisa: 0 },
    { enabled: false, amountPaisa: 0 },
  ]) {
    const saved = await snapshot(policy, null, campaign);
    assert.equal(saved.enabled, policy.enabled);
    assert.equal(saved.amountPaisa, policy.amountPaisa);
    assert.equal(saved.standardPaisa, 0);
    assert.equal(saved.waivedPaisa, 0);
    assert.equal(saved.chargedPaisa, 0);
    assert.equal(saved.campaign, null);
  }
});

void test('saved customer attribution owns its original campaign revision and name', async () => {
  const selected = { ...campaign };
  const saved = await snapshot({ enabled: true, amountPaisa: 1000 }, null, selected);
  selected.id = 'later-campaign';
  selected.revision = 4;
  selected.name = 'Later campaign name';
  assert.deepEqual(saved.campaign, { id: 'customer-launch', revision: 3, name: 'Customer launch waiver' });
});

void test('customer factory rejects malformed policy, version and campaign attribution', async () => {
  const customer = await import('../lib/checkout/customer-service-fee').catch(() => null);
  assert.ok(customer, 'Customer fee factory must validate persisted fee evidence.');
  const factory = customer.customerServiceFeeSnapshot;
  for (const policy of [
    { enabled: 1, amountPaisa: 1000 },
    { enabled: true, amountPaisa: -1 },
    { enabled: true, amountPaisa: 1.5 },
    { enabled: true, amountPaisa: Number.MAX_SAFE_INTEGER + 1 },
    { enabled: true, amountPaisa: 100_001 },
    { enabled: true, amountPaisa: 1000, extra: true },
  ]) assert.throws(() => factory(policy as PlatformServiceFeePolicy, null, campaign));
  for (const versionId of ['', 'bad version', 'v'.repeat(121)])
    assert.throws(() => factory({ enabled: true, amountPaisa: 1000 }, versionId, campaign));
  for (const attribution of [
    { id: '' },
    { id: 'c'.repeat(121) },
    { revision: undefined },
    { revision: 0 },
    { revision: -1 },
    { revision: 1.5 },
    { revision: Number.MAX_SAFE_INTEGER + 1 },
    { revision: '3' },
    { name: undefined },
    { name: '   ' },
    { name: 'n'.repeat(101) },
  ]) assert.throws(() => factory(
    { enabled: true, amountPaisa: 1000 }, null,
    { ...campaign, ...attribution } as FeeWaiverCampaign,
  ));
});
