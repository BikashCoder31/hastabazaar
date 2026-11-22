import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { isDeepStrictEqual } from 'node:util';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { BrowserContext, Page, Request } from 'playwright-core';
import { reportingDayIso } from '../../lib/dates/nepal-calendar';
import { totpAtCounter } from '../../lib/security/crypto';
import type { SecurityStore } from '../../lib/security/store';
import { captureNativeInventory } from '../recovery/native-inventory.mjs';
import type { bindSelectedBrowserViews } from '../recovery/selected-native-views.mjs';
import {
  acknowledgeRegisteredSellerTerms, assertPreservedWithFormLoads, assertRegisteredSellerTermsAcceptance,
  continuePackagedRegistration, openPackagedRegistration, prepareRegistrationActors, signInPackagedBrowser, snapshotFormLoadObservations,
} from './registration-browser-fixture.mjs';

const reviewStarted = 'seller.application.review_started';
const changesRequested = 'seller.application.changes_requested';
const progress = '/admin/progress';
const activity = '/admin/activity';

export async function prepareRecordedWorkActors(db: D1Database, store: SecurityStore, grantorId: string) {
  const { passwordRecord } = await import('../../lib/auth/hosted-session');
  const staff = [];
  for (const [label, role, permissions] of [
    ['Reviewer', 'admin', ['audit_log.view', 'seller.application.review']],
    ['Owner', 'super_admin', []],
    ['Catalogue', 'admin', ['catalog.manage']],
  ] as const) {
    const id = 'browser-recorded-' + randomUUID(), email = id + '@example.test';
    const displayName = 'Fictional Recorded Work ' + label;
    const password = Buffer.from(randomBytes(32)).toString('base64url'), credential = await passwordRecord(password), now = Date.now();
    // Isolated fictional account facts. The browser must still pass current
    // password, role and (for the new Super Admin) authenticator checks.
    await store.registerStaff(id, now, [
      db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,?,'active','en',?,?)")
        .bind(id, id, email, displayName, now, now),
      db.prepare('INSERT INTO user_roles(user_id,role,assigned_by,assigned_at) VALUES(?,?,?,?)').bind(id, role, grantorId, now),
      db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)')
        .bind(id, credential.hash, credential.salt, now, now),
      ...(role === 'admin' ? [db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?)')
        .bind(id, JSON.stringify(permissions), grantorId, now)] : []),
    ]);
    staff.push({ id, email, displayName, password });
  }
  return { staff, applicants: await prepareRegistrationActors(db, ['recorded-one', 'recorded-two', 'recorded-three']) };
}

async function activateAuthenticator(page: Page, password: string) {
  const session = async () => (await page.context().cookies()).find(cookie => cookie.name === 'hastabazaar_session');
  const passwordSession = await session();
  assert.ok(passwordSession);
  const post = (route: string, data: Record<string, unknown>) => page.evaluate(async ({ route, data }) => {
    const response = await fetch('/api/security/' + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() as { setupId?: string; manualKey?: string; recoveryCodes?: string[]; status?: string } };
  }, { route, data });
  const setup = await post('setup', { password });
  assert.equal(setup.status, 200, 'Super Admin authenticator setup receiver');
  const { setupId, manualKey } = setup.body;
  assert.ok(typeof setupId === 'string' && typeof manualKey === 'string', 'Authenticator setup returned a challenge');
  const code = totpAtCounter(manualKey, Math.floor(Date.now() / 30_000));
  const confirm = await post('confirm', { setupId, password, code });
  assert.equal(confirm.status, 200, 'Super Admin authenticator confirmation receiver');
  assert.equal(confirm.body.recoveryCodes?.length, 10, 'The authenticator confirmation issued ten recovery codes');
  const recoveryCode = confirm.body.recoveryCodes?.[0];
  assert.ok(typeof recoveryCode === 'string' && recoveryCode.length > 0);
  const activate = await post('confirm', { setupId, password, acknowledge: true });
  assert.equal(activate.status, 200, 'Super Admin authenticator activation receiver');
  assert.equal(activate.body.status, 'active');
  const verified = await session();
  assert.ok(verified?.secure && verified.httpOnly && verified.sameSite === 'Lax' && verified.value !== passwordSession.value,
    'Super Admin activation must rotate to a protected verified session');
  return recoveryCode;
}

