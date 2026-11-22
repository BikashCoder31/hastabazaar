import { coreFormContract, coreFormVersionId } from './core-contracts';

export function currentFormVersionCondition(formId: string, versionId: string): { sql: string; bindings: string[] } {
  if (versionId.startsWith('core:')) {
    if (!coreFormContract(formId) || versionId !== coreFormVersionId(formId)) throw new Error('Invalid native form version.');
    return { sql: "NOT EXISTS(SELECT 1 FROM form_config_versions WHERE form_id=? AND HEX(form_id)=HEX(?) AND status='published')", bindings: [formId, formId] };
  }
  return { sql: `EXISTS(SELECT 1 FROM form_config_versions v WHERE v.id=? AND HEX(v.id)=HEX(?)
    AND v.form_id=? AND HEX(v.form_id)=HEX(?) AND v.status='published'
    AND v.version=(SELECT MAX(latest.version) FROM form_config_versions latest WHERE latest.form_id=v.form_id
      AND HEX(latest.form_id)=HEX(v.form_id) AND latest.status='published'))`, bindings: [versionId, versionId, formId, formId] };
}

export function currentFormVersionGuards(db: D1Database, formId: string, versionId: string): D1PreparedStatement[] {
  const condition = currentFormVersionCondition(formId, versionId), id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${condition.sql} THEN 1 ELSE 0 END`).bind(id, ...condition.bindings),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}

/** Nullable metadata FK only; the actual native receipt remains in the domain batch. */
export function publishedFormVersionId(formId: string, versionId: string): string | null {
  if (!versionId.startsWith('core:')) return versionId;
  currentFormVersionCondition(formId, versionId);
  return null;
}
