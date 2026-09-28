import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DatabaseSync,
  type SQLInputValue,
  type StatementSync,
} from 'node:sqlite';
import test from 'node:test';

import {
  BusinessSettingConflictError,
  approveBusinessSettingChange,
  rejectBusinessSettingChange,
  createBusinessSettingDraft,
  createBusinessSettingReversalDraft,
  getEffectiveBusinessSetting,
  listBusinessSettingHistory,
  publishBusinessSettingDraft,
  submitBusinessSettingDraft,
} from '../lib/db/repositories/business-settings';
import { INITIAL_HOMEPAGE_HERO_SLIDES } from '../lib/homepage/hero-slides';
import { INITIAL_HOMEPAGE_OCCASION_SLIDES } from '../lib/homepage/occasion-slides';

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
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
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
    CREATE TABLE users (id TEXT PRIMARY KEY, display_name TEXT NOT NULL, status TEXT DEFAULT 'active');
    CREATE TABLE user_roles(user_id TEXT, role TEXT);
    CREATE TABLE audit_logs (
      id TEXT PRIMARY KEY, actor_id TEXT, action TEXT, subject_type TEXT,
      subject_id TEXT, reason TEXT, previous_json TEXT, next_json TEXT,
      request_id TEXT, ip_hash TEXT, created_at INTEGER
    );
    INSERT INTO users VALUES
      ('admin-a', 'Super Admin A', 'active'),
      ('admin-b', 'Super Admin B', 'active');
    INSERT INTO user_roles VALUES ('admin-a','super_admin'),('admin-b','super_admin');
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

void test('controlled financial changes permit the submitted same-actor approval and preserve attribution', async () => {
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

    await approveBusinessSettingChange(database, {
      id: draft.id,
      actorId: 'admin-a',
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
    assert.equal(effective.approvedBy, 'admin-a');
    const approved = sqlite.prepare('SELECT submitted_by, approved_by, revision FROM business_setting_versions WHERE id=?').get(draft.id);
    assert.deepEqual({ ...approved }, { submitted_by: 'admin-a', approved_by: 'admin-a', revision: 3 });
    const audit = sqlite.prepare("SELECT actor_id, action, reason, subject_id FROM audit_logs WHERE request_id='retention-approve-1'").get();
    assert.equal(audit?.actor_id, 'admin-a');
    assert.equal(audit?.action, 'business_setting.approved');
    assert.equal(audit?.subject_id, draft.id);
  } finally {
    sqlite.close();
  }
});

void test('independent seller commission requires 15 days notice before taking effect', async () => {
  const { sqlite, database } = await fixture();
  try {
    const draft = await createBusinessSettingDraft(database, {
      key: 'independent_seller_commission_bps',
      value: 800,
      actorId: 'admin-a',
      reason: 'Prepare a future independent seller commission version.',
      requestId: 'seller-fee-draft',
      now: 1_000,
    });
    await submitBusinessSettingDraft(database, {
      id: draft.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      reason: 'Submit future seller commission for review.',
      requestId: 'seller-fee-submit',
      now: 2_000,
    });
    await assert.rejects(
      approveBusinessSettingChange(database, {
        id: draft.id,
        actorId: 'admin-b',
        expectedRevision: 2,
        effectiveFrom: 14 * 86_400_000,
        reason: 'Attempt insufficient notice.',
        requestId: 'seller-fee-too-soon',
        now: 3_000,
      }),
      /15 calendar days notice/i,
    );
    await approveBusinessSettingChange(database, {
      id: draft.id,
      actorId: 'admin-b',
      expectedRevision: 2,
      effectiveFrom: 16 * 86_400_000,
      reason: 'Approve with more than fifteen days notice.',
      requestId: 'seller-fee-approved',
      now: 3_000,
    });
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'independent_seller_commission_bps',
          16 * 86_400_000,
        )
      ).value,
      800,
    );
  } finally {
    sqlite.close();
  }
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
    assert.deepEqual(
      history.map((item) => item.version),
      [3, 2, 1],
    );
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
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS business_setting_versions/i,
  );
  assert.match(
    migration,
    /CREATE TABLE IF NOT EXISTS business_setting_guards/i,
  );
  assert.doesNotMatch(migration, /DROP TABLE/i);
  assert.match(generator, /business_setting_versions/);
  assert.match(generator, /business_setting_guards/);
});

