import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { access, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const localSettings = Object.freeze({
  HASTABAZAAR_RUNTIME_ENV: 'local_staging',
  NODE_ENV: 'development',
  APP_ORIGIN: 'http://localhost:3018',
  HASTABAZAAR_MAIL_MODE: 'capture',
  HASTABAZAAR_PAYMENT_MODE: 'simulated',
  HASTABAZAAR_RECIPIENT_DOMAIN: 'local.hastabazaar.test',
  CHECKOUT_CONTACT_POLICY: 'email_only',
  HOST: 'localhost',
  PORT: '3018',
});

const forbiddenSettings = /^(?:DEPLOY_TARGET|VERCEL(?:_.*)?|CF_PAGES(?:_.*)?|CLOUDFLARE_ENV|NODE_OPTIONS|VITE_USER_NODE_ENV|HASTABAZAAR_LOCAL_RIDER_DECODER|MEDIA_ROOT|DB_.*|DATABASE_URL|SMTP_.*|CLOUDFLARE_API_.*|CLOUDFLARE_ACCOUNT_ID|CF_API_.*|CF_ACCOUNT_ID|R2_.*|S3_.*|AWS_.*|GOOGLE_CLIENT_.*|STRIPE_.*|PAYPAL_.*|ESEWA_.*|KHALTI_.*|RESEND_.*|SENDGRID_.*|MAILGUN_.*|ORDER_EMAIL_JOB_SECRET|GIT_DIR|GIT_WORK_TREE|GIT_COMMON_DIR|GIT_CONFIG.*|GIT_INDEX_FILE|GIT_OBJECT_DIRECTORY|GIT_ALTERNATE_OBJECT_DIRECTORIES)$/;
const environmentFiles = ['.env', '.env.local', '.env.development', '.env.development.local', '.dev.vars', '.dev.vars.local', '.dev.vars.development'];

function samePath(left, right) {
  const normalize = (path) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  return normalize(left) === normalize(right);
}

export function assertLocalNodeVersion(version) {
  const parts = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!parts || Number(parts[1]) < 22 || (Number(parts[1]) === 22 && Number(parts[2]) < 13)) {
    throw new Error('Local startup requires Node.js 22.13.0 or newer.');
  }
}

export function parseLocalArguments(argumentsList) {
  if (argumentsList.length === 0) return false;
  if (argumentsList.length === 1 && argumentsList[0] === '--check') return true;
  throw new Error('Unexpected arguments. Use npm run dev or npm run local:check; host, port, and mode are fixed.');
}

/** @returns {Record<string, string | undefined>} */
export function createLocalEnvironment(environment) {
  for (const [name, rawValue] of Object.entries(environment)) {
    const value = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!value) continue;
    const upperName = name.toUpperCase();
    if (forbiddenSettings.test(upperName)) throw new Error(`${name} must be absent for the checked local preview.`);
    if ((Object.hasOwn(localSettings, upperName) || upperName === 'HASTABAZAAR_STAGING_ROOT') && name !== upperName) {
      throw new Error(`${name} must use its uppercase name for the checked local preview.`);
    }
    if (Object.hasOwn(localSettings, name) && value !== localSettings[name]) {
      throw new Error(`${name} conflicts with the checked local preview.`);
    }
  }
  const inherited = {};
  for (const [name, value] of Object.entries(environment)) {
    if (Object.hasOwn(localSettings, name.toUpperCase())) continue;
    const childName = process.platform === 'win32' ? name.toUpperCase() : name;
    if (Object.hasOwn(inherited, childName) && inherited[childName] !== value) {
      throw new Error(`Duplicate environment name ${childName} has conflicting values.`);
    }
    inherited[childName] = value;
  }
  return { ...inherited, ...localSettings };
}

function assertStagingRoot(projectRoot, environment) {
  const configured = environment.HASTABAZAAR_STAGING_ROOT?.trim();
  if (configured && !samePath(resolve(projectRoot, configured), join(projectRoot, '.staging'))) {
    throw new Error('HASTABAZAAR_STAGING_ROOT must use this project\'s .staging directory.');
  }
}

