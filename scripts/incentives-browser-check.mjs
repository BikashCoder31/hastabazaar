import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync, backup } from 'node:sqlite';
import {
  mkdir,
  readFile,
  readdir,
  realpath,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  verifyIncentiveSetupContext,
  readIncentiveSetupSnapshot,
} from './form-catalog-local-setup.mjs';
import {
  applyLocalD1Migrations,
  locateLocalD1Database,
} from './staging/local-d1.mjs';

const APPROVED_CHECKOUT = resolve(
  'C:/Users/abinash/.codex/worktrees/hastabazaar-v1-2-1-staging/Hatskala',
);
const CANONICAL_DB =
  'faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite';
const widths = [232, 390, 722, 1024, 1440, 1920];
const hash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
function inspect(databasePath, fn) {
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const value=fn(db);return value===undefined?undefined:JSON.parse(JSON.stringify(value));
  } finally {
    db.close();
  }
}
function inventory(db) {
  return Object.fromEntries(
    db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all()
      .map(({ name }) => {
        assert.match(name, /^[a-zA-Z0-9_]+$/);
        return [
          name,
          db.prepare(`SELECT COUNT(*) AS n FROM "${name}"`).get().n,
        ];
      }),
  );
}
export async function preflightLocalPromo({
  apply = false,
  makeBackup = false,
} = {}) {
  assert.equal(
    resolve(process.cwd()),
    APPROVED_CHECKOUT,
    'Run only in the approved worktree.',
  );
  assert.equal(
    resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    APPROVED_CHECKOUT,
  );
  const { paths, origin } = await verifyIncentiveSetupContext({
    projectRoot: APPROVED_CHECKOUT,
    environment: process.env,
  });
  assert.equal(
    origin.origin,
    'http://localhost:4173',
    'Acceptance preserves the exact preview origin.',
  );
  const databasePath = await realpath(await locateLocalD1Database(paths));
  assert.equal(
    databasePath,
    join(paths.state, 'v3', 'd1', 'miniflare-D1DatabaseObject', CANONICAL_DB),
    'Canonical marked database mismatch.',
  );
  assert.ok(databasePath.startsWith(paths.state + sep));
  const names = (await readdir(join(APPROVED_CHECKOUT, 'drizzle')))
    .filter((n) => /^\d{4}_.+\.sql$/.test(n))
    .sort();
  const read = () =>
    inspect(databasePath, (db) => {
      const applied = db
        .prepare('SELECT name FROM _hastabazaar_local_migrations ORDER BY name')
        .all()
        .map((r) => r.name);
      assert.ok(
        applied.every((n) => names.includes(n)),
        'Unknown migration ledger entry.',
      );
      const accounts = db
        .prepare(
          "SELECT id,email,status FROM users WHERE id IN ('local-test-customer','local-test-buyer','local-test-super-admin') ORDER BY id",
        )
        .all();
      assert.equal(
        accounts.length,
        3,
        'Existing fictional identities required.',
      );
      const expected = {
        'local-test-customer': 'customer',
        'local-test-buyer': 'buyer',
        'local-test-super-admin': 'superadmin',
      };
      for (const a of accounts) {
        assert.equal(a.status, 'active');
        assert.equal(a.email, expected[a.id] + '@local.hastabazaar.test');
      }
      return {
        applied,
        pending: names.filter((n) => !applied.includes(n)),
        counts: inventory(db),
        accounts: accounts.map((a) => a.id),
      };
    });
  const before = read();
  assert.ok(
    before.pending.length === 0 ||
      (before.pending.length === 1 &&
        before.pending[0] === '0060_promo_codes.sql'),
    'Only pending 0060 is authorized; helper otherwise applies all pending migrations.',
  );
  const output = join(paths.root, 'artifacts', 'incentives');
  await mkdir(output, { recursive: true });
  const evidence = {
    databasePath,
    markerVerified: true,
    origin: origin.origin,
    environment: {
      runtime: process.env.HASTABAZAAR_RUNTIME_ENV,
      mail: process.env.HASTABAZAAR_MAIL_MODE,
      payment: process.env.HASTABAZAAR_PAYMENT_MODE,
      recipients: process.env.HASTABAZAAR_RECIPIENT_DOMAIN,
    },
    before,
    backup: null,
    migration: null,
  };
  if (apply) {
    const attestation = JSON.parse(
      await readFile(join(output, 'runtime-attestation.json'), 'utf8'),
    );
    assert.equal(attestation.project, APPROVED_CHECKOUT);
    assert.equal(attestation.state, paths.state);
    for (const [key, expected] of Object.entries({
      origin: origin.origin,
      runtime: 'local_staging',
      mail: 'capture',
      payment: 'simulated',
      recipients: 'local.hastabazaar.test',
      remoteBindings: false,
      forbiddenBindingsAbsent: true,
      noLocalEnvFiles: true,
      guardedLaunch: true,
    }))
      assert.equal(attestation[key], expected);
    const health = await fetch(new URL('/health/live', origin), {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
    });
    assert.equal(
      health.status,
      200,
      'Refreshed safe local runtime must be reachable.',
    );
    evidence.runtimeAttestation = attestation;
  }
  if (makeBackup || apply) {
    const destination = join(
      output,
      `pre-0060-${Date.now()}-${randomUUID()}.sqlite`,
    );
    const source = new DatabaseSync(databasePath, { readOnly: true });
    try {
      await backup(source, destination);
    } finally {
      source.close();
    }
    const verification = inspect(destination, (db) => {
      assert.equal(
        db.prepare('PRAGMA integrity_check').get().integrity_check,
        'ok',
      );
      const counts = inventory(db);
      assert.deepEqual(
        counts,
        before.counts,
        'Online snapshot counts mismatch.',
      );
      assert.deepEqual(
        db
          .prepare(
            'SELECT name FROM _hastabazaar_local_migrations ORDER BY name',
          )
          .all()
          .map((r) => r.name),
        before.applied,
      );
      return { integrity: 'ok', countsMatch: true, sha256: hash(counts) };
    });
    evidence.backup = { path: destination, ...verification };
  }
  await writeFile(
    join(output, 'preflight.json'),
    JSON.stringify(evidence, null, 2),
  );
  if (apply && before.pending.length) {
    assert.deepEqual(
      read(),
      before,
      'Local state changed after backup; inspect before applying.',
    );
    const beforeSnapshot = readIncentiveSetupSnapshot(databasePath);
    evidence.migration = await applyLocalD1Migrations(paths, APPROVED_CHECKOUT);
    assert.equal(evidence.migration.applied, 1);
    const after = read();
    assert.deepEqual(after.pending, []);
    assert.deepEqual(
      readIncentiveSetupSnapshot(databasePath).published,
      beforeSnapshot.published,
    );
    for (const [table, count] of Object.entries(before.counts).filter(
      ([table]) => table !== '_hastabazaar_local_migrations',
    ))
      assert.equal(
        after.counts[table],
        count,
        `Migration changed ${table} count.`,
      );
    evidence.after = after;
    await writeFile(
      join(output, 'migration-0060.json'),
      JSON.stringify(evidence, null, 2),
    );
  }
  return { paths, origin, databasePath, output, evidence };
}

