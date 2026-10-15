import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath, access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync, backup } from 'node:sqlite';
import { createLocalEnvironment, assertLocalCheckout, verifyLocalEnvironmentFiles } from '../start-local.mjs';
import { assertDisposableStagingContext, resolveDisposableStagingPaths, readAndVerifyStagingMarker } from './guards.mjs';
import { locateLocalD1Database } from './local-d1.mjs';

export const readinessMigration = '0071_company_store_maker_readiness.sql';
export const readinessForms = Object.freeze(['seller.managed-terms-acceptance', 'staff.managed-eligibility-release',
  'staff.managed-payout-preparation', 'staff.managed-payout-action']);
const quote = name => `"${name.replaceAll('"', '""')}"`;
const sha = value => createHash('sha256').update(value).digest('hex');

export async function readReadinessManifest(root) {
  const manifest = JSON.parse(await readFile(resolve(root, 'scripts/staging/company-store-readiness-manifest.json'), 'utf8'));
  const sql = await readFile(resolve(root, 'drizzle', readinessMigration), 'utf8');
  if (manifest.migration !== readinessMigration || manifest.sqlSha256 !== sha(sql) ||
    JSON.stringify(manifest.forms) !== JSON.stringify(readinessForms)) throw new Error('Reviewed upgrade manifest differs from the exact SQL or form list.');
  return { ...manifest, sql, approval: sha(JSON.stringify(manifest)) };
}

export function existingRecordSnapshot(sqlite) {
  return sqlite.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all()
    .filter(({ name }) => name !== '_cf_METADATA').map(({ name }) => ({ table: name,
      columns: sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all().map(column => column.name),
      rows: sqlite.prepare(`SELECT * FROM ${quote(name)}`).all().map(row => ({ ...row })),
    }));
}

export function assertExistingRecordsPreserved(sqlite, snapshot) {
  for (const { table, columns, rows } of snapshot) {
    const current = sqlite.prepare(`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`).all();
    const counts = new Map();
    for (const row of current) { const key = JSON.stringify(row); counts.set(key, (counts.get(key) ?? 0) + 1); }
    for (const row of rows) {
      const key = JSON.stringify(row), n = counts.get(key) ?? 0;
      if (!n) throw new Error(`An existing record changed in ${table}.`);
      counts.set(key, n - 1);
    }
  }
}