export async function verifyLocalEnvironmentFiles(projectRoot) {
  for (const name of environmentFiles) {
    let contents;
    try { contents = await readFile(join(projectRoot, name), 'utf8'); }
    catch (error) {
      if (error.code === 'ENOENT') continue;
      throw new Error(`Cannot read local environment file ${name}.`);
    }
    try {
      const values = parseEnv(contents);
      createLocalEnvironment(values);
      assertStagingRoot(projectRoot, values);
    } catch (error) { throw new Error(`${name}: ${error.message}`); }
  }
}

// Paths supplied here have already been resolved with realpath by the CLI.
export function assertLocalCheckout(checkout) {
  if (!checkout.configuredRoot || !isAbsolute(checkout.configuredRoot)) {
    throw new Error('Missing canonical project configuration: hastabazaar.localProjectRoot.');
  }
  if (!/^[a-f\d]{40}$/i.test(checkout.baseline ?? '')) {
    throw new Error('Missing or invalid approved baseline configuration: hastabazaar.localBaseline.');
  }
  for (const name of ['projectRoot', 'cwd', 'gitRoot']) {
    if (!checkout[name] || !samePath(checkout[name], checkout.configuredRoot)) {
      throw new Error('Wrong checkout or working directory. Start the canonical Desktop/Hatskala project.');
    }
  }
  if (!checkout.baselineIsAncestor) {
    throw new Error('This checkout does not contain the approved local baseline. Stop and review the selected branch.');
  }
}

