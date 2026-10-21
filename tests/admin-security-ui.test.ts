import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import type { Page, Route } from 'playwright';
import { adminNavigation } from '../lib/admin/navigation';
import { marketplaceSecurityHeaders } from '../lib/http/security-headers';
import { stubFixtureLink } from './helpers/browser-fixture-link';

const fixtureStatus = {
  user: {
    displayName: 'Fictional Admin',
    email: 'admin@security.fixture',
    role: 'super_admin',
  },
  status: 'pending',
  needsPassword: false,
  canManage: true,
  localSimulation: true,
  session: { absoluteHours: 8, idleMinutes: 30 },
  recoveryRemaining: 0,
};

async function withFixture(
  component: 'SecurityWorkspace' | 'BackupTransferWorkspace',
  handle: (route: Route) => Promise<boolean>,
  run: (page: Page) => Promise<void>,
) {
  const { chromium } = createRequire(import.meta.url)(
    'playwright',
  ) as typeof import('playwright');
  const componentModule =
    component === 'SecurityWorkspace'
      ? 'security-workspace'
      : 'backup-transfer-workspace';
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `import React from 'react';import{createRoot}from'react-dom/client';import{${component}}from'./components/security/${componentModule}';createRoot(document.getElementById('root')).render(<${component}/>);`,
    },
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'fixture-links', setup: stubFixtureLink }],
  });
  const browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROME_PATH ??
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
  });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Content Security Policy|violates.*directive|Refused to frame/i.test(
        message.text(),
      )
    )
      errors.push(message.text());
  });
  try {
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      assert.equal(
        url.origin,
        'https://security.fixture',
        'Fictional UI requests must never reach an application server.',
      );
      if (url.pathname === '/fixture.js')
        return route.fulfill({
          contentType: 'text/javascript',
          body: bundle.outputFiles[0].text,
        });
      if (await handle(route)) return;
      assert.equal(url.pathname, '/fixture');
      return route.fulfill({
        headers: marketplaceSecurityHeaders,
        contentType: 'text/html',
        body: '<style>*{box-sizing:border-box}body{margin:8px}button,input{max-width:100%}p,code,li{overflow-wrap:anywhere}</style><div id="root"></div><script src="/fixture.js"></script>',
      });
    });
    await page.goto('https://security.fixture/fixture');
    await run(page);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}

void test('staff navigation exposes security, and only Super Admin sees complete transfer', () => {
  assert.ok(adminNavigation('admin').some((link) => link.href === '/security'));
  assert.ok(
    adminNavigation('super_admin').some(
      (link) => link.href === '/admin/backup-transfer',
    ),
  );
  assert.equal(
    adminNavigation('admin').some(
      (link) => link.href === '/admin/backup-transfer',
    ),
    false,
  );
});

void test('MFA enrollment needs a code and saved recovery confirmation before activation, with no browser persistence', async () => {
  let status = { ...fixtureStatus };
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (!path.startsWith('/api/security/')) return false;
      if (request.method() === 'GET') {
        await route.fulfill({ json: status });
        return true;
      }
      const body = request.postDataJSON() as Record<string, unknown>;
      posts.push({ path, body });
      if (path.endsWith('/setup'))
        await route.fulfill({
          json: {
            setupId: 'fictional-setup',
            manualKey: 'JBSWY3DPEHPK3PXP',
            otpAuthUrl:
              'otpauth://totp/Fictional?secret=JBSWY3DPEHPK3PXP&issuer=Fictional',
          },
        });
      else if (body.acknowledge === true) {
        status = { ...status, status: 'active', recoveryRemaining: 10 };
        await route.fulfill({ json: { ok: true } });
      } else
        await route.fulfill({
          json: {
            setupId: 'fictional-setup',
            recoveryCodes: Array.from(
              { length: 10 },
              (_, index) => `FICTIONAL-RECOVERY-${index}`,
            ),
          },
        });
      return true;
    },
    async (page) => {
      await page.getByText('MFA setup pending', { exact: true }).waitFor();
      await page
        .getByLabel('Current password', { exact: true })
        .fill('Fictional-Password-Only');
      await page
        .getByRole('button', { name: 'Set up authenticator', exact: true })
        .click();
      await page.getByLabel('Manual setup key', { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole('img', { name: 'Authenticator setup QR code' })
          .count(),
        1,
      );
      await page
        .getByLabel('Authenticator code', { exact: true })
        .fill('123456');
      await page
        .getByRole('button', { name: 'Confirm authenticator', exact: true })
        .click();
      const activate = page.getByRole('button', {
        name: 'Activate MFA',
        exact: true,
      });
      await activate.waitFor();
      assert.equal(await activate.isDisabled(), true);
      assert.equal(
        await page.getByLabel('Manual setup key', { exact: true }).count(),
        0,
      );
      assert.equal(posts.length, 2);
      await page
        .getByRole('checkbox', {
          name: /I saved these recovery codes privately/,
        })
        .check();
      await activate.click();
      await page.getByText('MFA active', { exact: true }).waitFor();
      assert.equal(posts[2].body.acknowledge, true);
      assert.equal(
        await page.getByText('FICTIONAL-RECOVERY-0', { exact: true }).count(),
        0,
      );
      assert.match(await page.locator('body').innerText(), /8 hours/);
      assert.match(await page.locator('body').innerText(), /30 minutes/);
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
      assert.equal(page.url(), 'https://security.fixture/fixture');
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
    },
  );
});

