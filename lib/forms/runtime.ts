import { FORM_REGISTRY } from './registry';
import type { FormAnswerSnapshot, FormId, PublishedFormConfig } from './types';
import { validateAnswersForDefinition, validateFormDraft } from './validation';

export type FormRuntimeCode = 'unknown_form' | 'config_unavailable' | 'stale_version';

export class FormRuntimeError extends Error {
  readonly retryable: boolean;
  constructor(readonly code: FormRuntimeCode, message: string) {
    super(message);
    this.name = 'FormRuntimeError';
    this.retryable = code === 'config_unavailable';
  }
}

interface PublishedRow {
  version: number;
  config_json: string;
  published_at: number;
}

export async function resolvePublishedForm(db: D1Database, formId: FormId): Promise<PublishedFormConfig> {
  if (!FORM_REGISTRY[formId]) throw new FormRuntimeError('unknown_form', 'Unknown form');
  if (!db || typeof db.prepare !== 'function') throw new FormRuntimeError('config_unavailable', 'Form configuration store unavailable');
  let row: PublishedRow | null;
  try {
    row = await db.prepare('SELECT version, config_json, published_at FROM form_config_versions WHERE form_id = ? AND status = ? ORDER BY version DESC LIMIT 1')
      .bind(formId, 'published').first<PublishedRow>();
  } catch {
    throw new FormRuntimeError('config_unavailable', 'Form configuration read failed');
  }
  if (!row || !Number.isSafeInteger(row.version) || row.version < 1 || !Number.isSafeInteger(row.published_at) || row.published_at < 0 || typeof row.config_json !== 'string' || new TextEncoder().encode(row.config_json).length > 65536) {
    throw new FormRuntimeError('config_unavailable', 'Published form configuration unavailable');
  }
  try {
    const parsed: unknown = JSON.parse(row.config_json);
    const draft = validateFormDraft(formId, parsed);
    return { ...draft, version: row.version, publishedAt: row.published_at };
  } catch {
    throw new FormRuntimeError('config_unavailable', 'Published form configuration invalid');
  }
}

export async function validateSubmittedForm(db: D1Database, formId: FormId, version: number, raw: unknown): Promise<FormAnswerSnapshot> {
  const config = await resolvePublishedForm(db, formId);
  if (!Number.isSafeInteger(version) || version !== config.version) throw new FormRuntimeError('stale_version', 'Published form version changed');
  return validateAnswersForDefinition(FORM_REGISTRY[formId], config, raw);
}
