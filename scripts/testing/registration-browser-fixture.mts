import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { BrowserContext, Page } from 'playwright-core';
import { readOwned as readOwnedRegistrationMedia } from '../recovery/registration-media.mjs';

// These tables may append only fictional registration facts. Original rows are
// independently checked byte-for-byte, including expired drafts: cleanup is not
// permission to remove another fixture's retained evidence.
export const registrationTables = ['account_email_verifications', 'form_answer_sets', 'request_rate_limits', 'file_health_observations', 'notification_messages',
  'seller_profiles', 'seller_participation_profiles', 'seller_operational_addresses',
  'seller_registration_intakes', 'seller_documents', 'seller_application_drafts',
  'seller_application_draft_uploads'] as const;

export function assertOriginalRows(before: readonly string[], after: readonly string[]) {
  const remaining = new Map<string, number>();
  for (const row of after) remaining.set(row, (remaining.get(row) ?? 0) + 1);
  for (const row of before) {
    assert.ok(remaining.get(row), 'An original registration-related row was altered or removed');
    remaining.set(row, remaining.get(row)! - 1);
  }
}

/** Called only after the authenticated runner and every browser have stopped. */
export async function retainRegistrationMedia(project: string, sourceRoot: string, keys: readonly string[], archiveSha256: string) {
  assert.match(archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE, '1');
  const target = await realpath(process.env.MEDIA_ROOT ?? 'missing');
  const local = relative(await realpath(project), target).split(sep).join('/');
  assert.match(local, /^\.test-artifacts\/t35\/current-artifact-native-\d+\/\d+\/media$/);
  const markerPath = resolve(process.env.HATSKALA_NATIVE_MARKER ?? 'missing');
  assert.equal(dirname(markerPath), resolve(project, '.superpowers/sdd/2026-10-16-staging-native-compatibility'));
  const marker = JSON.parse(await readFile(markerPath, 'utf8'));
  const ownershipPath = resolve(target, '../ownership.json');
  assert.ok((await lstat(ownershipPath)).isFile() && !(await lstat(ownershipPath)).isSymbolicLink());
  const ownership = JSON.parse(await readFile(ownershipPath, 'utf8'));
  assert.equal(ownership.name, marker.name); assert.equal(ownership.token, marker.token);
  assert.equal(marker.token, process.env.HATSKALA_NATIVE_TOKEN);
  assert.equal(marker.database, process.env.DB_NAME);
  sourceRoot = resolve(sourceRoot);
  const files = [];
  for (const key of [...new Set(keys)].sort()) {
    assert.match(key, /^private\/[a-zA-Z0-9_/-]+$/);
    assert.ok(!key.split('/').some(part => !part || part === '.' || part === '..'));
    for (const suffix of ['', '.metadata.json']) {
      const path = key + suffix, source = resolve(sourceRoot, path), destination = resolve(target, path);
      // The private target has no pre-existing paths in this random user's scope.
      // Walk each ancestor so recursive mkdir cannot follow a retained symlink.
      let parent = target;
      for (const segment of path.split('/').slice(0, -1)) {
        parent = resolve(parent, segment);
        try { await mkdir(parent, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
        assert.ok((await lstat(parent)).isDirectory() && !(await lstat(parent)).isSymbolicLink());
      }
      const bytes = await readOwnedRegistrationMedia(sourceRoot, source);
      await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 });
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      assert.equal(createHash('sha256').update(await readFile(destination)).digest('hex'), sha256);
      files.push({ path, sha256, bytes: bytes.length });
    }
  }
  assert.ok(files.length >= 2);
  const manifest = JSON.stringify({ version: 1, producer: 'packaged-registration-browser-v1', database: marker.database,
    ownerName: marker.name, archiveSha256, files }, null, 2);
  await writeFile(resolve(target, '../registration-browser-media.json'), manifest, { flag: 'wx', mode: 0o600 });
  return { retainedObjects: files.length / 2, exactBytesRetained: true, manifestSha256: createHash('sha256').update(manifest).digest('hex') };
}
async function snapshotTableRows(db: Connection, table: string, metadata = '') {
  assert.match(table, /^[a-z_][a-z0-9_]*$/);
  const [columns] = await db.query<RowDataPacket[]>('SELECT COLUMN_NAME name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? ORDER BY ORDINAL_POSITION', [table]);
  assert.ok(columns.length, `Missing registration fixture table: ${table}`);
  const identifiers = columns.map(row => { assert.match(row.name, /^[a-z_][a-z0-9_]*$/); return '`' + row.name + '`'; });
  const byteColumns = identifiers.map((name, i) => `HEX(CAST(${name} AS BINARY)) AS c${i}`).join(',');
  const [rows] = await db.query<RowDataPacket[]>('SELECT ' + metadata + byteColumns + ' FROM `' + table + '`');
  return rows;
}

