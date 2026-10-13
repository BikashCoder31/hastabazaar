import { submitRegisteredSellerTransition, reviewRouteTransition, applyDueRouteTransitions } from '../lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment } from '../lib/staging/environment';
import { createHash } from 'node:crypto';
import { managedMakerAgreementSnapshot } from '../lib/sellers/managed-identity';
import assert from 'node:assert/strict';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  createSellerApplication,
  reviewSellerApplication,
  getSellerDocumentForStaff,
  getSellerParticipationProfile,
  getSellerApplicationForReview,
  updateSellerParticipationPublicProfile,
} from '../lib/db/repositories/seller-applications';
import {
  parseSellerApplication,
  sellerDocumentsForApplication,
} from '../lib/sellers/application';
import {
  getBusinessSettingDefinition,
  validateBusinessSettingValue,
} from '../lib/configuration/definitions';
import {
  createBusinessSettingDraft,
  publishBusinessSettingDraft,
} from '../lib/db/repositories/business-settings';
import { companyDetails } from '../lib/content/company-details';
import { isManagedEntitlementEarned } from '../lib/managed-makers/settlement';
class TestStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }
}

class TestDatabase {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new TestStatement(this.sqlite.prepare(sql));
  }
  beforeBatch: (() => void) | null = null;
  async batch(statements: readonly TestStatement[]) {
    if (this.beforeBatch) {
      const before = this.beforeBatch;
      this.beforeBatch = null;
      before();
    }
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

async function applyMigrations(sqlite: DatabaseSync, stopAt?: string) {
  const names = (await readdir(new URL('../drizzle/', import.meta.url)))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(
      new URL(`../drizzle/${name}`, import.meta.url),
      'utf8',
    );
    for (const part of sql.split('--> statement-breakpoint')) {
      if (part.trim()) sqlite.exec(part);
    }
    if (name.startsWith(stopAt ?? 'never')) break;
  }
}

function managedMakerForm() {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    hasBusinessTaxRegistration: 'no',
    applicantType: 'individual',
    legalName: 'Sita Fictional Maker',
    tradingName: 'Fictional Mithila Studio',
    email: 'sita.maker@example.test',
    phone: '9800000000',
    province: 'Madhesh',
    district: 'Parsa',
    municipality: 'Birgunj',
    locality: 'Private test workshop',
    publicCity: 'Birgunj',
    businessDescription: 'Fictional handmade work.',
    productCategories: 'Clay work',
    experienceCraft: 'Clay work',
    experienceBand: 'less_than_one_year',
    managedAgreementContext: createHash('sha256')
      .update(
        JSON.stringify(
          managedMakerAgreementSnapshot(
            getBusinessSettingDefinition('managed_maker_company_account')
              .defaultValue,
            900,
          ),
        ),
      )
      .digest('hex'),
    applicationAcknowledgement: 'yes',
    governmentIdType: 'citizenship',
    personalPan: '123456789',
    managedAgreementAccepted: 'yes',
    managedAgreementVersion: 'managed-maker-sale-linked-2026-10-13-v1',
  }))
    form.set(key, value);
  return form;
}

