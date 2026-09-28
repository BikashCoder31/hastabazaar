import assert from 'node:assert/strict';
import { createIncentiveDb, seedIncentiveCustomer } from './incentive-db';
import type {
  ClaimInput,
  LoyaltyTerms,
  LoyaltyMutationContext,
} from '../../lib/incentives/types';
export const NOW = Date.parse('2026-09-28T12:00:00Z');
export const TERMS: LoyaltyTerms = {
  enabled: true,
  dailyPoints: 10,
  pointsPerBlock: 100,
  creditPaisaPerBlock: 1000,
  startsAt: 0,
  endsAt: 253402300799999,
  dailyBudgetPoints: 1000,
  lifetimeBudgetPoints: 10000,
};
export async function repo() {
  const loaded = await import('../../lib/db/repositories/loyalty').catch(
    () => null,
  );
  assert.ok(loaded, 'Task 9 loyalty repository must exist');
  return loaded;
}
export async function policy() {
  const loaded = await import('../../lib/incentives/loyalty-policy').catch(
    () => null,
  );
  assert.ok(loaded, 'Task 9 loyalty policy must exist');
  return loaded;
}
export async function publishForm(
  db: D1Database,
  id: string,
  version = 1,
  fields: unknown[] = [],
) {
  await db
    .prepare(
      `INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES (?,?,?,1,'published',?,'Fixture','super',1,'super',1,'super',1,?)`,
    )
    .bind(
      `${id}-v${version}`,
      id,
      version,
      JSON.stringify({ formId: id, fields }),
      `${id}-${version}`,
    )
    .run();
}
export async function fixture(
  live = true,
  overrides: Partial<LoyaltyTerms> = {},
) {
  const f = await createIncentiveDb();
  for (const id of ['customer', 'other', 'super', 'admin'])
    await seedIncentiveCustomer(f.db, id);
  await f.db
    .prepare(
      "INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('admin','admin',1)",
    )
    .run();
  await publishForm(f.db, 'staff.loyalty-settings');
  await publishForm(f.db, 'account.daily-reward');
  if (live) {
    const t = { ...TERMS, ...overrides };
    await f.db
      .prepare(
        `INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES (1,?,?,?,?,?,?,?,?,'super','seed-live','Fixture','staff.loyalty-settings-v1',1)`,
      )
      .bind(
        Number(t.enabled),
        t.dailyPoints,
        t.pointsPerBlock,
        t.creditPaisaPerBlock,
        t.startsAt,
        t.endsAt,
        t.dailyBudgetPoints,
        t.lifetimeBudgetPoints,
      )
      .run();
    await f.db
      .prepare('UPDATE loyalty_config SET current_revision=1,paused=0')
      .run();
  }
  return f;
}
export function claim(
  requestId = 'claim',
  expectedVersion = 1,
  userId = 'customer',
  now = NOW,
): ClaimInput {
  return {
    userId,
    authSubject: userId,
    requestId,
    expectedVersion,
    now,
    formVersionId: 'account.daily-reward-v1',
  };
}
export function ctx(
  requestId: string,
  expectedVersion = 1,
  actorId = 'super',
): LoyaltyMutationContext {
  return {
    actorId,
    authSubject: actorId,
    requestId,
    expectedVersion,
    now: NOW,
    reason: 'Fictional approved terms',
    form: {
      formId: 'staff.loyalty-settings',
      versionId: 'staff.loyalty-settings-v1',
      answers: { formId: 'staff.loyalty-settings', version: 1, answers: [] },
    },
  };
}
export async function counts(db: D1Database) {
  return Promise.all(
    [
      'loyalty_accounts',
      'loyalty_daily_claims',
      'loyalty_points_entries',
      'loyalty_day_issuance',
      'wallet_entries',
    ].map(
      async (name) =>
        (await db
          .prepare(`SELECT COUNT(*) n FROM ${name}`)
          .first<{ n: number }>())!.n,
    ),
  );
}
/** Interleaves a real database mutation immediately before the actual native batch. */
export function beforeBatch(
  db: D1Database,
  action: () => Promise<unknown>,
): D1Database {
  let called = false;
  return new Proxy(db, {
    get(target, key) {
      if (key === 'batch')
        return async (statements: D1PreparedStatement[]) => {
          if (!called) {
            called = true;
            await action();
          }
          return target.batch(statements);
        };
      const value = Reflect.get(target, key);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
