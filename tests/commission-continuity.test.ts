import assert from 'node:assert/strict';
import test from 'node:test';
import { commissionDatabase } from './helpers/commission-database';
import {
  sellerAcceptedCommissionVersion,
  getCommissionSetting,
} from '../lib/db/repositories/marketplace-settings';
import {
  prepareSellerCommissionAcceptance,
  getRegisteredSellerTerms,
} from '../lib/db/repositories/marketplace-settings';
import { SELLER_AGREEMENT_VERSION } from '../lib/content/legal-policies';
import {
  preserveOriginalCommissionContinuity,
  continuitySelectionSha256,
  type ContinuityRequest,
} from '../lib/db/repositories/commission-continuity';
import {
  CONTINUITY_END,
  CONTINUITY_SOURCE,
  CONTINUITY_SOURCE_RELEASE,
  CONTINUITY_CAPTURE,
  type EvidenceRow,
  auditColumns,
} from '../lib/db/repositories/commission-continuity-proof';
import {
  getCommissionCheckoutAcceptance,
  commissionCheckoutGuards,
  getSellerCommissionTerms,
} from '../lib/db/repositories/commission-rates';
import { runReviewedCommissionContinuity } from '../lib/operations/commission-continuity-operator';
const keys = [
  'independent_seller_commission_bps',
  'managed_sale_linked_platform_retention_bps',
];
async function fictionalFixture() {
  const f = await commissionDatabase();
  const db = f.database;
  for (const suffix of ['c', 'd']) {
    f.sqlite.exec(
      `INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES('fictional-${suffix}','fictional-${suffix}','fictional-${suffix}@example.test','Fictional','en-NP','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('fictional-${suffix}','seller',1)`,
    );
    const source = f.sqlite
      .prepare("SELECT * FROM seller_profiles WHERE id='seller-a'")
      .get()!;
    const row = {
      ...source,
      id: `fictional-seller-${suffix}`,
      user_id: `fictional-${suffix}`,
      registration_number: `fictional-reg-${suffix}`,
      tax_registration_number: `fictional-pan-${suffix}`,
    };
    f.sqlite
      .prepare(
        `INSERT INTO seller_profiles(${Object.keys(row).join(',')}) VALUES(${Object.keys(
          row,
        )
          .map(() => '?')
          .join(',')})`,
      )
      .run(...(Object.values(row) as never[]));
  }
  const sellers = [];
  for (const [sellerId, ownerId] of [
    ['seller-a', 'user-a'],
    ['seller-b', 'user-b'],
    ['fictional-seller-c', 'fictional-c'],
    ['fictional-seller-d', 'fictional-d'],
  ]) {
    await db
      .prepare(
        "INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,created_at,updated_at) VALUES(?,'registered_seller','active','Fictional shop','Fictional city',1,1) ON CONFLICT(seller_id) DO UPDATE SET participation_route='registered_seller'",
      )
      .bind(sellerId)
      .run();
    await db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES(?,?,'seller.agreement.accepted','seller',?,'Fictional original acceptance',NULL,?,?,1)",
      )
      .bind(
        `fictional-audit-${sellerId}`,
        ownerId,
        sellerId,
        JSON.stringify({ version: SELLER_AGREEMENT_VERSION, acceptedAt: 1 }),
        `fictional-consent-${sellerId}`,
      )
      .run();
    const audit = await db
      .prepare(`SELECT ${auditColumns.join(',')} FROM audit_logs WHERE id=?`)
      .bind(`fictional-audit-${sellerId}`)
      .first<EvidenceRow>();
    sellers.push({ sellerId, ownerId, acceptedAt: 1, audit: audit! });
  }
  for (const key of keys)
    await db
      .prepare(
        "INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id) VALUES(?,?,1,'1200','published',1,'controlled',?,'Fictional unchanged successor','owner',1,?)",
      )
      .bind(
        `fictional-future-${key}`,
        key,
        CONTINUITY_END,
        `fictional-future-${key}`,
      )
      .run();
  const o: ContinuityRequest = {
    mode: 'fictional_memory',
    requestId: 'fictional-continuity',
    actorId: 'owner',
    expectedRevision: 0,
    now: CONTINUITY_END - 1000,
    sourceRelease: CONTINUITY_SOURCE_RELEASE,
    sourceCommit: CONTINUITY_SOURCE,
    captureSha256: CONTINUITY_CAPTURE,
    selectionSha256: await continuitySelectionSha256(sellers),
    futureRows: (
      await db
        .prepare('SELECT * FROM business_setting_versions ORDER BY setting_key')
        .all<EvidenceRow>()
    ).results,
    sellers,
  };
  return { ...f, o };
}
void test('explicit continuity preserves four evidenced original consents, successors and history, with exact boundary and replay', async () => {
  const f = await fictionalFixture();
  try {
    const before = f.sqlite
      .prepare('SELECT * FROM seller_profiles ORDER BY id')
      .all();
    f.sqlite
      .prepare(
        "INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at) VALUES('fictional-original-history','seller-a',?,'ne',NULL,900,'fictional-original-history','user-a',1)",
      )
      .run(SELLER_AGREEMENT_VERSION);
    const originalHistory = f.sqlite
      .prepare('SELECT * FROM seller_agreement_acceptance_history')
      .all();
    await assert.rejects(
      getCommissionSetting(f.database, f.o.now),
      /No effective published/,
    );
    const result = await preserveOriginalCommissionContinuity(f.database, f.o);
    const setting = await getCommissionSetting(f.database, f.o.now);
    assert.equal(setting.basisPoints, 900);
    assert.equal(
      (await getCommissionSetting(f.database, CONTINUITY_END)).basisPoints,
      1200,
    );
    for (const s of f.o.sellers) {
      const proof = await getCommissionCheckoutAcceptance(
        f.database,
        s.sellerId,
        setting,
        f.o.now,
      );
      assert.equal(proof?.kind, 'preserved_legacy');
      assert.equal(
        await sellerAcceptedCommissionVersion(
          f.database,
          s.sellerId,
          setting,
          f.o.now,
        ),
        true,
      );
      const terms = await getSellerCommissionTerms(
        f.database,
        s.sellerId,
        f.o.now,
      );
      await f.database.batch(
        commissionCheckoutGuards(
          f.database,
          { [s.sellerId]: terms },
          setting,
          { [s.sellerId]: proof! },
          f.o.now,
        ),
      );
      await assert.rejects(
        f.database.batch(
          commissionCheckoutGuards(
            f.database,
            { [s.sellerId]: terms },
            setting,
            { [s.sellerId]: proof! },
            CONTINUITY_END,
          ),
        ),
      );
      assert.equal(
        await getCommissionCheckoutAcceptance(
          f.database,
          s.sellerId,
          await getCommissionSetting(f.database, CONTINUITY_END),
          CONTINUITY_END,
        ),
        null,
      );
    }
    assert.equal(
      await getCommissionCheckoutAcceptance(
        f.database,
        'fictional-unselected',
        setting,
        f.o.now,
      ),
      null,
    );
    assert.deepEqual(
      (
        await f.database
          .prepare(
            'SELECT * FROM business_setting_versions WHERE version=1 ORDER BY setting_key',
          )
          .all()
      ).results,
      f.o.futureRows,
    );
    assert.deepEqual(
      f.sqlite.prepare('SELECT * FROM seller_profiles ORDER BY id').all(),
      before,
    );
    assert.deepEqual(
      f.sqlite
        .prepare('SELECT * FROM seller_agreement_acceptance_history')
        .all(),
      originalHistory,
    );
    assert.deepEqual(
      await preserveOriginalCommissionContinuity(f.database, f.o),
      result,
    );
    await assert.rejects(
      preserveOriginalCommissionContinuity(f.database, {
        ...f.o,
        sourceRelease: 'changed',
      }),
    );
    for (const table of [
      'commission_continuity_operations',
      'commission_continuity_settings',
      'commission_continuity_sellers',
    ]) {
      assert.throws(
        () =>
          f.sqlite.exec(
            `UPDATE ${table} SET ${table === 'commission_continuity_settings' ? 'setting_key=setting_key' : 'id=id'}`,
          ),
        /immutable/,
      );
      assert.throws(() => f.sqlite.exec(`DELETE FROM ${table}`), /immutable/);
      assert.throws(
        () =>
          f.sqlite.exec(
            `INSERT OR REPLACE INTO ${table} SELECT * FROM ${table}`,
          ),
        /immutable/,
      );
    }
  } finally {
    await f.dispose();
  }
});
void test('a captured legacy proof fails closed on owner, role, status, route, profile, schedule and resulting rate drift at placement', async () => {
  const changes = [
    "UPDATE seller_profiles SET user_id='staff' WHERE id='seller-a'",
    "DELETE FROM user_roles WHERE user_id='user-a'",
    "UPDATE users SET status='suspended' WHERE id='user-a'",
    "UPDATE seller_profiles SET status='suspended' WHERE id='seller-a'",
    "UPDATE seller_profiles SET seller_agreement_accepted_at=2 WHERE id='seller-a'",
    "UPDATE seller_participation_profiles SET participation_route='managed_maker' WHERE seller_id='seller-a'",
    "UPDATE business_setting_versions SET reason='fictional drift' WHERE version=1 AND setting_key='independent_seller_commission_bps'",
    "UPDATE business_setting_versions SET value_json='1000' WHERE version=2 AND setting_key='independent_seller_commission_bps'",
  ];
  for (const change of changes) {
    const f = await fictionalFixture();
    try {
      await preserveOriginalCommissionContinuity(f.database, f.o);
      const setting = await getCommissionSetting(f.database, f.o.now);
      const proof = await getCommissionCheckoutAcceptance(
        f.database,
        'seller-a',
        setting,
        f.o.now,
      );
      const terms = await getSellerCommissionTerms(
        f.database,
        'seller-a',
        f.o.now,
      );
      f.sqlite.exec(change);
      assert.equal(
        await getCommissionCheckoutAcceptance(
          f.database,
          'seller-a',
          setting,
          f.o.now,
        ),
        null,
        change,
      );
      await assert.rejects(
        f.database.batch(
          commissionCheckoutGuards(
            f.database,
            { 'seller-a': terms },
            setting,
            { 'seller-a': proof! },
            f.o.now,
          ),
        ),
        (error: unknown) => error instanceof Error,
        change,
      );
    } finally {
      await f.dispose();
    }
  }
});
void test('a later genuine accepted supplement is preserved and its transaction identity remains guarded', async () => {
  const f = await fictionalFixture();
  const later = f.o.now + 1;
  try {
    await preserveOriginalCommissionContinuity(f.database, f.o);
    const setting = await getCommissionSetting(f.database, later);
    const proof = await getCommissionCheckoutAcceptance(
      f.database,
      'seller-a',
      setting,
      later,
    );
    f.sqlite
      .prepare(
        "INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at) VALUES('fictional-later-supplement',800,?,?,'Fictional schedule','Fictional supplement','owner',1)",
      )
      .run(later, SELLER_AGREEMENT_VERSION);
    f.sqlite
      .prepare(
        "INSERT INTO commission_rate_acceptances(rate_id,seller_id,actor_id,accepted_at) VALUES('fictional-later-supplement','seller-a','user-a',?)",
      )
      .run(later);
    const terms = await getSellerCommissionTerms(
      f.database,
      'seller-a',
      later,
    );
    assert.equal(terms.basisPoints, 800);
    await f.database.batch(
      commissionCheckoutGuards(
        f.database,
        { 'seller-a': terms },
        setting,
        { 'seller-a': proof! },
        later,
      ),
    );
    f.sqlite
      .prepare(
        "INSERT INTO commission_rate_cancellations(rate_id,request_id,reason,cancelled_by,cancelled_at) VALUES('fictional-later-supplement','fictional-cancellation','Fictional drift','owner',?)",
      )
      .run(later);
    await assert.rejects(
      f.database.batch(
        commissionCheckoutGuards(
          f.database,
          { 'seller-a': terms },
          setting,
          { 'seller-a': proof! },
          later,
        ),
      ),
    );
  } finally {
    await f.dispose();
  }
});
void test('the native operator refuses memory mode and unreviewed target/source bindings before mutation', async () => {
  const f = await fictionalFixture();
  try {
    await assert.rejects(
      runReviewedCommissionContinuity(f.database, f.o, {
        runtime: 'production',
        origin: 'https://hastabazaar.com',
        reviewedSelectionSha256: f.o.selectionSha256,
        capturePackageSha256: 'wrong',
      }),
      /environment\/source/,
    );
    await assert.rejects(
      preserveOriginalCommissionContinuity(f.database, {
        ...f.o,
        mode: 'reviewed_native',
      }),
    );
    assert.equal(
      f.sqlite
        .prepare('SELECT COUNT(*) n FROM commission_continuity_operations')
        .get()!.n,
      0,
    );
  } finally {
    await f.dispose();
  }
});
void test('wrong source, actor, clock, preimage and forged/other-owner evidence fail without additions', async () => {
  for (const mode of [
    'source',
    'actor',
    'clock',
    'preimage',
    'audit',
    'owner',
    'supplement',
  ]) {
    const f = await fictionalFixture();
    try {
      if (mode === 'source') f.o.sourceCommit = 'wrong';
      if (mode === 'actor') f.o.actorId = 'staff';
      if (mode === 'clock') f.o.now = CONTINUITY_END;
      if (mode === 'preimage') f.o.futureRows[1].reason = 'forged';
      if (mode === 'audit')
        f.o.sellers[0].audit.next_json = JSON.stringify({
          version: SELLER_AGREEMENT_VERSION,
          acceptedAt: 2,
        });
      if (mode === 'owner') f.o.sellers[0].ownerId = 'user-b';
      if (mode === 'supplement')
        f.sqlite.exec(
          "INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at) VALUES('fictional-supplement',800,1296000001,'old','Fictional','Fictional','owner',1)",
        );
      f.o.selectionSha256 = await continuitySelectionSha256(f.o.sellers);
      await assert.rejects(
        preserveOriginalCommissionContinuity(f.database, f.o),
        (error: unknown) => error instanceof Error,
        mode,
      );
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM commission_continuity_operations')
          .get()!.n,
        0,
        mode,
      );
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM business_setting_versions')
          .get()!.n,
        2,
        mode,
      );
    } finally {
      await f.dispose();
    }
  }
});
void test('transaction-time profile, owner, role, route, audit, schedule or actor drift and late audit failure roll back all additions', async () => {
  const changes = [
    "UPDATE seller_profiles SET status='suspended' WHERE id='seller-a'",
    "UPDATE seller_profiles SET user_id='staff' WHERE id='seller-a'",
    "DELETE FROM user_roles WHERE user_id='user-a'",
    "UPDATE seller_participation_profiles SET participation_route='managed_maker' WHERE seller_id='seller-a'",
    "UPDATE audit_logs SET reason='changed' WHERE id='fictional-audit-seller-a'",
    "UPDATE business_setting_versions SET decision_note='changed' WHERE setting_key='independent_seller_commission_bps'",
    "UPDATE users SET status='suspended' WHERE id='owner'",
    "CREATE TRIGGER fictional_fail BEFORE INSERT ON audit_logs WHEN NEW.action='commission.continuity.preserved' BEGIN SELECT RAISE(ABORT,'fictional late failure'); END",
  ];
  for (const change of changes) {
    const f = await fictionalFixture();
    try {
      const batch = f.database.batch.bind(f.database);
      f.database.batch = async (statements) => {
        f.sqlite.exec(change);
        return batch(statements);
      };
      await assert.rejects(
        preserveOriginalCommissionContinuity(f.database, f.o),
      );
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM commission_continuity_operations')
          .get()!.n,
        0,
        change,
      );
      assert.equal(
        f.sqlite
          .prepare('SELECT COUNT(*) n FROM business_setting_versions')
          .get()!.n,
        2,
        change,
      );
      assert.equal(
        f.sqlite
          .prepare("SELECT revision FROM commission_control WHERE id='default'")
          .get()!.revision,
        0,
      );
    } finally {
      await f.dispose();
    }
  }
});
void test('legacy proof transaction guards reject evidence drift and normal new explicit acceptance remains available at cutoff', async () => {
  const f = await fictionalFixture();
  try {
    await preserveOriginalCommissionContinuity(f.database, f.o);
    const setting = await getCommissionSetting(f.database, f.o.now);
    const proof = await getCommissionCheckoutAcceptance(
      f.database,
      'seller-a',
      setting,
      f.o.now,
    );
    const terms = await getSellerCommissionTerms(
      f.database,
      'seller-a',
      f.o.now,
    );
    f.sqlite.exec(
      "UPDATE audit_logs SET reason='fictional drift' WHERE id='fictional-audit-seller-a'",
    );
    assert.equal(
      await getCommissionCheckoutAcceptance(
        f.database,
        'seller-a',
        setting,
        f.o.now,
      ),
      null,
    );
    await assert.rejects(
      f.database.batch(
        commissionCheckoutGuards(
          f.database,
          { 'seller-a': terms },
          setting,
          { 'seller-a': proof! },
          f.o.now,
        ),
      ),
    );
    await assert.rejects(preserveOriginalCommissionContinuity(f.database, f.o));
    const current = await getRegisteredSellerTerms(f.database, CONTINUITY_END);
    const acceptance = await prepareSellerCommissionAcceptance(f.database, {
      sellerId: 'seller-a',
      actorId: 'user-a',
      context: current.context,
      requestId: 'fictional-genuine-renewal',
      now: CONTINUITY_END,
    });
    await f.database.batch(acceptance.statements);
    const normal = await getCommissionCheckoutAcceptance(
      f.database,
      'seller-a',
      current,
      CONTINUITY_END,
    );
    assert.equal(normal?.kind, 'current_acceptance');
    await f.database.batch(
      commissionCheckoutGuards(
        f.database,
        {
          'seller-a': await getSellerCommissionTerms(
            f.database,
            'seller-a',
            CONTINUITY_END,
          ),
        },
        current,
        { 'seller-a': normal! },
        CONTINUITY_END,
      ),
    );
  } finally {
    await f.dispose();
  }
});

