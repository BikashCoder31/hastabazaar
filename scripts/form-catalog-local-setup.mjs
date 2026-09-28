// Explicit, disposable local-staging QA preparation. Never starts a server,
// migrates, resets, submits checkout, or sends a notification.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INCENTIVE_FORM_IDS } from '../lib/incentives/forms.ts';

import {
  assertDisposableStagingContext,
  readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
} from './staging/guards.mjs';
import { locateLocalD1Database } from './staging/local-d1.mjs';

const APPROVED_CHECKOUT = resolve('C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala');
async function main() {
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assert.equal(project, APPROVED_CHECKOUT, 'QA setup is restricted to the approved isolated checkout.');
assert.equal(resolve(process.cwd()), APPROVED_CHECKOUT, 'Run from the approved checkout root.');
assertDisposableStagingContext(process.env);
const paths = resolveDisposableStagingPaths(project, process.env);
await readAndVerifyStagingMarker(paths);
const origin = new URL(process.env.APP_ORIGIN);
assert.equal(origin.protocol, 'http:', 'Loopback HTTP is required.');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Loopback host is required.');
assert.equal(origin.pathname + origin.search + origin.hash, '/', 'APP_ORIGIN must be a bare origin.');
assert.equal(origin.username + origin.password, '', 'APP_ORIGIN cannot contain credentials.');
assert.ok(process.version.startsWith('v22.') && Number(process.versions.node.split('.')[1]) >= 13,
  'Node 22.13 or later in the Node 22 line is required.');

const modes = new Set(['--plan', '--publish-matrix-configs', '--publish-incentive-configs', '--prepare-buyer-cart']);
const mode = process.argv[2];
assert.ok(modes.has(mode) && process.argv.length === 3,
  'Explicitly select --plan, --publish-matrix-configs, --publish-incentive-configs, or --prepare-buyer-cart.');

const databasePath = await locateLocalD1Database(paths);
assert.ok(resolve(databasePath).startsWith(`${paths.state}${sep}`), 'D1 escaped disposable state.');
assert.equal(await realpath(databasePath), databasePath, 'D1 path cannot redirect outside marked state.');
const db = new DatabaseSync(databasePath, { readOnly: true });
const matrixFormIds = Object.freeze([
  'public.contact', 'account.privacy-request', 'account.profile',
  'seller.product-submission', 'rider.application', 'staff.catalog',
  'identity.login-password', 'commerce.checkout',
]);
const fictionalBuyer = 'local-test-buyer';
const fictionalSellerProfile = 'local-test-seller-profile';
let readiness;
let product;
try {
  const migrations = new Set(db.prepare('SELECT name FROM _hastabazaar_local_migrations')
    .all().map((row) => row.name));
  const migrationFiles = (await readdir(join(project, 'drizzle')))
    .filter((name) => /^\d{4}_.+\.sql$/.test(name));
  assert.ok(migrationFiles.every((name) => migrations.has(name)), 'Local D1 has pending migrations.');
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all().map((row) => row.name));
  for (const name of ['form_config_versions', 'form_answer_sets', 'users', 'products', 'orders', 'carts'])
    assert.ok(tables.has(name), `Local D1 lacks ${name}.`);
  const roles = ['local-test-customer', fictionalBuyer, 'local-test-rider',
    'local-test-seller', 'local-test-admin', 'local-test-super-admin'];
  const active = db.prepare(`SELECT COUNT(*) AS count FROM users WHERE status='active'
    AND id IN (${roles.map(() => '?').join(',')})`).get(...roles).count;
  assert.equal(active, roles.length, 'Fictional local roles are missing.');
  product = db.prepare(`SELECT id,slug,inventory_quantity AS inventory
    FROM products WHERE seller_id=? AND status='published' AND name_en LIKE 'SIMULATED %'
    AND inventory_quantity>0`).all(fictionalSellerProfile);
  readiness = {
    migrations: migrations.size,
    publishedConfigs: db.prepare("SELECT COUNT(*) AS count FROM form_config_versions WHERE status='published'").get().count,
    catalogDrafts: db.prepare("SELECT COUNT(*) AS count FROM form_config_versions WHERE status='draft'").get().count,
    orders: db.prepare('SELECT COUNT(*) AS count FROM orders').get().count,
    buyerCarts: db.prepare('SELECT COUNT(*) AS count FROM carts WHERE user_id=?').get(fictionalBuyer).count,
    fictionalPublishedProducts: product.length,
  };
} finally { db.close(); }

function localUrl(path) {
  assert.ok(path.startsWith('/') && !path.startsWith('//'), 'Only local absolute paths are allowed.');
  const url = new URL(path, origin);
  assert.equal(url.origin, origin.origin, 'Cross-origin request blocked.');
  return url;
}