void test('restricted MFA sign-in supports single-use recovery and actionable failures without exposing secrets', async () => {
  const posts: Record<string, unknown>[] = [];
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/security/status') {
        await route.fulfill({
          json: { ...fixtureStatus, status: 'verify', canManage: false },
        });
        return true;
      }
      if (path === '/api/security/verify') {
        posts.push(route.request().postDataJSON());
        await route.fulfill({
          status: 400,
          json: { error: 'That recovery code is invalid or already used.' },
        });
        return true;
      }
      return false;
    },
    async (page) => {
      await page
        .getByRole('button', { name: 'Use a recovery code', exact: true })
        .click();
      await page
        .getByLabel('Current password', { exact: true })
        .fill('Fictional-Password-Only');
      await page
        .getByLabel('Recovery code', { exact: true })
        .fill('FICTIONAL-USED-CODE');
      await page
        .getByRole('button', { name: 'Verify and continue', exact: true })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: /invalid or already used/ })
        .waitFor();
      assert.equal(posts.length, 1);
      assert.equal(posts[0].recovery, true);
      assert.equal(
        await page.getByLabel('Current password', { exact: true }).inputValue(),
        '',
      );
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
      assert.equal(page.url(), 'https://security.fixture/fixture');
    },
  );
});

void test('replacing an active authenticator needs current password and factor before a new setup', async () => {
  const posts: Record<string, unknown>[] = [];
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/security/status') {
        await route.fulfill({
          json: { ...fixtureStatus, status: 'active', recoveryRemaining: 8 },
        });
        return true;
      }
      if (path === '/api/security/setup') {
        posts.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            setupId: 'replacement-setup',
            manualKey: 'JBSWY3DPEHPK3PXP',
            otpAuthUrl:
              'otpauth://totp/Fictional?secret=JBSWY3DPEHPK3PXP&issuer=Fictional',
          },
        });
        return true;
      }
      return false;
    },
    async (page) => {
      await page
        .getByRole('button', { name: 'Replace authenticator', exact: true })
        .click();
      await page
        .getByLabel('Current password', { exact: true })
        .fill('Fictional-Password-Only');
      await page
        .getByRole('button', { name: 'Use a recovery code', exact: true })
        .click();
      await page
        .getByLabel('Recovery code', { exact: true })
        .fill('FICTIONAL-UNUSED-CODE');
      await page
        .getByRole('button', {
          name: 'Start authenticator replacement',
          exact: true,
        })
        .click();
      await page.getByLabel('Manual setup key', { exact: true }).waitFor();
      assert.deepEqual(posts, [
        {
          password: 'Fictional-Password-Only',
          code: 'FICTIONAL-UNUSED-CODE',
          recovery: true,
        },
      ]);
      assert.match(
        await page.locator('body').innerText(),
        /existing authenticator stays active/,
      );
      await page
        .getByRole('button', { name: 'Close setup', exact: true })
        .click();
      await page.getByText('MFA active', { exact: true }).waitFor();
      assert.equal(
        await page.getByLabel('Manual setup key', { exact: true }).count(),
        0,
      );
      assert.equal(
        posts.length,
        1,
        'Closing a replacement must not activate or disable anything.',
      );
    },
  );
});