async function main() {
  const args = process.argv.slice(2);
  assert.ok(
    args.includes('--phase=promo') &&
      args.every((a) =>
        ['--phase=promo', '--preflight', '--apply-pending-0060'].includes(a),
      ),
    'Explicit --phase=promo is required; combined belongs to Task 12.',
  );
  const ready = await preflightLocalPromo({
    makeBackup: args.includes('--preflight'),
    apply: args.includes('--apply-pending-0060'),
  });
  if (args.includes('--preflight') || args.includes('--apply-pending-0060')) {
    console.log(JSON.stringify(ready.evidence, null, 2));
    return;
  }
  assert.deepEqual(
    ready.evidence.before.pending,
    [],
    'Apply guarded local 0060 before the browser journey.',
  );
  await runPromoJourney(ready);
}
function fixtureRows(db) {
  const tables = [
    'users',
    'user_roles',
    'seller_profiles',
    'seller_participation_profiles',
    'seller_documents',
    'seller_profile_media',
    'seller_operational_addresses',
    'seller_restrictions',
    'seller_restriction_events',
    'seller_agreement_acceptance_history',
    'products',
    'product_media',
    'seller_ledger_entries',
  ];
  return Object.fromEntries(
    tables.map((t) => [
      t,
      db.prepare(`SELECT * FROM "${t}" ORDER BY rowid`).all().map(row=>({...row})),
    ]),
  );
}
function addFictionalParcel(databasePath, state) {
  const before = inspect(databasePath, fixtureRows);
  if (before.products.some((p) => p.id === state.fixture.product)) return;
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
    const insert = (table, row) => {
      const columns = Object.keys(row);
      db.prepare(
        `INSERT INTO "${table}" (${columns.map((c) => '"' + c + '"').join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      ).run(...Object.values(row));
    };
    const now = Date.now();
    const source = db
      .prepare(
        "SELECT id,category_id,price_paisa FROM products WHERE seller_id='local-test-seller-profile' AND status='published' AND name_en LIKE 'SIMULATED %' AND inventory_quantity>0",
      )
      .all();
    assert.equal(
      source.length,
      1,
      'One existing fictional product is required.',
    );
    assert.equal(
      db
        .prepare(
          "SELECT COUNT(*) AS n FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps' AND status='published'",
        )
        .get().n,
      0,
      'Do not fabricate controlled commission acceptance.',
    );
    const agreementSource = awaitlessAgreement();
    insert('users', {
      id: state.fixture.owner,
      auth_subject: state.fixture.owner,
      email: state.fixture.owner + '@local.hastabazaar.test',
      display_name: 'SIMULATED promo acceptance fixture owner',
      status: 'active',
      created_at: now,
      updated_at: now,
    });
    insert('seller_profiles', {
      id: state.fixture.seller,
      user_id: state.fixture.owner,
      legal_name: 'SIMULATED fictional local parcel fixture',
      trading_name: 'SIMULATED Promo Parcel Studio',
      registration_authority: 'SIMULATED NOT A LEGAL AUTHORITY',
      registration_number: state.fixture.seller,
      tax_mode: 'PAN',
      tax_registration_number: '',
      representative_name: 'SIMULATED fixture owner',
      support_phone: '+9779800000099',
      support_email: state.fixture.owner + '@local.hastabazaar.test',
      province: 'Madhesh',
      district: 'Dhanusha',
      municipality: 'SIMULATED Janakpur',
      locality: 'SIMULATED local parcel fixture',
      status: 'approved',
      seller_agreement_version: agreementSource,
      seller_agreement_accepted_at: now,
      review_note:
        'SIMULATED initial fixture state; not an approval operation or real seller',
      approved_at: now,
      created_at: now,
      updated_at: now,
    });
    insert('products', {
      id: state.fixture.product,
      seller_id: state.fixture.seller,
      category_id: source[0].category_id,
      slug: state.fixture.product,
      sku: state.fixture.product.toUpperCase(),
      name_en: 'SIMULATED promo second parcel craft',
      description_en: 'SIMULATED local acceptance only',
      price_paisa: 10000,
      inventory_quantity: 5,
      producer: 'SIMULATED fixture owner',
      materials: 'SIMULATED clay',
      status: 'published',
      published_at: now,
      created_at: now,
      updated_at: now,
    });
    const after = fixtureRows(db);
    const added = new Set(Object.values(state.fixture));
    for (const [table, rows] of Object.entries(before))
      assert.deepEqual(
        after[table].filter((r) => !added.has(r.id)),
        rows,
        `Existing ${table} was changed by fixture setup.`,
      );
    db.exec('COMMIT');
    state.fixtureDeltas = {
      users: 1,
      seller_profiles: 1,
      products: 1,
      product_sku_claims: 1,
      existingRowsPreserved: true,
      privateMetadataCopied: false,
      initialApprovalState: 'SIMULATED approved fixture',
    };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    db.close();
  }
}
let sellerAgreement;
function awaitlessAgreement() {
  assert.match(sellerAgreement, /^seller-agreement:sha256:[0-9a-f]{64}$/);
  return sellerAgreement;
}

async function runPromoJourney({ paths, origin, databasePath, output }) {
  const attestation = JSON.parse(
    await readFile(join(output, 'runtime-attestation.json'), 'utf8'),
  );
  assert.equal(attestation.state, paths.state);
  assert.equal(attestation.guardedLaunch, true);
  const migration = JSON.parse(
    await readFile(join(output, 'migration-0060.json'), 'utf8'),
  );
  assert.equal(migration.databasePath, databasePath);
  assert.equal(migration.backup.integrity, 'ok');
  const policy = await readFile(
    join(APPROVED_CHECKOUT, 'lib/content/legal-policies.ts'),
    'utf8',
  );
  sellerAgreement = policy.match(/SELLER_AGREEMENT_VERSION\s*=\s*'([^']+)'/)[1];
  const statePath = join(output, 'promo-run-state.json');
  let state;
  try {
    state = JSON.parse(await readFile(statePath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const id = randomUUID().slice(0, 8);
    state = {
      schemaVersion: 1,
      id,
      code: 'SIM' + id.toUpperCase(),
      startedAt: new Date().toISOString(),
      fixture: {
        owner: 'sim-promo-owner-' + id,
        seller: 'sim-promo-seller-' + id,
        product: 'sim-promo-product-' + id,
      },
      originalCustomerCarts: inspect(databasePath, (db) =>
        hash(
          db
            .prepare(
              "SELECT * FROM carts WHERE user_id='local-test-customer' ORDER BY id",
            )
            .all(),
        ),
      ),
      initialCounts: inspect(databasePath, inventory),
      screenshots: [],
      checks: [],
      failures: [],
      blockedOrigins: [],
      consoleErrors: [],
    };
    await writeFile(statePath, JSON.stringify(state, null, 2), { flag: 'wx' });
  }
  assert.equal(state.schemaVersion, 1);
  assert.match(state.id, /^[0-9a-f]{8}$/);
  assert.equal(state.code, 'SIM' + state.id.toUpperCase());
  assert.deepEqual(state.fixture, {
    owner: 'sim-promo-owner-' + state.id,
    seller: 'sim-promo-seller-' + state.id,
    product: 'sim-promo-product-' + state.id,
  });
  state.consoleErrors = [];
  state.failures = [];
  state.screenshots = [];
  delete state.error;
  const save = async () => writeFile(statePath, JSON.stringify(state, null, 2));
  if (state.passed)
    throw Error(
      'This journey already passed; inspect retained evidence rather than creating another order.',
    );
  const playwrightModule = process.env.PLAYWRIGHT_MODULE;
  assert.ok(
    playwrightModule,
    'Use explicitly configured existing Playwright; never install/autofetch.',
  );
  const { chromium } = await import(
    pathToFileURL(resolve(playwrightModule)).href
  );
  assert.equal(
    process.env.CHROMIUM_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  );
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH,
    args: ['--disable-background-networking'],
  });
  let admin, customer;
  const localPath = (path) => {
    assert.ok(path.startsWith('/') && !path.startsWith('//'));
    const url = new URL(path, origin);
    assert.equal(url.origin, origin.origin);
    return url.href;
  };
  async function context(role) {
    const c = await browser.newContext({
      viewport: { width: 1024, height: 900 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    await c.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.origin !== origin.origin) {
        state.blockedOrigins.push(u.origin);
        return r.abort('blockedbyclient');
      }
      return r.continue();
    });
    if (role === 'customer') {
      try {
        const stored = JSON.parse(
          await readFile(
            join(output, state.id + '-customer-cookies.json'),
            'utf8',
          ),
        );
        await c.addCookies(stored);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
    await c.addCookies([
      {
        name: 'hastabazaar_local_test_role',
        value: role,
        url: origin.origin,
        httpOnly: true,
        sameSite: 'Strict',
      },
    ]);
    return c;
  }
  function listen(page, label) {
    page.on('pageerror', (e) =>
      state.consoleErrors.push({
        label,
        type: 'pageerror',
        message: e.message,
      }),
    );
    page.on('console', (m) => {
      if (
        ['error', 'warning'].includes(m.type()) &&
        !/ERR_BLOCKED_BY_CLIENT/.test(m.text())
      )
        state.consoleErrors.push({
          label,
          type: m.type(),
          message: m.text().slice(0, 12000),
        });
    });
    page.on('dialog', (d) => d.accept());
  }
  async function visit(page, path) {
    const response = await page.goto(localPath(path), {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    assert.ok(
      response && response.status() < 400,
      `${path} did not render (${response?.status()}).`,
    );
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('form,button,input')].some((n) =>
          Object.keys(n).some((k) => k.startsWith('__reactFiber')),
        ),
      undefined,
      { timeout: 45000 },
    );
    await page.evaluate(() => document.fonts.ready);
    assert.equal(
      new URL(page.url()).pathname,
      new URL(localPath(path)).pathname,
    );
  }
  async function api(page, path, body) {
    localPath(path);
    return page.evaluate(
      async ({ path, body }) => {
        const r = await fetch(path, {
          redirect: 'error',
          method: body ? 'POST' : 'GET',
          headers: body ? { 'content-type': 'application/json' } : {},
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, body: await r.json() };
      },
      { path, body },
    );
  }
  async function mutate(page, path, button) {
    let captured;
    const handler = async (route) => {
      assert.equal(new URL(route.request().url()).origin, origin.origin);
      const response = await route.fetch({ maxRedirects: 0 });
      captured = { status: response.status(), body: await response.json() };
      await route.fulfill({ response });
    };
    await page.route(localPath(path), handler);
    const response = page.waitForResponse(
      (r) => r.url() === localPath(path) && r.request().method() === 'POST',
      { timeout: 45000 },
    );
    await button.click();
    const r = await response;
    assert.ok(
      captured,
      'Actual API response was not captured before navigation.',
    );
    const body = captured.body;
    await page.unroute(localPath(path), handler);
    assert.ok(
      r.status() >= 200 && r.status() < 300,
      `${path} returned ${r.status()}: ${body.error ?? 'unverified result'}`,
    );
    return body;
  }
  async function capture(page, label, target, heading) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(new URL(page.url()).origin, origin.origin);
      assert.ok((await page.title()).trim());
      const body = await page.locator('body').innerText();
      assert.ok(body.trim().length > 30);
      assert.doesNotMatch(
        body,
        /Application error|Internal Server Error|This page could not be found/,
      );
      assert.equal(
        await page
          .locator('[data-nextjs-dialog-overlay],vite-error-overlay')
          .count(),
        0,
      );
      await page
        .getByRole('heading', { name: heading, exact: true })
        .first()
        .waitFor();
      const focusable = target
        .locator(
          'input:not([type="hidden"]):not(:disabled),button:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]',
        )
        .first();
      await focusable.focus();
      await page.keyboard.press('Tab');
      assert.ok(
        await page.evaluate(() => {
          const a = document.activeElement,
            b = a?.getBoundingClientRect();
          return a !== document.body && b?.width > 0 && b?.height > 0;
        }),
        'Keyboard Tab lost visible focus',
      );
      const geometry = await target.evaluate((e) => ({
        scrollWidth: document.documentElement.scrollWidth,
        viewport: innerWidth,
        clipped: [
          ...e.querySelectorAll(
            'input:not([type="hidden"]),select,textarea,button',
          ),
        ]
          .filter((n) => {
            const b = n.getBoundingClientRect();
            return (
              b.width > 0 &&
              b.height > 0 &&
              (b.left < -1 || b.right > innerWidth + 1)
            );
          })
          .map(
            (n) =>
              n.id ||
              n.getAttribute('name') ||
              n.textContent?.trim().slice(0, 60),
          ),
      }));
      const file = join(output, `${state.id}-${label}-${width}.png`);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: join(output, `${state.id}-${label}-top-${width}.png`),
        fullPage: false,
      });
      await target.scrollIntoViewIfNeeded();
      await page.screenshot({ path: file, fullPage: false });
      state.screenshots.push({
        label,
        width,
        path: file,
        geometry,
        identity: new URL(page.url()).pathname,
        keyboard: true,
        nonblank: true,
        noOverlay: true,
      });
      if (geometry.clipped.length || geometry.scrollWidth > width + 1)
        state.failures.push(
          `${label}/${width}: overflow ${geometry.scrollWidth}, clipped ${geometry.clipped.join(',')}`,
        );
    }
    await page.setViewportSize({ width: 1024, height: 900 });
    await save();
  }
  try {
    addFictionalParcel(databasePath, state);
    await save();
    admin = await context('super_admin');
    customer = await context('customer');
    const a = await admin.newPage(),
      p = await customer.newPage();
    listen(a, 'admin');
    listen(p, 'customer');
    await visit(a, '/admin/promo-codes');
    const form = a.locator('form[data-form-id="staff.promo-code"]');
    const known = inspect(databasePath, (db) =>
      db
        .prepare(
          'SELECT id,current_revision,draft_revision FROM promo_campaigns WHERE code=?',
        )
        .get(state.code),
    );
    if (!known) {
      await a
        .getByRole('button', { name: 'New campaign', exact: true })
        .click();
      const fields = {
        code: state.code,
        label: 'SIMULATED local promo acceptance ' + state.id,
        fixedPaisa: '1000',
        minimumSubtotalPaisa: '0',
        totalUseLimit: '2',
        perCustomerUseLimit: '2',
        budgetPaisa: '2000',
        startsAt: new Date(Date.now() - 3600000).toISOString().slice(0, 16),
        endsAt: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
        reason: 'SIMULATED guarded promo acceptance ' + state.id,
      };
      for (const [name, value] of Object.entries(fields))
        await form.locator(`[name="${name}"]`).fill(value);
      const draft = await mutate(
        a,
        '/api/admin/promo-codes',
        form.getByRole('button', { name: 'Save draft', exact: true }),
      );
      assert.equal(draft.terms.code, state.code);
      state.campaignId = draft.campaignId;
      await save();
    } else {
      state.campaignId = known.id;
      await a.getByLabel('Campaign', { exact: true }).selectOption(known.id);
    }
    const status = inspect(databasePath, (db) =>
      db
        .prepare('SELECT current_revision FROM promo_campaigns WHERE id=?')
        .get(state.campaignId),
    );
    if (!status.current_revision) {
      await a.getByLabel('Operation', { exact: true }).selectOption('publish');
      await form
        .getByLabel('Reason', { exact: true })
        .fill('SIMULATED publish guarded local promo ' + state.id);
      await mutate(
        a,
        '/api/admin/promo-codes',
        form.getByRole('button', { name: 'Publish draft', exact: true }),
      );
    }
    const promoNav = a.getByRole('link', { name: 'Promo codes', exact: true });
    assert.equal(await promoNav.getAttribute('href'), '/admin/promo-codes');
    state.navigation = {
      href: await promoNav.getAttribute('href'),
      ariaCurrent: await promoNav.getAttribute('aria-current'),
    };
    await a.getByText('Status: Published', { exact: true }).waitFor();
    state.checks.push('actual admin draft and publish');
    await capture(a, 'admin-published', form, 'Promo codes');
    const existingOrder = inspect(databasePath, (db) =>
      db
        .prepare(
          'SELECT o.order_number FROM promo_redemptions r JOIN orders o ON o.id=r.order_id WHERE r.campaign_id=?',
        )
        .all(state.campaignId),
    );
    assert.ok(
      existingOrder.length <= 1,
      'Acceptance must never create a second order.',
    );
    if (existingOrder.length) {
      state.orderNumber = existingOrder[0].order_number;
      state.browserResponseRecovery =
        'Order discovered from retained native redemption and verified actual receipt after navigation raced evidence collection.';
      await save();
    }
    await visit(p, '/checkout');
    if (!state.orderNumber) {
      // Fresh browser context has no user cart cookie. These calls create only its new cart.
      const products = inspect(databasePath, (db) =>
        db
          .prepare(
            "SELECT id FROM products WHERE id=? OR (seller_id='local-test-seller-profile' AND name_en LIKE 'SIMULATED %' AND status='published') ORDER BY id",
          )
          .all(state.fixture.product),
      );
      assert.equal(products.length, 2);
      const cartBefore = await api(p, '/api/cart');
      assert.equal(cartBefore.status, 200);
      for (const product of products) {
        if (cartBefore.body.items.some((i) => i.productId === product.id))
          continue;
        const add = await api(p, '/api/cart', {
          productId: product.id,
          quantity: 1,
        });
        assert.equal(add.status, 200);
      }
      await writeFile(
        join(output, state.id + '-customer-cookies.json'),
        JSON.stringify(await customer.cookies()),
        { mode: 0o600 },
      );
      await visit(p, '/checkout');
      const checkout = p.locator('form[data-form-id="commerce.checkout"]');
      await p.getByLabel('Promo code', { exact: true }).fill(state.code);
      const quote = await mutate(
        p,
        '/api/checkout/promo',
        p.getByRole('button', { name: 'Apply promo', exact: true }),
      );
      assert.equal(quote.discountPaisa, 1000);
      assert.equal(quote.subtotalPaisa, 20000);
      await p
        .getByRole('button', { name: 'Remove promo', exact: true })
        .click();
      assert.equal(
        await p
          .locator('[data-promo-discount-paisa]')
          .getAttribute('data-promo-discount-paisa'),
        '0',
      );
      await p.getByLabel('Promo code', { exact: true }).fill(state.code);
      await mutate(
        p,
        '/api/checkout/promo',
        p.getByRole('button', { name: 'Apply promo', exact: true }),
      );
      assert.equal(
        await p
          .locator('[data-promo-discount-paisa]')
          .getAttribute('data-promo-discount-paisa'),
        '1000',
      );
      state.checks.push('actual quote remove reapply');
      await capture(p, 'checkout-applied', checkout, 'Let’s bring them home.');
      const fields = {
        recipientName: 'SIMULATED promo recipient',
        recipientPhone: '9800000000',
        customerPhone: '9800000000',
        district: 'Dhanusha',
        municipality: 'SIMULATED Janakpur',
        locality: 'SIMULATED local promo delivery',
      };
      for (const [id, value] of Object.entries(fields))
        await checkout.locator('#' + id).fill(value);
      await checkout.getByRole('checkbox', { name: /I agree to/ }).click();
      const saved = await mutate(
        p,
        '/api/checkout',
        checkout.getByRole('button', { name: 'Place COD order', exact: true }),
      );
      assert.equal(typeof saved.orderNumber, 'string');
      state.orderNumber = saved.orderNumber;
      await save();
    }
    if (!state.promoRegionCaptured) {
      await visit(p, '/checkout');
      const cart = await api(p, '/api/cart');
      assert.equal(cart.status, 200);
      const products = inspect(databasePath, (db) =>
        db
          .prepare(
            "SELECT id FROM products WHERE id=? OR (seller_id='local-test-seller-profile' AND name_en LIKE 'SIMULATED %' AND status='published') ORDER BY id",
          )
          .all(state.fixture.product),
      );
      for (const product of products)
        if (!cart.body.items.some((i) => i.productId === product.id))
          assert.equal(
            (await api(p, '/api/cart', { productId: product.id, quantity: 1 }))
              .status,
            200,
          );
      await visit(p, '/checkout');
      await p.getByLabel('Promo code', { exact: true }).fill(state.code);
      let release;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const quoteHandler = async (route) => {
        assert.equal(new URL(route.request().url()).origin, origin.origin);
        const response = await route.fetch({ maxRedirects: 0 });
        await gate;
        await route.fulfill({ response });
      };
      await p.route(localPath('/api/checkout/promo'), quoteHandler);
      const staleResponse = p.waitForResponse(
        (r) =>
          r.url() === localPath('/api/checkout/promo') &&
          r.request().method() === 'POST',
      );
      await p.getByRole('button', { name: 'Apply promo', exact: true }).click();
      await p.locator('[data-promo-loading]').waitFor();
      await p
        .getByRole('button', { name: 'Remove promo', exact: true })
        .click();
      release();
      await staleResponse;
      await p.unroute(localPath('/api/checkout/promo'), quoteHandler);
      assert.equal(
        await p.getByLabel('Promo code', { exact: true }).inputValue(),
        '',
      );
      await p.waitForTimeout(100);
      assert.equal(
        await p
          .locator('[data-promo-discount-paisa]')
          .getAttribute('data-promo-discount-paisa'),
        '0',
      );
      state.checks.push(
        'actual obsolete quote response cannot restore removed code',
      );
      await p.getByLabel('Promo code', { exact: true }).fill(state.code);
      await mutate(
        p,
        '/api/checkout/promo',
        p.getByRole('button', { name: 'Apply promo', exact: true }),
      );
      assert.equal(
        await p
          .locator('[data-promo-discount-paisa]')
          .getAttribute('data-promo-discount-paisa'),
        '1000',
      );
      await capture(
        p,
        'promo-region',
        p.locator('#promo-code').locator('..'),
        'Let’s bring them home.',
      );
      for (const width of widths) {
        await p.setViewportSize({ width, height: 900 });
        await p.locator('[data-promo-discount-paisa]').scrollIntoViewIfNeeded();
        await p.screenshot({
          path: join(output, state.id + '-promo-summary-' + width + '.png'),
          fullPage: false,
        });
      }
      // Remove only this context's temporary quote cart; never submit a second order.
      const finalCart = await api(p, '/api/cart');
      for (const item of finalCart.body.items) {
        const removed = await p.evaluate(async (itemId) => {
          const r = await fetch('/api/cart', {
            method: 'DELETE',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ itemId }),
          });
          return r.status;
        }, item.id);
        assert.equal(removed, 200);
      }
      state.promoRegionCaptured = true;
      await save();
    }
    const orderPath = '/orders/' + encodeURIComponent(state.orderNumber);
    await visit(p, orderPath);
    await p
      .getByText(/Promo savings/)
      .first()
      .waitFor();
    const accounting = () =>
      inspect(databasePath, (db) => {
        const order = db
          .prepare(
            'SELECT id,item_subtotal_paisa,grand_total_paisa,delivery_charge_paisa,wallet_credit_paisa,promo_discount_paisa,current_subtotal_paisa,current_total_paisa,current_delivery_paisa,current_wallet_paisa,current_promo_discount_paisa,refunded_promo_discount_paisa FROM orders WHERE order_number=?',
          )
          .get(state.orderNumber);
        const items = db
          .prepare(
            'SELECT id,seller_id,unit_price_paisa,quantity,promo_discount_paisa,current_promo_discount_paisa,commission_paisa,line_total_paisa FROM order_items WHERE order_id=? ORDER BY id',
          )
          .all(order.id);
        const campaign = db
          .prepare(
            'SELECT used_count,spent_paisa FROM promo_campaigns WHERE id=?',
          )
          .get(state.campaignId);
        const redemptions = db
          .prepare(
            'SELECT order_id,discount_paisa,revision FROM promo_redemptions WHERE campaign_id=?',
          )
          .all(state.campaignId);
        const customer = db
          .prepare(
            "SELECT used_count FROM promo_customer_usage WHERE campaign_id=? AND customer_id='local-test-customer'",
          )
          .get(state.campaignId);
        const wallet = db
          .prepare(
            "SELECT balance_paisa FROM wallet_accounts WHERE user_id='local-test-customer'",
          )
          .get();
        return { order, items, campaign, redemptions, customer, wallet };
      });
    if (!state.beforeCancellation) {
      state.beforeCancellation = accounting();
      await save();
    }
    const before = state.beforeCancellation;
    assert.equal(before.order.promo_discount_paisa, 1000);
    assert.equal(before.order.item_subtotal_paisa, 20000);
    assert.equal(
      before.order.grand_total_paisa,
      20000 +
        before.order.delivery_charge_paisa -
        1000 -
        before.order.wallet_credit_paisa,
    );
    assert.equal(
      before.items.reduce((sum, i) => sum + i.promo_discount_paisa, 0),
      1000,
    );
    assert.equal(before.campaign.used_count, 1);
    assert.equal(before.campaign.spent_paisa, 1000);
    assert.equal(before.customer.used_count, 1);
    assert.equal(before.redemptions.length, 1);
    await capture(p, 'receipt', p.locator('main'), 'Your order is confirmed.');
    if (!state.cancelled) {
      await p
        .getByRole('button', {
          name: 'Cancel order or seller parcels',
          exact: true,
        })
        .click();
      const cancellation = p.locator(
        'form[data-form-id="commerce.order-cancellation"]',
      );
      await cancellation
        .getByRole('checkbox', {
          name: /SIMULATED Promo Parcel Studio.*Available to cancel/,
        })
        .check();
      await cancellation
        .getByLabel(/^Reason/)
        .fill('SIMULATED cancel second parcel before pickup');
      await mutate(
        p,
        orderPath + '/cancel',
        cancellation.getByRole('button', {
          name: 'Review cancellation amounts',
          exact: true,
        }),
      );
      await mutate(
        p,
        orderPath + '/cancel',
        cancellation.getByRole('button', {
          name: 'Confirm cancellation and revised amount',
          exact: true,
        }),
      );
      await p
        .getByText('Selected parcels cancelled.', { exact: false })
        .waitFor();
      state.cancelled = true;
      await save();
    }
    await visit(p, orderPath);
    const after = accounting();
    state.afterCancellation = after;
    assert.equal(after.order.grand_total_paisa, before.order.grand_total_paisa);
    assert.equal(after.order.current_subtotal_paisa, 10000);
    assert.equal(after.order.current_promo_discount_paisa, 500);
    assert.equal(after.order.refunded_promo_discount_paisa, 0);
    assert.equal(
      after.order.current_total_paisa,
      10000 +
        after.order.current_delivery_paisa -
        500 -
        after.order.current_wallet_paisa,
    );
    assert.deepEqual(after.campaign, before.campaign);
    assert.deepEqual(after.customer, before.customer);
    assert.deepEqual(after.redemptions, before.redemptions);
    for (const item of after.items) {
      const original = before.items.find((i) => i.id === item.id);
      assert.equal(item.unit_price_paisa, original.unit_price_paisa);
      assert.equal(item.line_total_paisa, original.line_total_paisa);
      assert.equal(item.commission_paisa, original.commission_paisa);
      assert.equal(item.promo_discount_paisa, original.promo_discount_paisa);
    }
    assert.equal(
      after.wallet.balance_paisa,
      before.wallet.balance_paisa,
      'No promo-created wallet credit',
    );
    assert.equal(
      before.order.wallet_credit_paisa,
      0,
      'No artificial fixture credit',
    );
    state.checks.push(
      'actual simulated COD checkout and receipt',
      'partial seller cancellation original gross/commission retained',
      'promo usage/budget/customer use retained',
      'wallet restored only actual spend (zero)',
    );
    await capture(
      p,
      'partial-cancelled',
      p.locator('main'),
      'Your order is confirmed.',
    );
    assert.ok(
      state.consoleErrors.every((e) => e.type === 'warning'),
      'Relevant browser console/page errors found; inspect evidence.',
    );
    assert.deepEqual(
      state.failures,
      [],
      'Responsive clipping/overflow found; inspect screenshots.',
    );
    const baselineCarts = inspect(migration.backup.path, (db) =>
      db.prepare('SELECT * FROM carts ORDER BY id').all(),
    );
    const baselineItems = inspect(migration.backup.path, (db) =>
      db.prepare('SELECT * FROM cart_items ORDER BY id').all(),
    );
    inspect(databasePath, (db) => {
      for (const row of baselineCarts)
        assert.deepEqual(
          {...db.prepare('SELECT * FROM carts WHERE id=?').get(row.id)},
          row,
          'Existing user cart changed',
        );
      for (const row of baselineItems)
        assert.deepEqual(
          {...db.prepare('SELECT * FROM cart_items WHERE id=?').get(row.id)},
          row,
          'Existing user cart item changed',
        );
    });
    state.userCartPreservation = {
      originalCarts: baselineCarts.length,
      originalItems: baselineItems.length,
      preserved: true,
    };
    state.passed = true;
  } catch (error) {
    state.error = error.message;
    state.passed = false;
    for (const [label, c] of [
      ['admin', admin],
      ['customer', customer],
    ])
      for (const page of c?.pages() ?? []) {
        await page
          .screenshot({
            path: join(output, state.id + '-' + label + '-failure.png'),
            fullPage: false,
          })
          .catch(() => {});
        state.failurePage ??= [];
        state.failurePage.push({
          label,
          path: new URL(page.url()).pathname,
          text: (
            await page
              .locator('body')
              .innerText()
              .catch(() => '')
          ).slice(0, 10000),
        });
      }
    throw error;
  } finally {
    await save();
    await writeFile(
      join(output, 'promo-results.json'),
      JSON.stringify(state, null, 2),
    );
    await browser.close();
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
