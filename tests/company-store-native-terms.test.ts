import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncentiveDb } from './helpers/incentive-db';
import { managedIdentityDocument, managedIdentityFields } from './helpers/managed-identity-fixture';
import { parseSellerApplication } from '../lib/sellers/application';
import { createSellerApplication } from '../lib/db/repositories/seller-applications';
import { acceptManagedTerms, getAcceptedManagedTerms, getManagedTermsOffers, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { currentManagedSaleEvidence } from '../lib/products/managed-sale-evidence';

void test('native D1 supports real maker IDs and exact private-document boundaries', async (t) => {
  const f = await createIncentiveDb();
  const now = Date.now() - 60_000;
  const sellerId = '12345678-1234-4234-8234-123456789abc';
  const actorId = `owner-${sellerId}`;
  let applicationCount = 0;
  async function application(id: string) {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      hasBusinessTaxRegistration: 'no', applicantType: 'individual', legalName: 'SIMULATED UUID Maker',
      tradingName: 'SIMULATED UUID Studio', email: `${id}@local.hastabazaar.test`, phone: `980000${String(++applicationCount).padStart(4, '0')}`,
      province: 'Bagmati', district: 'Kathmandu', municipality: 'Kathmandu', locality: 'SIMULATED workshop',
      publicCity: 'Kathmandu', businessDescription: 'SIMULATED handmade products for isolated native tests.',
      productCategories: 'Clay work', applicationAcknowledgement: 'yes', ...managedIdentityFields(),
    })) form.set(key, value);
    const parsed = parseSellerApplication(form);
    assert.ok(parsed.input, parsed.errors.join('\n'));
    await createSellerApplication(f.db, { sellerId: id, userId: `owner-${id}`, input: parsed.input,
      applicationReference: `QA-${id}`, documents: [managedIdentityDocument(id)], now });
  }
  async function publicEvidence(id: string) {
    return f.db.prepare(`SELECT s.id FROM seller_profiles s WHERE s.id=? AND EXISTS(
      SELECT 1 ${currentManagedSaleEvidence('s.id', 's.user_id', now)})`).bind(id).first();
  }
  try {
    await application(sellerId);
    await f.db.batch([
      f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('native-reviewer','reviewer@local.hastabazaar.test','SIMULATED reviewer','active',1,1)"),
      f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('native-reviewer','super_admin',1)"),
    ]);
    await t.test('full UUID application acceptance loads in the native runtime', async () => {
      assert.equal(sellerId.length, 36);
      const offers = await getManagedTermsOffers(f.db, sellerId, now);
      assert.equal(offers.current.accepted, true);
      const accepted = await getAcceptedManagedTerms(f.db, sellerId, now);
      assert.equal(accepted?.acceptedBy, actorId);
      assert.equal(accepted?.retentionBps, 900);
    });
    await t.test('public sale evidence accepts the same full UUID', async () => {
      assert.equal((await publicEvidence(sellerId))?.id, sellerId);
    });
    await t.test('renewed acceptance commits with the full private path and exact replay', async () => {
      await f.db.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,
        created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES(?,?,1,'published',?,'SIMULATED native terms test',?,1,?,1,?,1,'native-terms-publication')`)
        .bind('native-terms-v1', managedTermsFormId, JSON.stringify({ formId: managedTermsFormId, fields: [] }),
          'native-reviewer', 'native-reviewer', 'native-reviewer').run();
      const offer = (await getManagedTermsOffers(f.db, sellerId, now)).current;
      const input = { sellerId, actorId, offerId: offer.id, context: offer.context, language: 'en' as const,
        requestId: 'native-uuid-terms-acceptance', now: now + 1,
        form: { versionId: 'native-terms-v1', answers: { formId: managedTermsFormId, version: 1, answers: [] } } };
      const receipt = await acceptManagedTerms(f.db, input);
      assert.ok(receipt.detailId);
      assert.deepEqual(await acceptManagedTerms(f.db, input), receipt);
      assert.equal((await f.db.prepare('SELECT count(*) AS n FROM managed_maker_application_details WHERE seller_id=?')
        .bind(sellerId).first<{ n: number }>())?.n, 2);
    });
    await t.test('foreign, suffix, embedded, case and wildcard-lookalike paths remain excluded', async () => {
      for (const [id, objectKey] of [
        ['22345678-1234-4234-8234-123456789abc', `private/seller-documents/${sellerId}/foreign-file`],
        ['32345678-1234-4234-8234-123456789abc', 'private/seller-documents/32345678-1234-4234-8234-123456789abc-other/file'],
        ['42345678-1234-4234-8234-123456789abc', 'archive/private/seller-documents/42345678-1234-4234-8234-123456789abc/file'],
        ['52345678-1234-4234-8234-123456789abc', 'PRIVATE/seller-documents/52345678-1234-4234-8234-123456789abc/file'],
        ['maker_qa', 'private/seller-documents/makerXqa/file'],
      ]) {
        await application(id);
        // Corrupt only this isolated fixture to check the defensive read boundary.
        await f.db.prepare('UPDATE seller_documents SET object_key=? WHERE id=?')
          .bind(objectKey, managedIdentityDocument(id).id).run();
        assert.equal(await getAcceptedManagedTerms(f.db, id, now), null);
        assert.equal(await publicEvidence(id), null);
        const counts = async () => Promise.all([
          f.db.prepare('SELECT count(*) AS n FROM managed_maker_application_details WHERE seller_id=?').bind(id).first(),
          f.db.prepare('SELECT count(*) AS n FROM form_answer_sets WHERE subject_id=?').bind(id).first(),
          f.db.prepare('SELECT count(*) AS n FROM audit_logs WHERE subject_id=?').bind(id).first(),
        ]);
        const before = await counts();
        const offer = (await getManagedTermsOffers(f.db, id, now)).current;
        await assert.rejects(acceptManagedTerms(f.db, { sellerId: id, actorId: `owner-${id}`,
          offerId: offer.id, context: offer.context, language: 'en', requestId: `native-negative-${id}`, now: now + 1,
          form: { versionId: 'native-terms-v1', answers: { formId: managedTermsFormId, version: 1, answers: [] } } }), /changed|evidence/i);
        assert.deepEqual(await counts(), before, 'Rejected evidence must leave all acceptance history unchanged');
      }
    });
    await t.test('a document owned by a different seller cannot establish acceptance', async () => {
      const id = '62345678-1234-4234-8234-123456789abc';
      await application(id);
      await f.db.prepare('UPDATE seller_documents SET seller_id=? WHERE id=?')
        .bind(sellerId, managedIdentityDocument(id).id).run();
      assert.equal(await getAcceptedManagedTerms(f.db, id, now), null);
      assert.equal(await publicEvidence(id), null);
    });
  } finally { await f.dispose(); }
});
