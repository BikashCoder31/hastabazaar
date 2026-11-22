import {programmeNoticeStatements} from '../../operations/programme-notice-sources';
import {
  IncentiveError,
  type PromoMutationContext,
  type PromoTerms,
  type PromoQuote,
  type PromoState,
  type PromoConsumptionInput,
  type PromoCampaignPage,
  type PromoRedemptionPage,
  type PromoListInput,
  type PromoDetailInput,
  type PromoRedemptionListInput,
  type PromoQuoteInput,
} from '../../incentives/types';
import {
  calculatePromoDiscount,
  normalizePromoCode,
} from '../../incentives/promo-policy';
import { digestFormRequest } from '../../forms/submission';
import { buildFormAnswerInsert } from './form-answers';

const MAX_TIME = 253402300799999;
const FORM = 'staff.promo-code';
const authoritySql = `EXISTS(SELECT 1 FROM users u JOIN user_roles role ON role.user_id=u.id WHERE u.id=? AND u.status='active' AND role.role=?)`;
const staffSql = `EXISTS(SELECT 1 FROM users u JOIN user_roles role ON role.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND role.role='super_admin')`;
function integer(n: number, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(n) || n < min || n > max)
    throw new IncentiveError('invalid');
}
function identifier(value: string) {
  if (typeof value !== 'string' || !value.trim() || value.length > 191)
    throw new IncentiveError('invalid');
}
async function authority(db: D1Database, id: string, role = 'super_admin') {
  identifier(id);
  if (
    !(await db.prepare(`SELECT 1 WHERE ${authoritySql}`).bind(id, role).first())
  )
    throw new IncentiveError('unauthorized');
}
async function staffAuthority(
  db: D1Database,
  actorId: string,
  authSubject: string,
) {
  identifier(actorId);
  identifier(authSubject);
  if (
    !(await db
      .prepare(`SELECT 1 WHERE ${staffSql}`)
      .bind(actorId, authSubject)
      .first())
  )
    throw new IncentiveError('unauthorized');
}
/** Checked INSERTs abort both native D1 and MariaDB batches when a predicate fails. Zero-row UPDATEs alone do not. */
function guard(
  db: D1Database,
  predicate: string,
  bindings: (string | number | null)[],
): D1PreparedStatement[] {
  const id = crypto.randomUUID();
  return [
    db
      .prepare(
        `INSERT INTO staff_permission_guards(id,valid) VALUES (?,CASE WHEN (${predicate}) THEN 1 ELSE 0 END)`,
      )
      .bind(id, ...bindings),
    db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id),
  ];
}
/** No-op UPDATEs lock authority rows for the transaction on MariaDB; native D1 serializes the batch. */
function lockActor(
  db: D1Database,
  actorId: string,
  role: string,
): D1PreparedStatement[] {
  return [
    db
      .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
      .bind(actorId),
    db
      .prepare(
        'UPDATE user_roles SET assigned_at=assigned_at WHERE user_id=? AND role=?',
      )
      .bind(actorId, role),
  ];
}
interface CampaignRow {
  id: string;
  code: string;
  version: number;
  current_revision: number | null;
  draft_revision: number | null;
  status: string;
  paused: number;
  used_count: number;
  spent_paisa: number;
  created_at: number;
  revision: number;
  label: string;
  kind: 'fixed' | 'percentage';
  fixed_paisa: number | null;
  percent_bps: number | null;
  max_discount_paisa: number | null;
  minimum_subtotal_paisa: number;
  starts_at: number;
  ends_at: number;
  total_use_limit: number;
  per_customer_use_limit: number;
  budget_paisa: number;
  maximum_customer_count: number;
}
const selectState = `SELECT c.*,r.*,c.id AS id,c.created_at AS created_at,
 COALESCE((SELECT MAX(used_count) FROM promo_customer_usage WHERE campaign_id=c.id),0) AS maximum_customer_count
 FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=COALESCE(c.draft_revision,c.current_revision)`;
