import {
  FeeWaiverError,
  validateFeeWaiverInstant,
  validateFeeWaiverTerms,
  type FeeWaiverCampaign,
  type FeeWaiverCommand,
  type FeeWaiverContext,
  type FeeWaiverTerms,
} from '../../marketplace/fee-waivers';

// Private, fixed SQL identifiers. No caller supplies a table name or audit namespace.
const campaignTables = {
  customer: {
    control: 'customer_fee_waiver_control',
    campaigns: 'customer_fee_waiver_campaigns',
    revisions: 'customer_fee_waiver_revisions',
    requests: 'customer_fee_waiver_requests',
    auditAction: 'customer.service-fee-waiver',
    auditSubject: 'customer_fee_waiver',
    auditReason: 'Customer service fee waiver',
    requestPrefix: 'customer-fee-waiver',
  },
} as const;
export interface FeeCampaignQuote {
  controlRevision: number;
  campaign: FeeWaiverCampaign | null;
}
function commands(
  tables: (typeof campaignTables)[keyof typeof campaignTables],
) {
  const authoritySql = `EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin')`;
  const campaignColumns =
    'c.id,r.revision,r.state,r.name,r.description,r.starts_at AS startsAt,r.ends_at AS endsAt';
  function identifier(value: string) {
    if (typeof value !== 'string' || !value.trim() || value.length > 191)
      throw new FeeWaiverError('invalid');
  }
  function guard(
    db: D1Database,
    predicate: string,
    values: (string | number)[],
  ): D1PreparedStatement[] {
    const id = crypto.randomUUID();
    return [
      db
        .prepare(
          `INSERT INTO staff_permission_guards(id,valid) VALUES (?,CASE WHEN (${predicate}) THEN 1 ELSE 0 END)`,
        )
        .bind(id, ...values),
      db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id),
    ];
  }
  function lockActor(db: D1Database, c: FeeWaiverContext) {
    return [
      db
        .prepare('UPDATE users SET updated_at=updated_at WHERE id=?')
        .bind(c.actorId),
      db
        .prepare(
          "UPDATE user_roles SET assigned_at=assigned_at WHERE user_id=? AND role='super_admin'",
        )
        .bind(c.actorId),
    ];
  }
  async function authorize(
    db: D1Database,
    c: Pick<FeeWaiverContext, 'actorId' | 'authSubject'>,
  ) {
    if (
      !(await db
        .prepare(`SELECT 1 WHERE ${authoritySql}`)
        .bind(c.actorId, c.authSubject)
        .first())
    )
      throw new FeeWaiverError('unauthorized');
  }

  /** Staff sessions alone are insufficient: check the live role before exposing controls. */
  async function getAuthorizedFeeWaiverState(
    db: D1Database,
    actor: Pick<FeeWaiverContext, 'actorId' | 'authSubject'>,
  ) {
    await authorize(db, actor);
    return getFeeWaiverState(db);
  }
  /** Failure diagnosis must not erase the original storage/audit error if reads also fail. */
  async function failureChecks<T>(
    original: unknown,
    check: () => Promise<T>,
  ): Promise<T> {
    try {
      return await check();
    } catch (diagnostic) {
      if (
        diagnostic instanceof FeeWaiverError &&
        ['unauthorized', 'stale', 'conflict'].includes(diagnostic.code)
      )
        throw diagnostic;
      throw new AggregateError(
        [original, diagnostic],
        'Fee waiver failure checks also failed.',
        { cause: original },
      );
    }
  }
  function normalizeCommand(command: FeeWaiverCommand): FeeWaiverCommand {
    if (
      !command ||
      typeof command !== 'object' ||
      Array.isArray(command) ||
      !['create', 'revise', 'publish', 'pause', 'resume', 'end'].includes(
        command.type,
      )
    )
      throw new FeeWaiverError('invalid');
    const allowed =
      command.type === 'create'
        ? ['type', 'terms']
        : command.type === 'revise'
          ? ['type', 'campaignId', 'terms']
          : ['type', 'campaignId'];
    if (Object.keys(command).some((k) => !allowed.includes(k)))
      throw new FeeWaiverError('invalid');
    if (command.type !== 'create') identifier(command.campaignId);
    if (command.type === 'create' || command.type === 'revise') {
      validateFeeWaiverTerms(command.terms);
      // New customer schedules must fit the four-digit Nepal datetime editor.
      // 0 is the existing nonnegative lower bound; this upper endpoint is
      // 9999-12-31 23:59:59.999 at +05:45. Preserve sub-minute saved instants.
      // Historical revisions and the legacy seller validator remain unchanged.
      if (command.terms.startsAt > 253402280099999 || command.terms.endsAt > 253402280099999)
        throw new FeeWaiverError('invalid');
      if (
        Object.keys(command.terms).some(
          (k) => !['name', 'description', 'startsAt', 'endsAt'].includes(k),
        )
      )
        throw new FeeWaiverError('invalid');
      const { name, description, startsAt, endsAt } = command.terms;
      const terms = { name, description, startsAt, endsAt };
      return command.type === 'create'
        ? { type: 'create', terms }
        : { type: 'revise', campaignId: command.campaignId, terms };
    }
    return { type: command.type, campaignId: command.campaignId };
  }

  /** A single read gives callers a consistent global revision and all current campaign versions. */
  async function getFeeWaiverState(
    db: D1Database,
  ): Promise<{ revision: number; campaigns: FeeWaiverCampaign[] }> {
    const rows = await db
      .prepare(
        `SELECT ctl.revision AS controlRevision,${campaignColumns} FROM ${tables.control} ctl LEFT JOIN ${tables.campaigns} c ON 1=1 LEFT JOIN ${tables.revisions} r ON r.campaign_id=c.id AND r.revision=c.revision WHERE ctl.id='default' ORDER BY r.starts_at,c.id`,
      )
      .all<FeeWaiverCampaign & { controlRevision: number }>();
    if (!rows.results.length) throw new FeeWaiverError('conflict');
    return {
      revision: rows.results[0].controlRevision,
      campaigns: rows.results
        .filter((r) => r.id !== null)
        .map(
          ({ id, revision, state, name, description, startsAt, endsAt }) => ({
            id,
            revision,
            state,
            name,
            description,
            startsAt,
            endsAt,
          }),
        ),
    };
  }

  /** Serialize with campaign mutations, including quotes that found no campaign.
   * Eligibility is re-evaluated at the server's actual order placement instant. */
  function feeWaiverCheckoutGuards(
    db: D1Database,
    quote: FeeCampaignQuote,
    placedAt: number,
  ): D1PreparedStatement[] {
    validateFeeWaiverInstant(placedAt);
    const idOrder =
      (db as D1Database & { dialect?: string }).dialect === 'mariadb'
        ? 'BINARY c.id'
        : 'c.id COLLATE BINARY';
    const winner = `FROM ${tables.campaigns} c JOIN ${tables.revisions} r ON r.campaign_id=c.id AND r.revision=c.revision
    WHERE r.state='published' AND r.starts_at<=? AND r.ends_at>? ORDER BY r.starts_at,${idOrder} LIMIT 1`;
    return [
      db.prepare(
        `UPDATE ${tables.control} SET revision=revision WHERE id='default'`,
      ),
      ...guard(
        db,
        `EXISTS(SELECT 1 FROM ${tables.control} WHERE id='default' AND revision=?)
      AND COALESCE((SELECT c.id ${winner}),'')=? AND COALESCE((SELECT r.revision ${winner}),0)=?`,
        [
          quote.controlRevision,
          placedAt,
          placedAt,
          quote.campaign?.id ?? '',
          placedAt,
          placedAt,
          quote.campaign?.revision ?? 0,
        ],
      ),
    ];
  }

  interface Receipt {
    actor_id: string;
    auth_subject: string;
    command_json: string;
    response_json: string;
  }
  async function replay(
    db: D1Database,
    c: FeeWaiverContext,
    payload: string,
  ): Promise<FeeWaiverCampaign | null> {
    const receipt = await db
      .prepare(
        `SELECT actor_id,auth_subject,command_json,response_json FROM ${tables.requests} WHERE request_id=?`,
      )
      .bind(c.requestId)
      .first<Receipt>();
    if (!receipt) return null;
    if (
      receipt.actor_id !== c.actorId ||
      receipt.auth_subject !== c.authSubject ||
      receipt.command_json !== payload
    )
      throw new FeeWaiverError('conflict');
    try {
      await db.batch([
        ...lockActor(db, c),
        ...guard(db, authoritySql, [c.actorId, c.authSubject]),
      ]);
    } catch (error) {
      await failureChecks(error, () => authorize(db, c));
      throw error;
    }
    return JSON.parse(receipt.response_json) as FeeWaiverCampaign;
  }

  async function mutateFeeWaiver(
    db: D1Database,
    context: FeeWaiverContext,
    raw: FeeWaiverCommand,
  ): Promise<FeeWaiverCampaign> {
    const c = { ...context };
    if(c.reason!==undefined){if(typeof c.reason!=='string'||c.reason.trim().length<10||c.reason.trim().length>1000)throw new FeeWaiverError('invalid');c.reason=c.reason.trim();}
    identifier(c.actorId);
    identifier(c.authSubject);
    identifier(c.requestId);
    validateFeeWaiverInstant(c.now);
    validateFeeWaiverInstant(c.expectedRevision);
    const command = normalizeCommand(raw);
    await authorize(db, c);
    // Server execution time may change on a retry; actor, expected revision and command may not.
    const payload = JSON.stringify({
      expectedRevision: c.expectedRevision,
      command,
      ...(c.reason===undefined?{}:{reason:c.reason}),
    });
    const saved = await replay(db, c, payload);
    if (saved) return saved;
    const snapshot = await getFeeWaiverState(db);
    if (snapshot.revision !== c.expectedRevision) {
      // A winner can commit after our first receipt lookup but before the snapshot read.
      const concurrent = await replay(db, c, payload);
      if (concurrent) return concurrent;
      throw new FeeWaiverError('stale');
    }
    if (c.expectedRevision === Number.MAX_SAFE_INTEGER)
      throw new FeeWaiverError('invalid');
    const before =
      command.type === 'create'
        ? null
        : snapshot.campaigns.find((x) => x.id === command.campaignId);
    if (command.type !== 'create' && (!before || before.state === 'ended'))
      throw new FeeWaiverError('invalid');
    if (
      (command.type === 'publish' && before?.state !== 'draft') ||
      (command.type === 'pause' && before?.state !== 'published') ||
      (command.type === 'resume' && before?.state !== 'paused')
    )
      throw new FeeWaiverError('invalid');
    if (
      ['publish', 'pause', 'resume'].includes(command.type) &&
      before!.endsAt <= c.now
    )
      throw new FeeWaiverError('invalid');
    const id = before?.id ?? crypto.randomUUID();
    const revision = (before?.revision ?? 0) + 1;
    if (!Number.isSafeInteger(revision)) throw new FeeWaiverError('invalid');
    const terms: FeeWaiverTerms =
      command.type === 'create' || command.type === 'revise'
        ? command.terms
        : before!;
    const next: FeeWaiverCampaign = {
      id,
      revision,
      name: terms.name,
      description: terms.description,
      startsAt: terms.startsAt,
      endsAt: terms.endsAt,
      state:
        command.type === 'create'
          ? 'draft'
          : command.type === 'publish' || command.type === 'resume'
            ? 'published'
            : command.type === 'pause'
              ? 'paused'
              : command.type === 'end'
                ? 'ended'
                : before!.state,
    };
    const nativeEventId=crypto.randomUUID();
    const statements: D1PreparedStatement[] = [
      ...lockActor(db, c),
      db.prepare(
        `UPDATE ${tables.control} SET revision=revision WHERE id='default'`,
      ),
      ...guard(
        db,
        `${authoritySql} AND EXISTS(SELECT 1 FROM ${tables.control} WHERE id='default' AND revision=?)`,
        [c.actorId, c.authSubject, c.expectedRevision],
      ),
    ];
    if (!before)
      statements.push(
        db
          .prepare(
            `INSERT INTO ${tables.campaigns}(id,revision,created_at,updated_at) VALUES (?,1,?,?)`,
          )
          .bind(id, c.now, c.now),
      );
    statements.push(
      db
        .prepare(
          `INSERT INTO ${tables.revisions}(campaign_id,revision,state,name,description,starts_at,ends_at,created_by,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          id,
          revision,
          next.state,
          next.name,
          next.description,
          next.startsAt,
          next.endsAt,
          c.actorId,
          c.requestId,
          c.now,
        ),
      db
        .prepare(
          `UPDATE ${tables.campaigns} SET revision=?,updated_at=? WHERE id=?`,
        )
        .bind(revision, c.now, id),
      db.prepare(
        `UPDATE ${tables.control} SET revision=revision+1 WHERE id='default'`,
      ),
      db
        .prepare(
          `INSERT INTO ${tables.requests}(request_id,actor_id,auth_subject,command_json,response_json,created_at) VALUES (?,?,?,?,?,?)`,
        )
        .bind(
          c.requestId,
          c.actorId,
          c.authSubject,
          payload,
          JSON.stringify(next),
          c.now,
        ),
      db
        .prepare(
          'INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          nativeEventId,
          c.actorId,
          `${tables.auditAction}.${command.type}`,
          tables.auditSubject,
          id,
          c.reason??`${tables.auditReason} ${command.type}`,
          before ? JSON.stringify(before) : null,
          JSON.stringify(next),
          `${tables.requestPrefix}:${c.requestId}`,
          c.now,
        ),
    );
    if(command.type!=='create'&&(command.type!=='revise'||before?.state!=='draft')){
      const status={publish:'waiver_published',pause:'waiver_paused',resume:'waiver_resumed',end:'waiver_ended',revise:'waiver_revised'}[command.type];
      statements.push(...await(await import('../../operations/programme-notice-sources')).programmeNoticeStatements(db,c,{type:'waiver',sourceId:id,eventId:nativeEventId,status}));
    }
    try {
      await db.batch(statements);
    } catch (error) {
      // Another identical request may have committed while this caller read its quote.
      const concurrent = await failureChecks(error, async () => {
        await authorize(db, c);
        const receipt = await replay(db, c, payload);
        if (receipt) return receipt;
        const latest = await getFeeWaiverState(db);
        if (latest.revision !== c.expectedRevision)
          throw new FeeWaiverError('stale');
        return null;
      });
      if (concurrent) return concurrent;
      throw error;
    }
    return next;
  }

  return {
    getState: getFeeWaiverState,
    getAuthorizedState: getAuthorizedFeeWaiverState,
    mutate: mutateFeeWaiver,
    checkoutGuards: feeWaiverCheckoutGuards,
  };
}
export const customerServiceFeeCampaignCommands = commands(
  campaignTables.customer,
);