async function readLocalCheckout(projectRoot, cwd) {
  const git = (args) => execFileSync('git', ['--no-optional-locks', '-C', projectRoot, ...args], {
    encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  let configuredRoot;
  let baseline;
  try {
    configuredRoot = git(['config', '--local', '--no-includes', '--get', 'hastabazaar.localProjectRoot']);
    baseline = git(['config', '--local', '--no-includes', '--get', 'hastabazaar.localBaseline']);
  } catch {
    throw new Error('Missing local Git configuration. Review hastabazaar.localProjectRoot and hastabazaar.localBaseline; do not launch another copy.');
  }
  // Reject invalid configuration before using it as a path or Git argument.
  assertLocalCheckout({ projectRoot, cwd: projectRoot, gitRoot: projectRoot, configuredRoot, baseline, baselineIsAncestor: true });
  const checkout = {
    projectRoot: await realpath(projectRoot),
    cwd: await realpath(cwd),
    configuredRoot: await realpath(configuredRoot),
    gitRoot: await realpath(git(['rev-parse', '--show-toplevel'])),
    baseline,
    head: git(['rev-parse', '--verify', 'HEAD']),
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    baselineIsAncestor: false,
  };
  const ancestry = spawnSync('git', ['--no-optional-locks', '-C', projectRoot, 'merge-base', '--is-ancestor', baseline, checkout.head], {
    windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  checkout.baselineIsAncestor = ancestry.status === 0;
  assertLocalCheckout(checkout);
  return checkout;
}

export function inspectLocalFeatureSchema(sqlite) {
  const required = {
    commission_control: ['id', 'revision'],
    commission_rate_changes: ['id', 'basis_points', 'effective_at', 'agreement_version', 'terms_text', 'reason', 'created_by', 'created_at'],
    commission_rate_cancellations: ['rate_id', 'request_id', 'reason', 'cancelled_by', 'cancelled_at'],
    commission_rate_acceptances: ['rate_id', 'seller_id', 'actor_id', 'accepted_at'],
    loyalty_revisions: ['weekly_points_json', 'grace_enabled'],
    loyalty_daily_claims: ['cycle_day', 'cycle_number', 'grace_used', 'grace_applied', 'cycle_reset_reason'],
    managed_maker_application_details: ['agreement_language', 'agreement_form_version_id'],
    seller_participation_profiles: ['accepted_managed_detail_id'],
    managed_commercial_snapshots: ['accepted_managed_detail_id', 'maker_name_snapshot', 'company_store_name_snapshot', 'company_legal_name_snapshot'],
    seller_route_transition_applications: ['registered_terms_snapshot_json'],
    managed_payout_allocations: ['payout_id', 'entitlement_id', 'amount_paisa', 'disposition', 'terminal_at', 'request_id', 'actor_id'],
  };
  const missing = [];
  for (const [table, columns] of Object.entries(required)) {
    const actual = sqlite.prepare(`PRAGMA table_info("${table}")`).all().map(row => row.name);
    if (!actual.length) missing.push(table);
    else for (const column of columns) if (!actual.includes(column)) missing.push(`${table}.${column}`);
  }
  for (const name of ['loyalty_latest_claims', 'loyalty_weekly_revision_guard', 'loyalty_weekly_claim_guard',
    'managed_allocation_one_reservation', 'managed_allocation_preserve_identity', 'managed_allocation_no_delete',
    'managed_payout_preserve_identity', 'managed_payout_no_delete', 'managed_payout_preserve_terminal',
    'managed_legacy_payout_link_no_update', 'managed_legacy_payout_link_no_delete']) {
    if (!sqlite.prepare('SELECT 1 FROM sqlite_master WHERE name=?').get(name)) missing.push(name);
  }
  if (!missing.includes('commission_control') && !sqlite.prepare("SELECT 1 FROM commission_control WHERE id='default'").get()) missing.push('commission_control.default');
  return { ready: missing.length === 0, missing };
}

export async function checkLocalData(projectRoot, environment) {
  const { assertDisposableStagingContext, readAndVerifyStagingMarker, resolveDisposableStagingPaths } = await import('./staging/guards.mjs');
  assertDisposableStagingContext(environment);
  const paths = resolveDisposableStagingPaths(projectRoot, environment);
  try {
    for (const target of [paths.root, paths.marker, paths.state]) {
      if (!samePath(await realpath(target), target)) throw new Error('Local staging paths must not redirect to another copy.');
    }
    await readAndVerifyStagingMarker(paths);
    const { locateLocalD1Database } = await import('./staging/local-d1.mjs');
    const databasePath = await locateLocalD1Database(paths);
    if (!samePath(await realpath(databasePath), databasePath)) throw new Error('Local database must not redirect to another copy.');
    const { DatabaseSync } = await import('node:sqlite');
    const { inspectFormPreviewReadiness } = await import('./staging/form-preview-readiness.mjs');
    const sqlite = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const features = inspectLocalFeatureSchema(sqlite);
      if (!features.ready) throw new Error(`Approved feature storage is incomplete: ${features.missing.join(', ')}. Review the required local upgrades separately.`);
      const readiness = inspectFormPreviewReadiness(sqlite);
      if (!readiness.ready) {
        throw new Error(`Local forms/sign-in data is incomplete: ${readiness.readyForms}/${readiness.requiredForms} forms ready. ${readiness.errors.join(' ')}`);
      }
      return { databasePath, readiness };
    } finally { sqlite.close(); }
  } catch (error) {
    throw new Error(`Local staging data check failed: ${error.message} No data was created, restored, migrated, or seeded.`);
  }
}

async function main() {
  const checkOnly = parseLocalArguments(process.argv.slice(2));
  assertLocalNodeVersion(process.versions.node);
  const environment = createLocalEnvironment(process.env);
  const projectRoot = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
  assertStagingRoot(projectRoot, environment);
  const checkout = await readLocalCheckout(projectRoot, process.cwd());
  await verifyLocalEnvironmentFiles(projectRoot);
  const data = await checkLocalData(projectRoot, environment);
  const cli = join(projectRoot, 'node_modules', 'vinext', 'dist', 'cli.js');
  try { await access(cli); }
  catch { throw new Error('Local dependencies are missing. Review the dependency setup in the canonical project.'); }

  console.log(`Project: ${checkout.projectRoot}\nBranch: ${checkout.branch}\nCommit: ${checkout.head}\nData: ${data.databasePath}\nForms: ${data.readiness.readyForms}/${data.readiness.requiredForms}; sign-in schema ready\nURL: ${environment.APP_ORIGIN}\nMode: local staging; no live email or payment services\nEmail and payment delivery are not verified by this check.`);
  if (checkOnly) {
    console.log('Local check passed. No server started; no data changed.');
    return;
  }
  // strictPort is enforced by the local-staging server settings in vite.config.ts.
  // Vinext accepts --hostname and --port, but does not implement --strictPort.
  const child = spawn(process.execPath, [cli, 'dev', '--hostname', 'localhost', '--port', '3018'], {
    cwd: projectRoot, env: environment, shell: false, windowsHide: true, stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => child.kill(signal));
  child.once('error', () => { console.error('Local server could not start.'); process.exitCode = 1; });
  child.once('exit', (code, signal) => { process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1); });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { await main(); }
  catch (error) { console.error(`Local startup stopped: ${error.message}`); process.exitCode = 1; }
}
