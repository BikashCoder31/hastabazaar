import type { ConfiguredField } from './types';
import { compatibilityAwareSellerForms, formAnswerContractsMatch } from './catalog-changes';
import { validateFormDraft } from './validation';
import { staffMutationGuard } from '../db/repositories/staff-mutation-guard';
import { commandReceipt, type CommandContext } from '../workflows/contracts';

export class FormCompatibilityError extends Error {}
export const compatibilityRevocationId = (formId: string, version: number) => `form-compatibility-revoked:${formId}:${version}`;
export const compatibilityGrantId = (formId: string, version: number) => `form-compatibility-granted:${formId}:${version}`;
const lifetimeMs = 24 * 60 * 60 * 1000;

export async function getFormCompatibility(db: D1Database, formId: string, toVersion: number, now: number) {
  if (!compatibilityAwareSellerForms.has(formId) || !Number.isSafeInteger(toVersion) || toVersion < 2)
    throw new FormCompatibilityError('This form has no eligible preceding publication.');
  const current = await db.prepare("SELECT MAX(version) version FROM form_config_versions WHERE form_id=? AND status='published'")
    .bind(formId).first<{version:number|null}>();
  if (current?.version !== toVersion) throw new FormCompatibilityError('Published form version changed.');
  const rows = await db.prepare('SELECT action,next_json value FROM audit_logs WHERE id IN (?,?)')
    .bind(compatibilityRevocationId(formId, toVersion), compatibilityGrantId(formId, toVersion)).all<{action:string;value:string}>();
  const revoked = rows.results.find(row => row.action === 'form.compatibility.revoked');
  const granted = rows.results.find(row => row.action === 'form.compatibility.granted');
  if (!revoked && !granted) return { mode: 'automatic', expiresAt: null, reason: '' };
  const policy = JSON.parse((revoked ?? granted)!.value) as { expiresAt: number|null; reason: string };
  return { ...policy, mode: revoked ? 'require_current' : policy.expiresAt !== null && policy.expiresAt > now ? 'review_equivalent' : 'expired' };
}

async function fingerprint(before: readonly ConfiguredField[], after: readonly ConfiguredField[]) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([before, after])));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