void test('a freshly MFA-verified session can replenish recovery codes after the final code was used', async () => {
  const posts: Record<string, unknown>[] = [];
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/security/status') {
        await route.fulfill({
          json: {
            ...fixtureStatus,
            status: 'active',
            sessionVerified: true,
            recoveryRemaining: 0,
          },
        });
        return true;
      }
      if (path === '/api/security/recovery') {
        posts.push(route.request().postDataJSON());
        await route.fulfill({
          json: {
            recoveryCodes: Array.from(
              { length: 10 },
              (_, index) => `FICTIONAL-REPLACEMENT-${index}`,
            ),
          },
        });
        return true;
      }
      return false;
    },
    async (page) => {
      await page.getByText('MFA active', { exact: true }).waitFor();
      assert.match(
        await page.locator('body').innerText(),
        /0 recovery codes remaining/,
      );
      const code = page.getByLabel(/^Authenticator code/);
      assert.equal(
        await code.getAttribute('required'),
        null,
        'Fresh server-verified MFA must not demand another exhausted recovery code.',
      );
      assert.equal(
        await page
          .getByLabel('Authenticator code (optional)', { exact: true })
          .count(),
        1,
      );
      await page
        .getByLabel('Current password', { exact: true })
        .fill('Fictional-Password-Only');
      await page
        .getByRole('button', {
          name: 'Generate replacement recovery codes',
          exact: true,
        })
        .click();
      await page
        .getByText('Save your recovery codes now', { exact: true })
        .waitFor();
      assert.deepEqual(posts, [{ password: 'Fictional-Password-Only' }]);
      assert.equal(
        await page
          .getByText('FICTIONAL-REPLACEMENT-0', { exact: true })
          .count(),
        1,
      );
    },
  );
});

void test('fresh verified MFA can start authenticator replacement without an old code while the new authenticator code stays required', async () => {
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/security/status') {
        await route.fulfill({
          json: {
            ...fixtureStatus,
            status: 'active',
            sessionVerified: true,
            recoveryRemaining: 0,
          },
        });
        return true;
      }
      if (path === '/api/security/setup') {
        posts.push({ path, body: route.request().postDataJSON() });
        await route.fulfill({
          json: {
            setupId: 'fresh-replacement',
            manualKey: 'JBSWY3DPEHPK3PXP',
            otpAuthUrl:
              'otpauth://totp/Fictional?secret=JBSWY3DPEHPK3PXP&issuer=Fictional',
          },
        });
        return true;
      }
      if (path === '/api/security/confirm') {
        posts.push({ path, body: route.request().postDataJSON() });
        await route.fulfill({
          json: {
            setupId: 'fresh-replacement',
            recoveryCodes: Array.from(
              { length: 10 },
              (_, index) => `FICTIONAL-NEW-RECOVERY-${index}`,
            ),
          },
        });
        return true;
      }
      return false;
    },
    async (page) => {
      await page
        .getByRole('button', { name: 'Replace authenticator', exact: true })
        .click();
      assert.equal(
        await page.getByLabel(/^Authenticator code/).getAttribute('required'),
        null,
      );
      await page
        .getByLabel('Current password', { exact: true })
        .fill('Fictional-Password-Only');
      await page
        .getByRole('button', {
          name: 'Start authenticator replacement',
          exact: true,
        })
        .click();
      await page.getByLabel('Manual setup key', { exact: true }).waitFor();
      assert.deepEqual(posts[0].body, { password: 'Fictional-Password-Only' });
      const newCode = page.getByLabel('Authenticator code', { exact: true });
      assert.notEqual(
        await newCode.getAttribute('required'),
        null,
        'The new authenticator must always be proven.',
      );
      await page
        .getByRole('button', { name: 'Confirm authenticator', exact: true })
        .click();
      assert.equal(posts.length, 1);
      await newCode.fill('123456');
      await page
        .getByRole('button', { name: 'Confirm authenticator', exact: true })
        .click();
      await page
        .getByText('Save your recovery codes now', { exact: true })
        .waitFor();
      assert.deepEqual(posts[1].body, {
        setupId: 'fresh-replacement',
        code: '123456',
        password: 'Fictional-Password-Only',
      });
    },
  );
});

