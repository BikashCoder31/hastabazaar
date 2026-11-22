import assert from 'node:assert/strict';
import test from 'node:test';
import { deliveryPartnerSchemaAvailable, listDeliveryPartners, saveDeliveryPartner } from '../lib/delivery/partners';
import { partnerTrackingUrl, validatePartnerTrackingPattern } from '../lib/delivery/partner-tracking';
import { completeVersionFixture } from './helpers/complete-version-fixture';

import { installFixtureTables } from './helpers/delivery-partner-fixture';

void test('tracking requires an HTTPS public path with one encoded tracking number', () => {
  assert.equal(validatePartnerTrackingPattern(''), null);
  assert.equal(validatePartnerTrackingPattern('https://track.example.test/?shipment={number}'), 'https://track.example.test/?shipment={number}');
  assert.equal(partnerTrackingUrl('https://track.example.test/?shipment={number}', 'AB/4?5'), 'https://track.example.test/?shipment=AB%2F4%3F5');
  for (const invalid of ['https://track.example.test/', 'https://{number}.example.test/', 'https://track.example.test/{number}/{number}',
    'http://track.example.test/{number}', 'https://127.0.0.1/{number}', 'https://track.example.test/{number}#again{number}']) {
    assert.throws(() => validatePartnerTrackingPattern(invalid), /tracking/i);
  }
});

void test('delivery partners remain unavailable before the upgrade and configuration is audited and role restricted', async () => {
  const f = await completeVersionFixture();
  try {
    const input = { id: 'upaya', name: 'Upaya', status: 'in_use' as const, bookingMode: 'manual', collectsCod: true,
      trackingPattern: 'https://track.example.test/{number}', makeDefault: true, expectedRevision: null, requestId: 'courier-add-upaya', now: f.now };
    assert.equal(await deliveryPartnerSchemaAvailable(f.db), false);
    assert.equal(await listDeliveryPartners(f.db), null);
    await assert.rejects(saveDeliveryPartner(f.db, 'reviewer', input), /database update/i);
    installFixtureTables(f.sqlite);
    assert.deepEqual(await listDeliveryPartners(f.db), []);
    await assert.rejects(saveDeliveryPartner(f.db, 'delegate', input), { status: 403 });
    await assert.rejects(saveDeliveryPartner(f.db, 'reviewer', { ...input, bookingMode: 'api' }), /by hand/i);
    const saved = await saveDeliveryPartner(f.db, 'reviewer', input);
    assert.deepEqual(await saveDeliveryPartner(f.db, 'reviewer', input), saved);
    await saveDeliveryPartner(f.db, 'reviewer', { ...input, id: 'nepal-can-move', name: 'Nepal Can Move', status: 'setting_up',
      makeDefault: false, requestId: 'courier-add-ncm' });
    assert.deepEqual((await listDeliveryPartners(f.db))?.map(partner => [partner.id, partner.status, partner.isDefault]), [
      ['upaya', 'in_use', true], ['nepal-can-move', 'setting_up', false],
    ]);
    await saveDeliveryPartner(f.db, 'reviewer', { ...input, id:'another', name:'Another courier', requestId:'courier-change-default' });
    assert.deepEqual((await listDeliveryPartners(f.db))?.map(partner => [partner.id, partner.isDefault]), [
      ['another', true], ['upaya', false], ['nepal-can-move', false],
    ]);
    await assert.rejects(saveDeliveryPartner(f.db, 'reviewer', { ...input, expectedRevision: 1, requestId:'courier-stale-edit' }), /changed/i);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='delivery_partner.saved'").get()?.n, 3);
  } finally { f.dispose(); }
});
