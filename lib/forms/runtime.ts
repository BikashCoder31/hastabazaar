import { FORM_REGISTRY } from './registry';
import type { FormAnswerSnapshot, FormId, PublishedFormConfig } from './types';
import { validateAnswersForDefinition, validateFormDraft } from './validation';
import { coreFormContract } from './core-contracts';

import {FormRuntimeError} from './runtime-error';
export {FormRuntimeError,type FormRuntimeCode} from './runtime-error';

interface PublishedRow {
  version: number;
  config_json: string;
  published_at: number;
}

// Server memory only; never accepts a definition supplied by the browser. A
// second authoritative query must still prove this exact definition is current.
const verifiedDefinitions = new WeakMap<D1Database, Map<FormId, { config: PublishedFormConfig; raw: string | null; verifiedAt: number }>>();
const verifiedDefinitionLifetimeMs = 60_000;

function rememberDefinition(db: D1Database, config: PublishedFormConfig, raw: string | null) {
  if (!coreFormContract(config.formId)) return;
  let definitions = verifiedDefinitions.get(db);
  if (!definitions) { definitions = new Map(); verifiedDefinitions.set(db, definitions); }
  definitions.set(config.formId, { config: structuredClone(config), raw, verifiedAt: Date.now() });
}

async function recoverVerifiedDefinition(db: D1Database, formId: FormId): Promise<PublishedFormConfig | null> {
  const cached = verifiedDefinitions.get(db)?.get(formId);
  const age = cached ? Date.now() - cached.verifiedAt : -1;
  if (!cached || age < 0 || age > verifiedDefinitionLifetimeMs) return null;
  try {
    const current = cached.raw === null
      ? await db.prepare("SELECT 1 AS valid WHERE NOT EXISTS(SELECT 1 FROM form_config_versions WHERE form_id=? AND status='published')").bind(formId).first()
      : await db.prepare(`SELECT 1 AS valid FROM form_config_versions v WHERE v.form_id=? AND v.version=? AND v.status='published'
          AND v.config_json=? AND v.version=(SELECT MAX(latest.version) FROM form_config_versions latest WHERE latest.form_id=v.form_id AND latest.status='published')`)
        .bind(formId, cached.config.version, cached.raw).first();
    return current ? cached.raw === null ? coreFormContract(formId) : structuredClone(cached.config) : null;
  } catch { return null; }
}

export async function resolvePublishedForm(db: D1Database, formId: FormId): Promise<PublishedFormConfig> {
  if (!FORM_REGISTRY[formId]) throw new FormRuntimeError('unknown_form', 'Unknown form');
  if (!db || typeof db.prepare !== 'function') throw new FormRuntimeError('config_unavailable', 'Form configuration store unavailable');
  let row: PublishedRow | null;
  try {
    row = await db.prepare('SELECT version, config_json, published_at FROM form_config_versions WHERE form_id = ? AND status = ? ORDER BY version DESC LIMIT 1')
      .bind(formId, 'published').first<PublishedRow>();
  } catch {
    const verified = await recoverVerifiedDefinition(db, formId);
    if (verified) {await observeRuntimeForm(db,formId,verified.version,'fallback','read_unavailable');return verified;}
    const reference=await observeRuntimeForm(db,formId,null,'blocked','read_unavailable');
    throw new FormRuntimeError('config_unavailable', 'Form configuration read failed',reference,'read_unavailable');
  }
  let config:PublishedFormConfig;
  try{config=decodePublishedForm(formId,row);}catch(error){
    const reference=await observeRuntimeForm(db,formId,row?.version??null,'blocked',row?'definition_invalid':'definition_unavailable');
    if(error instanceof FormRuntimeError)throw new FormRuntimeError(error.code,error.message,reference,row?'definition_invalid':'definition_unavailable');throw error;
  }
  rememberDefinition(db, config, row?.config_json ?? null);
  await observeRuntimeForm(db,formId,config.version,'compatible');
  return config;
}

/** Diagnostics cannot make a valid business action fail or turn a failure into success. */
async function observeRuntimeForm(db:D1Database,formId:FormId,version:number|null,outcome:'compatible'|'fallback'|'blocked',category?:'definition_invalid'|'definition_unavailable'|'read_unavailable'){
 try{const health=await import('../operations/form-health');return await health.recordFormLoadObservation(db,{...health.formHealthDatabaseScope(db),formId,version,outcome,category});}catch{return undefined;}
}

/** The management health view and runtime validate the same definition. */
export function decodePublishedForm(formId: FormId, row: PublishedRow | null): PublishedFormConfig {
  if (!FORM_REGISTRY[formId]) throw new FormRuntimeError('unknown_form', 'Unknown form');
  if (!row) {
    const core = coreFormContract(formId);
    if (core) return core;
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