void test('a null setting identity alone never proves registered seller consent', async () => {
  const f = await commissionDatabase();
  try {
    assert.equal(
      await sellerAcceptedCommissionVersion(f.database, 'seller-a', null),
      false,
    );
  } finally {
    await f.dispose();
  }
});

void test('actual continuity creation, replay and legacy checkout declare the exact protected transaction sources', async () => {
  const f = await fictionalFixture();
  const prepare = f.database.prepare.bind(f.database),
    batch = f.database.batch.bind(f.database);
  const declarations = new WeakMap<
    object,
    { sql: string; values: unknown[] }
  >();
  let emitted: { sql: string; values: unknown[] }[] = [];
  f.database.prepare = (sql) => {
    const statement = prepare(sql),
      bind = statement.bind.bind(statement);
    declarations.set(statement, { sql, values: [] });
    statement.bind = (...values: unknown[]) => {
      const bound = bind(...values);
      declarations.set(bound, { sql, values });
      return bound;
    };
    return statement;
  };
  f.database.batch = async (statements) => {
    emitted = statements
      .map((statement) => declarations.get(statement)!)
      .filter(Boolean);
    return batch(statements);
  };
  const markers = () =>
    emitted.filter((s) => s.sql.startsWith('/* commission-continuity-'));
  try {
    await preserveOriginalCommissionContinuity(f.database, f.o);
    const create = markers();
    const evidence = create.filter((s) =>
      s.sql.startsWith('/* commission-continuity-evidence-lock */'),
    );
    assert.deepEqual(
      evidence.map((s) => s.values),
      [
        [f.o.actorId, null, `${f.o.requestId}:audit`],
        ...f.o.sellers.map((s) => [s.ownerId, s.sellerId, s.audit.id]),
      ],
    );
    assert.deepEqual(
      create
        .filter((s) =>
          s.sql.startsWith('/* commission-continuity-setting-lock */'),
        )
        .map((s) => s.values[0]),
      keys,
    );
    assert.deepEqual(
      create
        .filter((s) => s.sql.startsWith('/* commission-continuity-cutoff */'))
        .map((s) => s.values),
      [[CONTINUITY_END]],
    );
    await preserveOriginalCommissionContinuity(f.database, f.o);
    assert.equal(
      markers().filter((s) =>
        s.sql.startsWith('/* commission-continuity-evidence-lock */'),
      ).length,
      5,
    );
    assert.equal(
      markers().some((s) =>
        s.sql.startsWith('/* commission-continuity-cutoff */'),
      ),
      false,
      'Exact replay creates no new interval',
    );
    const setting = await getCommissionSetting(f.database, f.o.now),
      proof = await getCommissionCheckoutAcceptance(
        f.database,
        'seller-a',
        setting,
        f.o.now,
      );
    const terms = await getSellerCommissionTerms(
      f.database,
      'seller-a',
      f.o.now,
    );
    await f.database.batch(
      commissionCheckoutGuards(
        f.database,
        { 'seller-a': terms },
        setting,
        { 'seller-a': proof! },
        f.o.now,
      ),
    );
    assert.deepEqual(
      markers()
        .filter((s) =>
          s.sql.startsWith('/* commission-continuity-evidence-lock */'),
        )
        .map((s) => s.values),
      [['user-a', 'seller-a', 'fictional-audit-seller-a']],
    );
    assert.ok(
      markers().some((s) =>
        s.sql.startsWith('/* commission-continuity-cutoff */'),
      ),
    );
    const current = await getRegisteredSellerTerms(f.database, CONTINUITY_END);
    const acceptance = await prepareSellerCommissionAcceptance(f.database, {
      sellerId: 'seller-a',
      actorId: 'user-a',
      context: current.context,
      requestId: 'fictional-round1-renewal',
      now: CONTINUITY_END,
    });
    await f.database.batch(acceptance.statements);
    const normal = await getCommissionCheckoutAcceptance(
      f.database,
      'seller-a',
      current,
      CONTINUITY_END,
    );
    await f.database.batch(
      commissionCheckoutGuards(
        f.database,
        {
          'seller-a': await getSellerCommissionTerms(
            f.database,
            'seller-a',
            CONTINUITY_END,
          ),
        },
        current,
        { 'seller-a': normal! },
        CONTINUITY_END,
      ),
    );
    assert.equal(
      markers().length,
      0,
      'Genuine version-specific acceptance retains its normal behavior',
    );
  } finally {
    await f.dispose();
  }
});