void test('scheduled hero versions stay hidden until effective and restoration appends history', async () => {
  const { sqlite, database } = await fixture();
  try {
    const firstValue = INITIAL_HOMEPAGE_HERO_SLIDES.map((slide) => ({
      ...slide,
    }));
    const first = await createBusinessSettingDraft(database, {
      key: 'homepage_hero_slides',
      value: firstValue,
      actorId: 'admin-a',
      reason: 'Create the first complete staging homepage hero version.',
      requestId: 'hero-draft-first',
      now: 1_000,
    });
    await publishBusinessSettingDraft(database, {
      id: first.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 2_000,
      reason: 'Publish the first complete staging homepage hero version.',
      requestId: 'hero-publish-first',
      now: 1_100,
    });
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_hero_slides',
          1_999,
        )
      ).source,
      'default',
    );

    const secondValue = firstValue.map((slide, index) =>
      index === 0
        ? { ...slide, headingLead: 'A later staged headline' }
        : slide,
    );
    const second = await createBusinessSettingDraft(database, {
      key: 'homepage_hero_slides',
      value: secondValue,
      actorId: 'admin-a',
      reason: 'Create a second complete staging homepage hero version.',
      requestId: 'hero-draft-second',
      now: 2_100,
    });
    await publishBusinessSettingDraft(database, {
      id: second.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 3_000,
      reason: 'Schedule the second complete staging homepage hero version.',
      requestId: 'hero-publish-second',
      now: 2_200,
    });
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_hero_slides',
          2_999,
        )
      ).value[0]?.headingLead,
      firstValue[0]?.headingLead,
    );

    const restoration = await createBusinessSettingReversalDraft(database, {
      sourceVersionId: first.id,
      actorId: 'admin-b',
      reason:
        'Restore the earlier hero prospectively without rewriting history.',
      requestId: 'hero-restore-draft',
      now: 3_100,
    });
    await publishBusinessSettingDraft(database, {
      id: restoration.id,
      actorId: 'admin-b',
      expectedRevision: 1,
      effectiveFrom: 4_000,
      reason: 'Publish the prospective hero restoration in staging.',
      requestId: 'hero-restore-publish',
      now: 3_200,
    });
    const history = await listBusinessSettingHistory(
      database,
      'homepage_hero_slides',
    );
    assert.deepEqual(
      history.map((version) => version.version),
      [3, 2, 1],
    );
    assert.equal(history[2]?.value[0]?.headingLead, firstValue[0]?.headingLead);
    assert.equal(history[1]?.value[0]?.headingLead, 'A later staged headline');
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_hero_slides',
          4_000,
        )
      ).value[0]?.headingLead,
      firstValue[0]?.headingLead,
    );
  } finally {
    sqlite.close();
  }
});

void test('occasion drafts, schedules, history, and restoration never mutate the current or older published versions', async () => {
  const { sqlite, database } = await fixture();
  try {
    const firstValue = INITIAL_HOMEPAGE_OCCASION_SLIDES.map((slide) => ({
      ...slide,
      cards: [{ ...slide.cards[0] }, { ...slide.cards[1] }] as const,
    }));
    const first = await createBusinessSettingDraft(database, {
      key: 'homepage_occasion_slides',
      value: firstValue,
      actorId: 'admin-a',
      reason: 'Create the initial gifting carousel version.',
      requestId: 'occasion-first-draft',
      now: 1_000,
    });
    await publishBusinessSettingDraft(database, {
      id: first.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 1_100,
      reason: 'Publish the initial gifting carousel version.',
      requestId: 'occasion-first-publish',
      now: 1_050,
    });

    const secondValue = firstValue.map((slide, index) =>
      index === 1
        ? { ...slide, headingLead: 'A private draft heading.' }
        : slide,
    );
    const second = await createBusinessSettingDraft(database, {
      key: 'homepage_occasion_slides',
      value: secondValue,
      actorId: 'admin-a',
      reason: 'Edit a private future gifting version.',
      requestId: 'occasion-second-draft',
      now: 1_200,
    });
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_occasion_slides',
          2_000,
        )
      ).value[1]?.headingLead,
      firstValue[1]?.headingLead,
      'editing a draft must not alter the current published carousel',
    );
    await publishBusinessSettingDraft(database, {
      id: second.id,
      actorId: 'admin-a',
      expectedRevision: 1,
      effectiveFrom: 3_000,
      reason: 'Schedule the edited gifting carousel.',
      requestId: 'occasion-second-publish',
      now: 1_300,
    });
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_occasion_slides',
          2_999,
        )
      ).value[1]?.headingLead,
      firstValue[1]?.headingLead,
    );
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_occasion_slides',
          3_000,
        )
      ).value[1]?.headingLead,
      'A private draft heading.',
    );

    const restoration = await createBusinessSettingReversalDraft(database, {
      sourceVersionId: first.id,
      actorId: 'admin-b',
      reason: 'Restore the original gifting layout prospectively.',
      requestId: 'occasion-restore-draft',
      now: 3_100,
    });
    await publishBusinessSettingDraft(database, {
      id: restoration.id,
      actorId: 'admin-b',
      expectedRevision: 1,
      effectiveFrom: 4_000,
      reason: 'Publish the prospective gifting restoration.',
      requestId: 'occasion-restore-publish',
      now: 3_200,
    });
    const history = await listBusinessSettingHistory(
      database,
      'homepage_occasion_slides',
    );
    assert.deepEqual(
      history.map((version) => version.version),
      [3, 2, 1],
    );
    assert.equal(history[2]?.value[1]?.headingLead, firstValue[1]?.headingLead);
    assert.equal(history[1]?.value[1]?.headingLead, 'A private draft heading.');
    assert.equal(
      (
        await getEffectiveBusinessSetting(
          database,
          'homepage_occasion_slides',
          4_000,
        )
      ).value[1]?.headingLead,
      firstValue[1]?.headingLead,
    );
  } finally {
    sqlite.close();
  }
});

