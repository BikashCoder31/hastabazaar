import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';

import {
  BusinessSettingConflictError,
  approveBusinessSettingChange,
  createBusinessSettingDraft,
  createBusinessSettingReversalDraft,
  getEffectiveBusinessSetting,
  listBusinessSettingHistory,
  publishBusinessSettingDraft,
  submitBusinessSettingDraft,
} from '../lib/db/repositories/business-settings';

class PreparedStatement {
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
    return { results: this.statement.all(...this.values) as T[] };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
}

class TestDatabase {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new PreparedStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly PreparedStatement[]) {
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

async function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL);
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT,
      request_id TEXT, ip_hash TEXT, created_at INTEGER
    );
    INSERT INTO users VALUES
      ('admin-a', 'Super Admin A'),
      ('admin-b', 'Super Admin B');
  `);
  const migration = await readFile(
    new URL('../drizzle/0044_business_configuration.sql', import.meta.url),
    'utf8',
  );
  sqlite.exec(migration);
  return {
    sqlite,
    database: new TestDatabase(sqlite) as unknown as D1Database,
  };
}

const socialLinksA = {
  linkedin: 'https://linkedin.com/company/hastabazaar',
  x: 'https://x.com/Hastabazaar',
  tiktok: 'https://tiktok.com/@hastabazaar',
  instagram: 'https://instagram.com/hastabazaar',
  facebook: 'https://www.facebook.com/hastabazaar',
  youtube: 'https://www.youtube.com/@hastabazaar',
};

void test('simple content moves from draft through publish and resolves from its effective date', async () => {
  const { sqlite, database } = await fixture();
  try {
    const draft = await createBusinessSettingDraft(database, {
      key: 'official_social_links',
      value: socialLinksA,
      actorId: 'admin-a',
      reason: 'Publish owner-confirmed official social media links.',
      requestId: 'social-draft-1',
      now: 1_000,
    });
    assert.equal(draft.status, 'draft');
    assert.equal(draft.version, 1);

    const before = await getEffectiveBusinessSetting(
      database,
      'official_social_links',
      1_999,
    );
    assert.equal(before.source, 'default');

    await publishBusinessSettingDraft(database, {
      id: draft.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 2_000,
      reason: 'Schedule the reviewed public links.',
      requestId: 'social-publish-1',
      now: 1_100,
    });

    const after = await getEffectiveBusinessSetting(
      database,
      'official_social_links',
      2_000,
    );
    assert.equal(after.source, 'persisted');
    assert.equal(after.version, 1);
    assert.deepEqual(after.value, socialLinksA);
  } finally {
    sqlite.close();
  }
});

void test('controlled financial changes require submission and a different approver', async () => {
  const { sqlite, database } = await fixture();
  try {
    const draft = await createBusinessSettingDraft(database, {
      key: 'managed_sale_linked_platform_retention_bps',
      value: 800,
      actorId: 'admin-a',
      reason: 'Prepare an alternate simulated retention rate for review.',
      requestId: 'retention-draft-1',
      now: 1_000,
    });
    await submitBusinessSettingDraft(database, {
      id: draft.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      reason: 'Submit the simulated rate for independent review.',
      requestId: 'retention-submit-1',
      now: 1_100,
    });

    await assert.rejects(
      approveBusinessSettingChange(database, {
        id: draft.id,
        actorId: 'admin-a',
        expectedRevision: 2,
        effectiveFrom: 2_000,
        reason: 'Attempt self approval.',
        requestId: 'retention-approve-self',
        now: 1_200,
      }),
      BusinessSettingConflictError,
    );

    await approveBusinessSettingChange(database, {
      id: draft.id,
      actorId: 'admin-b',
      expectedRevision: 2,
      effectiveFrom: 2_000,
      reason: 'Independently approve the simulated staging change.',
      requestId: 'retention-approve-1',
      now: 1_300,
    });

    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'managed_sale_linked_platform_retention_bps',
          1_999,
        )
      ).value,
      900,
    );
    const effective = await getEffectiveBusinessSetting(
      database,
      'managed_sale_linked_platform_retention_bps',
      2_000,
    );
    assert.equal(effective.value, 800);
    assert.equal(effective.approvedBy, 'admin-b');
  } finally {
    sqlite.close();
  }
});

void test('independent seller commission requires 15 days notice before taking effect', async () => {
  const { sqlite, database } = await fixture();
  try {
    const draft = await createBusinessSettingDraft(database, {
      key: 'independent_seller_commission_bps', value: 800, actorId: 'admin-a',
      reason: 'Prepare a future independent seller commission version.', requestId: 'seller-fee-draft', now: 1_000,
    });
    await submitBusinessSettingDraft(database, { id: draft.id, actorId: 'admin-a', expectedRevision: 1, reason: 'Submit future seller commission for review.', requestId: 'seller-fee-submit', now: 2_000 });
    await assert.rejects(approveBusinessSettingChange(database, { id: draft.id, actorId: 'admin-b', expectedRevision: 2, effectiveFrom: 14 * 86_400_000, reason: 'Attempt insufficient notice.', requestId: 'seller-fee-too-soon', now: 3_000 }), /15 calendar days notice/i);
    await approveBusinessSettingChange(database, { id: draft.id, actorId: 'admin-b', expectedRevision: 2, effectiveFrom: 16 * 86_400_000, reason: 'Approve with more than fifteen days notice.', requestId: 'seller-fee-approved', now: 3_000 });
    assert.equal((await getEffectiveBusinessSetting(database, 'independent_seller_commission_bps', 16 * 86_400_000)).value, 800);
  } finally { sqlite.close(); }
});

void test('effective versions append chronologically, close the prior interval, and prevent overlap', async () => {
  const { sqlite, database } = await fixture();
  try {
    const first = await createBusinessSettingDraft(database, {
      key: 'open_box_service_area_codes',
      value: ['test-birgunj'],
      actorId: 'admin-a',
      reason: 'First isolated staging service area.',
      requestId: 'area-draft-1',
      now: 1_000,
    });
    await publishBusinessSettingDraft(database, {
      id: first.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 2_000,
      reason: 'Schedule first isolated staging area.',
      requestId: 'area-publish-1',
      now: 1_100,
    });

    const second = await createBusinessSettingDraft(database, {
      key: 'open_box_service_area_codes',
      value: ['test-kathmandu'],
      actorId: 'admin-a',
      reason: 'Second isolated staging service area.',
      requestId: 'area-draft-2',
      now: 1_200,
    });
    await publishBusinessSettingDraft(database, {
      id: second.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 3_000,
      reason: 'Schedule second isolated staging area.',
      requestId: 'area-publish-2',
      now: 1_300,
    });

    assert.deepEqual(
      (
        await getEffectiveBusinessSetting(
          database,
          'open_box_service_area_codes',
          2_999,
        )
      ).value,
      ['test-birgunj'],
    );
    assert.deepEqual(
      (
        await getEffectiveBusinessSetting(
          database,
          'open_box_service_area_codes',
          3_000,
        )
      ).value,
      ['test-kathmandu'],
    );

    const overlap = await createBusinessSettingDraft(database, {
      key: 'open_box_service_area_codes',
      value: ['test-pokhara'],
      actorId: 'admin-a',
      reason: 'Attempt an overlapping effective interval.',
      requestId: 'area-draft-overlap',
      now: 1_400,
    });
    await assert.rejects(
      publishBusinessSettingDraft(database, {
        id: overlap.id,
        actorId: 'admin-a',
        expectedRevision: 1,
        effectiveFrom: 2_500,
        reason: 'This must fail instead of rewriting scheduled history.',
        requestId: 'area-publish-overlap',
        now: 1_500,
      }),
      BusinessSettingConflictError,
    );
  } finally {
    sqlite.close();
  }
});

void test('reversal is a new version and leaves published history immutable', async () => {
  const { sqlite, database } = await fixture();
  try {
    const first = await createBusinessSettingDraft(database, {
      key: 'open_box_category_codes',
      value: ['clay'],
      actorId: 'admin-a',
      reason: 'Initial staged open-box category.',
      requestId: 'category-draft-1',
      now: 1_000,
    });
    await publishBusinessSettingDraft(database, {
      id: first.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 1_000,
      reason: 'Publish the initial category.',
      requestId: 'category-publish-1',
      now: 1_000,
    });
    const second = await createBusinessSettingDraft(database, {
      key: 'open_box_category_codes',
      value: ['clay', 'wood'],
      actorId: 'admin-a',
      reason: 'Add a second staged category.',
      requestId: 'category-draft-2',
      now: 2_000,
    });
    await publishBusinessSettingDraft(database, {
      id: second.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 2_000,
      reason: 'Publish the expanded category set.',
      requestId: 'category-publish-2',
      now: 2_000,
    });

    const reversal = await createBusinessSettingReversalDraft(database, {
      sourceVersionId: first.id,
      actorId: 'admin-b',
      reason: 'Restore the earlier tested category set prospectively.',
      requestId: 'category-reversal-1',
      now: 3_000,
    });
    assert.equal(reversal.version, 3);
    assert.equal(reversal.supersedesId, first.id);
    await publishBusinessSettingDraft(database, {
      id: reversal.id,
      actorId: 'admin-b',
      expectedRevision: 1,
      effectiveFrom: 3_000,
      reason: 'Publish the prospective reversal.',
      requestId: 'category-reversal-publish',
      now: 3_000,
    });

    assert.deepEqual(
      (
        await getEffectiveBusinessSetting(
          database,
          'open_box_category_codes',
          3_000,
        )
      ).value,
      ['clay'],
    );
    const history = await listBusinessSettingHistory(
      database,
      'open_box_category_codes',
    );
    assert.deepEqual(history.map((item) => item.version), [3, 2, 1]);
    assert.deepEqual(history[2]?.value, ['clay']);
    assert.deepEqual(history[1]?.value, ['clay', 'wood']);
  } finally {
    sqlite.close();
  }
});

void test('invalid keys, invalid values, stale revisions, and controlled direct publication fail closed', async () => {
  const { sqlite, database } = await fixture();
  try {
    await assert.rejects(
      createBusinessSettingDraft(database, {
        key: 'raw_sql' as never,
        value: 'DROP TABLE orders',
        actorId: 'admin-a',
        reason: 'Must never be accepted.',
        requestId: 'bad-key',
        now: 1_000,
      }),
      /unknown business setting/i,
    );
    await assert.rejects(
      createBusinessSettingDraft(database, {
        key: 'managed_sale_linked_platform_retention_bps',
        value: -1,
        actorId: 'admin-a',
        reason: 'Must reject invalid money configuration.',
        requestId: 'bad-value',
        now: 1_000,
      }),
      RangeError,
    );
    const controlled = await createBusinessSettingDraft(database, {
      key: 'managed_sale_linked_platform_retention_bps',
      value: 900,
      actorId: 'admin-a',
      reason: 'Controlled staging financial setting.',
      requestId: 'controlled-draft',
      now: 1_000,
    });
    await assert.rejects(
      publishBusinessSettingDraft(database, {
        id: controlled.id,
        actorId: 'admin-a',
        expectedRevision: 99,
        effectiveFrom: 2_000,
        reason: 'Direct publication must fail.',
        requestId: 'controlled-direct-publish',
        now: 1_100,
      }),
      BusinessSettingConflictError,
    );
  } finally {
    sqlite.close();
  }
});

void test('migration remains additive and the MariaDB generator includes business configuration tables', async () => {
  const migration = await readFile(
    new URL('../drizzle/0044_business_configuration.sql', import.meta.url),
    'utf8',
  );
  const generator = await readFile(
    new URL('../scripts/generate-mariadb-schema.mjs', import.meta.url),
    'utf8',
  );
  assert.match(migration, /CREATE TABLE IF NOT EXISTS business_setting_versions/i);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS business_setting_guards/i);
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.match(generator, /business_setting_versions/);
  assert.match(generator, /business_setting_guards/);
});
