// Disposable local-staging browser QA. Does not start a server, migrate, seed or send mail.
// --flow-profile intentionally writes only to the guarded disposable local catalog/profile.
// Browser plugin not available in this task; use existing Playwright/Chromium via env paths.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertDisposableStagingContext, readAndVerifyStagingMarker,
  resolveDisposableStagingPaths,
} from './staging/guards.mjs';
import { locateLocalD1Database } from './staging/local-d1.mjs';
import { assertApprovedFormCatalogCheckout, assertUnusedProfileQaRun, assertPublishedMatrixVersion } from './staging/form-catalog-qa-guards.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
assertApprovedFormCatalogCheckout(project, process.cwd());
assertDisposableStagingContext(process.env);
const paths = resolveDisposableStagingPaths(project, process.env);
await readAndVerifyStagingMarker(paths);
const origin = new URL(process.env.APP_ORIGIN);
assert.equal(origin.protocol, 'http:', 'Browser QA requires loopback HTTP.');
assert.ok(['localhost', '127.0.0.1'].includes(origin.hostname), 'Loopback host required.');
assert.equal(origin.pathname, '/', 'APP_ORIGIN must have no path.');
assert.equal(origin.search + origin.hash, '', 'APP_ORIGIN must have no query or fragment.');
assert.equal(origin.username + origin.password, '', 'APP_ORIGIN must not contain credentials.');

const widths = [232, 390, 722, 1024, 1440, 1920];
const audiences = ['public', 'customer', 'account', 'seller', 'rider', 'staff',
  'super_admin', 'auth', 'checkout'];
const roles = new Set(['customer', 'buyer', 'rider', 'seller', 'admin', 'super_admin']);
const output = join(paths.root, 'artifacts', 'form-catalog');
const mode = process.argv[2] ?? '--preflight';
assert.ok(['--preflight', '--matrix', '--flow-profile'].includes(mode),
  'Use --preflight, --matrix, or --flow-profile.');

function insideStaging(path) {
  const absolute = resolve(path);
  assert.ok(absolute.startsWith(`${paths.root}${sep}`), 'Fixture/evidence path escaped .staging.');
  return absolute;
}

function localUrl(path) {
  assert.ok(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//'),
    'Fixture route must be a local absolute path.');
  const url = new URL(path, origin);
  assert.equal(url.origin, origin.origin, 'Fixture route changed origin.');
  return url.href;
}

function readSchema() {
  const databasePath = insideStagingSync();
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all().map((row) => row.name));
    const tracked = tables.has('_hastabazaar_local_migrations')
      ? new Set(db.prepare('SELECT name FROM _hastabazaar_local_migrations')
        .all().map((row) => row.name)) : new Set();
    const roleIds = ['local-test-customer', 'local-test-buyer', 'local-test-rider',
      'local-test-seller', 'local-test-admin', 'local-test-super-admin'];
    const seeded = tables.has('users') ? db.prepare(`SELECT id FROM users WHERE id IN
      (${roleIds.map(() => '?').join(',')}) AND status='active'`).all(...roleIds).map((row) => row.id) : [];
    return { databasePath, tables: [...tables], tracked: [...tracked], seeded };
  } finally { db.close(); }
}

function insideStagingSync() {
  // locateLocalD1Database is awaited below and cached before this function runs.
  return insideStaging(localDatabasePath);
}

let localDatabasePath;
try { localDatabasePath = await locateLocalD1Database(paths); }
catch (error) { throw new Error('Exactly one disposable local D1 SQLite file is required.', { cause: error }); }
const schema = readSchema();
const migrationFiles = (await readdir(join(project, 'drizzle')))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const pendingMigrations = migrationFiles.filter((name) => !schema.tracked.includes(name));
const missingTables = ['form_config_versions', 'form_answer_sets']
  .filter((name) => !schema.tables.includes(name));
const missingRoles = ['local-test-customer', 'local-test-buyer', 'local-test-rider',
  'local-test-seller', 'local-test-admin', 'local-test-super-admin']
  .filter((id) => !schema.seeded.includes(id));
const ready = !pendingMigrations.length && !missingTables.length && !missingRoles.length;
const readiness = { ready, origin: origin.origin, marker: relative(project, paths.marker),
  database: relative(project, schema.databasePath), migrationsTracked: schema.tracked.length,
  migrationsCurrent: migrationFiles.length, pendingMigrations, missingTables, missingRoles,
  browserPlugin: 'not available; Playwright fallback' };
