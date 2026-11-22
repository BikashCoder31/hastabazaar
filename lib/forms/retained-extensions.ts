import type { FormConfigDraft } from './types';
import { isNativeTaskForm } from './catalog-policy';
import { validateFormDraft } from './validation';
import { FormCatalogStoredConfigError } from '../db/repositories/form-catalog';

export class RetainedExtensionError extends Error {}
export function isRetainedExtensionRequest(request: Request): boolean {
  return request.headers.get('X-Hastabazaar-Form-Mode') === 'retained-extension';
}

/** Original published identities, not a client assertion, bound this exception. */
export async function assertRetainedExtensionConfig(db: D1Database, formId: string, config: FormConfigDraft): Promise<void> {
  if (!isNativeTaskForm(formId)) return;
  const history = await db.prepare(`SELECT config_json AS configJson FROM form_config_versions
    WHERE form_id=? AND HEX(form_id)=HEX(?) AND status='published' ORDER BY version`)
    .bind(formId, formId).all<{ configJson: string }>();
  let originals;
  try { originals = history.results.flatMap(row => validateFormDraft(formId, JSON.parse(row.configJson) as unknown).fields); }
  catch { throw new FormCatalogStoredConfigError(); }
  if (!originals.length) throw new RetainedExtensionError('This native task has no published extra questions to review. Use its owning feature.');
  for (const field of config.fields) {
    const original = originals.find(candidate => candidate.id === field.id && candidate.key === field.key && candidate.type === field.type &&
      JSON.stringify(candidate.choices?.map(choice => choice.value) ?? []) === JSON.stringify(field.choices?.map(choice => choice.value) ?? []));
    if (!original) throw new RetainedExtensionError('Retained native questions must keep their original identity, key, type and choice values. New questions belong in a deliberate native feature change.');
  }
}

export async function assertRetainedExtensionVersion(db: D1Database, formId: string, source: { draftId: string } | { sourceVersion: number }): Promise<void> {
  if (!isNativeTaskForm(formId)) return;
  const predicate = 'draftId' in source ? "id=? AND status='draft'" : "version=? AND status='published'";
  const value = 'draftId' in source ? source.draftId : source.sourceVersion;
  const row = await db.prepare(`SELECT config_json AS configJson FROM form_config_versions
    WHERE form_id=? AND HEX(form_id)=HEX(?) AND ${predicate} LIMIT 1`).bind(formId, formId, value).first<{ configJson: string }>();
  if (!row) throw new RetainedExtensionError('The original native question version is unavailable.');
  let config;
  try { config = validateFormDraft(formId, JSON.parse(row.configJson) as unknown); }
  catch { throw new FormCatalogStoredConfigError(); }
  await assertRetainedExtensionConfig(db, formId, config);
}