const identityDocument = (sellerId: string) => ({
  id: `id-${sellerId}`,
  kind: 'representative_identity' as const,
  objectKey: `private/seller-documents/${sellerId}/identity`,
  originalName: 'private-id.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 16,
});
async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  await applyMigrations(sqlite);
  sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES
    ('super','super@example.test','Super','active',1,1),('staff','staff@example.test','Staff','active',1,1);
    INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('staff','admin',1);`);
  return {
    sqlite,
    database: new TestDatabase(sqlite) as unknown as D1Database,
  };
}
async function application(database: D1Database, sellerId = 'maker') {
  const parsed = parseSellerApplication(managedMakerForm());
  assert.ok(parsed.input, parsed.errors.join('\n'));
  return createSellerApplication(database, {
    userId: `user-${sellerId}`,
    sellerId,
    input: parsed.input,
    documents: [identityDocument(sellerId)],
    now: 1800000000000,
    applicationReference: `APP-${sellerId}`,
  });
}
void test('managed parser rejects missing government ID selection, malformed optional personal PAN and stale or unchecked agreement', () => {
  for (const [key, value] of [
    ['governmentIdType', ''],
    ['governmentIdType', 'unknown'],
    ['personalPan', '123'],
    ['managedAgreementAccepted', ''],
    ['managedAgreementVersion', 'old'],
  ]) {
    const form = managedMakerForm();
    form.set(key, value);
    assert.equal(parseSellerApplication(form).input, undefined, key);
  }
  const other = managedMakerForm();
  other.set('governmentIdType', 'other_government_id');
  assert.equal(parseSellerApplication(other).input, undefined);
  other.set('governmentIdDescription', 'Municipal government identity card');
  assert.ok(parseSellerApplication(other).input);
  const optional = managedMakerForm();
  optional.delete('personalPan');
  assert.ok(parseSellerApplication(optional).input);
  assert.deepEqual(
    sellerDocumentsForApplication({
      applicantType: 'individual',
      taxMode: 'NONE',
      participationRoute: 'managed_maker',
    })
      .filter((x) => x.required)
      .map((x) => x.kind),
    ['representative_identity'],
  );
  assert.ok(
    sellerDocumentsForApplication({
      applicantType: 'individual',
      taxMode: 'NONE',
      participationRoute: 'managed_maker',
    }).some((x) => x.kind === 'pan_certificate' && !x.required),
  );
});
void test('forged managed input or absent government ID cannot create users or applications', async () => {
  const { sqlite, database } = await fixture();
  try {
    const input = parseSellerApplication(managedMakerForm()).input!;
    await assert.rejects(
      createSellerApplication(database, {
        userId: 'forged-user',
        sellerId: 'forged',
        applicationReference: 'FORGED',
        input,
        documents: [],
        now: 1,
      }),
      /identity|required/i,
    );
    const forged = { ...input, managedIdentity: undefined };
    await assert.rejects(
      createSellerApplication(database, {
        userId: 'forged-user',
        sellerId: 'forged',
        applicationReference: 'FORGED',
        input: forged,
        documents: [identityDocument('forged')],
        now: 1,
      }),
      /identity|agreement/i,
    );
    assert.equal(
      sqlite
        .prepare('SELECT COUNT(*) AS n FROM users WHERE id=?')
        .get('forged-user')?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('private identity and canonical agreement snapshot commit atomically and cannot be rewritten', async () => {
  const { sqlite, database } = await fixture();
  try {
    await application(database);
    const detail = sqlite
      .prepare(
        'SELECT * FROM managed_maker_application_details WHERE seller_id=?',
      )
      .get('maker')!;
    assert.equal(detail.personal_pan, '123456789');
    assert.equal(detail.government_id_type, 'citizenship');
    assert.equal(detail.agreement_accepted_by, 'user-maker');
    assert.equal(
      detail.agreement_version,
      'managed-maker-sale-linked-2026-10-13-v1',
    );
    assert.equal(detail.agreement_accepted_at, 1800000000000);
    const terms = JSON.parse(String(detail.agreement_snapshot_json));
    assert.equal(terms.company.legalName, companyDetails.legalName);
    assert.equal(terms.company.pan, companyDetails.pan);
    assert.equal(terms.platformRetentionBps, 900);
    assert.equal(terms.commercialModel, 'managed_sale_linked_percentage_v1');
    assert.throws(
      () =>
        sqlite
          .prepare(
            'UPDATE managed_maker_application_details SET personal_pan=? WHERE seller_id=?',
          )
          .run('987654321', 'maker'),
      /immutable/i,
    );
    const publicProfile = await getSellerParticipationProfile(
      database,
      'maker',
    );
    assert.equal(JSON.stringify(publicProfile).includes('123456789'), false);
    const input = parseSellerApplication(managedMakerForm()).input!;
    input.email = 'failed@example.test';
    input.phone = '9800000001';
    sqlite.exec(`CREATE TRIGGER reject_private_details BEFORE INSERT ON managed_maker_application_details
      WHEN NEW.seller_id='fail' BEGIN SELECT RAISE(ABORT,'synthetic private detail rejection'); END;`);
    await assert.rejects(
      createSellerApplication(database, {
        userId: 'failed-user',
        sellerId: 'fail',
        input,
        documents: [identityDocument('fail')],
        now: 1,
        applicationReference: 'FAIL',
      }),
      /synthetic/,
    );
    assert.equal(
      sqlite.prepare('SELECT id FROM users WHERE id=?').get('failed-user'),
      undefined,
    );
    assert.equal(
      sqlite.prepare('SELECT id FROM seller_profiles WHERE id=?').get('fail'),
      undefined,
    );
  } finally {
    sqlite.close();
  }
});
void test('managed review and private document retrieval require current Super Admin authority', async () => {
  const { sqlite, database } = await fixture();
  try {
    await application(database);
    await assert.rejects(
      reviewSellerApplication(database, {
        sellerId: 'maker',
        actorId: 'staff',
        action: 'start_review',
        reason: 'Test review',
        now: 2,
      }),
      /Super Admin/i,
    );
    await assert.rejects(
      getSellerDocumentForStaff(database, 'id-maker', 'staff'),
      /Super Admin/i,
    );
    assert.ok(await getSellerDocumentForStaff(database, 'id-maker', 'super'));
    sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='super'");
    await assert.rejects(
      getSellerDocumentForStaff(database, 'id-maker', 'super'),
      /Super Admin/i,
    );
  } finally {
    sqlite.close();
  }
});
void test('legacy managed applications cannot be approved without current agreement and identity evidence', async () => {
  const { sqlite, database } = await fixture();
  try {
    await application(database);
    await reviewSellerApplication(database, {
      sellerId: 'maker',
      actorId: 'super',
      action: 'start_review',
      reason: 'Test review',
      now: 2,
    });
    sqlite.exec(
      'DROP TRIGGER managed_maker_details_no_delete; DELETE FROM managed_maker_application_details;',
    );
    await assert.rejects(
      reviewSellerApplication(database, {
        sellerId: 'maker',
        actorId: 'super',
        action: 'approve_for_activation',
        reason: 'Test approve',
        now: 3,
      }),
      /agreement|identity/i,
    );
    assert.equal(
      sqlite
        .prepare(
          'SELECT application_stage FROM seller_participation_profiles WHERE seller_id=?',
        )
        .get('maker')?.application_stage,
      'under_review',
    );
  } finally {
    sqlite.close();
  }
});
void test('operational company account has a stable entity and validates mutable contact/address without accepting legal or PAN overrides', () => {
  const key = 'managed_maker_company_account' as Parameters<
    typeof getBusinessSettingDefinition
  >[0];
  const defaults = getBusinessSettingDefinition(key).defaultValue as Record<
    string,
    string
  >;
  assert.equal(defaults.entityReference, 'hastabazaar-company-406171-83-84');
  assert.equal(defaults.storeName, companyDetails.brandName);
  assert.equal(defaults.contactEmail, companyDetails.supportEmail);
  assert.equal(defaults.returnAddress, companyDetails.registeredOffice);
  assert.throws(
    () =>
      validateBusinessSettingValue(key, {
        ...defaults,
        entityReference: 'different',
      }),
    /entity|reference/i,
  );
  assert.throws(
    () => validateBusinessSettingValue(key, { ...defaults, pan: '123456789' }),
    /unsupported|unknown|legal/i,
  );
  assert.throws(
    () =>
      validateBusinessSettingValue(key, {
        ...defaults,
        contactEmail: 'invalid',
      }),
    /email/i,
  );
});
void test('company account publication is Super Admin controlled and historical agreement preserves accepted identity', async () => {
  const { sqlite, database } = await fixture();
  try {
    await application(database);
    const before = sqlite
      .prepare(
        'SELECT agreement_snapshot_json FROM managed_maker_application_details WHERE seller_id=?',
      )
      .get('maker');
    const key = 'managed_maker_company_account' as Parameters<
      typeof getBusinessSettingDefinition
    >[0];
    const defaults = getBusinessSettingDefinition(key).defaultValue as Record<
      string,
      string
    >;
    await assert.rejects(
      createBusinessSettingDraft(database, {
        key,
        value: { ...defaults, storeName: 'New Store' } as never,
        actorId: 'staff',
        reason: 'Operational company account update',
        requestId: 'denied-company',
        now: 10,
      }),
      /Super Admin/i,
    );
    const draft = await createBusinessSettingDraft(database, {
      key,
      value: { ...defaults, storeName: 'New Store' } as never,
      actorId: 'super',
      reason: 'Operational company account update',
      requestId: 'draft-company',
      now: 10,
    });
    await publishBusinessSettingDraft(database, {
      id: draft.id,
      actorId: 'super',
      expectedRevision: 1,
      reason: 'Publish company contact defaults',
      effectiveFrom: 20,
      requestId: 'publish-company',
      now: 20,
    });
    assert.deepEqual(
      sqlite
        .prepare(
          'SELECT agreement_snapshot_json FROM managed_maker_application_details WHERE seller_id=?',
        )
        .get('maker'),
      before,
    );
    assert.equal(
      sqlite
        .prepare('SELECT legal_name FROM seller_profiles WHERE id=?')
        .get('maker')?.legal_name,
      'Sita Fictional Maker',
    );
  } finally {
    sqlite.close();
  }
});
void test('sale-linked entitlement never becomes payable for unpaid, undelivered, disputed or refunded orders', () => {
  assert.equal(
    isManagedEntitlementEarned({ delivered: true, customerPaid: false }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({ delivered: false, customerPaid: true }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({ delivered: false, customerPaid: false }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({
      delivered: true,
      customerPaid: true,
      disputed: true,
    }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({
      delivered: true,
      customerPaid: true,
      refunded: true,
    }),
    false,
  );
  assert.equal(
    isManagedEntitlementEarned({ delivered: true, customerPaid: true }),
    true,
  );
});

void test('changed authoritative retention rejects acceptance of previously displayed terms before writes', async () => {
  const { sqlite, database } = await fixture();
  try {
    const input = parseSellerApplication(managedMakerForm()).input!;
    const draft = await createBusinessSettingDraft(database, {
      key: 'managed_sale_linked_platform_retention_bps',
      value: 1000,
      actorId: 'super',
      reason: 'Update rate before acceptance',
      requestId: 'rate-draft',
      now: 10,
    });
    await publishBusinessSettingDraft(database, {
      id: draft.id,
      actorId: 'super',
      expectedRevision: 1,
      reason: 'Update rate before acceptance',
      effectiveFrom: 20,
      requestId: 'rate-publish',
      now: 20,
    });
    await assert.rejects(
      createSellerApplication(database, {
        userId: 'stale-user',
        sellerId: 'stale',
        input,
        documents: [identityDocument('stale')],
        now: 1800000000000,
        applicationReference: 'STALE',
      }),
      /terms.*changed|reload/i,
    );
    assert.equal(
      sqlite.prepare('SELECT id FROM users WHERE id=?').get('stale-user'),
      undefined,
    );
  } finally {
    sqlite.close();
  }
});
void test('changes-requested managed maker supplies missing evidence and explicitly accepts current terms before resubmission', async () => {
  const { sqlite, database } = await fixture();
  try {
    await application(database);
    await reviewSellerApplication(database, {
      sellerId: 'maker',
      actorId: 'super',
      action: 'start_review',
      reason: 'Test review',
      now: 1800000000001,
    });
    await reviewSellerApplication(database, {
      sellerId: 'maker',
      actorId: 'super',
      action: 'request_changes',
      reason: 'Supply updated government evidence',
      now: 1800000000002,
    });
    const profile = (await getSellerParticipationProfile(database, 'maker'))!;
    const identity =
      parseSellerApplication(managedMakerForm()).input!.managedIdentity!;
    const correction = {
      identity,
      documents: [
        {
          ...identityDocument('maker'),
          id: 'corrected-id',
          objectKey: 'private/seller-documents/maker/corrected-id',
        },
      ],
    };
    await assert.rejects(
      updateSellerParticipationPublicProfile(database, {
        sellerId: 'maker',
        actorId: 'staff',
        expectedVersion: profile.version,
        publicName: profile.publicName,
        publicCity: profile.publicCity,
        craftExperience: [],
        socialLinks: {},
        requestId: 'denied-correction',
        now: 1800000000003,
        managedCorrection: correction,
      }),
      /owner/i,
    );
    await updateSellerParticipationPublicProfile(database, {
      sellerId: 'maker',
      actorId: 'user-maker',
      expectedVersion: profile.version,
      publicName: profile.publicName,
      publicCity: profile.publicCity,
      craftExperience: [],
      socialLinks: {},
      requestId: 'maker-correction',
      now: 1800000000003,
      managedCorrection: correction,
    });
    assert.equal(
      (await getSellerParticipationProfile(database, 'maker'))
        ?.applicationStage,
      'submitted',
    );
    assert.equal(
      sqlite
        .prepare('SELECT status FROM seller_profiles WHERE id=?')
        .get('maker')?.status,
      'submitted',
    );
    assert.equal(
      sqlite
        .prepare(
          'SELECT COUNT(*) AS n FROM managed_maker_application_details WHERE seller_id=?',
        )
        .get('maker')?.n,
      2,
    );
    assert.equal(
      sqlite
        .prepare(
          'SELECT identity_document_id FROM managed_maker_application_details WHERE created_at=?',
        )
        .get(1800000000003)?.identity_document_id,
      'corrected-id',
    );
    await reviewSellerApplication(database, {
      sellerId: 'maker',
      actorId: 'super',
      action: 'start_review',
      reason: 'Review corrected evidence',
      now: 1800000000004,
    });
    await reviewSellerApplication(database, {
      sellerId: 'maker',
      actorId: 'super',
      action: 'approve_for_activation',
      reason: 'Corrected evidence accepted',
      now: 1800000000005,
    });
    assert.equal(
      (await getSellerParticipationProfile(database, 'maker'))
        ?.applicationStage,
      'approved_for_activation',
    );
  } finally {
    sqlite.close();
  }
});

void test('Super Admin downgrade at the transaction boundary rolls back managed approval', async () => {
  const { sqlite, database } = await fixture();
  try {
    await application(database);
    await reviewSellerApplication(database, {
      sellerId: 'maker',
      actorId: 'super',
      action: 'start_review',
      reason: 'Start managed review',
      now: 1800000000001,
    });
    (database as unknown as TestDatabase).beforeBatch = () =>
      sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='super'");
    await assert.rejects(
      reviewSellerApplication(database, {
        sellerId: 'maker',
        actorId: 'super',
        action: 'approve_for_activation',
        reason: 'Approve managed evidence',
        now: 1800000000002,
      }),
      /CHECK constraint|staff_permission_guards|permission/i,
    );
    assert.equal(
      (await getSellerParticipationProfile(database, 'maker'))
        ?.applicationStage,
      'under_review',
    );
    assert.equal(
      sqlite
        .prepare(
          "SELECT COUNT(*) AS n FROM audit_logs WHERE action='seller.application.approved_for_activation'",
        )
        .get()?.n,
      0,
    );
  } finally {
    sqlite.close();
  }
});
void test('company account changes between authoritative read and batch cannot silently change accepted terms', async () => {
  const { sqlite, database } = await fixture();
  try {
    const account = getBusinessSettingDefinition(
      'managed_maker_company_account',
    ).defaultValue;
    const draft = await createBusinessSettingDraft(database, {
      key: 'managed_maker_company_account',
      value: { ...account, storeName: 'Updated operational store' },
      actorId: 'super',
      reason: 'Change operational company account',
      requestId: 'company-race-draft',
      now: 10,
    });
    (database as unknown as TestDatabase).beforeBatch = () =>
      sqlite
        .prepare(`UPDATE business_setting_versions SET status='published',revision=revision+1,
      effective_from=20,published_at=20,published_by='super' WHERE id=?`)
        .run(draft.id);
    await assert.rejects(
      application(database),
      /CHECK constraint|operation_transaction_guards/i,
    );
    assert.equal(
      sqlite.prepare('SELECT id FROM users WHERE id=?').get('user-maker'),
      undefined,
    );
  } finally {
    sqlite.close();
  }
});

void test('managed government ID and optional personal PAN evidence stay private after real registered-route transition, including correction and legacy history',async()=>{
  const {sqlite,database}=await fixture();
  try {
    const input=parseSellerApplication(managedMakerForm()).input!;
    await createSellerApplication(database,{userId:'user-maker',sellerId:'maker',applicationReference:'MAKER',input,
      documents:[identityDocument('maker'),{...identityDocument('maker'),id:'original-pan',kind:'pan_certificate',objectKey:'private/seller-documents/maker/original-pan',originalName:'123456789-personal-PAN.pdf'}],now:1800000000000});
    await reviewSellerApplication(database,{sellerId:'maker',actorId:'super',action:'start_review',reason:'Review evidence',now:1800000000001});
    await reviewSellerApplication(database,{sellerId:'maker',actorId:'super',action:'request_changes',reason:'Supply corrected government evidence',now:1800000000002});
    const profile=(await getSellerParticipationProfile(database,'maker'))!;
    await updateSellerParticipationPublicProfile(database,{sellerId:'maker',actorId:'user-maker',expectedVersion:profile.version,publicName:profile.publicName,publicCity:profile.publicCity,
      craftExperience:[],socialLinks:{},requestId:'corrected-private-evidence',now:1800000000003,managedCorrection:{identity:input.managedIdentity!,documents:[
        {...identityDocument('maker'),id:'corrected-government',objectKey:'private/seller-documents/maker/corrected-government',originalName:'123456789-corrected-ID.pdf'},
        {...identityDocument('maker'),id:'corrected-pan',kind:'pan_certificate',objectKey:'private/seller-documents/maker/corrected-pan',originalName:'123456789-corrected-PAN.pdf'}]}});
    sqlite.exec("UPDATE seller_profiles SET status='approved' WHERE id='maker'; UPDATE seller_participation_profiles SET application_stage='active' WHERE seller_id='maker'");
    const environment=resolveRuntimeEnvironment({runtimeEnvironment:'local_staging',appOrigin:'http://127.0.0.1:4173'});
    const id=await submitRegisteredSellerTransition(database,{sellerId:'maker',actorId:'user-maker',legalName:'SIM Registered Maker Business',registrationAuthority:'SIM Registration Office',registrationNumber:'SIM-REG-123',
      taxMode:'PAN',taxRegistrationNumber:'987654321',evidenceReferences:['SIM-business-registration'],agreementVersion:'SIM-REGISTERED-V1',agreementLanguage:'en',agreementAcceptedAt:1800000000004,requestId:'managed-to-registered',now:1800000000004,environment});
    await reviewRouteTransition(database,{applicationId:id,actorId:'super',action:'approve',reason:'SIMULATED verified registered evidence',effectiveAt:1800000000005,requestId:'approve-route-transition',now:1800000000005,environment});
    assert.equal(await applyDueRouteTransitions(database,1800000000006,environment),1);
    assert.equal((await getSellerParticipationProfile(database,'maker'))?.participationRoute,'registered_seller');
    for (const documentId of ['id-maker','original-pan','corrected-government','corrected-pan']) {
      await assert.rejects(getSellerDocumentForStaff(database,documentId,'staff'),/Super Admin/i);
      assert.ok(await getSellerDocumentForStaff(database,documentId,'super'));
    }
    const staffView=await getSellerApplicationForReview(database,'maker','staff');
    assert.equal(staffView?.documents.length,0);assert.equal(staffView?.documentCount,0);
    assert.equal(JSON.stringify(staffView).includes('123456789'),false,'private filenames must not reach ordinary staff');
    assert.equal((await getSellerApplicationForReview(database,'maker','super'))?.documents.length,4);
    sqlite.exec('DROP TRIGGER managed_maker_details_no_delete; DELETE FROM managed_maker_application_details;');
    await assert.rejects(getSellerDocumentForStaff(database,'original-pan','staff'),/Super Admin/i,'historical transition also protects legacy makers without new acceptance');
    assert.equal((await getSellerApplicationForReview(database,'maker','staff'))?.documents.length,0);
  }finally{sqlite.close();}
});
void test('originally registered seller certificates retain ordinary staff document and review access',async()=>{
  const {sqlite,database}=await fixture();
  try {
    const form=managedMakerForm();form.set('hasBusinessTaxRegistration','yes');form.set('taxStatus','business_pan_only');form.set('taxRegistrationNumber','987654321');form.set('acceptedTerms','yes');
    const parsed=parseSellerApplication(form);assert.ok(parsed.input,parsed.errors.join('\n'));
    const documents=sellerDocumentsForApplication(parsed.input).filter(d=>d.required||d.kind==='representative_identity').map((definition,index)=>({
      ...identityDocument('registered'),id:`registered-document-${index}`,kind:definition.kind,objectKey:`private/seller-documents/registered/document-${index}`,originalName:`registered-${definition.kind}.pdf`}));
    await createSellerApplication(database,{userId:'user-registered',sellerId:'registered',applicationReference:'REGISTERED',input:parsed.input,documents,now:1800000000000});
    for(const document of documents) assert.ok(await getSellerDocumentForStaff(database,document.id,'staff'));
    const view=await getSellerApplicationForReview(database,'registered','staff');
    assert.equal(view?.documents.length,documents.length);assert.equal(view?.documentCount,documents.length);
  }finally{sqlite.close();}
});