void test('same-actor rejection retains submitted revision, rejection audit and state guards', async () => {
  const { sqlite, database } = await fixture();
  try {
    const draft = await createBusinessSettingDraft(database, { key: 'managed_sale_linked_platform_retention_bps', value: 800, actorId: 'admin-a', reason: 'Prepare controlled change', requestId: 'self-reject-draft', now: 1000 });
    const input = { id: draft.id, actorId: 'admin-a', expectedRevision: 2, reason: 'Reject unsupported change', requestId: 'self-reject-action', now: 1200 };
    await assert.rejects(rejectBusinessSettingChange(database, { ...input, expectedRevision: 1 }), BusinessSettingConflictError);
    await submitBusinessSettingDraft(database, { id: draft.id, actorId: 'admin-a', expectedRevision: 1, reason: 'Submit controlled change', requestId: 'self-reject-submit', now: 1100 });
    await assert.rejects(rejectBusinessSettingChange(database, { ...input, expectedRevision: 1 }), BusinessSettingConflictError);
    await rejectBusinessSettingChange(database, input);
    const row = sqlite.prepare('SELECT status, revision, submitted_by, approved_by, decision_note FROM business_setting_versions WHERE id=?').get(draft.id);
    assert.deepEqual({ ...row }, { status: 'rejected', revision: 3, submitted_by: 'admin-a', approved_by: 'admin-a', decision_note: input.reason });
    const audit = sqlite.prepare('SELECT actor_id, action, subject_id, reason FROM audit_logs WHERE request_id=?').get(input.requestId);
    assert.deepEqual({ ...audit }, { actor_id: 'admin-a', action: 'business_setting.rejected', subject_id: draft.id, reason: input.reason });
    await assert.rejects(rejectBusinessSettingChange(database, { ...input, requestId: 'reject-again' }), BusinessSettingConflictError);
    assert.equal((sqlite.prepare("SELECT count(*) AS n FROM audit_logs WHERE action='business_setting.rejected'").get())?.n, 1);
    assert.equal((await getEffectiveBusinessSetting(database, 'managed_sale_linked_platform_retention_bps', 2000)).value, 900);
  } finally { sqlite.close(); }
});

void test('no-form setting decisions require current active Super Admin authority', async () => {
 for (const action of [approveBusinessSettingChange,rejectBusinessSettingChange]) {
  for(const blocked of ['ordinary','suspended']) {
   const {sqlite,database}=await fixture();
   try {
    const draft=await createBusinessSettingDraft(database,{key:'managed_sale_linked_platform_retention_bps',value:900,actorId:'admin-a',reason:'SIMULATED same value regression.',requestId:'noform-draft',now:100});
    await submitBusinessSettingDraft(database,{id:draft.id,actorId:'admin-a',expectedRevision:1,reason:'SIMULATED submission regression.',requestId:'noform-submit',now:200});
    if(blocked==='ordinary')sqlite.exec("UPDATE user_roles SET role='admin' WHERE user_id='admin-a'");
    else sqlite.exec("UPDATE users SET status='suspended' WHERE id='admin-a'");
    await assert.rejects(action(database,{id:draft.id,actorId:'admin-a',expectedRevision:2,effectiveFrom:1000,reason:'SIMULATED authority regression.',requestId:'noform-decision',now:300}),/Super Admin authority/);
    assert.equal(sqlite.prepare('SELECT status FROM business_setting_versions WHERE id=?').get(draft.id)?.status,'pending_approval');
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='noform-decision'").get()?.n,0);
   }finally{sqlite.close();}
  }
 }
});
