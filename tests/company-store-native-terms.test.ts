import assert from 'node:assert/strict';
import test from 'node:test';
import { createIncentiveDb } from './helpers/incentive-db';
import { managedIdentityDocument, managedIdentityFields } from './helpers/managed-identity-fixture';
import { parseSellerApplication } from '../lib/sellers/application';
import { createSellerApplication } from '../lib/db/repositories/seller-applications';
import { acceptManagedTerms, getAcceptedManagedTerms, getManagedTermsOffers, managedTermsFormId } from '../lib/managed-commerce/accepted-terms';
import { currentManagedSaleEvidence } from '../lib/products/managed-sale-evidence';
import { managedMakerAgreementContext, managedMakerAgreementSnapshot, MANAGED_MAKER_AGREEMENT_VERSION, MANAGED_SUPPLIER_AGREEMENT_VERSION } from '../lib/sellers/managed-identity';

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
  async function appendInvalidDocumentEvidence(id: string, overrides: { object_key?: string; seller_id?: string }) {
    const originalDocumentId = managedIdentityDocument(id).id;
    const saved = await f.db.prepare('SELECT id FROM managed_maker_application_details WHERE seller_id=?')
      .bind(id).first<{id:string}>();
    assert.ok(saved);
    // Frozen versions remain frozen. Construct an independent fictional historical
    // version with its invalid boundary at INSERT, rather than rewriting evidence.
    for (const [column, value] of Object.entries(overrides)) {
      await assert.rejects(f.db.prepare(`UPDATE seller_documents SET ${column}=? WHERE id=?`)
        .bind(value, originalDocumentId).run(), /seller_document_version_immutable/);
    }
    const documentId = crypto.randomUUID(), detailId = crypto.randomUUID();
    const documentColumns = (await f.db.prepare('PRAGMA table_info(seller_documents)').all<{name:string}>()).results.map(row=>row.name);
    const documentValues: Record<string,string> = { id:documentId, object_key:`private/seller-documents/${id}/historical-invalid-${documentId}`, ...overrides };
    await f.db.prepare(`INSERT INTO seller_documents(${documentColumns.join(',')}) SELECT ${documentColumns.map(column=>Object.hasOwn(documentValues,column)?'?':column).join(',')} FROM seller_documents WHERE id=?`)
      .bind(...documentColumns.filter(column=>Object.hasOwn(documentValues,column)).map(column=>documentValues[column]),originalDocumentId).run();
    const detailColumns = (await f.db.prepare('PRAGMA table_info(managed_maker_application_details)').all<{name:string}>()).results.map(row=>row.name);
    const detailValues: Record<string,string> = { id:detailId, identity_document_id:documentId };
    await f.db.prepare(`INSERT INTO managed_maker_application_details(${detailColumns.join(',')}) SELECT ${detailColumns.map(column=>Object.hasOwn(detailValues,column)?'?':column).join(',')} FROM managed_maker_application_details WHERE id=?`)
      .bind(...detailColumns.filter(column=>Object.hasOwn(detailValues,column)).map(column=>detailValues[column]),saved.id).run();
    // Only the new invalid version is eligible for the defensive read assertion.
    // The original unverified application document can lawfully be rejected.
    await f.db.prepare("UPDATE seller_documents SET status='rejected' WHERE id=?").bind(originalDocumentId).run();
  }
  async function assertInvalidEvidenceRefused(id: string) {
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
  try {
    await f.db.batch([
      f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('native-reviewer','reviewer@local.hastabazaar.test','SIMULATED reviewer','active',1,1)"),
      f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('native-reviewer','super_admin',1)"),
      f.db.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
        VALUES('native-historical-retention','managed_sale_linked_platform_retention_bps',1,'900','published',1,'controlled',1,
          'Explicit historical native terms','native-reviewer',1,'native-historical-retention')`),
    ]);
    await application(sellerId);
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
    await t.test('brand spelling alone preserves accepted maker evidence for both agreement versions', async () => {
      for (const version of [MANAGED_MAKER_AGREEMENT_VERSION, MANAGED_SUPPLIER_AGREEMENT_VERSION] as const) {
        for (const variant of ['brand-only', 'rate', 'pan', 'terms', 'source']) {
          const id = crypto.randomUUID();
          await application(id);
          const saved = await f.db.prepare('SELECT id,identity_document_id AS documentId,agreement_snapshot_json AS json FROM managed_maker_application_details WHERE seller_id=?').bind(id).first<{id:string;documentId:string;json:string}>();
          assert.ok(saved);
          const original = JSON.parse(saved.json);
          const current = managedMakerAgreementSnapshot(original.companyAccount, 900, version);
          const previous = { ...current, company: {...current.company, brandName: 'HastaBazaar'}, terms: current.terms.map(term => term.replace(/\bHastabazaar\b/g, 'HastaBazaar')) };
          const stored = {...previous, settingVersionIds: original.settingVersionIds};
          if (variant === 'rate') stored.platformRetentionBps = 1000;
          if (variant === 'pan') stored.company.pan = '999999999';
          if (variant === 'terms') stored.terms = [...stored.terms,'A new obligation'];
          if (variant === 'source') stored.settingVersionIds = {...stored.settingVersionIds,retention:'different-setting'};
          const json = JSON.stringify(stored);
          // Append an independent historical fixture; real evidence stays immutable.
          const documentId = crypto.randomUUID(), detailId = crypto.randomUUID();
          const documentColumns = (await f.db.prepare('PRAGMA table_info(seller_documents)').all<{name:string}>()).results.map(row=>row.name);
          const documentOverrides:Record<string,string> = {id:documentId,object_key:`private/seller-documents/${id}/historical-brand-evidence`};
          await f.db.prepare(`INSERT INTO seller_documents(${documentColumns.join(',')}) SELECT ${documentColumns.map(column=>Object.hasOwn(documentOverrides,column)?'?':column).join(',')} FROM seller_documents WHERE id=?`).bind(...documentColumns.filter(column=>Object.hasOwn(documentOverrides,column)).map(column=>documentOverrides[column]),saved.documentId).run();
          await f.db.prepare("UPDATE seller_documents SET status='rejected' WHERE id=?").bind(saved.documentId).run();
          const detailColumns = (await f.db.prepare('PRAGMA table_info(managed_maker_application_details)').all<{name:string}>()).results.map(row=>row.name);
          const overrides:Record<string,string> = {id:detailId, identity_document_id:documentId, agreement_version:version, agreement_snapshot_json:json};
          await f.db.prepare(`INSERT INTO managed_maker_application_details(${detailColumns.join(',')}) SELECT ${detailColumns.map(column=>Object.hasOwn(overrides,column)?'?':column).join(',')} FROM managed_maker_application_details WHERE id=?`).bind(...detailColumns.filter(column=>Object.hasOwn(overrides,column)).map(column=>overrides[column]),saved.id).run();
          const accepted = await getAcceptedManagedTerms(f.db,id,now);
          if (variant === 'brand-only') {
            assert.ok(accepted,version);
            assert.deepEqual(accepted.snapshot,previous);
            assert.equal(accepted.context,await managedMakerAgreementContext(previous));
            assert.equal((await getManagedTermsOffers(f.db,id,now)).current.accepted,true);
          } else {
            assert.equal(accepted,null,`${version}: ${variant}`);
          }
          assert.equal((await f.db.prepare('SELECT agreement_snapshot_json AS json FROM managed_maker_application_details WHERE id=?').bind(detailId).first<{json:string}>())?.json,json);
        }
      }
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
        await appendInvalidDocumentEvidence(id, { object_key:objectKey });
        await assertInvalidEvidenceRefused(id);
      }
    });
    await t.test('a document owned by a different seller cannot establish acceptance', async () => {
      const id = '62345678-1234-4234-8234-123456789abc';
      await application(id);
      await appendInvalidDocumentEvidence(id, { seller_id:sellerId });
      await assertInvalidEvidenceRefused(id);
    });
  } finally { await f.dispose(); }
});