/** Explicit review cannot waive structural, requiredness, choice-value or protected rules. */
export async function setFormCompatibility(db: D1Database, input: CommandContext & {
  formId: string; fromVersion: number; toVersion: number; mode: 'review_equivalent' | 'require_current'; reason: string;
}) {
  const authority = await staffMutationGuard(db, input.actorId, 'admin.invite', FormCompatibilityError, 'super_admin');
  if (!compatibilityAwareSellerForms.has(input.formId) || !Number.isSafeInteger(input.toVersion) || input.toVersion < 2 ||
      input.fromVersion !== input.toVersion - 1 || !['review_equivalent', 'require_current'].includes(input.mode) ||
      typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 2000)
    throw new FormCompatibilityError('This form or compatibility review is not eligible.');
  const versions = await db.prepare("SELECT id,version,config_json configJson FROM form_config_versions WHERE form_id=? AND status='published' AND version IN (?,?)")
    .bind(input.formId, input.fromVersion, input.toVersion).all<{id:string;version:number;configJson:string}>();
  const before = versions.results.find(row => row.version === input.fromVersion);
  const after = versions.results.find(row => row.version === input.toVersion);
  if (!before || !after || input.expectedRevision !== after.id) throw new FormCompatibilityError('Published form version changed.');
  const source = { action: `form.compatibility.${input.mode}`, subjectType: 'form_configuration', subjectId: after.id };
  const payload = { formId: input.formId, fromVersion: input.fromVersion, toVersion: input.toVersion, mode: input.mode, reason: input.reason.trim() };
  const receipt = await commandReceipt(db, input, source, payload);
  if (receipt.replayed) return receipt.result;
  const oldFields = validateFormDraft(input.formId, JSON.parse(before.configJson)).fields;
  const newFields = validateFormDraft(input.formId, JSON.parse(after.configJson)).fields;
  if (input.mode === 'review_equivalent' && !formAnswerContractsMatch(oldFields, newFields, true))
    throw new FormCompatibilityError('Required questions, choices, field identity and validation rules cannot be waived by wording review.');
  const id = input.mode === 'require_current' ? compatibilityRevocationId(input.formId, input.toVersion) : compatibilityGrantId(input.formId, input.toVersion);
  const result = { ...payload, id, createdAt: input.now, expiresAt: input.mode === 'require_current' ? null : input.now + lifetimeMs,
    fingerprint: await fingerprint(oldFields, newFields) };
  const guardId = crypto.randomUUID();
  const { operationalBusinessNotificationStatements } = await import('../operations/business-notifications');
  const notifications = await operationalBusinessNotificationStatements(db, {
    kind: 'form.compatibility.changed', sourceId: input.formId, eventId: id, actorId: input.actorId, now: input.now,
  });
  try {
    await db.batch([
      ...authority.statements,
      db.prepare(`INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN
        EXISTS(SELECT 1 FROM form_config_versions WHERE id=? AND config_json=? AND status='published') AND
        EXISTS(SELECT 1 FROM form_config_versions WHERE id=? AND config_json=? AND status='published') AND
        (SELECT MAX(version) FROM form_config_versions WHERE form_id=? AND status='published')=? AND
        NOT EXISTS(SELECT 1 FROM audit_logs WHERE id=?) THEN 1 ELSE 0 END`)
        .bind(guardId, before.id, before.configJson, after.id, after.configJson, input.formId, input.toVersion,
          input.mode === 'require_current' ? id : compatibilityRevocationId(input.formId, input.toVersion)),
      db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(guardId),
      db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,next_json,created_at)
        VALUES(?,?,?,'form_configuration',?,?,?,?,?)`).bind(id, input.actorId,
          input.mode === 'require_current' ? 'form.compatibility.revoked' : 'form.compatibility.granted', after.id,
          input.reason.trim(), input.requestId, JSON.stringify(result), input.now),
      receipt.insert(result),
      ...notifications,
    ]);
  } catch {
    const concurrent = await commandReceipt(db, input, source, payload);
    if (concurrent.replayed) return concurrent.result;
    throw new FormCompatibilityError('Compatibility review conflict. Refresh the current publication and review its recorded policy.');
  }
  return result;
}

export async function allowsPreviousFormVersion(db: D1Database, input: {
  formId: string; fromVersion: number; toVersion: number; before: readonly ConfiguredField[]; after: readonly ConfiguredField[]; now: number;
}) {
  if (!compatibilityAwareSellerForms.has(input.formId) || input.fromVersion !== input.toVersion - 1) return false;
  const revoked = await db.prepare("SELECT id FROM audit_logs WHERE id=? AND action='form.compatibility.revoked'")
    .bind(compatibilityRevocationId(input.formId, input.toVersion)).first();
  if (revoked) return false;
  const record = await db.prepare("SELECT next_json value FROM audit_logs WHERE id=? AND action='form.compatibility.granted'")
    .bind(compatibilityGrantId(input.formId, input.toVersion)).first<{ value: string }>();
  if (!record) return formAnswerContractsMatch(input.before, input.after);
  try {
    const policy = JSON.parse(record.value) as { fromVersion: number; toVersion: number; fingerprint: string; createdAt: number; expiresAt: number };
    return policy.fromVersion === input.fromVersion && policy.toVersion === input.toVersion &&
      Number.isSafeInteger(policy.createdAt) && Number.isSafeInteger(policy.expiresAt) &&
      policy.createdAt <= input.now && policy.expiresAt > input.now && policy.expiresAt - policy.createdAt <= lifetimeMs &&
      formAnswerContractsMatch(input.before, input.after, true) && policy.fingerprint === await fingerprint(input.before, input.after);
  } catch { return false; }
}