void test('first-password setup only exposes a captured code when the server explicitly confirms local simulation', async () => {
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/security/status') {
        await route.fulfill({
          json: { ...fixtureStatus, needsPassword: true },
        });
        return true;
      }
      if (path === '/api/security/bootstrap') {
        await route.fulfill({
          json: { code: 'FICTIONAL-NOT-APPROVED', localSimulation: false },
        });
        return true;
      }
      return false;
    },
    async (page) => {
      await page
        .getByRole('button', {
          name: 'Request email verification',
          exact: true,
        })
        .click();
      await page
        .getByLabel('Email verification code', { exact: true })
        .waitFor();
      assert.equal(
        await page.getByText('FICTIONAL-NOT-APPROVED', { exact: true }).count(),
        0,
      );
      assert.equal(
        await page
          .getByRole('button', { name: 'Set up authenticator', exact: true })
          .count(),
        0,
      );
    },
  );
});

void test('transfer requires confirmation, downloads encrypted packages separately and inspects without restoring', async () => {
  const posts: Record<string, unknown>[] = [];
  let inspected = false;
  const inspectionStages: string[] = [];
  let downloadRequests = 0;
  const downloadTickets = new Map<string, string>();
  await withFixture(
    'BackupTransferWorkspace',
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path === '/api/admin/backup-transfer' && request.method() === 'GET') {
        await route.fulfill({
          json: {
            ready: true,
            release: 'local-fixture-candidate',
            inventory: { tables: 153, rows: 321, files: 2, bytes: 4096 },
            warnings: [],
            supportedDestinations: ['SQLite'],
          },
        });
        return true;
      }
      if (path === '/api/admin/backup-transfer') {
        const body = request.postDataJSON();
        posts.push(body);
        assert.equal(body.action, 'prepare-download');
        const ticket = (body.kind === 'export' ? 'e' : 'k').repeat(43);
        downloadTickets.set(ticket, body.kind);
        await route.fulfill({ json: { ticket } });
        return true;
      }
      if (path === '/api/admin/backup-transfer/download') {
        assert.equal(request.method(), 'POST');
        assert.equal(new URL(request.url()).search, '');
        assert.equal(request.isNavigationRequest(), true);
        assert.match(
          request.headers()['content-type'],
          /^application\/x-www-form-urlencoded/,
        );
        const body = new URLSearchParams(request.postData() ?? '');
        assert.deepEqual([...body.keys()], ['ticket']);
        const kind = downloadTickets.get(body.get('ticket') ?? '');
        assert.ok(kind);
        downloadTickets.delete(body.get('ticket') ?? '');
        assert.equal(
          request.frame().parentFrame(),
          null,
          'The existing CSP forbids framed downloads.',
        );
        downloadRequests++;
        assert.equal((request.postData() ?? '').includes('Passphrase'), false);
        await route.fulfill({
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': `attachment; filename="fictional-encrypted.${kind === 'export' ? 'hzb' : 'hzk'}"`,
          },
          body: 'FICTIONAL ENCRYPTED BYTES',
        });
        return true;
      }
      if (path === '/api/admin/backup-transfer/inspect') {
        assert.equal(new URL(request.url()).search, '');
        const headers = request.headers();
        if (headers['content-type'] === 'application/json') {
          inspectionStages.push('prepare');
          assert.deepEqual(request.postDataJSON(), {
            action: 'prepare',
            passphrase: 'Fictional-Long-Passphrase',
          });
          assert.equal(headers['x-hastabazaar-inspection'], undefined);
          await route.fulfill({
            json: { ticket: 'fictional-inspection-ticket-one-use' },
          });
          return true;
        }
        inspected = true;
        inspectionStages.push('stream');
        assert.equal(headers['content-type'], 'application/octet-stream');
        assert.equal(
          headers['x-hastabazaar-inspection'],
          'fictional-inspection-ticket-one-use',
        );
        assert.equal(
          request.postDataBuffer()?.toString(),
          'FICTIONAL ENCRYPTED',
        );
        assert.equal(
          Object.values(headers).some((value) =>
            value.includes('Fictional-Long-Passphrase'),
          ),
          false,
        );
        await route.fulfill({
          json: {
            valid: true,
            inventory: { tables: 153, rows: 321, files: 2, bytes: 4096 },
            warnings: [],
            snapshotAt: '2026-10-20T00:00:00Z',
            release: 'fixture-release',
          },
        });
        return true;
      }
      return false;
    },
    async (page) => {
      await page
        .getByText('MFA verified for export', { exact: true })
        .waitFor();
      const exportButton = page.getByRole('button', {
        name: 'Download encrypted backup',
        exact: true,
      });
      assert.equal(await exportButton.isDisabled(), true);
      await page
        .getByLabel('Backup passphrase', { exact: true })
        .fill('Fictional-Long-Passphrase');
      await page
        .getByLabel('Confirm backup passphrase', { exact: true })
        .fill('Fictional-Long-Passphrase');
      await page
        .getByRole('checkbox', {
          name: /I will keep this passphrase separately/,
        })
        .check();
      const download = page.waitForEvent('download');
      await exportButton.click();
      await download;
      await page
        .getByRole('status')
        .filter({ hasText: /Encrypted backup download requested/ })
        .waitFor();
      assert.equal(posts[0].action, 'prepare-download');
      assert.equal(posts[0].kind, 'export');
      assert.equal(posts[0].confirmation, true);
      assert.equal(
        await page
          .getByLabel('Backup passphrase', { exact: true })
          .inputValue(),
        '',
      );
      await page
        .getByLabel('Key recovery passphrase', { exact: true })
        .fill('Fictional-Separate-Key-Passphrase');
      await page
        .getByLabel('Confirm key recovery passphrase', { exact: true })
        .fill('Fictional-Separate-Key-Passphrase');
      await page
        .getByRole('checkbox', {
          name: /I will keep the key recovery bundle separately/,
        })
        .check();
      const keyDownload = page.waitForEvent('download');
      await page
        .getByRole('button', {
          name: 'Download encrypted key recovery',
          exact: true,
        })
        .click();
      await keyDownload;
      assert.equal(posts[1].action, 'prepare-download');
      assert.equal(posts[1].kind, 'key-recovery');
      assert.equal(downloadRequests, 2);
      assert.equal(await page.locator('iframe').count(), 0);
      assert.equal(
        await page.locator('input[name="ticket"]').count(),
        0,
        'Ticket fields must be removed after native form submission.',
      );
      assert.equal(
        await page
          .getByLabel('Key recovery passphrase', { exact: true })
          .inputValue(),
        '',
      );
      assert.match(
        await page.locator('body').innerText(),
        /matching application source.*separately/,
      );
      assert.match(
        await page.locator('body').innerText(),
        /storage, schema and files are checked when an export starts/i,
      );
      await page
        .getByLabel('Encrypted backup file', { exact: true })
        .setInputFiles({
          name: 'fictional.hzb',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from('FICTIONAL ENCRYPTED'),
        });
      await page
        .getByLabel('Inspection passphrase', { exact: true })
        .fill('Fictional-Long-Passphrase');
      await page
        .getByRole('button', { name: 'Inspect backup', exact: true })
        .click();
      await page
        .getByText('Backup integrity verified', { exact: true })
        .waitFor();
      assert.equal(inspected, true);
      assert.deepEqual(inspectionStages, ['prepare', 'stream']);
      assert.equal(
        await page
          .getByLabel('Inspection passphrase', { exact: true })
          .inputValue(),
        '',
      );
      assert.match(
        (await page
          .getByLabel('Encrypted backup file', { exact: true })
          .getAttribute('accept')) ?? '',
        /\.hzk/,
      );
      assert.equal(
        await page
          .getByRole('button', { name: /restore|activate destination/i })
          .count(),
        0,
      );
      assert.match(
        await page.locator('body').innerText(),
        /empty, compatible destination/,
      );
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          true,
        );
      }
      assert.equal(
        await page.evaluate(() => localStorage.length + sessionStorage.length),
        0,
      );
    },
  );
});