async function localRequest(path, { method = 'GET', cookie, json, form } = {}) {
  const headers = new Headers();
  if (cookie) headers.set('Cookie', cookie);
  if (method !== 'GET') headers.set('Origin', origin.origin);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  if (form !== undefined) headers.set('Content-Type', 'application/x-www-form-urlencoded');
  const response = await fetch(localUrl(path), {
    method, headers, redirect: 'manual', signal: AbortSignal.timeout(10_000),
    ...(json !== undefined ? { body: JSON.stringify(json) } : {}),
    ...(form !== undefined ? { body: new URLSearchParams(form) } : {}),
  });
  assert.equal(new URL(response.url).origin, origin.origin, 'Response changed origin.');
  return response;
}

async function responseJson(response, label, expectedStatus = 200) {
  if (response.status !== expectedStatus)
    throw new Error(`${label} returned ${response.status}; inspect local response and current state before retrying.`);
  const value = await response.json().catch(() => null);
  assert.ok(value && typeof value === 'object' && !Array.isArray(value),
    `${label} returned an ambiguous response; inspect local state before retrying.`);
  return value;
}

function cookieValue(response, name) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie() : [response.headers.get('set-cookie') ?? ''];
  const hit = values.find((value) => value.startsWith(`${name}=`));
  assert.ok(hit, `${name} cookie was not returned.`);
  return hit.split(';', 1)[0];
}

async function serverReady() {
  const health = await localRequest('/health/live');
  assert.equal(health.status, 200, 'Expected loopback staging health endpoint.');
  const page = await localRequest('/local-testing');
  assert.equal(page.status, 200, 'Local-only role switch is unavailable.');
  assert.match(await page.text(), /Test every HastaBazaar interface/,
    'The loopback server is not the expected local test app.');
}

async function roleCookie(role) {
  const response = await localRequest('/api/local-testing/session', {
    method: 'POST', form: { role },
  });
  assert.equal(response.status, 303, `Fictional ${role} local role was not accepted.`);
  assert.equal(new URL(response.headers.get('location'), origin).origin, origin.origin,
    'Local role redirected outside loopback.');
  return cookieValue(response, 'hastabazaar_local_test_role');
}

async function publishMatrixConfigs() {
  await serverReady();
  const cookie = await roleCookie('super_admin');
  const listing = await responseJson(await localRequest('/api/admin/forms', { cookie }), 'Catalog list');
  assert.ok(Array.isArray(listing.forms), 'Catalog list lacks forms.');
  const byId = new Map(listing.forms.map((entry) => [entry.definition?.id, entry]));
  for (const formId of matrixFormIds) {
    const row = byId.get(formId);
    assert.ok(row && row.definition?.adapterId === formId &&
      row.definition?.capabilities?.answerBehavior === 'record',
      `${formId} must have a connected recording adapter before publication.`);
    assert.ok(Number.isSafeInteger(row.publishedVersion) && row.publishedVersion >= 0,
      `${formId} has an invalid publication version.`);
    assert.equal(row.draftVersion ?? 0, 0,
      `${formId} has an existing draft. Resolve it in the Super Admin editor before running setup.`);
  }
  for (const formId of matrixFormIds) {
    const current = byId.get(formId);
    if (current.publishedVersion > 0) continue;
    const reason = 'SIMULATED local browser QA baseline for ' + formId;
    const draft = await responseJson(await localRequest(
      `/api/admin/forms/${encodeURIComponent(formId)}/draft`, {
        method: 'POST', cookie,
        json: { requestId: randomUUID(), reason, expectedPublishedVersion: 0,
          config: { formId, fields: [] } },
      }), `${formId} draft`, 201);
    assert.ok(typeof draft.draft?.id === 'string' &&
      Number.isSafeInteger(draft.draft?.revision),
      `${formId} draft response is ambiguous; inspect the catalog before retrying.`);
    const published = await responseJson(await localRequest(
      `/api/admin/forms/${encodeURIComponent(formId)}/publish`, {
        method: 'POST', cookie,
        json: { requestId: randomUUID(), reason,
          expectedPublishedVersion: 0, draftId: draft.draft.id,
          expectedDraftRevision: draft.draft.revision },
      }), `${formId} publication`);
    assert.ok(published.published?.status === 'published' &&
      published.published?.id === draft.draft.id && published.published?.version === 1,
      `${formId} publication response is ambiguous; inspect the catalog before retrying.`);
    process.stdout.write(`Published local ${formId} v1.\n`);
  }
}

