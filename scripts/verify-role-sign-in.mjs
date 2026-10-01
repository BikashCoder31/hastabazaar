// Disposable localhost fixture only. Never print passwords, tokens or cookies.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { passwordRecord } from '../lib/auth/hosted-session.ts';
import { createEmailOtpChallenge } from '../lib/auth/email-otp.ts';
import { chromium } from 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const fixture = JSON.parse(
  await readFile('outputs/wallet-test-runtime/preview.json', 'utf8'),
);
assert.match(fixture.database, /^wallet_test_\d+$/);
const db = await mysql.createConnection({
  host: '127.0.0.1',
  port: 13316,
  database: fixture.database,
  user: fixture.user,
  password: fixture.password,
});
const origin = 'http://127.0.0.1:43872';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const password = crypto.randomUUID();
try {
  const now = Date.now();
  await db.execute(
    "INSERT IGNORE INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES ('routing-customer','routing-customer','routing-customer@example.test','Routing customer','en-NP','active',?,?)",
    [now, now],
  );
  await db.execute(
    "INSERT IGNORE INTO user_roles(user_id,role,assigned_at) VALUES ('routing-customer','customer',?)",
    [now],
  );
  const record = await passwordRecord(password);
  for (const id of ['routing-customer', 'friend', 'referrer'])
    await db.execute(
      'INSERT INTO user_credentials(user_id,password_hash,password_salt,created_at,updated_at) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),password_salt=VALUES(password_salt)',
      [id, record.hash, record.salt, now, now],
    );
  const check = async (id, expected, method = 'password', returnTo) => {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    try {
      let response;
      if (method === 'password')
        response = await ctx.request.post(origin + '/api/auth/login', {
          headers: { Origin: origin },
          form: {
            email: id + '@example.test',
            password,
            ...(returnTo ? { return_to: returnTo } : {}),
          },
          maxRedirects: 0,
        });
      else {
        const challenge = createEmailOtpChallenge({ userId: id });
        const r = challenge.record;
        await db.execute(
          'INSERT INTO email_login_challenges(token_hash,code_hash,user_id,attempts,expires_at,created_at,consumed_at) VALUES (?,?,?,?,?,?,NULL)',
          [r.tokenHash, r.codeHash, r.userId, 0, r.expiresAt, r.createdAt],
        );
        await ctx.addCookies([
          {
            name: 'hastabazaar_email_otp',
            value: challenge.token,
            url: origin,
            httpOnly: true,
          },
        ]);
        response = await ctx.request.post(
          origin + '/api/auth/email-code/verify',
          {
            headers: { Origin: origin },
            form: {
              code: challenge.code,
              ...(returnTo ? { return_to: returnTo } : {}),
            },
            maxRedirects: 0,
          },
        );
      }
      assert.equal(response.status(), 303, method + ' signs in');
      assert.equal(response.headers().location, returnTo ?? '/auth/continue');
      const page = await ctx.newPage();
      await page.goto(origin + response.headers().location);
      await page.waitForURL((url) => url.pathname === expected);
      // Revisiting a bare login page must also use role routing for a signed-in user.
      if (!returnTo) {
        await page.goto(origin + '/login');
        await page.waitForURL((url) => url.pathname === expected);
      }
      if (expected === '/seller') {
        await page.waitForLoadState('networkidle');
        assert.match(await page.locator('body').innerText(), /Seller workspace/i);
        // Exercise client navigation after the initial document is hydrated.
        await page.getByRole('link', { name: 'Marketplace', exact: true }).click();
        await page.waitForURL('**/shop');
        await page.getByRole('link', { name: 'Seller dashboard', exact: true }).click();
        await page.waitForURL((url) => url.pathname !== '/shop');
        await page.waitForLoadState('networkidle');
        assert.equal(new URL(page.url()).pathname, '/seller');
        assert.match(await page.locator('body').innerText(), /Seller workspace/i);
        assert.doesNotMatch(await page.locator('body').innerText(), /Staff invitation required/);
        await page.goto(origin + '/admin');
        await page.waitForURL('**/staff-access-denied');
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          await page.screenshot({ path: `outputs/seller-access-recovery-${width}.png`, fullPage: true });
        }
        await page.getByRole('link', { name: 'Open seller dashboard', exact: true }).click({ timeout: 3000 });
        await page.waitForURL('**/seller');
        assert.match(await page.locator('body').innerText(), /Seller workspace/i);
      }
    } finally {
      await ctx.close();
    }
  };
  for (const method of ['password', 'otp']) {
    await check('routing-customer', '/account', method);
    await check('friend', '/seller', method);
    await check('referrer', '/admin', method);
  }
  await db.execute(
    "UPDATE user_roles SET role='admin' WHERE user_id='referrer' AND role='super_admin'",
  );
  await check('referrer', '/admin');
  await db.execute(
    "UPDATE seller_profiles SET status='submitted' WHERE user_id='friend'",
  );
  await check('friend', '/account');
  await db.execute(
    "UPDATE seller_profiles SET status='approved' WHERE user_id='friend'",
  );
  await check('friend', '/account/wallet', 'password', '/account/wallet');
  const anon = await browser.newContext();
  const page = await anon.newPage();
  await page.goto(origin + '/auth/continue');
  await page.waitForURL((url) => url.pathname === '/login');
  await anon.close();
  console.log(
    'Local MariaDB/browser: password and OTP role routing, seller storefront navigation, staff denial and seller recovery, desktop/mobile recovery layout, unapproved seller fallback and anonymous protection passed. No email sent.',
  );
} finally {
  await db.execute(
    "UPDATE user_roles SET role='super_admin' WHERE user_id='referrer' AND role='admin'",
  );
  await db.execute(
    "UPDATE seller_profiles SET status='approved' WHERE user_id='friend'",
  );
  await db.end();
  await browser.close();
}