async function signInWithRecoveryCode(page: Page, origin: string, account: { email: string; password: string }, code: string) {
  await signInPackagedBrowser(page, origin, account, activity);
  await page.waitForURL(url => url.pathname === '/security');
  const passwordSession = (await page.context().cookies()).find(cookie => cookie.name === 'hastabazaar_session');
  assert.ok(passwordSession);
  const form = page.locator('form[data-form-id="system.security-mfa-verify"]');
  await form.getByRole('button', { name: 'Use a recovery code', exact: true }).click();
  const field = form.getByLabel('Recovery code', { exact: true });
  try { await field.fill(code); }
  catch { throw new Error('Owned browser could not enter its fictional recovery code'); }
  const verification = page.waitForResponse(response => response.request().method() === 'POST' &&
    new URL(response.url()).pathname === '/api/security/verify');
  await form.getByRole('button', { name: 'Verify and continue', exact: true }).click();
  assert.equal((await verification).status(), 200, 'Protected hosted receiver accepted the recovery code');
  await page.waitForURL(origin + activity);
  const verified = (await page.context().cookies()).find(cookie => cookie.name === 'hastabazaar_session');
  assert.ok(verified?.secure && verified.httpOnly && verified.sameSite === 'Lax' && verified.value !== passwordSession.value,
    'Recovery verification must rotate to a protected verified session');
  const state = await page.evaluate(async () => {
    const response = await fetch('/api/security/status');
    const body = await response.json() as { recoveryRemaining?: unknown };
    return { status: response.status, remaining: body.recoveryRemaining };
  });
  assert.deepEqual(state, { status: 200, remaining: 9 }, 'The real recovery sign-in consumed exactly one code');
}

function waitForSellerReviewRefresh(page: Page, sellerUrl: string, reviewUrl: string) {
  const seller = new URL(sellerUrl);
  const refreshRequests = new WeakSet<Request>();
  let reviewAccepted = false;
  const trackRefresh = (request: Request) => {
    if (!reviewAccepted || request.method() !== 'GET' || request.isNavigationRequest()) return;
    const url = new URL(request.url());
    if (url.origin !== seller.origin || (url.pathname !== seller.pathname && url.pathname !== seller.pathname + '.rsc')) return;
    const headers = request.headers();
    const purpose = (headers.purpose ?? '') + ' ' + (headers['sec-purpose'] ?? '');
    if (/(?:^|[\s;])prefetch(?:$|[\s;])/i.test(purpose) || headers['next-router-prefetch'] === '1' ||
        'next-router-segment-prefetch' in headers || 'x-middleware-prefetch' in headers) return;
    refreshRequests.add(request);
  };
  page.on('request', trackRefresh);
  return page.waitForResponse(response => {
    if (response.url() === reviewUrl && response.request().method() === 'POST' && response.status() === 200)
      reviewAccepted = true;
    return refreshRequests.has(response.request()) && (response.headers()['content-type'] ?? '').includes('text/x-component');
  }, { timeout: 20_000 }).catch(() => null).finally(() => page.off('request', trackRefresh));
}

async function sellerBankViewIds(db: Connection, ownerId: string, sellerId: string, timeout = 2_500) {
  const [rows] = await db.query<(RowDataPacket & { id: string })[]>({
    sql: "SELECT id FROM audit_logs WHERE actor_id=? AND subject_id=? AND subject_type='seller' AND action='seller.bank_details.viewed' LIMIT 65",
    timeout,
  }, [ownerId, sellerId]);
  assert.ok(rows.length <= 64, 'Exact fixture bank audit readback is bounded');
  return rows.map(row => row.id);
}

async function assertSellerReviewAuditCommitted(db: Connection, ownerId: string, sellerId: string, before: Set<string>, signal: AbortSignal) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    const views = await sellerBankViewIds(db, ownerId, sellerId, Math.min(2_500, Math.max(1, deadline - Date.now())));
    const appended = views.filter(id => !before.has(id)).length;
    if (appended > 0) {
      assert.equal(appended, 1, 'One protected bank view is expected during the final Seller review setup');
      return;
    }
    if (Date.now() < deadline) await delay(Math.min(200, deadline - Date.now()), undefined, { signal });
  }
  assert.fail('The final Seller review refresh did not commit its protected bank-view audit before the read-only inventory');
}

