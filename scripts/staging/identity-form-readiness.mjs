// Explicit feature-managed form initialization for marked disposable local staging.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, realpath, unlink } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initializeFeatureManagedForms, FEATURE_MANAGED_BASELINE_FORM_IDS } from '../../lib/db/repositories/form-catalog.ts';
import { validateFormDraft } from '../../lib/forms/validation.ts';
import { assertHostedAuthReadinessContext } from './hosted-auth-readiness.mjs';
import { readAndVerifyStagingMarker, resolveDisposableStagingPaths } from './guards.mjs';
import { locateLocalD1Database } from './local-d1.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const actorId = 'local-test-super-admin';
const baselineInput = Object.freeze({ actorId, actorRole: 'super_admin',
  reason: 'SIMULATED required feature-managed form baselines — NOT VALID FOR PRODUCTION',
  requestId: 'local-staging-feature-managed-v1' });

export function inspectIdentityFormReadiness(sqlite) {
  const actor = sqlite.prepare(`SELECT 1 AS allowed FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='super_admin' LIMIT 1`)
    .get(actorId, actorId);
  const forms = FEATURE_MANAGED_BASELINE_FORM_IDS.map((formId) => {
    const current = sqlite.prepare(`SELECT version,config_json,published_at FROM form_config_versions
      WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1`).get(formId);
    if (current) {
      assert.ok(Number.isSafeInteger(current.version) && current.version > 0
        && Number.isSafeInteger(current.published_at) && current.published_at >= 0,
      `${formId} publication metadata is invalid.`);
      validateFormDraft(formId, JSON.parse(current.config_json));
    }
    const history = sqlite.prepare('SELECT 1 AS found FROM form_config_versions WHERE form_id=? LIMIT 1').get(formId);
    return { formId, publishedVersion: current?.version ?? 0, blocked: !current && Boolean(history) };
  });
  return { ready: forms.every((form) => form.publishedVersion > 0), actorReady: Boolean(actor),
    missing: forms.filter((form) => form.publishedVersion === 0).map((form) => form.formId),
    blocked: forms.filter((form) => form.blocked).map((form) => form.formId), forms };
}

function databaseAdapter(sqlite) {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...next) { values = next; return this; },
        async first() { return statement.get(...values) ?? null; },
        async all() { return { results: statement.all(...values) }; },
        async run() { return { success: true, results: [], meta: { changes: Number(statement.run(...values).changes) } }; },
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  };
}

/** Caller supplies an already guarded disposable database and exclusive backup destination. */
export async function prepareIdentityFormBaselines(sqlite, backupFile, now = Date.now()) {
  const before = inspectIdentityFormReadiness(sqlite);
  assert.ok(before.actorReady, 'The existing active fictional Super Admin is required; bootstrap never creates or repairs its authority.');
  assert.equal(before.blocked.length, 0, 'Existing draft-only feature-managed history must be resolved before initialization.');
  if (before.ready) return { ready: true, created: [], preserved: before.forms.map((form) => form.formId), backup: null };
  assert.ok(Number.isSafeInteger(now) && now >= 0, 'Initialization timestamp is invalid.');
  const reserved = await open(backupFile, 'wx', 0o600);
  await reserved.close();
  try { sqlite.prepare('VACUUM INTO ?').run(backupFile); }
  catch (error) { await unlink(backupFile); throw error; }
  const result = await initializeFeatureManagedForms(databaseAdapter(sqlite), { ...baselineInput, now });
  assert.equal(inspectIdentityFormReadiness(sqlite).ready, true);
  return { ready: true, created: result.created.map((form) => form.formId),
    preserved: result.preserved.map((form) => form.formId), backup: backupFile };
}

export async function runIdentityFormReadiness(projectRoot, cwd, environment, mode = '--plan') {
  assert.ok(['--plan', '--apply'].includes(mode), 'Use --plan or --apply.');
  assertHostedAuthReadinessContext(projectRoot, cwd, environment);
  const paths = resolveDisposableStagingPaths(projectRoot, environment);
  await readAndVerifyStagingMarker(paths);
  assert.equal(resolve(await realpath(paths.root)), paths.root, 'Staging root must not redirect to another checkout.');
  const databasePath = await locateLocalD1Database(paths);
  assert.ok(resolve(await realpath(databasePath)).startsWith(paths.state + sep), 'Database must remain in this checkout local staging state.');
  const sqlite = new DatabaseSync(databasePath, { readOnly: mode === '--plan' });
  try {
    const names = (await readdir(join(projectRoot, 'drizzle'))).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
    const tracked = sqlite.prepare('SELECT name FROM _hastabazaar_local_migrations ORDER BY name').all().map((row) => row.name);
    assert.deepEqual(tracked, names, 'All local migrations must already be tracked; identity readiness never migrates.');
    const before = inspectIdentityFormReadiness(sqlite);
    if (mode === '--plan') return { mode, ...before, mutations: 0, productionBootstrapCertified: false };
    await mkdir(paths.recovery, { recursive: true });
    assert.equal(resolve(await realpath(paths.recovery)), paths.recovery, 'Recovery directory must remain in this checkout staging state.');
    const result = await prepareIdentityFormBaselines(sqlite,
      join(paths.recovery, `before-feature-managed-forms-${randomUUID()}.sqlite`));
    return { mode, ...result, backup: result.backup ? relative(projectRoot, result.backup) : null,
      usersCreated: 0, rolesGranted: 0, productionBootstrapCertified: false };
  } finally { sqlite.close(); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  assert.ok(process.argv.length <= 3, 'Use --plan or --apply without additional arguments.');
  console.log(JSON.stringify(await runIdentityFormReadiness(project, process.cwd(), process.env, process.argv[2])));
}