if (mode === '--preflight') {
  process.stdout.write(`${JSON.stringify(readiness, null, 2)}\n`);
  if (!ready) process.exitCode = 2;
} else {
  assert.ok(ready, `Disposable D1 is not ready: ${JSON.stringify(readiness)}`);
  let fixture;
  if (mode === '--matrix') {
    const fixturePath = insideStaging(process.env.FORM_CATALOG_QA_FIXTURE ||
      join(paths.root, 'form-catalog-browser-fixtures.json'));
    fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    assert.equal(fixture.schemaVersion, 1, 'Unsupported QA fixture version.');
    assert.ok(Array.isArray(fixture.surfaces), 'Fixture must list all nine audiences.');
    assert.deepEqual(fixture.surfaces.map((item) => item.audience).sort(), [...audiences].sort(),
      'Fixture must cover each representative audience exactly once.');
    for (const surface of fixture.surfaces) {
      localUrl(surface.path);
      assert.ok(surface.role === null || roles.has(surface.role), 'Invalid local role.');
      assert.ok(typeof surface.targetSelector === 'string' && surface.targetSelector.length,
        'Each surface needs a real target selector.');
      assert.ok(typeof surface.heading === 'string' && surface.heading.length,
        'Each surface needs an expected heading.');
      if (surface.formId) assert.ok(typeof surface.formSelector === 'string',
        'Expected form ID needs a form selector.');
    }
  }
  const health = await fetch(localUrl('/health/live'), { signal: AbortSignal.timeout(3000) });
  assert.equal(health.status, 200, 'Loopback staging server is not healthy.');
  const localTesting = await fetch(localUrl('/local-testing'), { signal: AbortSignal.timeout(3000) });
  assert.equal(localTesting.status, 200, 'Local-only role switch is unavailable.');
  assert.match(await localTesting.text(), /Test every HastaBazaar interface/,
    'The responding server is not the expected local test app.');
  const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
  const { chromium } = await import(playwrightModule.startsWith('.') || /^[A-Za-z]:[\\/]/.test(playwrightModule)
    ? pathToFileURL(resolve(playwrightModule)).href : playwrightModule);
  const browser = await chromium.launch({ headless: true,
    args: ['--disable-background-networking'],
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  await mkdir(output, { recursive: true });
  const run = { mode, startedAt: new Date().toISOString(), readiness,
    rows: [], failures: [], blockedRequests: [] };
  async function contextFor(role, width = 1024, preparedBuyerCart = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 },
      reducedMotion: 'reduce', serviceWorkers: 'block' });
    await context.route('**/*', (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.origin !== origin.origin) {
        run.blockedRequests.push({ origin: requestUrl.origin, type: route.request().resourceType() });
        return route.abort('blockedbyclient');
      }
      return route.continue();
    });
    if (role) await context.addCookies([{ name: 'hastabazaar_local_test_role', value: role,
      url: origin.origin, httpOnly: true, sameSite: 'Strict' }]);
    if (preparedBuyerCart) {
      assert.equal(role, 'buyer', 'Prepared cart belongs only to the fictional buyer.');
      const state = JSON.parse(await readFile(insideStaging(join(paths.root,
        'form-catalog-qa-buyer-cookies.json')), 'utf8'));
      assert.equal(state.schemaVersion, 1, 'Unsupported local buyer cookie state.');
      const cart = state.cookies?.find((entry) => entry.name === 'hastabazaar_cart');
      assert.ok(cart && cart.domain === origin.hostname && cart.path === '/' &&
        typeof cart.value === 'string' && /^[A-Za-z0-9_-]{32,128}$/.test(cart.value),
        'Invalid local buyer cart cookie.');
      await context.addCookies([{ name: 'hastabazaar_cart', value: cart.value,
        url: origin.origin, httpOnly: true, sameSite: 'Lax' }]);
    }
    return context;
  }
  async function visit(page, path) {
    const response = await page.goto(localUrl(path), { waitUntil: 'domcontentloaded' });
    assert.ok(response && response.status() < 400, `${path} failed to render.`);
    // Wait for the local client modules before interacting with server-rendered controls.
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    assert.equal(new URL(page.url()).origin, origin.origin, 'Navigation escaped loopback.');
    assert.ok((await page.title()).trim(), 'Page title is blank.');
    const body = await page.locator('body').innerText();
    assert.ok(body.trim().length > 30, 'Page is blank.');
    assert.doesNotMatch(body, /Application error|Internal Server Error|This page could not be found/);
    assert.equal(await page.locator('[data-nextjs-dialog-overlay]').count(), 0,
      'Framework error overlay is present.');
  }
  async function saveEvidence(page, name) {
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: false });
  }
  function resultsFor(page, label) {
    const errors = [];
    page.on('pageerror', (error) => errors.push(`${label}: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT/.test(message.text()))
        errors.push(`${label}: ${message.text()}`);
    });
    return errors;
  }
  async function runMatrix() {
    for (const surface of fixture.surfaces) {
      const context = await contextFor(surface.role, 1024, surface.preparedBuyerCart === true);
      const page = await context.newPage();
      const errors = resultsFor(page, surface.audience);
      try {
        for (const width of widths) {
          await page.setViewportSize({ width, height: 900 });
          const row = { audience: surface.audience, role: surface.role, width,
            path: surface.path, formId: surface.formId ?? null, issues: [] };
          try {
            await visit(page, surface.path);
            assert.equal(new URL(page.url()).pathname, new URL(localUrl(surface.path)).pathname,
              'Role reached a redirect instead of its target.');
            assert.ok(await page.getByRole('heading', { name: surface.heading, exact: true }).count(),
              'Expected heading missing.');
            if (surface.openButton) {
              assert.equal(surface.formId, 'staff.catalog', 'Unsupported matrix open action.');
              assert.equal(surface.openButton, 'Add category', 'Unsupported matrix open button.');
              await page.getByRole('button', { name: surface.openButton, exact: true }).click();
            }
            const target = page.locator(surface.targetSelector);
            await target.first().waitFor({ state: 'visible', timeout: 10000 });
            if (surface.formId) {
              const form = page.locator(surface.formSelector);
              await form.first().waitFor({ state: 'visible', timeout: 10000 });
              assert.equal(await form.first().getAttribute('data-form-id'), surface.formId);
              const versionInput = form.locator('input[name="formVersion"]').first();
              await versionInput.waitFor({ state: 'attached', timeout: 10000 });
              const versionDb = new DatabaseSync(schema.databasePath, { readOnly: true });
              try { assertPublishedMatrixVersion(versionDb, surface.formId, await versionInput.inputValue()); }
              finally { versionDb.close(); }
            }
            const geometry = await target.first().evaluate((element) => {
              const controls = [
                ...(element.matches('input:not([type="hidden"]),select,textarea') ? [element] : []),
                ...element.querySelectorAll('input:not([type="hidden"]),select,textarea'),
              ]
                .filter((node) => {
                  const box = node.getBoundingClientRect();
                  return box.width > 0 && box.height > 0 && !node.disabled &&
                    !node.closest('[aria-hidden="true"], [inert]');
                });
              const unlabeled = controls.filter((node) =>
                ![...(node.labels ?? [])].some((label) => label.textContent?.trim()) &&
                !node.getAttribute('aria-label')?.trim() &&
                !(node.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/)
                  .some((id) => id && document.getElementById(id)?.textContent?.trim()))
                .map((node) => node.getAttribute('name') || node.id || node.tagName);
              const clipped = controls.filter((node) => {
                const box = node.getBoundingClientRect();
                return box.left < -1 || box.right > innerWidth + 1;
              }).map((node) => node.getAttribute('name') || node.id || node.tagName);
              return { controlCount: controls.length, unlabeled, clipped,
                scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth };
            });
            if (geometry.controlCount < 1) row.issues.push('No visible input control.');
            if (geometry.unlabeled.length) row.issues.push(`Unlabeled: ${geometry.unlabeled.join(', ')}`);
            if (geometry.clipped.length) row.issues.push(`Clipped controls: ${geometry.clipped.join(', ')}`);
            if (geometry.scrollWidth > width + 1) row.issues.push(`Page overflow: ${geometry.scrollWidth}px`);
            const didFocus = await target.first().evaluate((element) => {
              const selector = 'input:not([type="hidden"]),select,textarea';
              const controls = [...(element.matches(selector) ? [element] : []),
                ...element.querySelectorAll(selector)];
              const first = controls.find((node) => {
                const box = node.getBoundingClientRect();
                return box.width > 0 && box.height > 0 && !node.disabled &&
                  !node.closest('[aria-hidden="true"], [inert]');
              });
              first?.focus();
              return Boolean(first);
            });
            if (didFocus) {
              await page.keyboard.press('Tab');
              const focus = await page.evaluate(() => {
                const active = document.activeElement;
                const box = active?.getBoundingClientRect();
                return Boolean(box && box.width > 0 && box.height > 0 && active !== document.body);
              });
              if (!focus) row.issues.push('Keyboard Tab lost visible focus.');
            }
            row.geometry = geometry;
            await saveEvidence(page, `${surface.audience}-${width}`);
          } catch (error) { row.issues.push(error.message); }
          run.rows.push(row);
          if (row.issues.length) run.failures.push(`${surface.audience}/${width}: ${row.issues.join('; ')}`);
        }
        run.failures.push(...errors);
      } finally { await context.close(); }
    }
  }
  async function clickMutation(page, button, suffix) {
    const response = page.waitForResponse((candidate) =>
      candidate.url().startsWith(`${origin.origin}/api/admin/forms/account.profile/`) &&
      candidate.url().endsWith(`/${suffix}`) && candidate.request().method() === 'POST');
    const [result] = await Promise.all([response, button.click()]);
    assert.ok(result.ok(), `${suffix} failed with ${result.status()}: ${(await result.text()).slice(0, 180)}`);
  }
  async function publishProfile(editor, reason) {
    await editor.locator('#catalog-reason').fill(reason);
    await clickMutation(editor, editor.getByRole('button', { name: 'Save draft' }), 'draft');
    await editor.getByText('Draft saved.', { exact: true }).waitFor({ state: 'visible' });
    await editor.locator('#catalog-reason').fill(reason);
    await editor.getByRole('button', { name: 'Publish draft' }).waitFor({ state: 'visible' });
    await editor.getByRole('button', { name: 'Publish draft' }).click();
    await clickMutation(editor, editor.getByRole('button', { name: 'Confirm publish' }), 'publish');
  }
  async function profileFlow() {
    const id = process.env.FORM_CATALOG_QA_RUN_ID || randomBytes(4).toString('hex');
    assert.match(id, /^[a-f0-9]{8}$/, 'QA resume ID must be eight lowercase hex characters.');
    const key = `qa_context_${id}`;
    const label = `SIMULATED QA context ${id}`;
    const value = `SIMULATED answer ${id}`;
    const existing = new DatabaseSync(schema.databasePath, { readOnly: true });
    try { assertUnusedProfileQaRun(existing, key); } finally { existing.close(); }
    const editorContext = await contextFor('super_admin');
    const buyerContext = await contextFor('buyer');
    const forbiddenContext = await contextFor('seller');
    const ordinaryAdminContext = await contextFor('admin');
    const editor = await editorContext.newPage();
    const buyer = await buyerContext.newPage();
    const forbidden = await forbiddenContext.newPage();
    const ordinaryAdmin = await ordinaryAdminContext.newPage();
    const errorBuckets = [
      resultsFor(editor, 'profile editor'), resultsFor(buyer, 'buyer profile'),
      resultsFor(forbidden, 'seller profile'), resultsFor(ordinaryAdmin, 'admin denial'),
    ];
    try {
      await visit(editor, '/admin/forms/account.profile');
      assert.ok(await editor.getByRole('heading', { name: 'account.profile' }).count());
      const field = editor.locator(`[data-editor-field="${key}"]`);
      if (!await field.count()) {
        await editor.locator('#new-field-key').fill(key);
        await editor.locator('#new-field-label').fill(label);
        await editor.locator('#new-field-type').selectOption('short_text');
        await editor.getByRole('button', { name: 'Add field' }).click();
      }
      await field.waitFor({ state: 'visible' });
      const required = field.getByRole('button', { name: `Required for ${label}` });
      if (await required.getAttribute('aria-pressed') !== 'true') await required.click();
      assert.equal(await required.getAttribute('aria-pressed'), 'true');
      await publishProfile(editor, `SIMULATED browser QA required field ${id}`);
      await saveEvidence(editor, `flow-${id}-published`);

      await visit(buyer, '/account/profile');
      const profile = buyer.locator('form[data-form-id="account.profile"]');
      const answerControl = profile.locator(`[data-configured-field="${key}"] input`);
      await answerControl.waitFor({ state: 'visible', timeout: 10000 });
      assert.equal(await answerControl.getAttribute('required'), '');
      await profile.getByRole('button', { name: 'Save changes' }).click();
      assert.equal(await answerControl.evaluate((node) => node === document.activeElement), true,
        'Missing required answer must receive focus.');
      assert.equal(await answerControl.evaluate((node) => node.validity.valueMissing), true);
      await saveEvidence(buyer, `flow-${id}-required`);
      await answerControl.fill(value);
      const update = buyer.waitForResponse((candidate) => candidate.url() === `${origin.origin}/api/account/profile`
        && candidate.request().method() === 'PATCH');
      await profile.getByRole('button', { name: 'Save changes' }).click();
      const updateResponse = await update;
      assert.ok(updateResponse.ok(), `Profile save failed: ${updateResponse.status()}`);
      await buyer.getByText('Your profile is up to date.').waitFor({ state: 'visible' });
      const db = new DatabaseSync(schema.databasePath, { readOnly: true });
      try {
        const rows = db.prepare(`SELECT id,subject_type,subject_id,actor_id,answers_json
          FROM form_answer_sets WHERE form_id='account.profile' AND actor_id='local-test-buyer'`)
          .all().filter((row) => row.answers_json.includes(key));
        assert.equal(rows.length, 1, 'Exactly one answer must link to the buyer profile action.');
        assert.equal(rows[0].subject_type, 'user');
        assert.equal(rows[0].subject_id, 'local-test-buyer');
        assert.ok(rows[0].answers_json.includes(value));
        run.profileAnswerId = rows[0].id;
      } finally { db.close(); }

      await visit(editor, '/admin/forms/account.profile');
      const archive = editor.locator(`[data-editor-field="${key}"]`);
      await archive.getByRole('button', { name: 'Archive' }).click();
      await editor.getByRole('button', { name: 'Confirm archive' }).click();
      await publishProfile(editor, `SIMULATED browser QA archive field ${id}`);
      await visit(buyer, '/account/profile');
      assert.equal(await buyer.locator(`[data-configured-field="${key}"]`).count(), 0);
      const history = buyer.getByRole('region', { name: 'Your profile answer history' });
      await history.getByText(label).waitFor({ state: 'visible' });
      assert.ok(await history.getByText(value).count(), 'Historical value missing.');
      assert.ok(await history.getByText('Historical').count(), 'Archived-field badge missing.');
      await history.scrollIntoViewIfNeeded();
      await saveEvidence(buyer, `flow-${id}-history`);

      await visit(forbidden, '/account/profile');
      assert.equal(await forbidden.getByText(value).count(), 0,
        'Another account must not see the buyer answer.');
      await ordinaryAdmin.goto(localUrl('/admin/forms/account.profile'), { waitUntil: 'domcontentloaded' });
      assert.equal(new URL(ordinaryAdmin.url()).pathname, '/staff-access-denied',
        'Ordinary Admin must not enter the Super Admin form editor.');
      run.rows.push({ flow: 'account.profile', key, label, result: 'passed',
        evidence: [`flow-${id}-published.png`, `flow-${id}-required.png`, `flow-${id}-history.png`] });
    } finally {
      run.failures.push(...errorBuckets.flat());
      await Promise.all([editorContext.close(), buyerContext.close(), forbiddenContext.close(), ordinaryAdminContext.close()]);
    }
  }
  try {
    if (mode === '--matrix') await runMatrix();
    else await profileFlow();
  } catch (error) { run.failures.push(error.stack ?? error.message); }
  finally {
    await browser.close();
    run.completedAt = new Date().toISOString();
    run.passed = run.failures.length === 0;
    await writeFile(join(output, `${mode.slice(2)}-results.json`), JSON.stringify(run, null, 2));
    process.stdout.write(`${JSON.stringify({ passed: run.passed, rows: run.rows.length,
      failures: run.failures, result: relative(project, join(output, `${mode.slice(2)}-results.json`)) }, null, 2)}\n`);
    if (!run.passed) process.exitCode = 1;
  }
}
