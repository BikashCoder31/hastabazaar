import type {Route as BrowserRoute} from 'playwright-core';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import {
  installHealthNoticeRouteFixture,
  actualHealthBellRead,
} from './helpers/service-health-route-fixture';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import {
  evaluateServiceHealth,
  recordServiceHealthObservation,
} from '../lib/operations/service-health-repository';
import { healthTransitionNotificationStatements } from '../lib/operations/service-health-notifications';
import { readEmailDeliveryOverview } from '../lib/operations/email-delivery-overview';
import { getNotificationPanel } from '../lib/operations/notification-panel';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
installHealthNoticeRouteFixture();
void test('shared delivery health and existing bell/inbox retain read state without resolving an outage and show one distinct recovery', async () => {
  const f = await incentiveReportDatabase();
  try {
    globalThis.healthNoticeDb = f.db;
    captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',NODE_ENV:'test',APP_ORIGIN:'https://email-health.test',HASTABAZAAR_RELEASE_ID:'browser-health-fixture'});
    f.sqlite.exec(
      "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('health-sa','health-sa','health-sa@local.hastabazaar.test','Fictional health reviewer','active',1,1);INSERT INTO user_roles(user_id,role,assigned_at) VALUES('health-sa','super_admin',1);",
    );
    let now = 2_000_000_000_000;
    const expectedSince = now - 400000;
    const evaluate = () =>
      evaluateServiceHealth(
        f.db,
        { environment: 'test', serviceKey: 'email.sender', expectedSince, now,evidenceScope:'browser-health-fixture' },
        healthTransitionNotificationStatements,
      );
    await evaluate();
    const panel = () =>
      getNotificationPanel(f.db, {
        userId: 'health-sa',
        audience: 'staff',
        staff: { role: 'super_admin' },
      });
    const boot = async () => ({
      overview: await readEmailDeliveryOverview(f.db, {
        actorId: 'health-sa',
        environment: 'test',
        expectedSince,
        now,
      }),
      panel: await panel(),
    });
    const code = (
      await build({
        stdin: {
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: `import React from'react';import{createRoot}from'react-dom/client';import{EmailDeliveryHealth}from'./components/admin/email-delivery-health';import{NotificationBell}from'./components/account/notification-bell';import{NotificationList}from'./components/account/notification-list';const boot=window.__HEALTH_FIXTURE__;createRoot(document.getElementById('root')).render(<><NotificationBell workspace="staff" accountId="health-sa"/><div id="inbox"><NotificationList workspace="staff" accountId="health-sa" initial={boot.panel.items}/></div><EmailDeliveryHealth overview={boot.overview}/></>);`,
        },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [
          {
            name: 'health-links',
            setup(builder) {
              stubFixtureLink(builder);
            },
          },
        ],
      })
    ).outputFiles[0].text;
    const { chromium } = await import(
      process.env.PLAYWRIGHT_MODULE ??
        'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
    );
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env.CHROME_PATH ??
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
    });
    try {
      const context = await browser.newContext({
          viewport: { width: 1100, height: 900 },
        }),
        origin = 'https://email-health.test',
        errors: string[] = [];
      let readPosts = 0;
      await context.route('**/*', async (route: BrowserRoute) => {
        const incoming = route.request(),
          url = new URL(incoming.url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/')
          return route.fulfill({
            status: 200,
            contentType: 'text/html',
            body:
              '<!doctype html><html><head><title>Fictional delivery health</title><link rel="icon" href="data:,"></head><body><div id="root"></div><script>window.__HEALTH_FIXTURE__=' +
              JSON.stringify(await boot()).replaceAll('<', '\\u003c') +
              '</script></body></html>',
          });
        if (url.pathname === '/api/notifications') {
          const data = await panel();
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(
              url.searchParams.get('filter') === 'unread'
                ? { ...data, items: data.items.filter((item) => !item.readAt) }
                : data,
            ),
          });
        }
        const match = url.pathname.match(
          /^\/api\/admin\/notifications\/([^/]+)\/read$/,
        );
        if (match) {
          readPosts++;
          const response = await actualHealthBellRead(match[1]);
          return route.fulfill({
            status: response.status,
            headers: Object.fromEntries(response.headers),
            body: await response.text(),
          });
        }
        return route.abort();
      });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      page.on('pageerror', (error: Error) => errors.push(error.message));
      const mount = async (reload = false) => {
        if (reload) await page.reload();
        else await page.goto(origin);
        await page.addScriptTag({ content: code });
        await page
          .getByRole('heading', { name: 'Automatic sender', exact: true })
          .waitFor();
      };
      await mount();
      await page
        .getByRole('button', { name: 'Notifications: 1 unread', exact: true })
        .waitFor();
      await page
        .getByRole('button', { name: 'Notifications: 1 unread', exact: true })
        .click();
      const recent = page.getByRole('region', { name: 'Recent notifications' });
      await recent
        .getByText('Email delivery needs attention', { exact: true })
        .waitFor();
      await recent
        .getByRole('button', { name: 'Mark as read', exact: true })
        .click();
      await page
        .getByRole('button', { name: 'Notifications: 0 unread', exact: true })
        .waitFor();
      assert.equal(
        await page
          .locator('#inbox')
          .getByRole('button', { name: 'Mark as read', exact: true })
          .count(),
        0,
      );
      assert.equal(
        f.sqlite.prepare('SELECT state FROM service_health_incidents').get()!
          .state,
        'detected',
      );
      await mount(true);
      await page
        .getByRole('button', { name: 'Notifications: 0 unread', exact: true })
        .waitFor();
      assert.equal(
        f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!
          .n,
        2,
      );
      const record = async (runKey: string) =>
        recordServiceHealthObservation(f.db, {
          environment: 'test',
          serviceKey: 'email.sender',
          runKey,
          observedAt: now,
          successful: true,
          functionalSuccess: true,
          eligibleBacklog: 0,
          oldestEligibleAt: null,
          progressCount: 0,
          failureCategory: null,
          sourceKind: 'sender',
          evidenceScope:'browser-health-fixture',
        });
      now += 10;
      await record('browser-functional-one');
      await evaluate();
      await mount(true);
      await page.getByText(/Episode 1: Monitoring recovery/).waitFor();
      assert.equal((await panel()).unreadCount, 0);
      now += 60000;
      await record('browser-functional-two');
      await evaluate();
      await evaluate();
      await mount(true);
      await page
        .getByRole('button', { name: 'Notifications: 1 unread', exact: true })
        .waitFor();
      await page
        .locator('#inbox')
        .getByText('Email delivery recovered', { exact: true })
        .waitFor();
      await page
        .getByText(/Resolved with recorded recovery evidence/)
        .waitFor();
      assert.equal(
        f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()!
          .n,
        4,
      );
      assert.equal(readPosts, 1);
      assert.deepEqual(errors, []);
      assert.deepEqual(
        await page.evaluate(() => ({
          local: Object.keys(localStorage),
          session: Object.keys(sessionStorage),
        })),
        { local: [], session: [] },
      );
      const artifacts = join(process.cwd(), '.test-artifacts', 't29');
      await mkdir(artifacts, { recursive: true });
      await page.screenshot({
        path: join(artifacts, 'email-health-shared-recovery.png'),
        fullPage: true,
      });
    } finally {
      await browser.close();
    }
  } finally {
    f.dispose();
  }
});