const rowDigest = (row: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(Object.values(row))).digest('hex');

export async function registrationSnapshot(db: Connection, tables: readonly string[] = registrationTables) {
  const result = new Map<string, string[]>();
  for (const table of tables) result.set(table, (await snapshotTableRows(db, table)).map(rowDigest));
  return result;
}

export async function snapshotFormLoadObservations(db: Connection) {
  const rows = await snapshotTableRows(db, 'form_health_observations',
    'id,phase,evidence_kind AS evidenceKind,environment,release_id AS releaseId,evidence_id AS evidenceId,');
  return rows.map(({ id, phase, evidenceKind, environment, releaseId, evidenceId, ...bytes }) => ({
    id: String(id), phase: String(phase), evidenceKind: String(evidenceKind), environment: String(environment),
    releaseId: String(releaseId), evidenceId: evidenceId === null ? null : String(evidenceId),
    digest: rowDigest(bytes),
  }));
}

type FormLoadObservations = Awaited<ReturnType<typeof snapshotFormLoadObservations>>;

export function assertPreservedWithFormLoads(before: FormLoadObservations, after: FormLoadObservations, releaseId: string, mayIncludePreparation = false) {
  assertOriginalRows(before.map(row => row.digest), after.map(row => row.digest));
  const originals = new Set(before.map(row => row.id));
  const appended = after.filter(row => !originals.has(row.id));
  for (const observation of appended) {
    assert.deepEqual([observation.phase, observation.evidenceKind, observation.evidenceId], ['load', 'runtime', null],
      'Only genuine runtime form-load telemetry may append during these browser checks');
    if (observation.environment === 'unknown') assert.equal(observation.releaseId, 'unrecorded');
    else {
      assert.ok(observation.environment === 'production' || mayIncludePreparation && observation.environment === 'local_staging');
      assert.equal(observation.releaseId, releaseId);
    }
  }
  return appended.length;
}

export async function acknowledgeRegisteredSellerTerms(page: Page) {
  const context = await page.locator('input[name="sellerAgreementContext"]').inputValue();
  assert.equal(/^[a-f0-9]{64}$/.test(context), true, 'Current Registered Seller agreement context is required');
  await page.locator('input[name="acceptedTerms"]').check();
  await page.locator('input[name="applicationAcknowledgement"]').check();
}

export async function assertRegisteredSellerTermsAcceptance(db: Connection, sellerId: string, applicantId: string,
  terms: { versionId: string | null; basisPoints: number; agreementVersion: string }) {
  const [rows] = await db.query<RowDataPacket[]>(`SELECT accepted_by AS applicantId, agreement_version AS agreementVersion,
    commission_setting_version_id AS versionId, commission_bps AS basisPoints, acceptance_request_id AS requestId
    FROM seller_agreement_acceptance_history WHERE seller_id=?`, [sellerId]);
  assert.equal(rows.length, 1, 'One immutable agreement acceptance is required per fictional registration');
  const { requestId, ...accepted } = rows[0];
  assert.ok(typeof requestId === 'string' && requestId.length > 0);
  assert.deepEqual({ ...accepted, basisPoints: Number(accepted.basisPoints) }, {
    applicantId, agreementVersion: terms.agreementVersion, versionId: terms.versionId, basisPoints: terms.basisPoints,
  });
}

