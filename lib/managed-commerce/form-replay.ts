import { FormRequestConflictError } from '@/lib/forms/submission';

/** Decision actions use their audit row and answer snapshot as one replay identity. */
export async function decisionFormReplay(database: D1Database, input: {
  formId: string; requestId: string; auditRequestId?: string; actorId: string;
  action: string; subjectType: string; subjectId: string; versionId: string; digest: string;
}): Promise<boolean> {
  const active = await database.prepare(`SELECT 1 FROM users JOIN user_roles ON user_roles.user_id=users.id
    WHERE users.id=? AND users.status='active' AND user_roles.role='super_admin' LIMIT 1`)
    .bind(input.actorId).first();
  if (!active) throw new FormRequestConflictError('An active Super Admin is required for this program decision.');
  const row = await database.prepare(`SELECT a.actor_id AS actorId,a.action,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.next_json AS nextJson,f.form_id AS formId,
      f.config_version_id AS versionId,f.actor_id AS answerActorId,f.subject_type AS answerSubjectType,
      f.subject_id AS answerSubjectId
    FROM audit_logs a LEFT JOIN form_answer_sets f ON f.form_id=? AND f.request_id=?
    WHERE a.request_id=? LIMIT 1`).bind(input.formId, input.requestId, input.auditRequestId ?? input.requestId)
    .first<{ actorId: string | null; action: string; subjectType: string; subjectId: string;
      nextJson: string | null; formId: string | null; versionId: string | null;
      answerActorId: string | null; answerSubjectType: string | null; answerSubjectId: string | null }>();
  if (!row) {
    if (await database.prepare('SELECT 1 FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1')
      .bind(input.formId, input.requestId).first()) throw new FormRequestConflictError('Request reference is already used.');
    return false;
  }
  let next: unknown;
  try { next = row.nextJson && JSON.parse(row.nextJson); } catch { /* Broken history is a conflict. */ }
  if (row.actorId !== input.actorId || row.action !== input.action || row.subjectType !== input.subjectType ||
      row.subjectId !== input.subjectId || row.formId !== input.formId || row.versionId !== input.versionId ||
      row.answerActorId !== input.actorId || row.answerSubjectType !== input.subjectType ||
      row.answerSubjectId !== input.subjectId || !next || typeof next !== 'object' ||
      (next as { catalogDigest?: string }).catalogDigest !== input.digest) {
    throw new FormRequestConflictError('Request reference is already used for different content.');
  }
  const parents:Record<string,{subjectType:string;table:string}>={
    'staff.managed-supply-decision':{subjectType:'managed_supply',table:'managed_supply_records'},
    'staff.managed-adjustment':{subjectType:'managed_supply',table:'managed_supply_records'},
    'staff.managed-payment-preparation':{subjectType:'managed_supplier_payment',table:'managed_supplier_payments'},
    'staff.managed-payment-action':{subjectType:'managed_supplier_payment',table:'managed_supplier_payments'},
    'staff.managed-transition-decision':{subjectType:'seller_route_transition',table:'seller_route_transition_applications'},
  };
  const parent=parents[input.formId];
  if(!parent||parent.subjectType!==input.subjectType||
    !await database.prepare(`SELECT 1 FROM ${parent.table} WHERE id=? LIMIT 1`).bind(input.subjectId).first())
    throw new FormRequestConflictError('The committed program decision parent is unavailable.');
  return true;
}
