import {
  IncentiveError,
  type ClaimInput,
  type ClaimResult,
  type RedeemInput,
  type RedemptionResult,
  type CustomerLoyaltyState,
  type LoyaltyTerms,
  type LoyaltyState,
  type LoyaltyDenomination,
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
  validateWeeklyPoints,
} from '../../incentives/loyalty-policy';
import {
  nextLoyaltyCycle,
  type PreviousLoyaltyClaim,
} from '../../incentives/loyalty-cycle';
import { digestFormRequest } from '../../forms/submission';
import { buildFormAnswerInsert } from './form-answers';
import {resolveEffectiveLoyaltyState,type LoyaltyPromotion} from '../../incentives/loyalty-effective-state';
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
  if (
    !(await db
      .prepare(`SELECT 1 WHERE ${staffSql}`)
      .bind(actor, subject)
      .first())
  )
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
  scheduled_revision:number|null;
  scheduled_for:number|null;
  scheduled_unpause:number;
  scheduled_terms?:LoyaltyTerms|null;
  published_terms?:LoyaltyTerms;
  schedule_blocked_reason?:string|null;
  paused: number;
  issued_points: number;
  redeemed_points: number;
  credited_paisa: number;
  locked_points_per_block: number | null;
  locked_credit_paisa_per_block: number | null;
  revision: number;
  enabled: number;
  daily_points: number;
  weekly_points_json: string | null;
  grace_enabled: number;
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
function rowTerms(row:Row):LoyaltyTerms {
  return {
    enabled: row.enabled === 1,
    dailyPoints: row.daily_points,
    ...(row.weekly_points_json === null
      ? {}
      : {
          weeklyPoints: validateWeeklyPoints(
            JSON.parse(row.weekly_points_json),
          ),
          graceEnabled: row.grace_enabled === 1,
        }),
    pointsPerBlock: row.points_per_block,
    creditPaisaPerBlock: row.credit_paisa_per_block,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    dailyBudgetPoints: row.daily_budget_points,
    lifetimeBudgetPoints: row.lifetime_budget_points,
  };
}
function decode(row: Row, today: number): LoyaltyState {
  const terms=rowTerms(row);
  const lockedDenomination: LoyaltyDenomination | null =
    row.issued_points > 0
      ? {
          pointsPerBlock: row.locked_points_per_block!,
          creditPaisaPerBlock: row.locked_credit_paisa_per_block!,
        }
      : null;
  const denomination = lockedDenomination ?? terms;
  // A draft saved before issuance may have a budget safe only at its old rate.
  const unrepresentableDraftExposure =
    lockedDenomination !== null &&
    row.draft_revision === row.revision &&
    (row.points_per_block !== lockedDenomination.pointsPerBlock ||
      row.credit_paisa_per_block !== lockedDenomination.creditPaisaPerBlock) &&
    row.lifetime_budget_points !== null &&
    (BigInt(row.lifetime_budget_points) / BigInt(denomination.pointsPerBlock)) *
      BigInt(denomination.creditPaisaPerBlock) >
      BigInt(Number.MAX_SAFE_INTEGER);
  const outstandingPoints = row.issued_points - row.redeemed_points;
  return {
    version: row.version,
    revision: row.revision,
    publishedRevision: row.current_revision,
    draftRevision: row.draft_revision,
    scheduledRevision:row.scheduled_revision,
    scheduledFor:row.scheduled_for,
    scheduledTerms:row.scheduled_terms??null,
    scheduledUnpause:row.scheduled_unpause===1,
    scheduleBlockedReason:row.schedule_blocked_reason??null,
    paused: row.paused === 1,
    terms,
    publishedTerms:row.published_terms??terms,
    rateLocked: row.issued_points > 0,
    lockedDenomination,
    issuedPoints: row.issued_points,
    redeemedPoints: row.redeemed_points,
    creditedPaisa: row.credited_paisa,
    outstandingPoints,
    issuedTodayPoints: today,
    liability: loyaltyLiability(
      outstandingPoints,
      denomination.pointsPerBlock,
      denomination.creditPaisaPerBlock,
    ),
    maximumLiability:
      row.lifetime_budget_points === null || unrepresentableDraftExposure
        ? null
        : loyaltyLiability(
            row.lifetime_budget_points,
            denomination.pointsPerBlock,
            denomination.creditPaisaPerBlock,
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
async function effectiveRow(db:D1Database,now:number,draft=false) {
  const stored=await readRow(db,false,nepalRewardDay(now).localDate);
  const scheduled=stored.scheduled_revision===null?null:await db.prepare(`SELECT r.* FROM loyalty_revisions r WHERE r.revision=?`).bind(stored.scheduled_revision).first<Row & {request_id:string}>();
  const publication=scheduled?await db.prepare(`SELECT request_id AS requestId FROM audit_logs WHERE action='loyalty.publish'
    AND subject_type='loyalty_config' AND subject_id='default' AND json_extract(next_json,'$.response.scheduledRevision')=?
    AND json_extract(next_json,'$.response.scheduledFor')=? ORDER BY created_at DESC,id DESC LIMIT 1`).bind(stored.scheduled_revision,stored.scheduled_for).first<{requestId:string}>():null;
  const maxDay=(await db.prepare('SELECT COALESCE(MAX(issued_points),0) n FROM loyalty_day_issuance').first<{n:number}>())!.n;
  let resolved=resolveEffectiveLoyaltyState({version:stored.version,currentRevision:stored.current_revision,currentTerms:rowTerms(stored),paused:stored.paused===1,
    scheduledRevision:stored.scheduled_revision,scheduledFor:stored.scheduled_for,scheduledTerms:scheduled?rowTerms(scheduled):null,scheduledUnpause:stored.scheduled_unpause===1,
    issuedPoints:stored.issued_points,maximumIssuedDayPoints:maxDay,lockedDenomination:stored.issued_points>0?{pointsPerBlock:stored.locked_points_per_block!,creditPaisaPerBlock:stored.locked_credit_paisa_per_block!}:null},now);
  if(resolved.promotion&&!publication)resolved={...resolved,version:stored.version,revision:stored.current_revision,terms:rowTerms(stored),paused:stored.paused===1,
    scheduledRevision:stored.scheduled_revision,scheduledFor:stored.scheduled_for,scheduledTerms:scheduled?rowTerms(scheduled):null,scheduledUnpause:stored.scheduled_unpause===1,
    scheduleBlockedReason:'The original scheduled publication needs review. Cancel this change and publish a new reviewed draft.',promotion:null};
  let row:Row={...stored,...(resolved.promotion?scheduled:{}),version:resolved.version,current_revision:resolved.revision,revision:resolved.revision,
    paused:Number(resolved.paused),scheduled_revision:resolved.scheduledRevision,scheduled_for:resolved.scheduledFor,scheduled_unpause:Number(resolved.scheduledUnpause),
    scheduled_terms:resolved.scheduledTerms,schedule_blocked_reason:resolved.scheduleBlockedReason};
  row.published_terms=rowTerms(row);
  const current=row;
  if(draft&&stored.draft_revision!==null){const selected=await readRow(db,true);row={...row,...revisionFields(rowTerms(selected)),revision:selected.revision};}
  return {row,current,stored,promotion:resolved.promotion,maxDay,publicationRequestId:publication?.requestId??null};
}
function revisionFields(terms:LoyaltyTerms) {
  return {enabled:Number(terms.enabled),daily_points:terms.dailyPoints,weekly_points_json:terms.weeklyPoints?JSON.stringify(terms.weeklyPoints):null,
    grace_enabled:Number(terms.graceEnabled??false),points_per_block:terms.pointsPerBlock,credit_paisa_per_block:terms.creditPaisaPerBlock,starts_at:terms.startsAt,
    ends_at:terms.endsAt,daily_budget_points:terms.dailyBudgetPoints,lifetime_budget_points:terms.lifetimeBudgetPoints};
}
function promotionStatements(db:D1Database,state:Awaited<ReturnType<typeof effectiveRow>>,now:number) {
  const promotion:LoyaltyPromotion|null=state.promotion;if(!promotion)return [];
  return [...guard(db,`EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=? AND current_revision=? AND scheduled_revision=? AND scheduled_for=?
    AND scheduled_unpause=? AND issued_points=? AND redeemed_points=? AND credited_paisa=?
    AND COALESCE((SELECT MAX(issued_points) FROM loyalty_day_issuance),0)=?) AND EXISTS(SELECT 1 FROM audit_logs WHERE request_id=? AND action='loyalty.publish'
      AND subject_type='loyalty_config' AND subject_id='default' AND json_extract(next_json,'$.response.scheduledRevision')=? AND json_extract(next_json,'$.response.scheduledFor')=?)`,[promotion.fromVersion,promotion.fromRevision,promotion.revision,promotion.scheduledFor,
      Number(promotion.unpause),state.stored.issued_points,state.stored.redeemed_points,state.stored.credited_paisa,state.maxDay,state.publicationRequestId,promotion.revision,promotion.scheduledFor]),
    db.prepare(`UPDATE loyalty_config SET current_revision=?,version=?,paused=?,scheduled_revision=NULL,scheduled_for=NULL,scheduled_unpause=0 WHERE id='default' AND version=?`)
      .bind(promotion.revision,promotion.toVersion,Number(!promotion.unpause),promotion.fromVersion),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at)
      VALUES (?,NULL,'loyalty.schedule_activated','loyalty_config','default','Scheduled loyalty rules became effective',?,?,?,?)`)
      .bind(crypto.randomUUID(),JSON.stringify({revision:promotion.fromRevision,version:promotion.fromVersion}),JSON.stringify({revision:promotion.revision,version:promotion.toVersion,
        scheduledFor:promotion.scheduledFor,unpause:promotion.unpause,publicationRequestId:state.publicationRequestId}),`loyalty-schedule-activate:${promotion.revision}`,now)];
}
export async function getLoyaltyState(
  db: D1Database,
  actorId: string,
  now: number,
  authSubject: string,
  options:{publishedOnly?:boolean} = {},
): Promise<LoyaltyState> {
  await staffAuthority(db, actorId, authSubject);
  const state = decode((await effectiveRow(db,now,!options.publishedOnly)).row, await todayIssued(db, now));
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
  action: 'draft' | 'publish' | 'pause' | 'cancel_schedule',
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
  const effective=await effectiveRow(db,c.now,true),row=effective.row,
    before = decode(row, await todayIssued(db, c.now));
  if (row.version !== c.expectedVersion) throw new IncentiveError('stale');
  if(action==='cancel_schedule'&&(effective.promotion||row.scheduled_revision===null))throw new IncentiveError('conflict');
  if(action==='publish'&&row.scheduled_revision!==null)throw new IncentiveError('conflict');
  if (action === 'publish' && row.draft_revision === null)
    throw new IncentiveError('invalid');
  if (
    action === 'publish' &&
    row.issued_points > 0 &&
    (row.points_per_block !== row.locked_points_per_block ||
      row.credit_paisa_per_block !== row.locked_credit_paisa_per_block)
  )
    throw new IncentiveError('invalid');
  const maxDay=effective.maxDay;
  if(action==='publish') {
    validateLoyaltyTerms(rowTerms(row));
    if(row.lifetime_budget_points!<row.issued_points||row.daily_budget_points!<maxDay)throw new IncentiveError('invalid');
  }
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
  const publishFuture=action==='publish'&&row.starts_at!==null&&row.starts_at>c.now;
  const nextRow: Row = {
    ...row,
    version,
    ...(terms
      ? {
          revision,
          draft_revision: revision,
          enabled: Number(terms.enabled),
          daily_points: terms.dailyPoints,
          weekly_points_json: terms.weeklyPoints
            ? JSON.stringify(terms.weeklyPoints)
            : null,
          grace_enabled: Number(terms.graceEnabled ?? false),
          points_per_block: terms.pointsPerBlock,
          credit_paisa_per_block: terms.creditPaisaPerBlock,
          starts_at: terms.startsAt,
          ends_at: terms.endsAt,
          daily_budget_points: terms.dailyBudgetPoints,
          lifetime_budget_points: terms.lifetimeBudgetPoints,
        }
      : action === 'publish'
        ? publishFuture ? {
            ...revisionFields(rowTerms(effective.current)),revision:row.current_revision,draft_revision:null,
            scheduled_revision:row.draft_revision!,scheduled_for:row.starts_at,scheduled_unpause:1,scheduled_terms:rowTerms(row),schedule_blocked_reason:null,
          } : {
            current_revision: row.draft_revision!,
            draft_revision: null,
            paused: 0,
            published_terms:rowTerms(row),
          }
        : action==='pause'?{ paused: 1,scheduled_unpause:0 }:{scheduled_revision:null,scheduled_for:null,scheduled_unpause:0,scheduled_terms:null,schedule_blocked_reason:null}),
  };
  const next = decode(nextRow, before.issuedTodayPoints);
  const statements = [
    ...actorLocks(db, c.actorId, 'super_admin'),
    db.prepare("UPDATE loyalty_config SET version=version WHERE id='default'"),
    ...promotionStatements(db,effective,c.now),
    ...guard(
      db,
      `${staffSql} AND EXISTS(SELECT 1 FROM loyalty_config WHERE id='default' AND version=? AND issued_points=? AND redeemed_points=? AND credited_paisa=?
        AND current_revision=? AND draft_revision IS ? AND scheduled_revision IS ? AND scheduled_for IS ? AND scheduled_unpause=?)`,
      [
        c.actorId,
        c.authSubject,
        c.expectedVersion,
        row.issued_points,
        row.redeemed_points,
        row.credited_paisa,
        row.current_revision,row.draft_revision,row.scheduled_revision,row.scheduled_for,row.scheduled_unpause,
      ],
    ),
  ];
  if (terms)
    statements.push(
      db
        .prepare(
          'INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at,weekly_points_json,grace_enabled) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
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
          terms.weeklyPoints ? JSON.stringify(terms.weeklyPoints) : null,
          Number(terms.graceEnabled ?? false),
        ),
    );
  statements.push(
    db
      .prepare(
        "UPDATE loyalty_config SET version=?,current_revision=?,draft_revision=?,paused=?,scheduled_revision=?,scheduled_for=?,scheduled_unpause=? WHERE id='default' AND version=?",
      )
      .bind(
        version,
        nextRow.current_revision,
        nextRow.draft_revision,
        nextRow.paused,
        nextRow.scheduled_revision,nextRow.scheduled_for,nextRow.scheduled_unpause,
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
export const cancelScheduledLoyalty=(db:D1Database,c:LoyaltyMutationContext)=>mutate(db,c,'cancel_schedule');
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
function eligibility(
  row: Row,
  input: ClaimInput,
  today: number,
  award = row.daily_points,
) {
  if (row.version !== input.expectedVersion) throw new IncentiveError('stale');
  if(row.schedule_blocked_reason)throw new IncentiveError('unavailable');
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
    award > row.daily_budget_points - today ||
    award > row.lifetime_budget_points - row.issued_points
  )
    throw new IncentiveError('exhausted');
}
async function lastLoyaltyClaim(
  db: D1Database,
  userId: string,
  throughDate?: string,
): Promise<(PreviousLoyaltyClaim & { awardedPoints: number }) | null> {
  const prior = await db
    .prepare(
      'SELECT local_date,response_json FROM loyalty_daily_claims WHERE user_id=?' +
        (throughDate ? ' AND local_date<=?' : '') +
        ' ORDER BY local_date DESC LIMIT 1',
    )
    .bind(...(throughDate ? [userId, throughDate] : [userId]))
    .first<{ local_date: string; response_json: string }>();
  if (!prior) return null;
  const result = JSON.parse(prior.response_json) as ClaimResult;
  return {
    localDate: prior.local_date,
    awardedPoints: result.awardedPoints,
    ...(result.cycle ? { cycle: result.cycle } : {}),
  };
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
  const effective=await effectiveRow(db,input.now),row=effective.row;
  const weekly =
    row.weekly_points_json === null
      ? null
      : validateWeeklyPoints(JSON.parse(row.weekly_points_json));
  const cycle = weekly
    ? nextLoyaltyCycle(
        localDate,
        await lastLoyaltyClaim(db, input.userId),
        row.grace_enabled === 1,
      )
    : undefined;
  const award = weekly ? weekly[cycle!.day - 1] : row.daily_points;
  eligibility(row, input, await todayIssued(db, input.now), award);
  const balance =
    (
      await db
        .prepare(
          'SELECT balance_points n FROM loyalty_accounts WHERE user_id=?',
        )
        .bind(input.userId)
        .first<{ n: number }>()
    )?.n ?? 0;
  loyaltyInteger(balance + award, 1);
  const result: ClaimResult = {
    claimId: crypto.randomUUID(),
    localDate,
    awardedPoints: award,
    balancePoints: balance + award,
    ...(cycle ? { cycle } : {}),
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
    ...promotionStatements(db,effective,input.now),
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
        'INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at,cycle_day,cycle_number,grace_used,grace_applied,cycle_reset_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      )
      .bind(
        result.claimId,
        input.userId,
        input.userId,
        input.requestId,
        digest,
        row.revision,
        localDate,
        award,
        JSON.stringify(result),
        input.formVersionId,
        input.now,
        cycle?.day ?? null,
        cycle?.number ?? null,
        cycle ? Number(cycle.graceUsed) : null,
        cycle ? Number(cycle.graceApplied) : null,
        cycle?.resetReason ?? null,
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
    eligibility(
      (await effectiveRow(db,input.now)).row,
      input,
      await todayIssued(db, input.now),
      award,
    );
    throw new IncentiveError('stale');
  }
  return result;
}
function publicState(
  row: Row,
  now: number,
  award = row.daily_points,
): CustomerLoyaltyState {
  return {
    version: row.version,
    revision: row.current_revision,
    enabled: row.enabled === 1,
    paused: row.paused === 1,
    dailyPoints: award,
    ...(row.weekly_points_json === null
      ? {}
      : {
          weeklyPoints: validateWeeklyPoints(
            JSON.parse(row.weekly_points_json),
          ),
          graceEnabled: row.grace_enabled === 1,
        }),
    pointsPerBlock: row.locked_points_per_block ?? row.points_per_block,
    creditPaisaPerBlock:
      row.locked_credit_paisa_per_block ?? row.credit_paisa_per_block,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.schedule_blocked_reason ? 'review_required' : row.paused
      ? 'paused'
      : row.enabled !== 1
        ? 'disabled'
        : row.starts_at !== null && now < row.starts_at
          ? 'scheduled'
          : row.ends_at !== null && now >= row.ends_at
            ? 'expired'
            : row.daily_budget_points === null ||
                row.lifetime_budget_points === null ||
                award > row.daily_budget_points - row.issued_today_points ||
                award > row.lifetime_budget_points - row.issued_points
              ? 'exhausted'
              : 'active',
  };
}
/** Public legal summary: published rules only, with no draft or administrative totals. */
export async function getPublishedLoyaltyTerms(db: D1Database, now: number) {
  const row = (await effectiveRow(db,now)).row;
  const { version: _configurationVersion, ...terms } = publicState(row, now);
  return terms;
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
  const row = (await effectiveRow(db,now)).row;
  const previous = await lastLoyaltyClaim(db, userId, day.localDate);
  const claimedToday = previous?.localDate === day.localDate;
  const weekly =
    row.weekly_points_json === null
      ? null
      : validateWeeklyPoints(JSON.parse(row.weekly_points_json));
  const cycle = weekly
    ? claimedToday && previous?.cycle
      ? previous.cycle
      : nextLoyaltyCycle(day.localDate, previous, row.grace_enabled === 1)
    : undefined;
  const award =
    claimedToday && previous
      ? previous.awardedPoints
      : weekly
        ? weekly[cycle!.day - 1]
        : row.daily_points;
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
    claimedToday,
    ...(cycle ? { cycle } : {}),
    nextClaimAt: day.nextClaimAt,
    state: publicState(row, now, award),
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
  const effective=await effectiveRow(db,input.now),row=effective.row,
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
    ...promotionStatements(db,effective,input.now),
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
      (await effectiveRow(db,input.now)).row,
      input,
      await redemptionBalances(db, input.userId),
    );
    throw new IncentiveError('stale');
  }
  return result;
}
