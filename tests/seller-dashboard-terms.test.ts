import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { loadSellerDashboardTerms } from '../lib/sellers/dashboard-terms';
import { getManagedTermsOffers } from '../lib/managed-commerce/accepted-terms';

void test('maker dashboard survives unpublished rates without inventing an offer or accepting terms', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const ready = await loadSellerDashboardTerms(f.db, f.sellerId, f.now, true);
    assert.ok(ready.offers?.current);
    assert.ok(ready.managedTerms);
    f.sqlite.exec("UPDATE business_setting_versions SET status='draft' WHERE setting_key='managed_sale_linked_platform_retention_bps'");
    const before = f.sqlite.prepare('SELECT COUNT(*) AS count FROM managed_maker_application_details').get();
    assert.deepEqual(await loadSellerDashboardTerms(f.db, f.sellerId, f.now, true), {
      offers: null, accepted: null, managedTerms: undefined, unavailable: true,
    });
    assert.deepEqual(f.sqlite.prepare('SELECT COUNT(*) AS count FROM managed_maker_application_details').get(), before);
    await assert.rejects(() => getManagedTermsOffers(f.db, f.sellerId, f.now), /No effective published commission/);
  } finally { f.dispose(); }
});

void test('maker dashboard terms still propagate unexpected database errors', async () => {
  const failure = new Error('Storage unavailable');
  const db = { prepare() { throw failure; } } as unknown as D1Database;
  await assert.rejects(() => loadSellerDashboardTerms(db, 'maker', Date.now(), false), error => error === failure);
});
