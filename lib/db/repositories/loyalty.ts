import {
  IncentiveError,
  type ClaimInput,
  type ClaimResult,
  type RedeemInput,
  type RedemptionResult,
  type CustomerLoyaltyState,
  type LoyaltyTerms,
  type LoyaltyState,
  type LoyaltyMutationContext,
  type RewardsView,
  type RewardHistoryEntry,
} from '../../incentives/types';
import {
  calculateRedemption,
  loyaltyInteger,
  nepalRewardDay,
  loyaltyLiability,
  validateLoyaltyTerms,
} from '../../incentives/loyalty-policy';
import { digestFormRequest } from '../../forms/submission';
import { buildFormAnswerInsert } from './form-answers';
const FORM = 'staff.loyalty-settings';
const authoritySql =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role=?)";
const staffSql =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin')";
const customerSql =
  "EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='customer')";
function id(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 191)
    throw new IncentiveError('invalid');
}
function guard(
  db: D1Database,
  predicate: string,
  values: (string | number | null)[] = [],
): D1PreparedStatement[] {
  const key = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO staff_permission_guards(id,valid) VALUES (?,CASE WHEN (${predicate}) THEN 1 ELSE 0 END)`,
      )
      .bind(key, ...values),
    db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(key),
  ];
}
async function authority(
  db: D1Database,
  actor: string,
  role = 'super_admin',
  subject?: string,
) {
  id(actor);
  if (subject !== undefined) id(subject);
  if (
    !(await db
      .prepare(
        `SELECT 1 WHERE ${subject !== undefined ? customerSql : authoritySql}`,
      )
      .bind(actor, subject ?? role)
      .first())
  )
    throw new IncentiveError('unauthorized');
}
async function staffAuthority(db: D1Database, actor: string, subject: string) {
  id(actor);
  id(subject);
  if (!(await db.prepare(`SELECT 1 WHERE ${staffSql}`).bind(actor, subject).first()))
    throw new IncentiveError('unauthorized');
}
function actorLocks(db: D1Database, actor: string, role: string) {
  return [
    db.prepare('UPDATE users SET updated_at=updated_at WHERE id=?').bind(actor),
    db
      .prepare(
        'UPDATE user_roles SET assigned_at=assigned_at WHERE user_id=? AND role=?',
      )
      .bind(actor, role),
  ];
}
/** Existing wallet first, then customer authority, then points, then singleton. Claims never create a wallet. */
function customerLocks(db: D1Database, input: ClaimInput) {
  return [
    db
      .prepare(
        'UPDATE wallet_accounts SET balance_paisa=balance_paisa WHERE user_id=?',
      )
      .bind(input.userId),
    ...actorLocks(db, input.userId, 'customer'),
  ];
}
interface Row {
  issued_today_points: number;
  version: number;
  current_revision: number;
  draft_revision: number | null;
  paused: number;
  issued_points: number;
  redeemed_points: number;
  credited_paisa: number;
  locked_points_per_block: number | null;
  locked_credit_paisa_per_block: number | null;
  revision: number;
  enabled: number;
  daily_points: number;
  points_per_block: number;
  credit_paisa_per_block: number;
  starts_at: number | null;
  ends_at: number | null;
  daily_budget_points: number | null;
  lifetime_budget_points: number | null;
}
async function readRow(
  db: D1Database,
  draft = false,
  localDate: string | null = null,
): Promise<Row> {
  const row = await db
    .prepare(
      `SELECT c.*,r.*,COALESCE((SELECT issued_points FROM loyalty_day_issuance WHERE local_date=?),0) AS issued_today_points FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=${draft ? 'COALESCE(c.draft_revision,c.current_revision)' : 'c.current_revision'} WHERE c.id='default'`,
    )
    .bind(localDate)
    .first<Row>();
  if (!row) throw new IncentiveError('unavailable');
  return row;
}
function decode(row: Row, today: number): LoyaltyState {
  const terms: LoyaltyTerms = {
    enabled: row.enabled === 1,
    dailyPoints: row.daily_points,
    pointsPerBlock: row.points_per_block,
    creditPaisaPerBlock: row.credit_paisa_per_block,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    dailyBudgetPoints: row.daily_budget_points,
    lifetimeBudgetPoints: row.lifetime_budget_points,
  };
  const outstandingPoints = row.issued_points - row.redeemed_points;
  return {
    version: row.version,
    revision: row.revision,
    publishedRevision: row.current_revision,
    draftRevision: row.draft_revision,
    paused: row.paused === 1,
    terms,
    rateLocked: row.issued_points > 0,
    issuedPoints: row.issued_points,
    redeemedPoints: row.redeemed_points,
    creditedPaisa: row.credited_paisa,
    outstandingPoints,
    issuedTodayPoints: today,
    liability: loyaltyLiability(
      outstandingPoints,
      row.locked_points_per_block ?? row.points_per_block,
      row.locked_credit_paisa_per_block ?? row.credit_paisa_per_block,
    ),
    maximumLiability:
      row.lifetime_budget_points === null
        ? null
        : loyaltyLiability(
            row.lifetime_budget_points,
            row.points_per_block,
            row.credit_paisa_per_block,
          ),
  };
}
async function todayIssued(db: D1Database, now: number) {
  const day = nepalRewardDay(now).localDate;
  return (
    (
      await db
        .prepare(
          'SELECT issued_points n FROM loyalty_day_issuance WHERE local_date=?',
        )
        .bind(day)
        .first<{ n: number }>()
    )?.n ?? 0
  );
}
export async function getLoyaltyState(
  db: D1Database,
  actorId: string,
  now: number,
  authSubject: string,
): Promise<LoyaltyState> {
  await staffAuthority(db, actorId, authSubject);
  const state = decode(await readRow(db, true), await todayIssued(db, now));
  await staffAuthority(db, actorId, authSubject);
  return state;
}
function context(c: LoyaltyMutationContext) {
  id(c.actorId);
  id(c.authSubject);
  id(c.requestId);
  loyaltyInteger(c.expectedVersion, 1);
  nepalRewardDay(c.now);
  if (
    typeof c.reason !== 'string' ||
    !c.reason.trim() ||
    c.reason.length > 1000 ||
    c.form?.formId !== FORM
  )
    throw new IncentiveError('invalid');
  id(c.form.versionId);
}
async function adminReplay(
  db: D1Database,
  c: LoyaltyMutationContext,
  digest: string,
): Promise<LoyaltyState | null> {
  await staffAuthority(db, c.actorId, c.authSubject);
  const rows = (
    await db
      .prepare(
        'SELECT l.actor_id,l.action,l.next_json,a.form_id FROM audit_logs l LEFT JOIN form_answer_sets a ON a.request_id=l.request_id AND a.form_id=? WHERE l.request_id=? LIMIT 2',
      )
      .bind(FORM, c.requestId)
      .all<{
        actor_id: string;
        action: string;
        next_json: string;
        form_id: string;
      }>()
  ).results;
  if (!rows.length) {
    if (
      await db
        .prepare(
          'SELECT 1 FROM form_answer_sets WHERE form_id=? AND request_id=?',
        )
        .bind(FORM, c.requestId)
        .first()
    )
      throw new IncentiveError('conflict');
    return null;
  }
  let saved: { digest: string; response: LoyaltyState } | null = null;
  try {
    saved = JSON.parse(rows[0].next_json);
  } catch {
    /*fail closed*/
  }
  if (
    rows.length !== 1 ||
    rows[0].actor_id !== c.actorId ||
    !rows[0].action.startsWith('loyalty.') ||
    rows[0].form_id !== FORM ||
    saved?.digest !== digest ||
    !saved.response
  )
    throw new IncentiveError('conflict');
  try {
    await db.batch([
      ...actorLocks(db, c.actorId, 'super_admin'),
      ...guard(db, staffSql, [c.actorId, c.authSubject]),
    ]);
  } catch {
    throw new IncentiveError('unauthorized');
  }
  return saved.response;
}
async function mutate(
  db: D1Database,
  c: LoyaltyMutationContext,
  action: 'draft' | 'publish' | 'pause',
  raw?: LoyaltyTerms,
): Promise<LoyaltyState> {
  context(c);
  await staffAuthority(db, c.actorId, c.authSubject);
  const terms = action === 'draft' ? validateLoyaltyTerms(raw!) : undefined;
  const digest = await digestFormRequest({
    action,
    actorId: c.actorId,
    authSubject: c.authSubject,
    expectedVersion: c.expectedVersion,
    reason: c.reason.trim(),
    terms: terms ?? null,
    form: c.form,
  });
  const original = await adminReplay(db, c, digest);
  if (original) return original;
  const row = await readRow(db, true),
    before = decode(row, await todayIssued(db, c.now));
  if (row.version !== c.expectedVersion) throw new IncentiveError('stale');
  if (action === 'publish' && row.draft_revision === null)
    throw new IncentiveError('invalid');
  const maxDay = (await db
    .prepare(
      'SELECT COALESCE(MAX(issued_points),0) n FROM loyalty_day_issuance',
    )
    .first<{ n: number }>())!.n;
  if (
    terms &&
    ((row.issued_points > 0 &&
      (terms.pointsPerBlock !== row.locked_points_per_block ||
        terms.creditPaisaPerBlock !== row.locked_credit_paisa_per_block)) ||
      terms.lifetimeBudgetPoints! < row.issued_points ||
      terms.dailyBudgetPoints! < maxDay)
  )
    throw new IncentiveError('invalid');
  const version = row.version + 1;
  loyaltyInteger(version, 1);
  const revision = terms
    ? (await db
        .prepare('SELECT MAX(revision) n FROM loyalty_revisions')
        .first<{ n: number }>())!.n + 1
    : row.revision;
  loyaltyInteger(revision);
  const nextRow: Row = {
    ...row,
    version,
    ...(terms
      ? {
          revision,
          draft_revision: revision,
          enabled: Number(terms.enabled),
          daily_points: terms.dailyPoints,
          points_per_block: terms.pointsPerBlock,
          credit_paisa_per_block: terms.creditPaisaPerBlock,
          starts_at: terms.startsAt,
          ends_at: terms.endsAt,
          daily_budget_points: terms.dailyBudgetPoints,
          lifetime_budget_points: terms.lifetimeBudgetPoints,
        }
      : action === 'publish'
        ? {
            current_revision: row.draft_revision!,
            draft_revision: null,
            paused: 0,
          }
        : { paused: 1 }),
  };
  const next = decode(nextRow, before.issuedTodayPoints);
  const statements = [
    ...actorLocks(db, c.actorId, 'super_admin'),
    db.prepare("UPDATE loyalty_config SET version=version WHERE id='default'"),
    ...guard(
      db,
      `${staffSql} AND EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=? AND issued_points=? AND redeemed_points=? AND credited_paisa=?)`,
      [
        c.actorId,
        c.authSubject,
        c.expectedVersion,
        row.issued_points,
        row.redeemed_points,
        row.credited_paisa,
      ],
    ),
  ];
  if (terms)
    statements.push(
      db
        .prepare(
          'INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          revision,
          Number(terms.enabled),
          terms.dailyPoints,
          terms.pointsPerBlock,
          terms.creditPaisaPerBlock,
          terms.startsAt,
          terms.endsAt,
          terms.dailyBudgetPoints,
          terms.lifetimeBudgetPoints,
          c.actorId,
          c.requestId,
          c.reason.trim(),
          c.form.versionId,
          c.now,
        ),
    );
  statements.push(
    db
      .prepare(
        "UPDATE loyalty_config SET version=?,current_revision=?,draft_revision=?,paused=? WHERE id='default' AND version=?",
      )
      .bind(
        version,
        nextRow.current_revision,
        nextRow.draft_revision,
        nextRow.paused,
        c.expectedVersion,
      ),
    ...guard(
      db,
      `${staffSql} AND EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=?)`,
      [c.actorId, c.authSubject, version],
    ),
    db
      .prepare(
        "INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'loyalty_config','default',?,?,?,?,NULL,?)",
      )
      .bind(
        crypto.randomUUID(),
        c.actorId,
        `loyalty.${action}`,
        c.reason.trim(),
        JSON.stringify(before),
        JSON.stringify({ digest, response: next }),
        c.requestId,
        c.now,
      ),
  );
  try {
    statements.push(
      buildFormAnswerInsert(db, {
        formId: FORM,
        requestId: c.requestId,
        versionId: c.form.versionId,
        subjectType: 'loyalty_config',
        subjectId: 'default',
        actorId: c.actorId,
        answers: c.form.answers,
        now: c.now,
      }),
    );
  } catch {
    throw new IncentiveError('invalid');
  }
  try {
    await db.batch(statements);
  } catch {
    await staffAuthority(db, c.actorId, c.authSubject);
    const retry = await adminReplay(db, c, digest);
    if (retry) return retry;
    throw new IncentiveError('stale');
  }
  return next;
}
export const saveLoyaltyDraft = (
  db: D1Database,
  c: LoyaltyMutationContext,
  terms: LoyaltyTerms,
) => mutate(db, c, 'draft', terms);
export const publishLoyalty = (db: D1Database, c: LoyaltyMutationContext) =>
  mutate(db, c, 'publish');
export const pauseLoyalty = (db: D1Database, c: LoyaltyMutationContext) =>
  mutate(db, c, 'pause');
async function claimReplay(
  db: D1Database,
  input: ClaimInput,
  digest: string,
): Promise<ClaimResult | null> {
  const row = await db
    .prepare(
      'SELECT actor_id,payload_digest,response_json FROM loyalty_daily_claims WHERE user_id=? AND request_id=?',
    )
    .bind(input.userId, input.requestId)
    .first<{
      actor_id: string;
      payload_digest: string;
      response_json: string;
    }>();
  if (!row) return null;
  if (row.actor_id !== input.userId || row.payload_digest !== digest)
    throw new IncentiveError('conflict');
  try {
    await db.batch([
      ...customerLocks(db, input),
      ...guard(db, customerSql, [input.userId, input.authSubject]),
    ]);
  } catch {
    throw new IncentiveError('unauthorized');
  }
  return JSON.parse(row.response_json) as ClaimResult;
}
function eligibility(row: Row, input: ClaimInput, today: number) {
  if (row.version !== input.expectedVersion) throw new IncentiveError('stale');
  if (
    row.paused ||
    row.enabled !== 1 ||
    row.starts_at === null ||
    row.ends_at === null ||
    input.now < row.starts_at ||
    input.now >= row.ends_at
  )
    throw new IncentiveError('unavailable');
  if (
    row.daily_budget_points === null ||
    row.lifetime_budget_points === null ||
    row.daily_points > row.daily_budget_points - today ||
    row.daily_points > row.lifetime_budget_points - row.issued_points
  )
    throw new IncentiveError('exhausted');
}
export async function claimDailyPoints(
  db: D1Database,
  input: ClaimInput,
): Promise<ClaimResult> {
  id(input.userId);
  id(input.authSubject);
  id(input.requestId);
  id(input.formVersionId);
  loyaltyInteger(input.expectedVersion, 1);
  const { localDate } = nepalRewardDay(input.now);
  await authority(db, input.userId, 'customer', input.authSubject);
  const digest = await digestFormRequest({
    operation: 'daily_claim',
    userId: input.userId,
    authSubject: input.authSubject,
    expectedVersion: input.expectedVersion,
    formVersionId: input.formVersionId,
  });
  const original = await claimReplay(db, input, digest);
  if (original) return original;
  if (
    await db
      .prepare(
        'SELECT 1 FROM loyalty_daily_claims WHERE user_id=? AND local_date=?',
      )
      .bind(input.userId, localDate)
      .first()
  )
    throw new IncentiveError('conflict');
  const row = await readRow(db);
  eligibility(row, input, await todayIssued(db, input.now));
  const balance =
    (
      await db
        .prepare(
          'SELECT balance_points n FROM loyalty_accounts WHERE user_id=?',
        )
        .bind(input.userId)
        .first<{ n: number }>()
    )?.n ?? 0;
  loyaltyInteger(balance + row.daily_points, 1);
  const result: ClaimResult = {
    claimId: crypto.randomUUID(),
    localDate,
    awardedPoints: row.daily_points,
    balancePoints: balance + row.daily_points,
  };
  const formSql = `EXISTS(SELECT 1 FROM form_config_versions v WHERE v.id=? AND v.form_id='account.daily-reward' AND v.status='published' AND v.version=(SELECT MAX(version) FROM form_config_versions WHERE form_id=v.form_id AND status='published') AND json_extract(v.config_json,'$.formId')=v.form_id AND json_type(v.config_json,'$.fields')='array' AND json_array_length(v.config_json,'$.fields')=0)`;
  const statements = [
    ...customerLocks(db, input),
    ...guard(db, customerSql, [input.userId, input.authSubject]),
    db
      .prepare(
        'INSERT INTO loyalty_accounts(user_id,created_at) SELECT ?,? WHERE NOT EXISTS(SELECT 1 FROM loyalty_accounts WHERE user_id=?)',
      )
      .bind(input.userId, input.now, input.userId),
    db
      .prepare(
        'UPDATE loyalty_accounts SET balance_points=balance_points WHERE user_id=?',
      )
      .bind(input.userId),
    db.prepare("UPDATE loyalty_config SET version=version WHERE id='default'"),
    ...guard(
      db,
      `${customerSql} AND EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=? AND current_revision=? AND paused=0) AND EXISTS(SELECT 1 FROM loyalty_accounts WHERE user_id=? AND balance_points=?) AND ${formSql}`,
      [
        input.userId,
        input.authSubject,
        input.expectedVersion,
        row.revision,
        input.userId,
        balance,
        input.formVersionId,
      ],
    ),
    db
      .prepare(
        'INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        result.claimId,
        input.userId,
        input.userId,
        input.requestId,
        digest,
        row.revision,
        localDate,
        row.daily_points,
        JSON.stringify(result),
        input.formVersionId,
        input.now,
      ),
    ...guard(db, customerSql, [input.userId, input.authSubject]),
  ];
  try {
    await db.batch(statements);
  } catch {
    await authority(db, input.userId, 'customer', input.authSubject);
    const retry = await claimReplay(db, input, digest);
    if (retry) return retry;
    if (
      await db
        .prepare(
          'SELECT 1 FROM loyalty_daily_claims WHERE user_id=? AND local_date=?',
        )
        .bind(input.userId, localDate)
        .first()
    )
      throw new IncentiveError('conflict');
    eligibility(await readRow(db), input, await todayIssued(db, input.now));
    throw new IncentiveError('stale');
  }
  return result;
}
function publicState(row: Row, now: number): CustomerLoyaltyState {
  return {
    version: row.version,
    revision: row.current_revision,
    enabled: row.enabled === 1,
    paused: row.paused === 1,
    dailyPoints: row.daily_points,
    pointsPerBlock: row.locked_points_per_block ?? row.points_per_block,
    creditPaisaPerBlock:
      row.locked_credit_paisa_per_block ?? row.credit_paisa_per_block,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.paused
      ? 'paused'
      : row.enabled !== 1
        ? 'disabled'
        : row.starts_at !== null && now < row.starts_at
          ? 'scheduled'
          : row.ends_at !== null && now >= row.ends_at
            ? 'expired'
            : row.daily_budget_points === null ||
                row.lifetime_budget_points === null ||
                row.daily_points >
                  row.daily_budget_points - row.issued_today_points ||
                row.daily_points >
                  row.lifetime_budget_points - row.issued_points
              ? 'exhausted'
              : 'active',
  };
}
export async function getRewards(
  db: D1Database,
  userId: string,
  now: number,
  cursor?: string,
  limit = 20,
  authSubject?: string,
): Promise<RewardsView> {
  await authority(db, userId, 'customer', authSubject);
  const day = nepalRewardDay(now);
  loyaltyInteger(limit, 1, 50);
  let page: { owner: string; time: number; id: string; kind: string } | null =
    null;
  if (cursor !== undefined) {
    try {
      if (typeof cursor !== 'string' || cursor.length > 2048) throw new Error();
      page = JSON.parse(atob(cursor));
      if (
        !page ||
        page.owner !== userId ||
        !['daily_claim', 'redemption'].includes(page.kind)
      )
        throw new Error();
      loyaltyInteger(page.time, 0, 253402300799999);
      id(page.id);
    } catch {
      throw new IncentiveError('invalid');
    }
  }
  const rows = (
    await db
      .prepare(
        `SELECT * FROM (SELECT id,created_at,response_json,'daily_claim' kind FROM loyalty_daily_claims WHERE user_id=? UNION ALL SELECT id,created_at,response_json,'redemption' kind FROM loyalty_redemptions WHERE user_id=?) h WHERE (? IS NULL OR created_at<? OR (created_at=? AND id<?) OR (created_at=? AND id=? AND kind<?)) ORDER BY created_at DESC,id DESC,kind DESC LIMIT ?`,
      )
      .bind(
        userId,
        userId,
        page?.id ?? null,
        page?.time ?? 0,
        page?.time ?? 0,
        page?.id ?? '',
        page?.time ?? 0,
        page?.id ?? '',
        page?.kind ?? '',
        limit + 1,
      )
      .all<{
        id: string;
        created_at: number;
        response_json: string;
        kind: 'daily_claim' | 'redemption';
      }>()
  ).results;
  const selected = rows.slice(0, limit),
    last = selected.at(-1);
  return {
    balancePoints:
      (
        await db
          .prepare(
            'SELECT balance_points n FROM loyalty_accounts WHERE user_id=?',
          )
          .bind(userId)
          .first<{ n: number }>()
      )?.n ?? 0,
    walletBalancePaisa:
      (
        await db
          .prepare(
            'SELECT balance_paisa n FROM wallet_accounts WHERE user_id=?',
          )
          .bind(userId)
          .first<{ n: number }>()
      )?.n ?? 0,
    claimedToday: !!(await db
      .prepare(
        'SELECT 1 FROM loyalty_daily_claims WHERE user_id=? AND local_date=?',
      )
      .bind(userId, day.localDate)
      .first()),
    nextClaimAt: day.nextClaimAt,
    state: publicState(await readRow(db, false, day.localDate), now),
    history: selected.map(
      (row) =>
        ({
          kind: row.kind,
          result: JSON.parse(row.response_json),
          createdAt: row.created_at,
        }) as RewardHistoryEntry,
    ),
    nextCursor:
      rows.length > limit && last
        ? btoa(
            JSON.stringify({
              owner: userId,
              time: last.created_at,
              id: last.id,
              kind: last.kind,
            }),
          )
        : null,
  };
}

async function redemptionReplay(
  db: D1Database,
  input: RedeemInput,
  digest: string,
): Promise<RedemptionResult | null> {
  await authority(db, input.userId, 'customer', input.authSubject);
  const prior = await db
    .prepare(
      'SELECT actor_id,payload_digest,response_json FROM loyalty_redemptions WHERE user_id=? AND request_id=?',
    )
    .bind(input.userId, input.requestId)
    .first<{
      actor_id: string;
      payload_digest: string;
      response_json: string;
    }>();
  if (!prior) return null;
  if (prior.actor_id !== input.userId || prior.payload_digest !== digest)
    throw new IncentiveError('conflict');
  try {
    await db.batch([
      ...customerLocks(db, input),
      ...guard(db, customerSql, [input.userId, input.authSubject]),
    ]);
  } catch {
    throw new IncentiveError('unauthorized');
  }
  return JSON.parse(prior.response_json) as RedemptionResult;
}
async function redemptionBalances(db: D1Database, userId: string) {
  const points =
    (
      await db
        .prepare(
          'SELECT balance_points n FROM loyalty_accounts WHERE user_id=?',
        )
        .bind(userId)
        .first<{ n: number }>()
    )?.n ?? 0;
  const wallet =
    (
      await db
        .prepare('SELECT balance_paisa n FROM wallet_accounts WHERE user_id=?')
        .bind(userId)
        .first<{ n: number }>()
    )?.n ?? 0;
  return { points, wallet };
}
function redemptionEligibility(
  row: Row,
  input: RedeemInput,
  balances: { points: number; wallet: number },
) {
  if (row.version !== input.expectedVersion) throw new IncentiveError('stale');
  const credit = calculateRedemption(input.points, {
    ...decode(row, 0).terms,
    pointsPerBlock: row.locked_points_per_block ?? row.points_per_block,
    creditPaisaPerBlock:
      row.locked_credit_paisa_per_block ?? row.credit_paisa_per_block,
  });
  if (input.points > balances.points) throw new IncentiveError('insufficient');
  // Subtraction validates headroom without unsafe Number addition.
  if (
    credit > Number.MAX_SAFE_INTEGER - balances.wallet ||
    credit > Number.MAX_SAFE_INTEGER - row.credited_paisa
  )
    throw new IncentiveError('invalid');
  return credit;
}
/** The immutable source INSERT owns all debit, credit and counter posting through reviewed triggers. */
export async function redeemPoints(
  db: D1Database,
  input: RedeemInput,
): Promise<RedemptionResult> {
  id(input.userId);
  id(input.authSubject);
  id(input.requestId);
  id(input.formVersionId);
  loyaltyInteger(input.expectedVersion, 1);
  loyaltyInteger(input.points, 1);
  nepalRewardDay(input.now);
  await authority(db, input.userId, 'customer', input.authSubject);
  const digest = await digestFormRequest({
    operation: 'points_redemption',
    userId: input.userId,
    authSubject: input.authSubject,
    expectedVersion: input.expectedVersion,
    formVersionId: input.formVersionId,
    points: input.points,
  });
  const prior = await redemptionReplay(db, input, digest);
  if (prior) return prior;
  const row = await readRow(db),
    balances = await redemptionBalances(db, input.userId);
  const credit = redemptionEligibility(row, input, balances);
  const result: RedemptionResult = {
    redemptionId: crypto.randomUUID(),
    points: input.points,
    creditPaisa: credit,
    balancePoints: balances.points - input.points,
    walletBalancePaisa: balances.wallet + credit,
  };
  const formSql =
    "EXISTS(SELECT 1 FROM form_config_versions v WHERE v.id=? AND v.form_id='account.points-redemption' AND v.status='published' AND v.version=(SELECT MAX(version) FROM form_config_versions WHERE form_id=v.form_id AND status='published') AND json_extract(v.config_json,'$.formId')=v.form_id AND json_type(v.config_json,'$.fields')='array' AND json_array_length(v.config_json,'$.fields')=0)";
  const statements = [
    // Match checkout/gift serialization: provision and lock wallet before locking customer, points and singleton.
    db
      .prepare(
        `INSERT INTO wallet_accounts(user_id,referral_code,created_at) SELECT ?,?,? WHERE NOT EXISTS(SELECT 1 FROM wallet_accounts WHERE user_id=?) AND ${customerSql}`,
      )
      .bind(
        input.userId,
        crypto.randomUUID().replaceAll('-', '').slice(0, 16).toUpperCase(),
        input.now,
        input.userId,
        input.userId,
        input.authSubject,
      ),
    ...customerLocks(db, input),
    ...guard(db, customerSql, [input.userId, input.authSubject]),
    db
      .prepare(
        'UPDATE loyalty_accounts SET balance_points=balance_points WHERE user_id=?',
      )
      .bind(input.userId),
    db.prepare("UPDATE loyalty_config SET version=version WHERE id='default'"),
    ...guard(
      db,
      `${customerSql} AND EXISTS(SELECT 1 FROM loyalty_config c JOIN loyalty_revisions r ON r.revision=c.current_revision WHERE c.id='default' AND c.version=? AND c.current_revision=? AND COALESCE(c.locked_points_per_block,r.points_per_block)=? AND COALESCE(c.locked_credit_paisa_per_block,r.credit_paisa_per_block)=?) AND EXISTS(SELECT 1 FROM loyalty_accounts WHERE user_id=? AND balance_points=?) AND EXISTS(SELECT 1 FROM wallet_accounts WHERE user_id=? AND balance_paisa=?) AND ${formSql}`,
      [
        input.userId,
        input.authSubject,
        input.expectedVersion,
        row.revision,
        row.locked_points_per_block ?? row.points_per_block,
        row.locked_credit_paisa_per_block ?? row.credit_paisa_per_block,
        input.userId,
        balances.points,
        input.userId,
        balances.wallet,
        input.formVersionId,
      ],
    ),
    db
      .prepare(
        'INSERT INTO loyalty_redemptions(id,user_id,actor_id,request_id,payload_digest,revision,points,credit_paisa,response_json,form_version_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        result.redemptionId,
        input.userId,
        input.userId,
        input.requestId,
        digest,
        row.revision,
        input.points,
        credit,
        JSON.stringify(result),
        input.formVersionId,
        input.now,
      ),
    ...guard(db, customerSql, [input.userId, input.authSubject]),
  ];
  try {
    await db.batch(statements);
  } catch {
    await authority(db, input.userId, 'customer', input.authSubject);
    const retry = await redemptionReplay(db, input, digest);
    if (retry) return retry;
    redemptionEligibility(
      await readRow(db),
      input,
      await redemptionBalances(db, input.userId),
    );
    throw new IncentiveError('stale');
  }
  return result;
}