void test('download uses a native private POST rather than buffering a package in JavaScript', async () => {
  const source = await readFile(
    'components/security/backup-transfer-workspace.tsx',
    'utf8',
  );
  assert.equal(
    source.includes("action: 'prepare-download'"),
    true,
    'A separate download grant must be prepared.',
  );
  assert.equal(
    source.includes('/api/admin/backup-transfer/download'),
    true,
    'The native form must use the dedicated route.',
  );
  assert.equal(
    /response\.blob\(|createObjectURL|revokeObjectURL/.test(source),
    false,
    'Archives must not be materialized in browser JavaScript.',
  );
  assert.equal(
    source.includes("document.createElement('iframe')"),
    false,
    'Existing frame-src none must remain effective.',
  );
  assert.equal(
    source.includes("form.target = '_self'"),
    true,
    'Attachment download must target the current browsing context.',
  );
  assert.match(source, /document\.createElement\('form'\)/);
});

void test('an expired MFA proof during download preparation never creates a native download form', async () => {
  let downloadRequests = 0;
  await withFixture(
    'BackupTransferWorkspace',
    async (route) => {
      const request = route.request(),
        path = new URL(request.url()).pathname;
      if (path === '/api/admin/backup-transfer/download') {
        downloadRequests++;
        await route.fulfill({ status: 500 });
        return true;
      }
      if (path !== '/api/admin/backup-transfer') return false;
      if (request.method() === 'GET')
        await route.fulfill({
          json: { ready: true, release: 'local-fixture-candidate' },
        });
      else
        await route.fulfill({
          status: 403,
          json: {
            error:
              'Fresh MFA verification expired. Verify again before downloading.',
          },
        });
      return true;
    },
    async (page) => {
      await page
        .getByText('MFA verified for export', { exact: true })
        .waitFor();
      await page
        .getByLabel('Backup passphrase', { exact: true })
        .fill('Fictional-Long-Passphrase');
      await page
        .getByLabel('Confirm backup passphrase', { exact: true })
        .fill('Fictional-Long-Passphrase');
      await page
        .getByRole('checkbox', {
          name: /I will keep this passphrase separately/,
        })
        .check();
      await page
        .getByRole('button', { name: 'Download encrypted backup', exact: true })
        .click();
      await page
        .getByRole('alert')
        .filter({ hasText: /MFA verification expired/ })
        .waitFor();
      assert.equal(
        await page
          .getByRole('alert')
          .getByRole('link', { name: 'Verify Admin security', exact: true })
          .getAttribute('target'),
        '_blank',
        'The error recovery link must preserve the current form page',
      );
      assert.equal(downloadRequests, 0);
      assert.equal(
        await page
          .locator('input[name="ticket"],iframe[name^="hastabazaar-download-"]')
          .count(),
        0,
      );
      assert.equal(
        await page
          .getByRole('button', {
            name: 'Download encrypted backup',
            exact: true,
          })
          .isDisabled(),
        true,
      );
      assert.equal(
        await page
          .getByRole('status')
          .filter({ hasText: /download requested/ })
          .count(),
        0,
      );
    },
  );
});

void test('inspection uploads use a bounded ticket and native file body rather than multipart or a buffered file copy', async () => {
  const source = await readFile(
    'components/security/backup-transfer-workspace.tsx',
    'utf8',
  );
  assert.match(source, /X-Hastabazaar-Inspection/);
  assert.match(source, /body: file/);
  assert.match(source, /action: 'prepare'/);
  assert.doesNotMatch(source, /new FormData|file\.(arrayBuffer|text)\(/);
  assert.match(source, /signal: inspectionController\.signal/);
});

void test('MFA-required export stays blocked and links to verification', async () => {
  await withFixture(
    'BackupTransferWorkspace',
    async (route) => {
      if (
        new URL(route.request().url()).pathname !== '/api/admin/backup-transfer'
      )
        return false;
      await route.fulfill({
        status: 403,
        json: {
          error: 'Fresh password and MFA verification is required.',
          code: 'MFA_REQUIRED',
        },
      });
      return true;
    },
    async (page) => {
      await page
        .getByRole('alert')
        .filter({ hasText: /Fresh password and MFA/ })
        .waitFor();
      assert.match(
        (await page
          .getByRole('alert')
          .getByRole('link', { name: 'Verify Admin security', exact: true })
          .getAttribute('href')) ?? '',
        /^\/security\?/,
      );
      assert.equal(
        await page
          .getByRole('button', {
            name: 'Download encrypted backup',
            exact: true,
          })
          .isDisabled(),
        true,
      );
    },
  );
});

void test('backup verification expiry is visible beside each blocked action and refreshing preserves private form entries', async () => {
  const now = Date.parse('2026-10-20T05:00:00Z');
  let reads = 0,
    posts = 0;
  await withFixture(
    'BackupTransferWorkspace',
    async (route) => {
      if (
        new URL(route.request().url()).pathname !== '/api/admin/backup-transfer'
      )
        return false;
      if (route.request().method() !== 'GET') {
        posts++;
        await route.fulfill({
          status: 403,
          json: { error: 'Expired', code: 'MFA_REQUIRED' },
        });
        return true;
      }
      reads++;
      await route.fulfill({
        json: {
          ready: true,
          verificationExpiresAt: reads <= 2 ? now + 300000 : now + 900000,
          warnings: ['MFA is verified.'],
        },
      });
      return true;
    },
    async (page) => {
      await page.clock.install({ time: new Date(now) });
      await page.reload();
      await page
        .getByText('MFA verified for export', { exact: true })
        .waitFor();
      await page.getByText(/Export verification ends at/).waitFor();
      await page
        .getByLabel('Key recovery passphrase', { exact: true })
        .fill('Fictional-Private-Key-Passphrase');
      await page
        .getByLabel('Confirm key recovery passphrase', { exact: true })
        .fill('Fictional-Private-Key-Passphrase');
      await page
        .getByRole('checkbox', {
          name: /I will keep the key recovery bundle separately/,
        })
        .check();
      await page
        .getByLabel('Encrypted backup file', { exact: true })
        .setInputFiles({
          name: 'fictional-data.hzb',
          mimeType: 'application/octet-stream',
          buffer: Buffer.from('fictional encrypted fixture'),
        });
      await page
        .getByLabel('Inspection passphrase', { exact: true })
        .fill('Fictional-Backup-Passphrase');
      const keyButton = page.getByRole('button', {
          name: 'Download encrypted key recovery',
          exact: true,
        }),
        inspectButton = page.getByRole('button', {
          name: 'Inspect backup',
          exact: true,
        });
      assert.equal(await keyButton.isEnabled(), true);
      assert.equal(await inspectButton.isEnabled(), true);
      await page.clock.fastForward(300001);
      await page.getByText('Export needs attention', { exact: true }).waitFor();
      assert.equal(await keyButton.isDisabled(), true);
      assert.equal(await inspectButton.isDisabled(), true);
      const keySection = page.locator('section').filter({
        has: page.getByRole('heading', {
          name: '2. Protect your security keys separately',
          exact: true,
        }),
      });
      const inspectSection = page.locator('section').filter({
        has: page.getByRole('heading', {
          name: '3. Check a saved backup',
          exact: true,
        }),
      });
      assert.equal(
        await keySection
          .getByRole('link', { name: 'Verify for key recovery', exact: true })
          .getAttribute('target'),
        '_blank',
      );
      assert.equal(
        await inspectSection
          .getByRole('link', {
            name: 'Verify for backup inspection',
            exact: true,
          })
          .getAttribute('target'),
        '_blank',
      );
      assert.match(
        await inspectSection.innerText(),
        /matching passphrase|passphrase used for the selected file/,
      );
      assert.equal(
        await page.getByText('MFA is verified.', { exact: true }).count(),
        0,
      );
      await page
        .getByRole('button', { name: 'Refresh readiness', exact: true })
        .click();
      await page
        .getByText('MFA verified for export', { exact: true })
        .waitFor();
      assert.equal(await keyButton.isEnabled(), true);
      assert.equal(await inspectButton.isEnabled(), true);
      assert.equal(
        await page
          .getByLabel('Key recovery passphrase', { exact: true })
          .inputValue(),
        'Fictional-Private-Key-Passphrase',
      );
      assert.equal(
        await page
          .getByLabel('Inspection passphrase', { exact: true })
          .inputValue(),
        'Fictional-Backup-Passphrase',
      );
      assert.equal(
        await page
          .getByLabel('Encrypted backup file', { exact: true })
          .evaluate((input) => (input as HTMLInputElement).files?.[0]?.name),
        'fictional-data.hzb',
      );
      assert.equal(
        posts,
        0,
        'The client expiry state must not submit stale requests or keep the session alive',
      );
    },
  );
});

void test('security pages keep server authorization and never place secrets in persistent browser storage', async () => {
  const [security, transfer, page] = await Promise.all([
    readFile('components/security/security-workspace.tsx', 'utf8'),
    readFile('components/security/backup-transfer-workspace.tsx', 'utf8'),
    readFile('app/admin/backup-transfer/page.tsx', 'utf8'),
  ]);
  assert.match(page, /requireStaffPage/);
  assert.match(page, /staff\.role !== 'super_admin'/);
  for (const source of [security, transfer]) {
    assert.doesNotMatch(
      source,
      /localStorage|sessionStorage|console\.(log|error|debug)/,
    );
    assert.match(source, /cache: 'no-store'/);
  }
});

void test('optional Admin MFA remains available without requiring enrollment to continue', async () => {
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      if (!new URL(route.request().url()).pathname.startsWith('/api/security/'))
        return false;
      await route.fulfill({
        json: {
          ...fixtureStatus,
          user: { ...fixtureStatus.user, role: 'admin' },
          status: 'optional',
          mfaRequired: false,
        },
      });
      return true;
    },
    async (page) => {
      await page.getByText('MFA is optional', { exact: true }).waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Set up authenticator', exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page
          .getByRole('button', { name: 'Continue with password', exact: true })
          .count(),
        1,
      );
      assert.equal(
        await page
          .getByRole('button', { name: 'Disable MFA', exact: true })
          .count(),
        0,
      );
    },
  );
});
void test('unfinished optional setup still offers password continuation after reload', async () => {
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      if (!new URL(route.request().url()).pathname.startsWith('/api/security/'))
        return false;
      await route.fulfill({
        json: { ...fixtureStatus, status: 'setup', mfaRequired: false },
      });
      return true;
    },
    async (page) => {
      await page
        .getByRole('button', { name: 'Continue with password', exact: true })
        .waitFor();
    },
  );
});
void test('MFA disable requires explicit acknowledgment and sends password and a fresh factor only to its protected endpoint', async () => {
  let posted: Record<string, unknown> | undefined;
  await withFixture(
    'SecurityWorkspace',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/api/security/')) return false;
      if (route.request().method() === 'GET')
        await route.fulfill({
          json: {
            ...fixtureStatus,
            status: 'active',
            sessionVerified: true,
            canDisable: true,
          },
        });
      else {
        assert.equal(path, '/api/security/disable');
        posted = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
          status: 409,
          json: { error: 'Fixture keeps this page open' },
        });
      }
      return true;
    },
    async (page) => {
      const form = page.getByRole('form', { name: 'Disable MFA', exact: true });
      await form.waitFor();
      const button = form.getByRole('button', {
        name: 'Disable MFA',
        exact: true,
      });
      assert.equal(await button.isDisabled(), true);
      await form
        .getByLabel('Current password', { exact: true })
        .fill('fictional-owner-password');
      await form
        .getByLabel('Authenticator code', { exact: true })
        .fill('123456');
      await form
        .getByRole('checkbox', { name: /I understand.*password/ })
        .check();
      await button.click();
      await page.getByRole('alert').waitFor();
      assert.match(
        await page.getByRole('alert').innerText(),
        /Fixture keeps this page open/,
      );
      assert.deepEqual(posted, {
        password: 'fictional-owner-password',
        code: '123456',
        recovery: false,
        acknowledge: true,
      });
      assert.equal(
        await form.getByLabel('Current password', { exact: true }).inputValue(),
        '',
      );
      assert.equal(
        await form
          .getByLabel('Authenticator code', { exact: true })
          .inputValue(),
        '',
      );
    },
  );
});
