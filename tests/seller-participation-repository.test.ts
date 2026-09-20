import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { readdir, readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  createSellerApplication,
  getSellerParticipationProfile,
  reviewSellerApplication,
  updateSellerParticipationPublicProfile,
} from '../lib/db/repositories/seller-applications';
import { parseSellerApplication } from '../lib/sellers/application';
import { createProductSubmission } from '../lib/db/repositories/products';

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
    return { results: this.statement.all(...this.values) as T[], success: true, meta: {} };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class TestDatabase {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new TestStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly TestStatement[]) {
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
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), 'utf8');
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
    applicationAcknowledgement: 'yes',
  })) form.set(key, value);
  return form;
}

void test('0045 preserves existing sellers and creates a compatible active participation profile', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    await applyMigrations(sqlite, '0044');
    sqlite.exec(`
      INSERT INTO users(id,email,display_name,status,created_at,updated_at)
      VALUES ('legacy-user','legacy@example.test','Legacy Seller','active',1,1);
      INSERT INTO seller_profiles(
        id,user_id,legal_name,trading_name,registration_authority,registration_number,
        tax_mode,tax_registration_number,representative_name,support_phone,support_email,
        province,district,municipality,locality,status,created_at,updated_at
      ) VALUES (
        'legacy-seller','legacy-user','Legacy Legal','Legacy Shop','Office','LEGACY-1',
        'PAN','123456789','Legacy Owner','9800000000','legacy@example.test',
        'Bagmati','Kathmandu','Kathmandu','Private locality','approved',1,1
      );
    `);
    const before = sqlite.prepare('SELECT * FROM seller_profiles WHERE id = ?').get('legacy-seller');
    const migration = await readFile(new URL('../drizzle/0045_seller_participation_profiles.sql', import.meta.url), 'utf8');
    for (const part of migration.split('--> statement-breakpoint')) if (part.trim()) sqlite.exec(part);
    const after = sqlite.prepare('SELECT * FROM seller_profiles WHERE id = ?').get('legacy-seller');
    assert.deepEqual(after, before);
    const profile = sqlite.prepare(`SELECT participation_route, application_stage, public_name, public_city
      FROM seller_participation_profiles WHERE seller_id = ?`).get('legacy-seller');
    assert.deepEqual({ ...profile }, {
      participation_route: 'registered_seller',
      application_stage: 'active',
      public_name: 'Legacy Shop',
      public_city: 'Kathmandu',
    });
  } finally {
    sqlite.close();
  }
});