async function prepareBuyerCart() {
  assert.equal(product.length, 1,
    'Expected exactly one in-stock SIMULATED product owned by the fictional approved seller.');
  const statePath = resolve(paths.root, 'form-catalog-qa-buyer-cookies.json');
  assert.ok(statePath.startsWith(`${paths.root}${sep}`), 'Cookie state escaped .staging.');
  try {
    await readFile(statePath);
    throw new Error('A buyer cart cookie state already exists. Inspect it and the cart; no new attempt was made.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  await serverReady();
  const buyer = await roleCookie('buyer');
  const initial = await localRequest('/api/cart', { cookie: buyer });
  await responseJson(initial, 'Buyer cart');
  const cart = cookieValue(initial, 'hastabazaar_cart');
  const response = await localRequest('/api/cart', {
    method: 'POST', cookie: `${buyer}; ${cart}`,
    json: { productId: product[0].id, quantity: 1 },
  });
  const body = await responseJson(response, 'Buyer add-to-cart');
  assert.ok(Array.isArray(body.items) &&
    body.items.some((item) => item.productId === product[0].id && item.quantity >= 1),
    'Cart response did not confirm the fictional product. Inspect state before retrying.');
  // Opaque local cart token is kept only in ignored .staging. Never log it.
  const cookies = [buyer, cart].map((pair) => {
    const split = pair.indexOf('=');
    return { name: pair.slice(0, split), value: pair.slice(split + 1),
      domain: origin.hostname, path: '/', httpOnly: true, secure: false,
      sameSite: pair.startsWith('hastabazaar_cart=') ? 'Lax' : 'Strict' };
  });
  await writeFile(statePath, JSON.stringify({ schemaVersion: 1, cookies }) + '\n',
    { flag: 'wx', mode: 0o600 });
  process.stdout.write(`Prepared fictional product ${product[0].id} in one local buyer cart.\n`);
  process.stdout.write(`Browser cookie state: ${relative(project, statePath)} (opaque; keep local).\n`);
}

if (mode === '--plan') {
  process.stdout.write(JSON.stringify({
    checkout: relative(project, paths.root), database: relative(project, databasePath),
    ...readiness, matrixFormIds, incentivePhase: 'promo',
    incentiveFormIds: [INCENTIVE_FORM_IDS.promoCode, INCENTIVE_FORM_IDS.promoQuote],
    pendingContract: 'Order/assignment requires a real checkout and staff parcel workflow; this script never fabricates an order, answer, audit, or rider assignment.',
  }, null, 2) + '\n');
} else if (mode === '--publish-matrix-configs') await publishMatrixConfigs();
else if (mode === '--publish-incentive-configs') {
    let cookie;
    const result = await initializeIncentiveConfigs({
      projectRoot: project,
      environment: process.env,
      request: async (path, options) => {
        if (!cookie) {
          await serverReady();
          cookie = 'hastabazaar_local_test_role=super_admin';
        }
        return responseJson(
          await localRequest(path, { ...options, cookie }),
          path,
          path.endsWith('/draft') ? 201 : 200,
        );
      },
      readSnapshot: async () => readIncentiveSetupSnapshot(databasePath),
    });
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else await prepareBuyerCart();
}


/** This read-only preflight must finish before an injected API can be called. */
export async function verifyIncentiveSetupContext({
  environment,
  projectRoot,
}) {
  assertDisposableStagingContext(environment);
  const origin = new URL(environment.APP_ORIGIN);
  assert.equal(origin.protocol, 'http:', 'Loopback HTTP is required.');
  assert.ok(
    ['localhost', '127.0.0.1'].includes(origin.hostname),
    'Loopback host is required.',
  );
  assert.equal(
    origin.pathname + origin.search + origin.hash,
    '/',
    'APP_ORIGIN must be bare.',
  );
  assert.equal(
    origin.username + origin.password,
    '',
    'Origin credentials are forbidden.',
  );
  const paths = resolveDisposableStagingPaths(projectRoot, environment);
  await readAndVerifyStagingMarker(paths);
  assert.equal(
    await realpath(paths.root),
    paths.root,
    'Staging root cannot be a symlink.',
  );
  assert.equal(
    await realpath(paths.state),
    paths.state,
    'Staging state cannot be a symlink.',
  );
  return { paths, origin };
}

export function readIncentiveSetupSnapshot(databasePath) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = [
      'users',
      'user_roles',
      'seller_profiles',
      'products',
      'orders',
      'order_items',
      'carts',
      'cart_items',
      'wallet_accounts',
      'wallet_entries',
      'promo_campaigns',
      'promo_revisions',
      'promo_redemptions',
      'promo_customer_usage',
      'order_email_jobs',
      'seller_restrictions',
      'seller_restriction_events',
      'seller_ledger_entries',
    ];
    const present = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type='table'")
        .all()
        .map((r) => r.name),
    );
    const domain = Object.fromEntries(
      tables
        .filter((t) => present.has(t))
        .map((t) => [
          t,
          db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all(),
        ]),
    );
    return {
      published: db
        .prepare(
          "SELECT * FROM form_config_versions WHERE status='published' ORDER BY id",
        )
        .all(),
      domain,
    };
  } finally {
    db.close();
  }
}