function decode(row: CampaignRow): PromoState {
  const base = {
    code: row.code,
    label: row.label,
    minimumSubtotalPaisa: row.minimum_subtotal_paisa,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    totalUseLimit: row.total_use_limit,
    perCustomerUseLimit: row.per_customer_use_limit,
    budgetPaisa: row.budget_paisa,
  };
  const terms: PromoTerms =
    row.kind === 'fixed'
      ? { ...base, kind: 'fixed', fixedPaisa: row.fixed_paisa! }
      : {
          ...base,
          kind: 'percentage',
          percentBps: row.percent_bps!,
          maxDiscountPaisa: row.max_discount_paisa!,
        };
  return {
    campaignId: row.id,
    version: row.version,
    revision: row.revision,
    publishedRevision: row.current_revision,
    draftRevision: row.draft_revision,
    terms,
    paused: row.paused === 1,
    usedCount: row.used_count,
    spentPaisa: row.spent_paisa,
    maximumCustomerUsedCount: row.maximum_customer_count,
  };
}
async function state(db: D1Database, id: string) {
  const row = await db
    .prepare(`${selectState} WHERE c.id=?`)
    .bind(id)
    .first<CampaignRow>();
  if (!row) throw new IncentiveError('unavailable');
  return decode(row);
}
function validateContext(c: PromoMutationContext) {
  identifier(c.actorId);
  identifier(c.authSubject);
  identifier(c.requestId);
  integer(c.now, 0, MAX_TIME);
  integer(c.expectedVersion);
  if (
    typeof c.reason !== 'string' ||
    !c.reason.trim() ||
    c.reason.length > 1000 ||
    !c.form ||
    c.form.formId !== FORM
  )
    throw new IncentiveError('invalid');
  identifier(c.form.versionId);
}
function normalizeTerms(raw: PromoTerms): PromoTerms {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw))
    throw new IncentiveError('invalid');
  const allowed = [
    'code',
    'label',
    'kind',
    'fixedPaisa',
    'percentBps',
    'maxDiscountPaisa',
    'minimumSubtotalPaisa',
    'startsAt',
    'endsAt',
    'totalUseLimit',
    'perCustomerUseLimit',
    'budgetPaisa',
  ];
  if (Object.keys(raw).some((key) => !allowed.includes(key)))
    throw new IncentiveError('invalid');
  const terms = {
    ...raw,
    code: normalizePromoCode(raw.code),
    label: typeof raw.label === 'string' ? raw.label.trim() : raw.label,
  };
  calculatePromoDiscount(terms, 0);
  // Canonical field ordering makes equivalent JSON objects the same intent.
  return {
    code: terms.code,
    label: terms.label,
    kind: terms.kind,
    ...(terms.kind === 'fixed'
      ? { fixedPaisa: terms.fixedPaisa }
      : {
          percentBps: terms.percentBps,
          maxDiscountPaisa: terms.maxDiscountPaisa,
        }),
    minimumSubtotalPaisa: terms.minimumSubtotalPaisa,
    startsAt: terms.startsAt,
    endsAt: terms.endsAt,
    totalUseLimit: terms.totalUseLimit,
    perCustomerUseLimit: terms.perCustomerUseLimit,
    budgetPaisa: terms.budgetPaisa,
  } as PromoTerms;
}
async function replay(
  db: D1Database,
  c: PromoMutationContext,
  digest: string,
): Promise<PromoState | null> {
  await staffAuthority(db, c.actorId, c.authSubject);
  const rows = await db
    .prepare(
      `SELECT l.actor_id,l.action,l.next_json,a.form_id FROM audit_logs l LEFT JOIN form_answer_sets a ON a.request_id=l.request_id AND a.form_id=? WHERE l.request_id=? LIMIT 2`,
    )
    .bind(FORM, c.requestId)
    .all<{
      actor_id: string;
      action: string;
      next_json: string;
      form_id: string;
    }>();
  if (!rows.results.length) {
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
  if (rows.results.length !== 1) throw new IncentiveError('conflict');
  const row = rows.results[0];
  let saved: { digest?: string; response?: PromoState } | null = null;
  try {
    saved = JSON.parse(row.next_json);
  } catch {
    /* malformed persisted receipt fails closed */
  }
  if (
    row.actor_id !== c.actorId ||
    row.form_id !== FORM ||
    !row.action.startsWith('promo.') ||
    saved?.digest !== digest ||
    !saved.response
  )
    throw new IncentiveError('conflict');
  try {
    await db.batch([
      ...lockActor(db, c.actorId, 'super_admin'),
      ...guard(db, staffSql, [c.actorId, c.authSubject]),
    ]);
  } catch {
    throw new IncentiveError('unauthorized');
  }
  return saved.response;
}
async function mutation(
  db: D1Database,
  c: PromoMutationContext,
  action: 'draft' | 'publish' | 'pause',
  campaignId?: string,
  raw?: PromoTerms,
): Promise<PromoState> {
  validateContext(c);
  await staffAuthority(db, c.actorId, c.authSubject);
  if (campaignId !== undefined) identifier(campaignId);
  const terms = action === 'draft' ? normalizeTerms(raw!) : undefined;
  const digest = await digestFormRequest({
    action,
    actorId: c.actorId,
    authSubject: c.authSubject,
    campaignId: campaignId ?? null,
    expectedVersion: c.expectedVersion,
    reason: c.reason.trim(),
    terms: terms ?? null,
    form: c.form,
  });
  const original = await replay(db, c, digest);
  if (original) return original;
  const before = campaignId ? await state(db, campaignId) : null;
  if ((before?.version ?? 0) !== c.expectedVersion)
    throw new IncentiveError('stale');
  if (!before && action !== 'draft') throw new IncentiveError('invalid');
  if (
    before &&
    terms &&
    (terms.code !== before.terms.code ||
      terms.totalUseLimit < before.usedCount ||
      terms.budgetPaisa < before.spentPaisa ||
      terms.perCustomerUseLimit < before.maximumCustomerUsedCount)
  )
    throw new IncentiveError('invalid');
  if (action === 'publish' && !before?.draftRevision)
    throw new IncentiveError('invalid');
  const id = campaignId ?? crypto.randomUUID();
  const version = (before?.version ?? 0) + 1;
  const programmeEventId=crypto.randomUUID();
  integer(version, 1);
  const max =
    action === 'draft' && before
      ? await db
          .prepare(
            'SELECT MAX(revision) AS n FROM promo_revisions WHERE campaign_id=?',
          )
          .bind(id)
          .first<{ n: number }>()
      : null;
  const revision = action === 'draft' ? (max?.n ?? 0) + 1 : before!.revision;
  integer(revision, 1);
  const next: PromoState =
    action === 'draft'
      ? {
          campaignId: id,
          version,
          revision,
          publishedRevision: before?.publishedRevision ?? null,
          draftRevision: revision,
          terms: terms!,
          paused: before?.paused ?? false,
          usedCount: before?.usedCount ?? 0,
          spentPaisa: before?.spentPaisa ?? 0,
          maximumCustomerUsedCount: before?.maximumCustomerUsedCount ?? 0,
        }
      : {
          ...before!,
          version,
          ...(action === 'publish'
            ? {
                publishedRevision: before!.draftRevision,
                draftRevision: null,
                paused: false,
              }
            : { paused: true }),
        };
  const check = `${staffSql} AND ${before ? 'EXISTS(SELECT 1 FROM promo_campaigns WHERE id=? AND version=? AND used_count=? AND spent_paisa=?)' : 'NOT EXISTS(SELECT 1 FROM promo_campaigns WHERE id=?)'}`;
  const statements = [
    ...lockActor(db, c.actorId, 'super_admin'),
    ...(before
      ? [
          db
            .prepare('UPDATE promo_campaigns SET version=version WHERE id=?')
            .bind(id),
        ]
      : []),
    ...guard(db, check, [
      c.actorId,
      c.authSubject,
      id,
      ...(before
        ? [c.expectedVersion, before.usedCount, before.spentPaisa]
        : []),
    ]),
  ];
  if (!before)
    statements.push(
      db
        .prepare(
          'INSERT INTO promo_campaigns(id,code,created_at,updated_at) VALUES (?,?,?,?)',
        )
        .bind(id, terms!.code, c.now, c.now),
    );
  if (terms)
    statements.push(
      db
        .prepare(
          `INSERT INTO promo_revisions(campaign_id,revision,label,kind,fixed_paisa,percent_bps,max_discount_paisa,minimum_subtotal_paisa,starts_at,ends_at,total_use_limit,per_customer_use_limit,budget_paisa,created_by,request_id,reason,form_version_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          revision,
          terms.label,
          terms.kind,
          terms.kind === 'fixed' ? terms.fixedPaisa : null,
          terms.kind === 'percentage' ? terms.percentBps : null,
          terms.kind === 'percentage' ? terms.maxDiscountPaisa : null,
          terms.minimumSubtotalPaisa,
          terms.startsAt,
          terms.endsAt,
          terms.totalUseLimit,
          terms.perCustomerUseLimit,
          terms.budgetPaisa,
          c.actorId,
          c.requestId,
          c.reason.trim(),
          c.form.versionId,
          c.now,
        ),
    );
  if (action === 'draft')
    statements.push(
      db
        .prepare(
          'UPDATE promo_campaigns SET draft_revision=?,version=?,updated_at=? WHERE id=? AND version=?',
        )
        .bind(revision, version, c.now, id, before?.version ?? 1),
    );
  else if (action === 'publish')
    statements.push(
      db
        .prepare(
          "UPDATE promo_campaigns SET current_revision=draft_revision,draft_revision=NULL,status='published',paused=0,version=?,updated_at=? WHERE id=? AND version=?",
        )
        .bind(version, c.now, id, c.expectedVersion),
    );
  else
    statements.push(
      db
        .prepare(
          'UPDATE promo_campaigns SET paused=1,version=?,updated_at=? WHERE id=? AND version=?',
        )
        .bind(version, c.now, id, c.expectedVersion),
    );
  statements.push(
    ...guard(
      db,
      `${staffSql} AND EXISTS(SELECT 1 FROM promo_campaigns WHERE id=? AND version=?)`,
      [c.actorId, c.authSubject, id, version],
    ),
  );
  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,ip_hash,created_at) VALUES (?,?,?,'promo_campaign',?,?,?,?,?,NULL,?)`,
      )
      .bind(
        programmeEventId,
        c.actorId,
        `promo.${action}`,
        id,
        c.reason.trim(),
        before ? JSON.stringify(before) : null,
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
        subjectType: 'promo_campaign',
        subjectId: id,
        actorId: c.actorId,
        answers: c.form.answers,
        now: c.now,
      }),
    );
  } catch {
    throw new IncentiveError('invalid');
  }
  if(action!=='draft')statements.push(...await programmeNoticeStatements(db,c,{type:'promo',sourceId:id,eventId:programmeEventId,status:action==='publish'?'promo_published':'promo_paused'}));
  try {
    await db.batch(statements);
  } catch {
    await staffAuthority(db, c.actorId, c.authSubject);
    const retry = await replay(db, c, digest);
    if (retry) return retry;
    if (before && (await state(db, id)).version !== c.expectedVersion)
      throw new IncentiveError('stale');
    if (
      await db
        .prepare('SELECT 1 FROM promo_campaigns WHERE code=? AND id<>?')
        .bind(terms?.code ?? before!.terms.code, id)
        .first()
    )
      throw new IncentiveError('conflict');
    throw new IncentiveError('stale');
  }
  // Receipt is the exact state computed under the version fence; later mutations never rewrite it.
  return next;
}
export const savePromoDraft = (
  db: D1Database,
  context: PromoMutationContext,
  terms: PromoTerms,
  campaignId?: string,
) => mutation(db, context, 'draft', campaignId, terms);
export const publishPromo = (
  db: D1Database,
  context: PromoMutationContext,
  campaignId: string,
) => mutation(db, context, 'publish', campaignId);
export const pausePromo = (
  db: D1Database,
  context: PromoMutationContext,
  campaignId: string,
) => mutation(db, context, 'pause', campaignId);