type BrowserViews = Awaited<ReturnType<typeof bindSelectedBrowserViews>>;

async function readOnlyInventory(db: Connection, selectedViews?: BrowserViews) {
  const inventory = await captureNativeInventory(db, selectedViews);
  // Sessions, staff assurance and traffic may advance on ordinary GETs.
  // Inventory every other table, explicitly including audit_logs and form answers.
  const requestState = new Set(['user_sessions', 'marketplace_settings', 'traffic_sessions', 'traffic_events', 'form_health_observations']);
  const [settings] = await db.query("SELECT HEX(`key`) AS k,HEX(value) AS v,HEX(updated_by) AS actor,updated_at FROM marketplace_settings WHERE `key` NOT LIKE 'auth-private:%' ORDER BY BINARY `key`");
  return {
    schemaSha256: inventory.schemaSha256,
    tables: inventory.tables.filter((table: { name: string }) => !requestState.has(table.name)),
    settings,
    formLoads: await snapshotFormLoadObservations(db),
  };
}

async function auditActionCounts(db: Connection) {
  const [rows] = await db.query<(RowDataPacket & { action: string; count: number })[]>('SELECT action,COUNT(*) AS count FROM audit_logs GROUP BY action');
  return new Map(rows.map(row => [row.action, Number(row.count)]));
}

