import assert from 'node:assert/strict';
import test from 'node:test';
import { commissionDatabase } from './helpers/commission-database';
import { assertBusinessSettingPublicationReady } from '../lib/configuration/capabilities';

void test('new registered settlement snapshot reads saved hold and does not invent a reserve', async () => {
  const { getRegisteredSettlementTerms } =
    await import('../lib/settlements/registered-terms');
  const f = await commissionDatabase();
  try {
    await f.database
      .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES ('hold14','seller_delivery_hold_days',1,'14','published',1,'controlled',1,'Fictional approved hold','owner',1,'hold14')`)
      .run();
    const terms = await getRegisteredSettlementTerms(f.database, 1800000000000);
    assert.equal(terms.deliveryHoldDays, 14);
    assert.equal(terms.holdSettingVersionId, 'hold14');
    assert.equal(terms.reserveBps, 0);
    await f.database
      .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES ('reserve5','new_seller_reserve_bps',1,'500','published',1,'controlled',1,'Fictional unsupported reserve','owner',1,'reserve5')`)
      .run();
    await assert.rejects(
      getRegisteredSettlementTerms(f.database, 1800000000000),
      /reserve/i,
    );
  } finally {
    await f.dispose();
  }
});

void test('unsupported payout calendar and minimum changes cannot be published', () => {
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'payout_processing_weekday',
        'friday',
      ),
    /not implemented/i,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'payout_cutoff_local_time',
        '16:00',
      ),
    /not implemented/i,
  );
  assert.throws(
    () =>
      assertBusinessSettingPublicationReady(
        'platform_payout_minimum_paisa',
        100_000,
      ),
    /not implemented/i,
  );
  assert.throws(
    () => assertBusinessSettingPublicationReady('new_seller_reserve_bps', 500),
    /reserve/i,
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady('new_seller_reserve_bps', 0),
  );
  assert.doesNotThrow(() =>
    assertBusinessSettingPublicationReady('platform_payout_minimum_paisa', 0),
  );
});