/** Initialize only actual connected promo receivers; contracts alone never imply readiness. */
export async function initializeIncentiveConfigs({
  environment,
  projectRoot,
  request,
  readSnapshot,
  phase = 'promo',
}) {
  await verifyIncentiveSetupContext({ environment, projectRoot });
  assert.equal(
    phase,
    'promo',
    'Combined initialization is reserved for Task 12.',
  );
  const before = await readSnapshot();
  const listing = await request('/api/admin/forms');
  assert.ok(Array.isArray(listing.forms), 'Catalog must return forms.');
  const byId = new Map(listing.forms.map((row) => [row.definition?.id, row]));
  assert.equal(
    byId.size,
    listing.forms.length,
    'Catalog contains duplicate IDs.',
  );
  const actualIds = [
    INCENTIVE_FORM_IDS.promoCode,
    INCENTIVE_FORM_IDS.promoQuote,
  ];
  const absentFutureIds = Object.values(INCENTIVE_FORM_IDS).filter(
    (id) => !byId.has(id),
  );
  for (const formId of actualIds) {
    const row = byId.get(formId);
    const expectedBehavior =
      formId === INCENTIVE_FORM_IDS.promoCode ? 'record' : 'none';
    assert.ok(
      row &&
        row.definition.adapterId === formId &&
        row.definition.capabilities?.answerBehavior === expectedBehavior,
      `${formId} must have its actual connected adapter.`,
    );
    if (expectedBehavior === 'none')
      assert.deepEqual(
        row.definition.capabilities.customFieldTypes,
        [],
        `${formId} cannot accept custom questions or answers.`,
      );
    assert.ok(
      Number.isSafeInteger(row.publishedVersion) && row.publishedVersion >= 0,
      `${formId} has an invalid published version.`,
    );
    if (row.publishedVersion === 0)
      assert.equal(
        row.draftVersion ?? 0,
        0,
        `${formId} already has an unpublished draft; resolve it before setup.`,
      );
  }
  const initializedFormIds = [];
  for (const formId of actualIds) {
    if (byId.get(formId).publishedVersion > 0) continue;
    const reason =
      'SIMULATED local incentive presentation baseline for ' + formId;
    const draft = await request(
      `/api/admin/forms/${encodeURIComponent(formId)}/draft`,
      {
        method: 'POST',
        json: {
          requestId: randomUUID(),
          reason,
          expectedPublishedVersion: 0,
          config: { formId, fields: [] },
        },
      },
    );
    assert.ok(
      typeof draft.draft?.id === 'string' &&
        Number.isSafeInteger(draft.draft.revision),
      `${formId} returned an ambiguous draft; inspect before retrying.`,
    );
    const publication = await request(
      `/api/admin/forms/${encodeURIComponent(formId)}/publish`,
      {
        method: 'POST',
        json: {
          requestId: randomUUID(),
          reason,
          expectedPublishedVersion: 0,
          draftId: draft.draft.id,
          expectedDraftRevision: draft.draft.revision,
        },
      },
    );
    assert.ok(
      publication.published?.status === 'published' &&
        publication.published.id === draft.draft.id &&
        publication.published.version === 1,
      `${formId} returned an ambiguous publication; inspect before retrying.`,
    );
    initializedFormIds.push(formId);
  }
  const after = await readSnapshot();
  assert.deepEqual(
    after.published.filter((row) =>
      before.published.some((old) => old.id === row.id),
    ),
    before.published,
    'Existing published configurations changed.',
  );
  assert.deepEqual(
    after.domain,
    before.domain,
    'Configuration setup changed business domain state.',
  );
  const current = await request('/api/admin/forms');
  const missingFormIds = actualIds.filter(
    (id) =>
      !current.forms.some(
        (row) => row.definition?.id === id && row.publishedVersion > 0,
      ),
  );
  assert.deepEqual(
    missingFormIds,
    [],
    'Connected incentive forms remain uninitialized.',
  );
  return {
    phase,
    initializedFormIds,
    missingFormIds,
    absentFutureIds,
    domainMutationCount: 0,
    existingPublishedPreserved: before.published.length,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
