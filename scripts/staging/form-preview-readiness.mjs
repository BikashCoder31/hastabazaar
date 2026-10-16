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
import { assertHostedAuthReadinessContext, inspectHostedAuthSchema } from './hosted-auth-readiness.mjs';
import { readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';
import { locateLocalD1Database } from './local-d1.mjs';

export const REQUIRED_PREVIEW_FORM_IDS = Object.freeze([...new Set([
  ...FEATURE_MANAGED_BASELINE_FORM_IDS,
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
  const hasStore = Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='form_config_versions'").get());
  if (!hasStore) errors.push('Missing form settings table: form_config_versions');
  for (const formId of REQUIRED_PREVIEW_FORM_IDS) {
    const row = hasStore ? sqlite.prepare(`SELECT version, config_json, published_at FROM form_config_versions
      WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1`).get(formId) : null;
    if (!row) { missingForms.push(formId); continue; }
    try {
      assert.ok(Number.isSafeInteger(row.version) && row.version > 0);
      assert.ok(Number.isSafeInteger(row.published_at) && row.published_at >= 0);
      assert.ok(typeof row.config_json === 'string' && Buffer.byteLength(row.config_json, 'utf8') <= 65536);
      validateFormDraft(formId, JSON.parse(row.config_json));
    } catch { invalidForms.push(formId); }
  }
  return { ready: authReady && hasStore && !missingForms.length && !invalidForms.length,
    requiredForms: REQUIRED_PREVIEW_FORM_IDS.length,
    readyForms: REQUIRED_PREVIEW_FORM_IDS.length - missingForms.length - invalidForms.length,
    missingForms, invalidForms, errors };
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