export async function runRecordedWorkBrowser(options: {
  db: Connection; origin: string; executablePath: string; browserEnvironment: Record<string, string>; signal: AbortSignal;
  accounts: Awaited<ReturnType<typeof prepareRecordedWorkActors>>;
  selectedViews?: BrowserViews;
  releaseId: string;
  registeredTerms: Parameters<typeof assertRegisteredSellerTermsAcceptance>[3];
  onStep?: (step: string) => void;
}) {
  const { db, origin, accounts, signal, selectedViews } = options;
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.hostname === '127.0.0.1' && url.protocol === 'http:' && url.port !== '3018' && url.port);
  signal.throwIfAborted();
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
  const browser = await chromium.launch({ headless: true, executablePath: options.executablePath, env: options.browserEnvironment });
  const contexts: BrowserContext[] = [];
  async function openPage() {
    signal.throwIfAborted();
    const context: BrowserContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
    contexts.push(context);
    // Continue genuine local traffic, deny requests outside the admitted app.
    await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    return context.newPage();
  }
  try {
    options.onStep?.('submit registered business applications through the wizard');
    const applications = [];
    for (const account of accounts.applicants) {
      const page = await openPage();
      await openPackagedRegistration(page, origin, account);
      // Managed Maker evidence is restricted to Super Admin. This journey uses
      // the registered seller route that the limited reviewer can inspect.
      await page.getByRole('radio', { name: /Registered business seller/ }).check();
      await continuePackagedRegistration(page, 0, 4);
      await acknowledgeRegisteredSellerTerms(page);
      const submitted = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/seller-registrations');
      await page.getByRole('button', { name: 'Submit application', exact: true }).click();
      assert.equal((await submitted).status(), 201, 'Fictional source application submitted through the real receiver');
      await page.getByRole('heading', { name: 'Application sent', exact: true }).waitFor();
      const [rows] = await db.query<RowDataPacket[]>('SELECT id,application_reference AS reference,status FROM seller_profiles WHERE user_id=?', [account.id]);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].status, 'submitted');
      assert.ok(typeof rows[0].id === 'string' && typeof rows[0].reference === 'string');
      await assertRegisteredSellerTermsAcceptance(db, String(rows[0].id), account.id, options.registeredTerms);
      applications.push({ id: String(rows[0].id), reference: String(rows[0].reference) });
      await page.close();
    }

    options.onStep?.('sign staff in and enroll the Super Admin authenticator');
    const [reviewer, owner, blocked] = accounts.staff;
    const ownPage = await openPage(), enrollmentPage = await openPage(), deniedPage = await openPage();
    await signInPackagedBrowser(ownPage, origin, reviewer, progress);
    await ownPage.waitForURL(origin + progress);
    await signInPackagedBrowser(enrollmentPage, origin, owner, activity);
    await enrollmentPage.waitForURL(url => url.pathname === '/security');
    const recoveryCode = await activateAuthenticator(enrollmentPage, owner.password);
    await enrollmentPage.close();
    const ownerPage = await openPage();
    await signInWithRecoveryCode(ownerPage, origin, owner, recoveryCode);
    await ownerPage.getByRole('heading', { name: 'Business activity', exact: true }).waitFor();
    await signInPackagedBrowser(deniedPage, origin, blocked, '/admin/catalog');
    await deniedPage.waitForURL(origin + '/admin/catalog');

    for (const [index, application] of applications.entries()) {
      signal.throwIfAborted();
      const page = index < 2 ? ownPage : ownerPage;
      const sellerUrl = origin + '/admin/sellers/' + application.id;
      const reviewUrl = origin + '/api/admin/seller-applications/' + application.id + '/review';
      options.onStep?.('open the seller record for application ' + (index + 1));
      await page.goto(sellerUrl);
      const form = page.locator('form[data-form-id="staff.seller-review-action"]');
      for (const [label, status] of [['Start review', 'under_review'], ['Hold, ask to fix first', 'needs_changes']]) {
        options.onStep?.(label + ' on application ' + (index + 1));
        if (status === 'needs_changes') await form.getByLabel('Review note', { exact: true }).fill('Fictional test review requests more business details.');
        await form.getByRole('button', { name: label, exact: true }).click();
        const beforeBankViews = page === ownerPage && status === 'needs_changes'
          ? new Set(await sellerBankViewIds(db, owner.id, application.id))
          : null;
        const refresh = beforeBankViews ? waitForSellerReviewRefresh(page, sellerUrl, reviewUrl) : null;
        const request = page.waitForResponse(response => response.request().method() === 'POST' && response.url() === reviewUrl);
        await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
        const response = await request;
        assert.equal(response.status(), 200, 'Current seller review receiver accepted ' + label);
        assert.equal((await response.json()).status, status);
        const [profiles] = await db.query<RowDataPacket[]>('SELECT status FROM seller_profiles WHERE id=?', [application.id]);
        assert.equal(profiles[0]?.status, status, 'The real source application must retain the transition');
        if (refresh && beforeBankViews) {
          options.onStep?.('verify the final review refresh and protected bank-view audit');
          const refreshed = await refresh;
          assert.equal(refreshed?.status(), 200, 'Observe the successful review-triggered Seller Flight before the read-only inventory');
          // The Flight can keep streaming after the application writes the protected view audit.
          await assertSellerReviewAuditCommitted(db, owner.id, application.id, beforeBankViews, signal);
        }
        if (status === 'under_review') {
          const confirmation = form.getByText('Review started. Check the documents and record the next decision.', { exact: true });
          const note = form.getByLabel('Review note', { exact: true });
          await confirmation.or(note).first().waitFor();
          await page.reload({ waitUntil: 'domcontentloaded' });
          await page.waitForURL(origin + '/admin/sellers/' + application.id);
          await note.waitFor();
        }
      }
    }
    const [events] = await db.query<RowDataPacket[]>(`SELECT actor_id AS actor,subject_id AS subject,action,created_at AS at
      FROM audit_logs WHERE subject_type='seller' AND subject_id IN (?,?,?) AND action IN (?,?) ORDER BY created_at,id`,
    [...applications.map(application => application.id), reviewStarted, changesRequested]);
    assert.equal(events.length, 6);
    for (const [index, application] of applications.entries()) {
      const expected = index < 2 ? reviewer.id : owner.id;
      for (const action of [reviewStarted, changesRequested]) {
        const matching = events.filter(event => event.subject === application.id && event.action === action);
        assert.equal(matching.length, 1, 'Native audit has each real source transition exactly once');
        assert.equal(matching[0].actor, expected);
      }
    }
    const day = (event: RowDataPacket) => reportingDayIso(Number(event.at));
    const from = day(events[0]), to = day(events[events.length - 1]);
    const previousDay = reportingDayIso(Number(events[0].at) - 86_400_000);
    // Leave the review pages before starting the read-only window. A protected
    // seller render from the final review is allowed to finish writing its audit.
    options.onStep?.('finish review-page requests before the read-only inventory');
    await ownPage.goto(origin + progress, { waitUntil: 'networkidle' });
    await ownerPage.goto(origin + activity, { waitUntil: 'networkidle' });
    const { formLoads: beforeLoads, ...beforeRead } = await readOnlyInventory(db, selectedViews);
    const auditBefore = await auditActionCounts(db);

    const groups = (page: Page) => page.getByRole('table', { name: 'Completed steps recorded in this date range', exact: true });
    const group = (page: Page, actor: string) => groups(page).getByRole('row').filter({ hasText: actor });
    const widths = [320, 390, 1440];
    for (const width of widths) {
      const atWidth = (step: string) => options.onStep?.(step + ' at ' + width + ' px');
      atWidth('check the reviewer’s work log tab and scoped counts');
      signal.throwIfAborted();
      for (const page of [ownPage, ownerPage, deniedPage]) await page.setViewportSize({ width, height: 1000 });
      await ownPage.goto(origin + progress);
      await ownPage.getByRole('heading', { name: 'Your recorded work', exact: true }).waitFor();
      await ownPage.getByRole('navigation', { name: 'Reports pages' }).getByRole('link', { name: 'Work log', exact: true }).waitFor();
      const own = group(ownPage, reviewer.id);
      assert.equal(await groups(ownPage).getByRole('row').count(), 2);
      await own.getByRole('cell', { name: '2', exact: true }).waitFor();
      await own.getByRole('cell', { name: 'Application revision requested', exact: true }).waitFor();
      assert.equal(await ownPage.getByRole('link', { name: 'seller: ' + applications[2].id, exact: true }).count(), 0);
      atWidth('open the exact seller record from the reviewer’s filtered work log');
      await own.getByRole('link', { name: 'View matching records', exact: true }).click();
      await ownPage.waitForURL(url => url.pathname === progress && url.searchParams.get('action') === changesRequested);
      for (const application of applications.slice(0, 2)) await ownPage.getByRole('link', { name: 'seller: ' + application.id, exact: true }).waitFor();
      await ownPage.getByRole('link', { name: 'seller: ' + applications[0].id, exact: true }).click();
      await ownPage.waitForURL(origin + '/admin/sellers/' + applications[0].id);
      await ownPage.locator('[data-seller-record] header p').filter({ hasText: applications[0].reference }).waitFor();
      await ownPage.locator('#seller-decision').getByText('Application decision', { exact: true }).waitFor();

      atWidth('check Super Admin’s two actor groups and apply the matching dates');
      await ownerPage.goto(origin + activity);
      await group(ownerPage, reviewer.id).getByRole('cell', { name: '2', exact: true }).waitFor();
      await group(ownerPage, owner.id).getByRole('cell', { name: '1', exact: true }).waitFor();
      const filter = ownerPage.locator('form[data-form-id="staff.activity-filter"]');
      await filter.locator('[name="actor"]').fill(reviewer.id);
      const applyDate = async (start: string, end: string) => {
        await filter.locator('input[type="date"][name="from"]').fill(start);
        await filter.locator('input[type="date"][name="to"]').fill(end);
        await filter.getByRole('button', { name: 'Filter recorded actions', exact: true }).click();
        await ownerPage.waitForURL(url => url.pathname === activity && url.searchParams.get('actor') === reviewer.id &&
          url.searchParams.get('from') === start && url.searchParams.get('to') === end);
      };
      await applyDate(from, to);
      atWidth('check the filtered activity entries and empty date range');
      await group(ownerPage, reviewer.id).getByRole('cell', { name: '2', exact: true }).waitFor();
      assert.equal(await groups(ownerPage).getByRole('row').count(), 2);
      const history = ownerPage.getByRole(width < 768 ? 'list' : 'table', { name: 'Recorded actions', exact: true });
      assert.equal(await history.getByText(changesRequested, { exact: true }).count(), 2);
      assert.equal(await history.getByText(reviewStarted, { exact: true }).count(), 2);
      assert.equal(await history.getByRole('link', { name: 'seller: ' + applications[2].id, exact: true }).count(), 0);
      await applyDate(previousDay, previousDay);
      await ownerPage.getByText('No matching completed steps were recorded in this range.', { exact: true }).waitFor();
      await ownerPage.getByText('No recorded actions match these filters.', { exact: true }).waitFor();

      atWidth('check invalid filters and denied staff links');
      await ownPage.goto(origin + progress + '?actor=' + owner.id);
      await ownPage.getByRole('alert').filter({ hasText: 'Admins can view only their own recorded work.' }).waitFor();
      await ownPage.goto(origin + progress + '?from=2020-01-01&to=2022-01-01');
      await ownPage.getByRole('alert').filter({ hasText: 'Choose a date range of at most 366 days.' }).waitFor();
      await deniedPage.goto(origin + '/admin/catalog');
      const nav = deniedPage.getByRole('navigation', { name: 'Catalog pages' });
      await nav.getByRole('link', { name: 'Categories & occasions', exact: true }).waitFor();
      assert.equal(await nav.locator('a[href="/admin/progress"],a[href="/admin/activity"]').count(), 0);
      assert.equal(await deniedPage.locator('nav a[href="/admin/progress"],nav a[href="/admin/activity"]').count(), 0);
      atWidth('verify denied direct navigation to both reports and the seller record');
      for (const [label, path] of [['Work log', progress], ['Staff history', activity], ['seller record', '/admin/sellers/' + applications[0].id]]) {
        atWidth('verify direct access denial for ' + label);
        await deniedPage.goto(origin + path);
        await deniedPage.waitForURL(origin + '/staff-access-denied');
        assert.equal(await deniedPage.getByText(applications[0].reference, { exact: true }).count(), 0);
      }
    }
    options.onStep?.('capture the business and audit inventory after read-only navigation');
    const { formLoads: afterLoads, ...afterRead } = await readOnlyInventory(db, selectedViews);
    if (!isDeepStrictEqual(afterRead, beforeRead)) {
      // Report schema names only. Row values and captured digests stay private.
      const beforeTables = new Map(beforeRead.tables.map(table => [table.name, table]));
      const afterTables = new Map(afterRead.tables.map(table => [table.name, table]));
      const affected = [...new Set([...beforeTables.keys(), ...afterTables.keys()])].filter(name =>
        /^[a-z0-9_]+$/.test(name) && !isDeepStrictEqual(beforeTables.get(name), afterTables.get(name)));
      if (beforeRead.schemaSha256 !== afterRead.schemaSha256) affected.push('schema');
      if (!isDeepStrictEqual(beforeRead.settings, afterRead.settings)) affected.push('public settings');
      if (affected.includes('audit_logs')) {
        const auditAfter = await auditActionCounts(db);
        const changes = [...new Set([...auditBefore.keys(), ...auditAfter.keys()])].flatMap(action => {
          const delta = (auditAfter.get(action) ?? 0) - (auditBefore.get(action) ?? 0);
          return delta && /^[a-z][a-z_.-]{0,95}$/.test(action) ? [action + ' (' + delta + ')'] : [];
        });
        affected.push(...changes);
      }
      options.onStep?.('read-only inventory changed in ' + affected.join(', '));
    }
    assert.deepEqual(afterRead, beforeRead, 'Recorded work and linked source reads preserved every business and audit row');
    options.onStep?.('verify that only permitted runtime form-load telemetry appended');
    const runtimeFormLoadsAppended = assertPreservedWithFormLoads(beforeLoads, afterLoads, options.releaseId);
    signal.throwIfAborted();
    options.onStep?.('finish the recorded-work checks and close their browser contexts');
    return { tests: 1, skipped: 0, widths, completedSteps: { reviewer: 2, superAdmin: 1 }, source: 'seller application review',
      startedReviewsExcludedFromCounts: 3, superAdminAuthenticator: 'verified by current hosted setup, TOTP activation and one-use recovery sign-in',
      transport: 'real packaged HTTP with genuine browser password sessions', businessTablesUnchanged: beforeRead.tables.length,
      auditRowsUnchanged: true, runtimeFormLoadsAppended, denied: ['foreign actor', 'overlong date range', 'missing capability', 'hidden navigation', 'unauthorised source'] };
  } finally {
    const closed = await Promise.allSettled(contexts.map(context => context.close()));
    await browser.close();
    assert.ok(closed.every(result => result.status === 'fulfilled'), 'Every recorded-work browser context must close');
  }
}