void test('managed application persists absent tax data, private address, and editable shared profile', async () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    await applyMigrations(sqlite);
    const database = new TestDatabase(sqlite) as unknown as D1Database;
    const parsed = parseSellerApplication(managedMakerForm());
    assert.ok(parsed.input, parsed.errors.join('\n'));
    await createSellerApplication(database, {
      userId: 'managed-user',
      sellerId: 'managed-seller',
      applicationReference: 'HB-M-TEST-1',
      input: parsed.input,
      documents: [],
      now: 1_800_000_000_000,
    });
    const legacy = sqlite.prepare(`SELECT tax_mode, tax_registration_number, registration_number,
      seller_agreement_version, seller_agreement_accepted_at FROM seller_profiles WHERE id = ?`)
      .get('managed-seller');
    assert.deepEqual({ ...legacy }, {
      tax_mode: 'NONE',
      tax_registration_number: '',
      registration_number: '',
      seller_agreement_version: null,
      seller_agreement_accepted_at: null,
    });
    const participation = await getSellerParticipationProfile(database, 'managed-seller');
    assert.equal(participation?.participationRoute, 'managed_maker');
    assert.equal(participation?.applicationStage, 'submitted');
    assert.equal(participation?.publicName, 'Fictional Mithila Studio');
    assert.equal(participation?.publicCity, 'Birgunj');
    assert.deepEqual(participation?.craftExperience, [
      { craft: 'Clay work', band: 'less_than_one_year' },
    ]);
    assert.equal(participation?.legalSellerReference, null);
    assert.equal(participation?.invoiceIssuerReference, null);
    await updateSellerParticipationPublicProfile(database, {
      sellerId: 'managed-seller',
      actorId: 'managed-user',
      expectedVersion: 1,
      publicName: 'Updated Fictional Studio',
      publicCity: 'Kathmandu',
      craftExperience: [{ craft: 'Clay work', band: 'beginner' }],
      socialLinks: { instagram: 'https://instagram.com/updated-fictional-maker' },
      now: 1_800_000_000_050,
      requestId: 'profile-update-1',
    });
    const updatedParticipation = await getSellerParticipationProfile(database, 'managed-seller');
    assert.equal(updatedParticipation?.publicName, 'Updated Fictional Studio');
    assert.equal(updatedParticipation?.version, 2);
    await assert.rejects(
      () => updateSellerParticipationPublicProfile(database, {
        sellerId: 'managed-seller',
        actorId: 'different-user',
        expectedVersion: 2,
        publicName: 'Hijacked',
        publicCity: 'Birgunj',
        craftExperience: [],
        socialLinks: {},
        now: 1_800_000_000_060,
        requestId: 'profile-update-2',
      }),
      /owner|changed/i,
    );
    const address = sqlite.prepare(`SELECT purpose, locality, is_public FROM seller_operational_addresses
      WHERE seller_id = ?`).get('managed-seller');
    assert.deepEqual({ ...address }, {
      purpose: 'verification',
      locality: 'Private test workshop',
      is_public: 0,
    });

    sqlite.exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at)
      VALUES ('cat-test','test-category','Test category',1,1,1,1)`);
    await createProductSubmission(database, {
      productId: 'managed-draft-product',
      sellerId: 'managed-seller',
      actorId: 'managed-user',
      slug: 'fictional-clay-cup',
      intent: 'draft',
      input: {
        categoryId: 'cat-test',
        occasionIds: [],
        sku: '',
        nameEn: 'Fictional clay cup',
        nameNe: null,
        descriptionEn: 'A fictional staging-only product.',
        descriptionNe: null,
        pricePaisa: 100_000,
        compareAtPricePaisa: null,
        inventoryQuantity: 1,
        producer: 'Sita Fictional Maker',
        materials: ['Clay'],
        originStory: null,
        dimensions: null,
        careInstructions: null,
        safetyInformation: null,
        returnConditions: null,
        returnEligible: true,
        warranty: null,
        madeToOrder: true,
        preparationDays: 3,
        manufacturedAt: null,
        expiresAt: null,
        licenceReference: null,
      },
      images: [],
      now: 1_800_000_000_100,
    });
    assert.equal(
      sqlite.prepare('SELECT status FROM products WHERE id = ?').get('managed-draft-product')?.status,
      'draft',
    );

    sqlite.exec(`
      INSERT INTO users(id,email,display_name,status,created_at,updated_at)
      VALUES ('reviewer-user','reviewer@example.test','Fictional Reviewer','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('reviewer-user','super_admin',1);
    `);
    await reviewSellerApplication(database, {
      sellerId: 'managed-seller',
      actorId: 'reviewer-user',
      action: 'start_review',
      reason: 'Review started for staging.',
      requestId: 'managed-review-start',
      now: 1_800_000_000_200,
    });
    await reviewSellerApplication(database, {
      sellerId: 'managed-seller',
      actorId: 'reviewer-user',
      action: 'approve_for_activation',
      reason: 'Maker requirements completed for staging review.',
      requestId: 'managed-ready',
      now: 1_800_000_000_300,
    });
    assert.equal((await getSellerParticipationProfile(database, 'managed-seller'))?.applicationStage, 'approved_for_activation');
    assert.equal(sqlite.prepare('SELECT status FROM seller_profiles WHERE id = ?').get('managed-seller')?.status, 'under_review');
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS count FROM user_roles WHERE user_id = 'managed-user' AND role = 'seller'`).get()?.count, 0);
  } finally {
    sqlite.close();
  }
});
