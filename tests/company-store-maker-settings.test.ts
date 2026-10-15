import assert from 'node:assert/strict';
import test from 'node:test';
import { companyStoreMakerFixture } from './helpers/company-store-maker-fixture';
import { acceptManagedTerms, getAcceptedManagedTerms, getManagedTermsOffers, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { createBusinessSettingDraft, publishBusinessSettingDraft } from '../lib/db/repositories/business-settings';
import { scheduleCommissionRate } from '../lib/db/repositories/commission-rates';

type Fixture = Awaited<ReturnType<typeof companyStoreMakerFixture>>;
async function publishRate(f: Fixture, value: number, effectiveFrom: number) {
  const draft = await createBusinessSettingDraft(f.db, { key: 'managed_sale_linked_platform_retention_bps', value,
    actorId: 'reviewer', reason: 'Fictional terms change for isolated testing', requestId: `rate-draft-${value}`, now: f.now });
  await publishBusinessSettingDraft(f.db, { id: draft.id, actorId: 'reviewer', expectedRevision: 1,
    reason: 'Publish fictional rate for isolated testing', effectiveFrom, requestId: `rate-publish-${value}`, now: f.now });
  return draft.id;
}
function acceptanceForm(f: Fixture) {
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,
    updated_by,updated_at,published_by,published_at,last_request_id) VALUES(?,?,1,'published',?,'Isolated test','reviewer',1,'reviewer',1,'reviewer',1,?)`)
    .run('terms-form-v1', managedTermsFormId, JSON.stringify({ formId: managedTermsFormId, fields: [] }), 'test-terms-config');
  return { versionId: 'terms-form-v1', answers: { formId: managedTermsFormId, version: 1, answers: [] } };
}

void test('current and upcoming offers require explicit exact owner acceptance', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const offers = await getManagedTermsOffers(f.db, f.sellerId, f.now);
    assert.equal(offers.current.retentionBps, 900);
    const accepted = await getAcceptedManagedTerms(f.db, f.sellerId, f.now);
    assert.ok(accepted, 'the application already explicitly accepted the current offer');
    assert.equal(accepted.retentionBps, 900);
    assert.equal(accepted.acceptedBy, f.actorId);
    assert.equal(accepted.sellerId, f.sellerId);
    assert.equal(accepted.language, 'en');
    assert.equal(await getAcceptedManagedTerms(f.db, 'missing', f.now), null);
  } finally { f.dispose(); }
});

void test('future acceptance cannot change current earnings and exact retry cannot accept twice', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const start = f.now + 3_600_000;
    await publishRate(f, 1200, start);
    const offers = await getManagedTermsOffers(f.db, f.sellerId, f.now);
    assert.equal(offers.current.retentionBps, 900);
    assert.equal(offers.upcoming.length, 1);
    const future = offers.upcoming[0];
    const input = { sellerId: f.sellerId, actorId: f.actorId, offerId: future.id, context: future.context,
      language: 'en' as const, requestId: 'accept-future-terms', now: f.now + 1, form: acceptanceForm(f) };
    assert.equal(await getAcceptedManagedTerms(f.db, f.sellerId, start), null);
    const receipt = await acceptManagedTerms(f.db, input);
    assert.equal((await getAcceptedManagedTerms(f.db, f.sellerId, start - 1))?.retentionBps, 900);
    assert.equal((await getAcceptedManagedTerms(f.db, f.sellerId, start))?.retentionBps, 1200);
    assert.deepEqual(await acceptManagedTerms(f.db, { ...input, now: start + 1 }), receipt);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n, 2);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets WHERE form_id=?').get(managedTermsFormId)?.n, 1);
    await assert.rejects(acceptManagedTerms(f.db, { ...input, context: offers.current.context }), /different content/i);
    await assert.rejects(acceptManagedTerms(f.db, { ...input, actorId: 'reviewer' }), /owner/i);
  } finally { f.dispose(); }
});

void test('managed retention is independent of Registered Seller Commission', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const independentStart = f.now + 16 * 86_400_000;
    await scheduleCommissionRate(f.db, { actorId: 'reviewer', expectedRevision: 0, basisPoints: 1100,
      reason: 'Independent commission only', effectiveAt: independentStart, requestId: 'independent-publish', now: f.now });
    assert.equal((await getAcceptedManagedTerms(f.db, f.sellerId, independentStart))?.retentionBps, 900);
    await publishRate(f, 1200, f.now + 100_000);
    assert.equal(await getAcceptedManagedTerms(f.db, f.sellerId, f.now + 100_000), null);
  } finally { f.dispose(); }
});

void test('cancelled offers and owner revocation cannot leave partial acceptance evidence', async () => {
  const f = await companyStoreMakerFixture();
  try {
    await publishRate(f, 1200, f.now + 60_000);
    const future = (await getManagedTermsOffers(f.db, f.sellerId, f.now)).upcoming[0];
    const input = { sellerId: f.sellerId, actorId: f.actorId, offerId: future.id, context: future.context,
      language: 'en' as const, requestId: 'accept-revoked-terms', now: f.now + 1, form: acceptanceForm(f) };
    f.setBeforeBatch(() => { f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id=?").run(f.actorId); });
    await assert.rejects(acceptManagedTerms(f.db, input), /changed/i);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n, 1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n, 0);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='managed_maker.terms_accepted'").get()?.n, 0);
  } finally { f.dispose(); }
});

void test('cancelled future offer and rejected identity cannot be accepted', async () => {
  const f = await companyStoreMakerFixture();
  try {
    const settingId = await publishRate(f, 1200, f.now + 60_000);
    const future = (await getManagedTermsOffers(f.db, f.sellerId, f.now)).upcoming[0];
    const input = { sellerId: f.sellerId, actorId: f.actorId, offerId: future.id, context: future.context,
      language: 'en' as const, requestId: 'accept-cancelled-terms', now: f.now + 1, form: acceptanceForm(f) };
    f.sqlite.prepare("UPDATE business_setting_versions SET status='cancelled' WHERE id=?").run(settingId);
    await assert.rejects(acceptManagedTerms(f.db, input), /changed|cancelled/i);
    const current = (await getManagedTermsOffers(f.db, f.sellerId, f.now)).current;
    f.sqlite.prepare("UPDATE seller_documents SET status='rejected' WHERE seller_id=?").run(f.sellerId);
    await assert.rejects(acceptManagedTerms(f.db, { ...input, offerId: current.id, context: current.context }), /identity/i);
    assert.equal(await getAcceptedManagedTerms(f.db, f.sellerId, f.now), null);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM managed_maker_application_details').get()?.n, 1);
  } finally { f.dispose(); }
});