export async function quotePromo(
  db: D1Database,
  input: PromoQuoteInput,
): Promise<PromoQuote> {
  integer(input.now, 0, MAX_TIME);
  integer(input.subtotalPaisa);
  const discountCapPaisa = input.discountCapPaisa === undefined
    ? input.subtotalPaisa
    : input.discountCapPaisa;
  integer(discountCapPaisa, 0, input.subtotalPaisa);
  await authority(db, input.userId, 'customer');
  const code = normalizePromoCode(input.code);
  const row = await db
    .prepare(
      `SELECT c.*,r.*,c.id AS id,COALESCE((SELECT used_count FROM promo_customer_usage WHERE campaign_id=c.id AND customer_id=?),0) AS customer_count,0 AS maximum_customer_count FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision WHERE c.code=?`,
    )
    .bind(input.userId, code)
    .first<CampaignRow & { customer_count: number }>();
  if (
    !row ||
    row.status !== 'published' ||
    row.paused ||
    input.now < row.starts_at ||
    input.now >= row.ends_at ||
    input.subtotalPaisa < row.minimum_subtotal_paisa
  )
    throw new IncentiveError('unavailable');
  const discount = Math.min(
    calculatePromoDiscount(decode(row).terms, input.subtotalPaisa),
    discountCapPaisa,
  );
  if (discount < 1) throw new IncentiveError('unavailable');
  if (
    row.used_count >= row.total_use_limit ||
    row.customer_count >= row.per_customer_use_limit ||
    discount > row.budget_paisa - row.spent_paisa
  )
    throw new IncentiveError('exhausted');
  return {
    campaignId: row.id,
    revision: row.revision,
    code,
    label: row.label,
    discountPaisa: discount,
    subtotalPaisa: input.subtotalPaisa,
    expiresAt: row.ends_at,
    minimumSubtotalPaisa: row.minimum_subtotal_paisa,
  };
}
/** Caller supplies server-derived canonical order digest/receipt, inserts order and lines first, then batches these statements. */
export async function preparePromoConsumption(
  db: D1Database,
  input: PromoConsumptionInput,
): Promise<readonly D1PreparedStatement[]> {
  identifier(input.orderId);
  identifier(input.requestId);
  identifier(input.quote.campaignId);
  integer(input.quote.revision, 1);
  if (
    typeof input.payloadDigest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(input.payloadDigest) ||
    !input.response ||
    typeof input.response !== 'object' ||
    Array.isArray(input.response)
  )
    throw new IncentiveError('invalid');
  let response: string;
  try {
    response = JSON.stringify(input.response);
    const object = JSON.parse(response) as unknown;
    if (!object || typeof object !== 'object' || Array.isArray(object))
      throw new Error();
    if (new TextEncoder().encode(response).length > 131072) throw new Error();
  } catch {
    throw new IncentiveError('invalid');
  }
  const current = await quotePromo(db, {
    userId: input.userId,
    code: input.quote.code,
    subtotalPaisa: input.quote.subtotalPaisa,
    discountCapPaisa: input.discountCapPaisa,
    now: input.now,
  });
  if (
    Object.keys(current).some(
      (key) =>
        current[key as keyof PromoQuote] !==
        input.quote[key as keyof PromoQuote],
    )
  )
    throw new IncentiveError('stale');
  const q = current;
  // The amount was calculated with BigInt in policy. Reassert immutable revision terms at commit; schema guards serialize remaining limits and own consumption.
  return [
    ...lockActor(db, input.userId, 'customer'),
    ...guard(
      db,
      `${authoritySql} AND EXISTS(SELECT 1 FROM promo_campaigns c JOIN promo_revisions r ON r.campaign_id=c.id AND r.revision=c.current_revision WHERE c.id=? AND c.current_revision=? AND c.status='published' AND c.paused=0 AND c.code=? AND r.label=? AND r.ends_at=? AND r.minimum_subtotal_paisa=? AND ?>=r.starts_at AND ?<r.ends_at)`,
      [
        input.userId,
        'customer',
        q.campaignId,
        q.revision,
        q.code,
        q.label,
        q.expiresAt,
        q.minimumSubtotalPaisa,
        input.now,
        input.now,
      ],
    ),
    db
      .prepare(
        `INSERT INTO promo_redemptions(id,campaign_id,revision,customer_id,order_id,actor_id,request_id,payload_digest,response_json,discount_paisa,subtotal_paisa,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        crypto.randomUUID(),
        q.campaignId,
        q.revision,
        input.userId,
        input.orderId,
        input.userId,
        input.requestId,
        input.payloadDigest,
        response,
        q.discountPaisa,
        q.subtotalPaisa,
        input.now,
      ),
  ];
}

interface Cursor {
  actor: string;
  scope: string;
  time: number;
  id: string;
}
function pagination(input: PromoListInput, scope: string) {
  const limit = input.limit ?? 20;
  integer(limit, 1, 50);
  let cursor: Cursor | null = null;
  if (input.cursor !== undefined) {
    try {
      if (typeof input.cursor !== 'string' || input.cursor.length > 2048)
        throw new Error();
      cursor = JSON.parse(atob(input.cursor));
      if (!cursor || cursor.actor !== input.actorId || cursor.scope !== scope)
        throw new Error();
      integer(cursor.time, 0, MAX_TIME);
      identifier(cursor.id);
    } catch {
      throw new IncentiveError('invalid');
    }
  }
  return { limit, cursor };
}
function nextCursor(
  input: PromoListInput,
  scope: string,
  row: { created_at: number; id: string },
) {
  return btoa(
    JSON.stringify({
      actor: input.actorId,
      scope,
      time: row.created_at,
      id: row.id,
    }),
  );
}
export async function getPromoCampaign(
  db: D1Database,
  input: PromoDetailInput,
): Promise<PromoState> {
  await staffAuthority(db, input.actorId, input.authSubject);
  identifier(input.campaignId);
  const result = await state(db, input.campaignId);
  await staffAuthority(db, input.actorId, input.authSubject);
  return result;
}
export async function listPromoCampaigns(
  db: D1Database,
  input: PromoListInput,
): Promise<PromoCampaignPage> {
  await staffAuthority(db, input.actorId, input.authSubject);
  const scope = 'campaigns';
  const { limit, cursor } = pagination(input, scope);
  const rows = await db
    .prepare(
      `${selectState} WHERE (? IS NULL OR c.created_at<? OR (c.created_at=? AND c.id<?)) ORDER BY c.created_at DESC,c.id DESC LIMIT ?`,
    )
    .bind(
      cursor?.id ?? null,
      cursor?.time ?? 0,
      cursor?.time ?? 0,
      cursor?.id ?? '',
      limit + 1,
    )
    .all<CampaignRow>();
  await staffAuthority(db, input.actorId, input.authSubject);
  const page = rows.results.slice(0, limit);
  return {
    campaigns: page.map(decode),
    nextCursor:
      rows.results.length > limit && page.length
        ? nextCursor(input, scope, page[page.length - 1])
        : null,
  };
}
export async function listPromoRedemptions(
  db: D1Database,
  input: PromoRedemptionListInput,
): Promise<PromoRedemptionPage> {
  await staffAuthority(db, input.actorId, input.authSubject);
  identifier(input.campaignId);
  await state(db, input.campaignId);
  const scope = `redemptions:${input.campaignId}`;
  const { limit, cursor } = pagination(input, scope);
  const rows = await db
    .prepare(
      `SELECT id,order_id,revision,discount_paisa,created_at FROM promo_redemptions WHERE campaign_id=? AND (? IS NULL OR created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
    .bind(
      input.campaignId,
      cursor?.id ?? null,
      cursor?.time ?? 0,
      cursor?.time ?? 0,
      cursor?.id ?? '',
      limit + 1,
    )
    .all<{
      id: string;
      order_id: string;
      revision: number;
      discount_paisa: number;
      created_at: number;
    }>();
  await staffAuthority(db, input.actorId, input.authSubject);
  const page = rows.results.slice(0, limit);
  return {
    redemptions: page.map((row) => ({
      redemptionId: row.id,
      orderId: row.order_id,
      revision: row.revision,
      discountPaisa: row.discount_paisa,
      createdAt: row.created_at,
    })),
    nextCursor:
      rows.results.length > limit && page.length
        ? nextCursor(input, scope, page[page.length - 1])
        : null,
  };
}
