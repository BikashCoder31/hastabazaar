// Uses only the disposable local MariaDB fixture. Secrets stay in memory.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { env } from '../lib/runtime/node-bindings.ts';
import { requestEmailOtp } from '../lib/auth/email-otp-service.ts';
import { PasswordResetStore } from '../lib/auth/password-reset-store.ts';
import { resetPassword, resetCookieName } from '../lib/auth/password-reset.ts';
import {
  passwordRecord,
  createHostedSessionForUser,
  verifyPassword,
} from '../lib/auth/hosted-session.ts';
import { createEmailOtpChallenge } from '../lib/auth/email-otp.ts';
import { sendPasswordResetCode } from '../lib/email/password-reset.ts';
const fixture = JSON.parse(
  await readFile('outputs/wallet-test-runtime/preview.json', 'utf8'),
);
assert.match(fixture.database, /^wallet_test_\d+$/);
Object.assign(process.env, {
  DB_HOST: '127.0.0.1',
  DB_PORT: '13316',
  DB_NAME: fixture.database,
  DB_USER: fixture.user,
  DB_PASSWORD: fixture.password,
});
const sql = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13316,
  database: fixture.database,
  user: fixture.user,
  password: fixture.password,
  multipleStatements: true,
});
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const origin = 'http://127.0.0.1:43872';
try {
  const migration = await readFile(
    'deployment/babal/mariadb-password-reset.sql',
    'utf8',
  );
  await sql.query(migration);
  await sql.query(migration);
  const db = env.DB,
    store = new PasswordResetStore(db);
  const now = Date.now();
  await sql.execute(
    "INSERT IGNORE INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES ('reset-local','reset-local','reset-local@example.test','Reset local','en-NP','active',?,?)",
    [now, now],
  );
  await sql.execute(
    "INSERT IGNORE INTO user_roles(user_id,role,assigned_at) VALUES ('reset-local','customer',?)",
    [now],
  );
  const old = crypto.randomUUID(),
    next = crypto.randomUUID();
  const prior = await passwordRecord(old);
  await sql.execute(
    'INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt)',
    ['reset-local', prior.hash, prior.salt, now, now],
  );
  const oldSession = await createHostedSessionForUser(db, 'reset-local');
  let code;
  let emailMessage;
  const delivery = {
    EMAIL: {
      configured: true,
      send: async (m) => {
        emailMessage = m;
      },
    },
  };
  const request = await requestEmailOtp(
    store,
    'reset-local@example.test',
    async (email, value) => {
      code = value;
      await sendPasswordResetCode(delivery, email, value);
    },
  );
  assert.ok(request.delivered);
  assert.match(emailMessage.subject, /Reset your Hastabazaar password/);
  assert.ok(emailMessage.text.includes(code));
  assert.ok(!emailMessage.text.includes(request.token));
  const unknown = await requestEmailOtp(
    store,
    'missing-reset@example.test',
    async () => {
      throw new Error('Must not send');
    },
  );
  assert.equal(unknown.delivered, false);
  const failing = {
    prepare: db.prepare.bind(db),
    batch: (statements) =>
      db.batch([
        ...statements,
        db.prepare(
          "INSERT INTO user_credentials(user_id) VALUES ('reset-local')",
        ),
      ]),
  };
  await assert.rejects(resetPassword(failing, request.token, code, next));
  assert.equal(
    (
      await store.findChallenge(
        createEmailOtpChallenge({ userId: 'unused', token: request.token })
          .record.tokenHash,
      )
    ).consumedAt,
    null,
  );
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await ctx.addCookies([
    {
      name: resetCookieName,
      value: request.token,
      url: origin,
      httpOnly: true,
    },
    {
      name: 'hastabazaar_session',
      value: oldSession,
      url: origin,
      httpOnly: true,
    },
  ]);
  const page = await ctx.newPage();
  await page.goto(origin + '/forgot-password/reset');
  await page.getByLabel('Reset code').fill(code);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill('does-not-match');
  await page
    .getByRole('button', { name: 'Reset password', exact: true })
    .click();
  await page.getByRole('alert').waitFor();
  await page.getByLabel('Reset code').fill(code);
  await page.getByLabel('New password', { exact: true }).fill(next);
  await page.getByLabel('Confirm new password').fill(next);
  await page
    .getByRole('button', { name: 'Reset password', exact: true })
    .click();
  await page.waitForURL((url) => url.pathname === '/login');
  await page
    .getByRole('status')
    .filter({ hasText: 'Your password has been reset' })
    .waitFor();
  const [credentials] = await sql.execute(
    "SELECT password_hash,password_salt FROM user_credentials WHERE user_id='reset-local'",
  );
  assert.equal(
    await verifyPassword(
      next,
      credentials[0].password_hash,
      credentials[0].password_salt,
    ),
    true,
  );
  assert.equal(
    await verifyPassword(
      old,
      credentials[0].password_hash,
      credentials[0].password_salt,
    ),
    false,
  );
  const [sessions] = await sql.execute(
    "SELECT * FROM user_sessions WHERE user_id='reset-local'",
  );
  assert.equal(sessions.length, 0);
  assert.equal(
    await resetPassword(db, request.token, code, crypto.randomUUID()),
    false,
  );
  const signedIn = await ctx.request.post(origin+'/api/auth/login',{headers:{Origin:origin},form:{email:'reset-local@example.test',password:next},maxRedirects:0});
  assert.equal(signedIn.headers().location,'/auth/continue');
  await page.goto(origin+'/auth/continue');await page.waitForURL(url=>url.pathname==='/account');
  const fresh = createEmailOtpChallenge({ userId: 'reset-local' });
  await store.replaceChallenge(fresh.record);
  const race = await Promise.all([
    resetPassword(db, fresh.token, fresh.code, next),
    resetPassword(db, fresh.token, fresh.code, old),
  ]);
  assert.equal(race.filter(Boolean).length, 1);
  // Reset twice is safe only with a fresh code; the winning credential stays private.
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(origin + '/login');
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await page.getByRole('heading', { name: 'Forgot password?' }).waitFor();
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    await page.screenshot({path:`C:/Users/abinash/.codex/visualizations/2026/09/10/01a08c6e-350f-7b40-b2fe-8c9c5b7dbea9/forgot-password-${viewport.width}.png`,fullPage:true});
    await page.goto(origin + '/forgot-password/reset');
    await page.getByRole('heading', { name: 'Reset your password' }).waitFor();
    await page.screenshot({path:`C:/Users/abinash/.codex/visualizations/2026/09/10/01a08c6e-350f-7b40-b2fe-8c9c5b7dbea9/reset-password-${viewport.width}.png`,fullPage:true});
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
  }
  const denied = await ctx.request.post(
    origin + '/api/auth/password-reset/complete',
    { headers: { Origin: 'https://untrusted.example' }, form: {} },
  );
  assert.equal(denied.status(), 403);
  const unavailable = await ctx.request.post(
    origin + '/api/auth/password-reset/request',
    {
      headers: { Origin: origin },
      form: { email: 'reset-local@example.test' },
      maxRedirects: 0,
    },
  );
  assert.match(unavailable.headers().location, /error=unavailable/);
  await ctx.close();
  console.log(
    'Local reset checks passed: repeatable MariaDB migration, mocked email, unknown account, transaction rollback, password confirmation, single use, concurrent replay, credential replacement, session revocation, desktop/mobile pages and CSRF rejection. SMTP unconfigured state checked; no email sent.',
  );
} finally {
  await sql.end();
  await browser.close();
}
process.exit(0);
