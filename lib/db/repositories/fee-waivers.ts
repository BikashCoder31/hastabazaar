import {
  FeeWaiverError,
  validateFeeWaiverInstant,
  validateFeeWaiverTerms,
  type FeeWaiverCampaign,
  type FeeWaiverCommand,
  type FeeWaiverContext,
  type FeeWaiverTerms,
} from '../../marketplace/fee-waivers';

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
async function authorize(db: D1Database, c: FeeWaiverContext) {
  if (
    !(await db
      .prepare(`SELECT 1 WHERE ${authoritySql}`)
      .bind(c.actorId, c.authSubject)
      .first())
  )
    throw new FeeWaiverError('unauthorized');
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
export async function getFeeWaiverState(
  db: D1Database,
): Promise<{ revision: number; campaigns: FeeWaiverCampaign[] }> {
  const rows = await db
    .prepare(
      `SELECT ctl.revision AS controlRevision,${campaignColumns} FROM marketplace_fee_waiver_control ctl LEFT JOIN marketplace_fee_waiver_campaigns c ON 1=1 LEFT JOIN marketplace_fee_waiver_revisions r ON r.campaign_id=c.id AND r.revision=c.revision WHERE ctl.id='default' ORDER BY r.starts_at,c.id`,
    )
    .all<FeeWaiverCampaign & { controlRevision: number }>();
  if (!rows.results.length) throw new FeeWaiverError('conflict');
  return {
    revision: rows.results[0].controlRevision,
    campaigns: rows.results
      .filter((r) => r.id !== null)
      .map(({ id, revision, state, name, description, startsAt, endsAt }) => ({
        id,
        revision,
        state,
        name,
        description,
        startsAt,
        endsAt,
      })),
  };
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
      'SELECT actor_id,auth_subject,command_json,response_json FROM marketplace_fee_waiver_requests WHERE request_id=?',
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

export async function mutateFeeWaiver(
  db: D1Database,
  context: FeeWaiverContext,
  raw: FeeWaiverCommand,
): Promise<FeeWaiverCampaign> {
  const c = { ...context };
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
  const statements: D1PreparedStatement[] = [
    ...lockActor(db, c),
    db.prepare(
      "UPDATE marketplace_fee_waiver_control SET revision=revision WHERE id='default'",
    ),
    ...guard(
      db,
      `${authoritySql} AND EXISTS(SELECT 1 FROM marketplace_fee_waiver_control WHERE id='default' AND revision=?)`,
      [c.actorId, c.authSubject, c.expectedRevision],
    ),
  ];
  if (!before)
    statements.push(
      db
        .prepare(
          'INSERT INTO marketplace_fee_waiver_campaigns(id,revision,created_at,updated_at) VALUES (?,1,?,?)',
        )
        .bind(id, c.now, c.now),
    );
  statements.push(
    db
      .prepare(
        'INSERT INTO marketplace_fee_waiver_revisions(campaign_id,revision,state,name,description,starts_at,ends_at,created_by,request_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
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
        'UPDATE marketplace_fee_waiver_campaigns SET revision=?,updated_at=? WHERE id=?',
      )
      .bind(revision, c.now, id),
    db.prepare(
      "UPDATE marketplace_fee_waiver_control SET revision=revision+1 WHERE id='default'",
    ),
    db
      .prepare(
        'INSERT INTO marketplace_fee_waiver_requests(request_id,actor_id,auth_subject,command_json,response_json,created_at) VALUES (?,?,?,?,?,?)',
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
        crypto.randomUUID(),
        c.actorId,
        `marketplace.fee-waiver.${command.type}`,
        'marketplace_fee_waiver',
        id,
        `Marketplace fee waiver ${command.type}`,
        before ? JSON.stringify(before) : null,
        JSON.stringify(next),
        `fee-waiver:${c.requestId}`,
        c.now,
      ),
  );
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