export function inspectReadinessUpgrade(sqlite, actorId) {
  if (!sqlite.prepare(`SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id
    WHERE u.id=? AND u.status='active' AND r.role='super_admin'`).get(actorId)) throw new Error('An existing active Super Admin actor is required.');
  const columns = sqlite.prepare('PRAGMA table_info(managed_maker_application_details)').all();
  if (!columns.length) throw new Error('Expected existing maker identity storage is missing.');
  const upgraded = columns.some(column => column.name === 'agreement_form_version_id');
  const hasAllocations = Boolean(sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='managed_payout_allocations'").get());
  const expected = [
    ['managed_maker_application_details', 'agreement_language'], ['managed_maker_application_details', 'agreement_form_version_id'],
    ['seller_participation_profiles', 'accepted_managed_detail_id'], ['managed_commercial_snapshots', 'accepted_managed_detail_id'],
    ['managed_commercial_snapshots', 'maker_name_snapshot'], ['managed_commercial_snapshots', 'company_store_name_snapshot'],
    ['managed_commercial_snapshots', 'company_legal_name_snapshot'],
    ['seller_route_transition_applications', 'registered_terms_snapshot_json'],
  ].map(([table, column]) => sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all().some(row => row.name === column));
  if ((upgraded || hasAllocations || expected.some(Boolean)) && !(hasAllocations && expected.every(Boolean)))
    throw new Error('Partial readiness schema detected. Review it separately.');
  if (upgraded && ['managed_allocation_preserve_identity','managed_allocation_no_delete','managed_payout_preserve_identity',
    'managed_payout_no_delete','managed_payout_preserve_terminal','managed_legacy_payout_link_no_update','managed_legacy_payout_link_no_delete']
    .some(name => !sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='trigger' AND name=?").get(name)))
    throw new Error('Partial readiness history guards detected. Review them separately.');
  const missingForms = [];
  for (const formId of readinessForms) {
    const rows = sqlite.prepare('SELECT status FROM form_config_versions WHERE form_id=?').all(formId);
    if (rows.some(row => row.status === 'draft')) throw new Error(`An existing unpublished draft requires review: ${formId}.`);
    if (!rows.some(row => row.status === 'published')) missingForms.push(formId);
  }
  return { migrationNeeded: !upgraded, missingForms };
}

/** Deliberate upgrade only; never called by the launcher. CLI adds canonical, backup and approval guards. */
export function applyReadinessUpgrade(sqlite, manifest, actorId, now) {
  const plan = inspectReadinessUpgrade(sqlite, actorId);
  const previous = existingRecordSnapshot(sqlite);
  if (!plan.migrationNeeded && !plan.missingForms.length) return { migrations: 0, forms: 0, audits: 0 };
  sqlite.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  try {
    if (plan.migrationNeeded) {
      sqlite.exec(manifest.sql);
      sqlite.exec('CREATE TABLE IF NOT EXISTS _hastabazaar_local_migrations(name TEXT PRIMARY KEY NOT NULL,applied_at INTEGER NOT NULL)');
      sqlite.prepare('INSERT INTO _hastabazaar_local_migrations(name,applied_at) VALUES(?,?)').run(readinessMigration, now);
    }
    for (const formId of plan.missingForms) {
      const requestId = `company-store-readiness-v1:${formId}`;
      const versionId = `company-store-readiness-v1:${formId}:1`;
      sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,
        created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES(?,?,1,'published',?,'Reviewed additive company-store readiness upgrade',?,?,?,?,?,?,?)`)
        .run(versionId, formId, JSON.stringify({ formId, fields: [] }), actorId, now, actorId, now, actorId, now, requestId);
      sqlite.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at)
        VALUES(?,?,'form.config.published','form_config',?,'Reviewed local readiness form initialization',?,?,?)`)
        .run(`${requestId}:audit`, actorId, versionId, JSON.stringify({ formId, version: 1, fields: [], migration: readinessMigration }), requestId, now);
    }
    assertExistingRecordsPreserved(sqlite, previous);
    if (sqlite.prepare('PRAGMA foreign_key_check').all().length || sqlite.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw new Error('Upgraded database integrity failed.');
    sqlite.exec('COMMIT');
    return { migrations: Number(plan.migrationNeeded), forms: plan.missingForms.length, audits: plan.missingForms.length };
  } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
}

async function main() {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--mode', '--actor', '--backup', '--approve'].includes(key) || options[key] || !args[index + 1]) throw new Error('Use explicit mode, actor, backup and approval arguments.');
    options[key] = args[index + 1];
  }
  if (!['check', 'rehearse', 'apply'].includes(options['--mode'])) throw new Error('Choose check, rehearse or apply.');
  const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '../..'));
  const git = args => execFileSync('git', ['--no-optional-locks', '-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
  const configuredRoot = await realpath(git(['config', '--local', '--no-includes', '--get', 'hastabazaar.localProjectRoot']));
  const baseline = git(['config', '--local', '--no-includes', '--get', 'hastabazaar.localBaseline']);
  let baselineIsAncestor = false;
  if (/^[a-f0-9]{40}$/.test(baseline)) { try { git(['merge-base', '--is-ancestor', baseline, 'HEAD']); baselineIsAncestor = true; } catch { /* deny */ } }
  assertLocalCheckout({ projectRoot: root, cwd: await realpath(process.cwd()), gitRoot: await realpath(git(['rev-parse', '--show-toplevel'])), configuredRoot, baseline, baselineIsAncestor });
  const environment = createLocalEnvironment(process.env);
  assertDisposableStagingContext(environment);
  await verifyLocalEnvironmentFiles(root);
  const paths = resolveDisposableStagingPaths(root, environment);
  await readAndVerifyStagingMarker(paths);
  const databasePath = await locateLocalD1Database(paths);
  if ((await realpath(databasePath)).toLowerCase() !== databasePath.toLowerCase()) throw new Error('Database path redirects outside the expected location.');
  const manifest = await readReadinessManifest(root);
  const source = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const plan = inspectReadinessUpgrade(source, options['--actor']);
    console.log(JSON.stringify({ mode: options['--mode'], source: databasePath, plan, manifestApproval: manifest.approval, sqlSha256: manifest.sqlSha256 }, null, 2));
    if (options['--mode'] === 'check') return;
    const target = options['--backup'] && resolve(options['--backup']);
    if (!target || target.toLowerCase().startsWith(paths.state.toLowerCase())) throw new Error('A new backup path outside active state is required.');
    try { await access(target); throw new Error('Backup destination already exists.'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (options['--mode'] === 'apply' && options['--approve'] !== manifest.approval) throw new Error('Exact reviewed manifest approval is required before active apply.');
    // A consistent SQLite backup includes committed WAL data. Never copy the live file directly.
    await backup(source, target);
    const destination = options['--mode'] === 'rehearse' ? target : databasePath;
    const writable = new DatabaseSync(destination);
    try { console.log(JSON.stringify({ destination, backup: target, result: applyReadinessUpgrade(writable, manifest, options['--actor'], Date.now()) }, null, 2)); }
    finally { writable.close(); }
  } finally { source.close(); }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); } catch (error) { console.error(`Readiness upgrade stopped: ${error.message}`); process.exitCode = 1; }
}