export async function prepareRegistrationActors(db: D1Database, labels = ['applicant', 'foreign']) {
  const { passwordRecord } = await import('../../lib/auth/hosted-session');
  const accounts = [];
  for (const label of labels) {
    const id = `browser-registration-${label}-${randomUUID()}`, email = `${id}@local.hastabazaar.test`;
    const password = Buffer.from(randomBytes(32)).toString('base64url'), credential = await passwordRecord(password), now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,?,'active','en',?,?)").bind(id, id, email, 'Fictional registration ' + label, now, now),
      db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'customer',?)").bind(id, now),
      db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)').bind(id, credential.hash, credential.salt, now, now),
      // Explicit fictional mailbox fact; this gate tests password/session ownership,
      // not provider delivery or the separate email verification ceremony.
      db.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES(?,?,?)').bind(id, email, now),
    ]);
    accounts.push({ id, email, password });
  }
  return accounts;
}

// The packaged gate calls this only after authenticating its disposable native
// database. An approved baseline is a fixture fact, not an application decision.
export async function preparePublicShopOwner(db: D1Database, registerSecret: (secret: string) => void) {
  const { passwordRecord, verifyPassword } = await import('../../lib/auth/hosted-session');
  const { getPublicMakerProfile } = await import('../../lib/db/repositories/customers');
  const { getSellerCenterAccess } = await import('../../lib/db/repositories/seller-center-access');
  const fixtureId = randomUUID();
  const id = `browser-public-owner-${fixtureId}`;
  const sellerId = `browser-public-shop-${fixtureId}`;
  const displayName = `Fictional Browser Shop ${fixtureId.slice(0, 8)}`;
  const email = `${id}@local.hastabazaar.test`;
  const password = Buffer.from(randomBytes(32)).toString('base64url');
  registerSecret(password);
  const credential = await passwordRecord(password);
  assert.equal(await verifyPassword(password, credential.hash, credential.salt), true);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,locale,created_at,updated_at) VALUES(?,?,?,?,'active','en',?,?)")
      .bind(id, id, email, displayName, now, now),
    db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'customer',?),(?,'seller',?)")
      .bind(id, now, id, now),
    db.prepare('INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES(?,?,?,?,?)')
      .bind(id, credential.hash, credential.salt, now, now),
    db.prepare('INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES(?,?,?)').bind(id, email, now),
    db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,
      tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,
      status,review_note,approved_at,created_at,updated_at) VALUES(?,?,?,?,'fictional-fixture',?,'PAN',?,?,'',?,
      'Bagmati','Kathmandu','Kathmandu','Fictional test workshop','approved','Fictional packaged browser fixture',?,?,?)`)
      .bind(sellerId, id, displayName, displayName, fixtureId, `fixture-${fixtureId}`, displayName, email, now, now, now),
  ]);
  const owner = await getSellerCenterAccess(db, id);
  assert.ok(owner?.userId === id && owner.sellerId === sellerId && owner.approvedSeller, 'Exact fictional owner has approved Seller Center access');
  const shop = await getPublicMakerProfile(db, sellerId);
  assert.ok(shop?.id === sellerId && shop.tradingName === displayName, 'Exact fictional public profile and heading are eligible');
  return { account: { id, email, password }, sellerId, displayName };
}

export async function assertSellerProfilePublicShop(options: {
  owner: Page;
  anonymous: Page;
  origin: string;
  sellerId: string;
  expected: { public: false } | { public: true; displayName: string };
}) {
  const { owner, anonymous, origin, sellerId, expected } = options;
  const profileUrl = origin + '/seller/profile';
  const makerPath = '/makers/' + sellerId;
  const makerUrl = origin + makerPath;
  const profile = await owner.goto(profileUrl);
  assert.equal(profile?.status(), 200, 'Owner can open Shop profile');
  assert.equal(owner.url(), profileUrl);
  const main = owner.locator('#main-content');
  await main.getByRole('heading', { name: 'Shop profile', exact: true }).waitFor();
  await main.getByRole('region', { name: 'Reviewed public profile', exact: true }).waitFor();
  const cta = main.getByRole('link', { name: /^View public shop/ });
  if (expected.public) {
    assert.equal(await cta.getAttribute('href'), makerPath);
    await cta.click();
    await owner.waitForURL(makerUrl);
    await owner.locator('#main-content').getByRole('heading', { level: 1, name: expected.displayName, exact: true }).waitFor();
  } else {
    await main.getByRole('heading', { name: 'Your private draft', exact: true }).waitFor();
    await main.getByText('Preview this private draft', { exact: true }).waitFor();
    assert.equal(await cta.count(), 0, 'Private applicant has no public-shop CTA');
    assert.equal(await owner.locator('a[href="' + makerPath + '"]').count(), 0, 'Seller Center has no link to the private maker');
  }
  const direct = await anonymous.goto(makerUrl);
  assert.equal(anonymous.url(), makerUrl, 'Direct public maker navigation must not redirect');
  if (expected.public) {
    assert.equal(direct?.status(), 200);
    await anonymous.locator('#main-content').getByRole('heading', { level: 1, name: expected.displayName, exact: true }).waitFor();
  } else {
    assert.equal(direct?.status(), 404);
    await anonymous.getByRole('heading', { name: 'This page has wandered away.', exact: true }).waitFor();
  }
}

export async function signInPackagedBrowser(page: Page, origin: string, account: { email: string; password: string }, destination: string) {
  await page.goto(origin + '/login?return_to=' + encodeURIComponent(destination));
  const form = page.locator('form[data-form-id="identity.login-password"]');
  await form.locator('[name="email"]').fill(account.email);
  await form.locator('[name="password"]').fill(account.password);
  const login = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/login');
  await form.getByRole('button', { name: 'Sign in', exact: true }).click();
  assert.equal((await login).status(), 303);
  const cookie = (await page.context().cookies()).find(value => value.name === 'hastabazaar_session');
  assert.ok(cookie?.secure && cookie.httpOnly && cookie.sameSite === 'Lax', 'Real sign-in must retain protected session cookie');
}

type CapturedRegistrationRequest = { contentType: string; bytes: number[] };
type RegistrationCaptureWindow = Window & {
  ownedRegistrationCapture?: { restore(): void; body?: Promise<CapturedRegistrationRequest> };
};

async function submitAndReplayRegistration(page: Page, account: string) {
  // Chromium may omit file-backed multipart bytes from Playwright request
  // metadata. Observe the Fetch Request the browser sends, without changing
  // its bytes, headers, cookie context, response or destination.
  await page.evaluate(() => {
    const captureWindow = window as RegistrationCaptureWindow;
    if (captureWindow.ownedRegistrationCapture) throw new Error('Registration body capture already armed');
    const originalFetch = window.fetch;
    const observer: { fetch: typeof window.fetch } = {
      fetch(input, init) {
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
        if (url.origin !== location.origin || url.pathname !== '/api/seller-registrations' || method !== 'POST')
          return originalFetch.call(window, input, init);
        state.restore();
        const request = new Request(input, init);
        const contentType = request.headers.get('content-type') ?? '';
        const captured = request.clone().body;
        state.body = (async () => {
          if (!captured || !/^multipart\/form-data;\s*boundary=/.test(contentType))
            throw new Error('The genuine registration request must contain its browser-generated multipart body');
          const limit = 1024 * 1024;
          const reader = captured.getReader();
          const bytes: number[] = [];
          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              if (bytes.length + value.length > limit) {
                void reader.cancel().catch(() => {});
                throw new Error('Fictional multipart capture exceeded its one MiB bound');
              }
              for (const byte of value) bytes.push(byte);
            }
          } finally { reader.releaseLock(); }
          if (!bytes.length) throw new Error('No transmitted multipart bytes were captured');
          return { contentType, bytes };
        })();
        void state.body.catch(() => {}); // Read and propagate once the actual response arrives.
        return originalFetch.call(window, request);
      },
    };
    const state: NonNullable<RegistrationCaptureWindow['ownedRegistrationCapture']> = {
      restore() { if (window.fetch === observer.fetch) window.fetch = originalFetch; },
    };
    captureWindow.ownedRegistrationCapture = state;
    window.fetch = observer.fetch;
  });
  try {
    const submitted = page.waitForResponse(response => response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/api/seller-registrations');
    await page.getByRole('button', { name: 'Submit application', exact: true }).click();
    const response = await submitted;
    const receipt = await response.json() as { applicationReference?: string };
    assert.equal(response.status(), 201); assert.ok(receipt.applicationReference);
    await page.getByRole('heading', { name: 'Application submitted', exact: true }).waitFor();
    const captured = await page.evaluate(() => {
      const state = (window as RegistrationCaptureWindow).ownedRegistrationCapture;
      if (!state?.body) throw new Error('Genuine registration body was not observed');
      return state.body;
    });
    const sentHeaders = response.request().headers();
    assert.equal(captured.contentType, sentHeaders['content-type']);
    assert.equal(sentHeaders['x-hastabazaar-actor'], account);
    const replay = await page.evaluate(async ({ contentType, account, bytes }) => {
      const result = await fetch('/api/seller-registrations', { method: 'POST',
        headers: { 'content-type': contentType, 'X-Hastabazaar-Actor': account }, body: new Uint8Array(bytes) });
      return { status: result.status, body: await result.json() as { applicationReference?: string } };
    }, { ...captured, account });
    assert.equal(replay.status, 200);
    assert.equal(replay.body.applicationReference, receipt.applicationReference);
    return { receipt, captured };
  } finally {
    await page.evaluate(() => {
      const captureWindow = window as RegistrationCaptureWindow;
      captureWindow.ownedRegistrationCapture?.restore();
      delete captureWindow.ownedRegistrationCapture;
    });
  }
}

export async function runRegistrationBrowser(options: {
  db: Connection; origin: string; executablePath: string; reviewerState: string;
  browserEnvironment: Record<string, string>;
  signal: AbortSignal;
  accounts: Awaited<ReturnType<typeof prepareRegistrationActors>>;
  publicOwner: Awaited<ReturnType<typeof preparePublicShopOwner>>;
  registeredTerms: Parameters<typeof assertRegisteredSellerTermsAcceptance>[3];
}) {
  const { db, origin, accounts, publicOwner } = options;
  const checkpoint = () => options.signal.throwIfAborted();
  checkpoint();
  const url = new URL(origin);
  assert.ok(url.hostname === '127.0.0.1' && url.protocol === 'http:' && url.port !== '3018' && url.port);
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE!);
  const browser = await chromium.launch({ headless: true, executablePath: options.executablePath, env: options.browserEnvironment });
  const contexts: BrowserContext[] = [];
  const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGElEQVQokWNwKe8gCTGMaigfDSWX4Zo0AHQCQxBwMUMGAAAAAElFTkSuQmCC', 'base64');
  try {
    async function customer(account: typeof accounts[number]) {
      const context: BrowserContext = await browser.newContext(); contexts.push(context);
      const page = await context.newPage();
      await signInPackagedBrowser(page, origin, account, '/sell');
      await page.waitForURL(origin + '/sell');
      await page.getByRole('button', { name: 'Start seller registration', exact: true }).click();
      await page.waitForURL(origin + '/sell/apply');
      await page.getByRole('button', { name: 'Save progress now', exact: true }).waitFor();
      return { context, page };
    }
    // All fetches below execute in the browser's genuine cookie context. No route
    // interception, identity substitution, mounted component, or generated bundle.
    async function get(page: Page, path: string, headers: Record<string,string> = {}) {
      return page.evaluate(async ({ path, headers }) => { const response = await fetch(path, { headers, cache: 'no-store' }); return { status: response.status, cache: response.headers.get('cache-control'), body: await response.text() }; }, { path, headers });
    }
    const owner = await customer(accounts[0]), foreign = await customer(accounts[1]);
    const page = owner.page;
    await page.locator('[name="hasBusinessTaxRegistration"]').selectOption('yes');
    await page.locator('[name="legalName"]').fill('Fictional incomplete registration');
    await page.locator('[name="businessRegistration"]').setInputFiles({ name: 'fictional-registration.png', mimeType: 'image/png', buffer: bytes });
    await page.getByRole('button', { name: 'Save progress now', exact: true }).click();
    await page.getByText('Progress saved to your account.', { exact: true }).waitFor();
    const saved = await get(page, '/api/seller-applications/draft', { 'X-Draft-Account': accounts[0].id });
    assert.equal(saved.status, 200); assert.match(saved.cache!, /no-store/);
    const draft = JSON.parse(saved.body).draft;
    assert.equal(draft.answers.legalName[0], 'Fictional incomplete registration');
    assert.ok(draft.files.businessRegistration.id);
    assert.equal((await get(foreign.page, '/api/seller-applications/draft', { 'X-Draft-Account': accounts[0].id })).status, 403);
    assert.equal((await get(foreign.page, '/api/seller-applications/draft?file=' + draft.files.businessRegistration.id, { 'X-Draft-Account': accounts[1].id })).status, 404);
    await page.reload(); await page.getByText(/Saved progress restored/).waitFor();
    assert.equal(await page.locator('[name="legalName"]').inputValue(), 'Fictional incomplete registration');
    await page.getByText(/Saved: fictional-registration.png/).waitFor();
    assert.equal(await page.locator('[name="phone"]').inputValue(), '');
    assert.equal(await page.locator('[name="taxRegistrationNumber"]').inputValue(), '');
    await acknowledgeRegisteredSellerTerms(page);
    const { receipt, captured } = await submitAndReplayRegistration(page, accounts[0].id);
    const [profiles] = await db.query<RowDataPacket[]>('SELECT id,status,application_reference FROM seller_profiles WHERE user_id=?', [accounts[0].id]);
    assert.equal(profiles.length, 1); assert.equal(profiles[0].status, 'submitted');
    assert.equal(profiles[0].application_reference, receipt.applicationReference);
    const sellerId = profiles[0].id;
    await assertRegisteredSellerTermsAcceptance(db, sellerId, accounts[0].id, options.registeredTerms);
    const [documents] = await db.query<RowDataPacket[]>('SELECT id,status,object_key FROM seller_documents WHERE seller_id=?', [sellerId]);
    assert.equal(documents.length, 1); assert.equal(documents[0].status, 'pending');
    const privatePath = '/api/admin/seller-documents/' + documents[0].id;
    for (const actor of [owner, foreign]) assert.equal((await get(actor.page, privatePath)).status, 403);
    const reviewer: BrowserContext = await browser.newContext({ storageState: options.reviewerState }); contexts.push(reviewer);
    const reviewerPage = await reviewer.newPage(); await reviewerPage.goto(origin + '/');
    const privateResponse = await reviewerPage.evaluate(async path => { const response = await fetch(path); return { status: response.status, cache: response.headers.get('cache-control'), bytes: [...new Uint8Array(await response.arrayBuffer())] }; }, privatePath);
    assert.equal(privateResponse.status, 200); assert.match(privateResponse.cache!, /no-store/);
    assert.deepEqual(Buffer.from(privateResponse.bytes), bytes);
    const anonymous: BrowserContext = await browser.newContext(); contexts.push(anonymous);
    const anonymousPage = await anonymous.newPage(); await anonymousPage.goto(origin + '/');
    assert.equal((await get(anonymousPage, privatePath)).status, 401);
    assert.equal((await get(foreign.page, '/api/seller-registrations', { 'X-Hastabazaar-Actor': accounts[0].id })).status, 403);
    const foreignWrite = await foreign.page.evaluate(async account => (await fetch('/api/seller-registrations', { method: 'PUT', headers: { 'X-Hastabazaar-Actor': account }, body: new FormData() })).status, accounts[0].id);
    assert.equal(foreignWrite, 403);
    assert.equal(JSON.parse((await get(foreign.page, '/api/seller-registrations')).body).registration, null);
    // A fixture-only retained evidence fact, never an application approval call.
    checkpoint();
    await db.query("UPDATE seller_documents SET status='verified' WHERE id=? AND seller_id=? AND status='pending'", [documents[0].id, sellerId]);
    await page.goto(origin + '/seller/registration');
    const legal = page.locator('input[name="legalName"]'); await legal.waitFor();
    assert.equal(await legal.getAttribute('readonly'), '');
    assert.equal(await page.locator('input[name="businessRegistration"]').isDisabled(), true);
    const currentFormVersion = page.locator('input[name="formVersion"]');
    await currentFormVersion.waitFor({ state: 'attached' });
    const formVersion = await currentFormVersion.inputValue();
    assert.match(formVersion, /^[1-9][0-9]*$/);
    const denied = await page.evaluate(async ({ account, captured, formVersion }) => {
      // Start with the actual accepted receiver fields so the negative attempt
      // reaches the protected-record guard independently of client hydration.
      const source = new Response(new Uint8Array(captured.bytes), { headers: { 'content-type': captured.contentType } });
      const body = await source.formData();
      for (const [name, value] of Array.from(body)) {
        if (typeof value !== 'string') body.delete(name);
      }
      if (body.get('formVersion') !== formVersion) throw new Error('The current published form version differs from the accepted receipt');
      body.set('legalName', 'Forbidden replacement');
      body.set('requestId', crypto.randomUUID());
      body.set('revision', '1');
      const response = await fetch('/api/seller-registrations', { method: 'PUT', headers: { 'X-Hastabazaar-Actor': account }, body });
      const result = await response.json() as { error?: string };
      const error = result.error ?? '';
      const known = ['Verified documents and their identity details are locked.', 'Unknown registration field.', 'Invalid registration field.',
        'Enter a valid seller registration email.', 'A registration request reference is required.', 'Your saved details changed.'];
      return { status: response.status, receiverReason: known.find(prefix => error.startsWith(prefix)) ?? 'other' };
    }, { account: accounts[0].id, captured, formVersion });
    assert.deepEqual(denied, { status: 409, receiverReason: 'Verified documents and their identity details are locked.' },
      'The verified-document guard must refuse the otherwise valid change');
    const [retainedDocuments] = await db.query<RowDataPacket[]>('SELECT id,status,object_key FROM seller_documents WHERE seller_id=?', [sellerId]);
    assert.deepEqual(retainedDocuments, [{ ...documents[0], status: 'verified' }]);
    const [intakes] = await db.query<RowDataPacket[]>('SELECT version,review_ready,answers_json FROM seller_registration_intakes WHERE user_id=?', [accounts[0].id]);
    assert.equal(intakes[0].version, 1); assert.equal(intakes[0].review_ready, 0);
    assert.equal(JSON.parse(intakes[0].answers_json).legalName[0], 'Fictional incomplete registration');
    const [roles] = await db.query<RowDataPacket[]>("SELECT role FROM user_roles WHERE user_id=? AND role='seller'", [accounts[0].id]); assert.equal(roles.length, 0);
    const [final] = await db.query<RowDataPacket[]>('SELECT status FROM seller_profiles WHERE id=?', [sellerId]); assert.equal(final[0].status, 'submitted');
    checkpoint();
    await assertSellerProfilePublicShop({ owner: page, anonymous: anonymousPage, origin, sellerId, expected: { public: false } });
    checkpoint();
    const publicOwnerContext: BrowserContext = await browser.newContext();
    contexts.push(publicOwnerContext);
    const publicOwnerPage = await publicOwnerContext.newPage();
    await signInPackagedBrowser(publicOwnerPage, origin, publicOwner.account, '/seller/profile');
    await publicOwnerPage.waitForURL(origin + '/seller/profile');
    await assertSellerProfilePublicShop({
      owner: publicOwnerPage, anonymous: anonymousPage, origin, sellerId: publicOwner.sellerId,
      expected: { public: true, displayName: publicOwner.displayName },
    });
    const [uploads] = await db.query<RowDataPacket[]>('SELECT object_key FROM seller_application_draft_uploads WHERE user_id=?', [accounts[0].id]);
    checkpoint();
    return { acceptance: { tests: 1, skipped: 0, transport: 'genuine packaged HTTP, password sign-in, Secure HttpOnly sessions', fixtureDocumentVerifiedOnly: true, applicationApproved: false,
      publicShop: { applicant: 'private editor and preview retained, public CTA absent, anonymous route 404',
        owner: 'approved fixture owner clicked through, anonymous heading matched', ownerId: publicOwner.account.id,
        sellerId: publicOwner.sellerId, displayName: publicOwner.displayName } },
      mediaKeys: [...documents, ...uploads].map(row => String(row.object_key)) };
  } finally {
    const closed = await Promise.allSettled(contexts.map(context => context.close()));
    await browser.close();
    assert.ok(closed.every(result => result.status === 'fulfilled'), 'Every registration browser context must close');
  }
}
