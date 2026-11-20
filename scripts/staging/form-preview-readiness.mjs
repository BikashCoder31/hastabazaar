// Read-only check of the complete form preview, including forms outside the catalog.
import assert from 'node:assert/strict';
import { realpath } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FEATURE_MANAGED_BASELINE_FORM_IDS } from '../../lib/db/repositories/form-catalog.ts';
import { FORM_REGISTRY } from '../../lib/forms/registry.ts';
import { isFormCatalogEditable } from '../../lib/forms/catalog-presentation.ts';
import { validateFormDraft } from '../../lib/forms/validation.ts';
import { coreFormContract } from '../../lib/forms/core-contracts.ts';
import { NATIVE_TASK_FORM_IDS,PUBLIC_NATIVE_FORM_IDS } from '../../lib/forms/catalog-policy.ts';
import { FIXED_PREVIEW_FORM_IDS,PROTECTED_PREVIEW_FORM_IDS } from '../../lib/forms/preview-contracts.ts';
import { inspectCoreReceiptStorage,inspectPublicCoreReceiptStorage,inspectPublishedReceiptStorage } from '../../lib/forms/core-readiness.mjs';
import { inspectCurrentRuntimeSchema } from '../../lib/operations/runtime-schema-readiness.mjs';
import { assertHostedAuthReadinessContext, inspectHostedAuthSchema } from './hosted-auth-readiness.mjs';
import { readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';
import { locateLocalD1Database } from './local-d1.mjs';

export const REQUIRED_PREVIEW_FORM_IDS = Object.freeze([...new Set([
  ...FEATURE_MANAGED_BASELINE_FORM_IDS,
  ...NATIVE_TASK_FORM_IDS,...FIXED_PREVIEW_FORM_IDS,...PROTECTED_PREVIEW_FORM_IDS,
  ...Object.values(FORM_REGISTRY).filter(form => isFormCatalogEditable(form) || form.capabilities.answerBehavior === 'record').map(form => form.id),
])].sort());

export function inspectFormPreviewReadiness(sqlite) {
  const errors = [];
  let authReady = false;
  try {
    const auth = inspectHostedAuthSchema(sqlite);
    authReady = auth.ready;
    for (const table of auth.missing) errors.push(`Missing sign-in table: ${table}`);
  } catch (error) { errors.push(`Sign-in setup: ${error.message}`); }
  const missingForms = [];
  const invalidForms = [];
  const coreForms = [], blockedCoreForms = [],fixedForms=[],blockedFixedForms=[],blockedPublishedForms=[];
  let coreStorageProblems,publicCoreStorageProblems,publishedStorageProblems;
  let fixedSchema;
  const hasStore = Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='form_config_versions'").get());
  if (!hasStore) errors.push('Missing form settings table: form_config_versions');
  for (const formId of REQUIRED_PREVIEW_FORM_IDS) {
    let row;
    try {row = hasStore ? sqlite.prepare(`SELECT version, config_json, published_at FROM form_config_versions
      WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1`).get(formId) : null;}
    catch {invalidForms.push(formId);errors.push(`Form settings could not be read: ${formId}`);continue;}
    if(FIXED_PREVIEW_FORM_IDS.has(formId)){
      try{
        const contract=FORM_REGISTRY[formId];
        assert.equal(contract.mode,'system');assert.equal(contract.capabilities.answerBehavior,'none');
        assert.equal(contract.capabilities.customFieldTypes.length,0);
        assert.ok(contract.baseFields.every(field=>field.capability==='protected'));
        if(row){assert.ok(Number.isSafeInteger(row.version)&&row.version>0);assert.ok(Number.isSafeInteger(row.published_at)&&row.published_at>=0);assert.ok(typeof row.config_json==='string'&&Buffer.byteLength(row.config_json,'utf8')<=65536);validateFormDraft(formId,JSON.parse(row.config_json));}
        fixedSchema??=inspectCurrentRuntimeSchema(sqlite);
        if(fixedSchema.ready)fixedForms.push(formId);else blockedFixedForms.push(formId);
      }catch{blockedFixedForms.push(formId);errors.push(`Fixed native contract/storage could not be verified: ${formId}`);}
      continue;
    }
    if (!row) {
      const core=hasStore?coreFormContract(formId):null;
      if(!core){missingForms.push(formId);continue;}
      try{
        validateFormDraft(formId,{formId:core.formId,fields:core.fields});
        coreStorageProblems??=inspectCoreReceiptStorage(sqlite);
        if(PUBLIC_NATIVE_FORM_IDS.has(formId))publicCoreStorageProblems??=inspectPublicCoreReceiptStorage(sqlite);
        if(coreStorageProblems.length||(PUBLIC_NATIVE_FORM_IDS.has(formId)&&publicCoreStorageProblems.length))blockedCoreForms.push(formId);
        else coreForms.push(formId);
      }catch{blockedCoreForms.push(formId);errors.push(`Native form contract/storage could not be verified: ${formId}`);}
      continue;
    }
    try {
      assert.ok(Number.isSafeInteger(row.version) && row.version > 0);
      assert.ok(Number.isSafeInteger(row.published_at) && row.published_at >= 0);
      assert.ok(typeof row.config_json === 'string' && Buffer.byteLength(row.config_json, 'utf8') <= 65536);
      validateFormDraft(formId, JSON.parse(row.config_json));
      if(FORM_REGISTRY[formId].capabilities.answerBehavior==='record'){
        publishedStorageProblems??=inspectPublishedReceiptStorage(sqlite);
        if(publishedStorageProblems.length)blockedPublishedForms.push(formId);
      }
    } catch { invalidForms.push(formId); }
  }
  for(const problem of coreStorageProblems??[])errors.push('Native form receipt storage: '+problem);
  for(const problem of publicCoreStorageProblems??[])errors.push('Native public receipt storage: '+problem);
  for(const problem of publishedStorageProblems??[])errors.push('Published form receipt storage: '+problem);
  if(fixedSchema&&!fixedSchema.ready)errors.push('Current native schema incomplete: '+[...fixedSchema.missing,...fixedSchema.changed].join(', '));
  return { ready: authReady && hasStore && !missingForms.length && !invalidForms.length && !blockedCoreForms.length&&!blockedFixedForms.length&&!blockedPublishedForms.length,
    requiredForms: REQUIRED_PREVIEW_FORM_IDS.length,
    readyForms: REQUIRED_PREVIEW_FORM_IDS.length - missingForms.length - invalidForms.length - blockedCoreForms.length-blockedFixedForms.length-blockedPublishedForms.length,
    missingForms, invalidForms, coreForms, blockedCoreForms,fixedForms,blockedFixedForms,blockedPublishedForms,fixedSchema, errors };
}

async function main() {
  assert.equal(process.argv.length, 2, 'This check takes no arguments and never changes data.');
  const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  assertHostedAuthReadinessContext(project, process.cwd(), process.env);
  const paths = resolveDisposableStagingPaths(project, process.env);
  await readAndVerifyStagingMarker(paths);
  assert.equal(resolve(await realpath(paths.root)), paths.root, 'Staging root must remain in this checkout.');
  const databasePath = await locateLocalD1Database(paths);
  assert.ok(resolve(await realpath(databasePath)).startsWith(paths.state + sep), 'Database must remain in local staging.');
  const sqlite = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const result = inspectFormPreviewReadiness(sqlite);
    console.log(JSON.stringify({ ...result, mutations: 0 }));
    if (!result.ready) process.exitCode = 1;
  } finally { sqlite.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main();
