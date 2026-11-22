import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextRequest } from 'vinext/shims/server';
import type { NextRequest as FrameworkRequest } from 'next/server';
import {
  createHostedSessionForUser,
  hostedSessionHash,
  passwordRecord,
} from '../lib/auth/hosted-session';
import { totpAtCounter } from '../lib/security/crypto';
import { MfaService } from '../lib/security/mfa';
import {
  ADMIN_ABSOLUTE_MS,
  ADMIN_IDLE_MS,
  FRESH_PASSWORD_MS,
} from '../lib/security/model';
import { SecurityStore } from '../lib/security/store';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import { incentiveReportDatabase } from './helpers/incentive-report-database';

const userId = 'fictional-sign-in-owner';
const email = 'owner@staff-sign-in.fixture';
const password = 'fictional-password-for-the-isolated-sign-in-test';
const destination = '/admin/orders?status=packing&search=gift%20box';
const context = {
  db: null as D1Database | null,
  key: '',
  origin: '',
  headers: new AsyncLocalStorage<Headers>(),
};
(
  globalThis as typeof globalThis & { staffSignInFixture: typeof context }
).staffSignInFixture = context;
registerHooks({
  resolve(specifier, current, next) {
    if (specifier === 'next/server')
      return next('vinext/shims/server', current);
    const seams: Record<string, string> = {
      'cloudflare:workers':
        'export const env={get DB(){return globalThis.staffSignInFixture.db},get HASTABAZAAR_SECURITY_KEY(){return globalThis.staffSignInFixture.key},SECURITY_POLICY:{async read(){return true},async mark(){}},get APP_ORIGIN(){return globalThis.staffSignInFixture.origin}};',
      'next/headers':
        'export async function headers(){return globalThis.staffSignInFixture.headers.getStore()}',
      'next/navigation':
        'export function redirect(path){throw new Error("REDIRECT:"+path)}',
      'next/link': 'export default function Link(props){return props.children}',
      '@/components/auth/google-sign-in':
        'export function GoogleSignIn(){return null}',
    };
    return seams[specifier]
      ? {
          url: 'data:text/javascript,' + encodeURIComponent(seams[specifier]),
          shortCircuit: true,
        }
      : next(specifier, current);
  },
});

void test(
  'an expired staff session completes password and MFA sign-in back to the requested page',
  { timeout: 45_000 },
  async (t) => {
    const f = await incentiveReportDatabase();
    context.db = f.db;
    context.key = Buffer.from(randomBytes(32)).toString('base64url');
    let now = Date.now();
    t.mock.method(Date, 'now', () => now);
    try {
      assert.equal(f.sqlite.prepare('PRAGMA database_list').all()[0].file, '');
      // The hosted sign-in tables are installed separately from the app migrations.
      f.sqlite.exec(
        'CREATE TABLE user_credentials(user_id TEXT PRIMARY KEY,password_hash TEXT,password_salt TEXT,password_version INTEGER,created_at INTEGER,updated_at INTEGER); CREATE TABLE user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER,created_at INTEGER,last_seen_at INTEGER);',
      );
      f.sqlite
        .prepare(
          "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'Fictional Super Admin','active',?,?)",
        )
        .run(userId, userId, email, now, now);
      f.sqlite
        .prepare(
          "INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,'super_admin',?)",
        )
        .run(userId, now);
      f.sqlite
        .prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,
      created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES ('fixture-login-v1','identity.login-password',1,1,'published',?,'Fictional login',?,1,?,1,?,1,'publish-fixture-login')`)
        .run(
          JSON.stringify({ formId: 'identity.login-password', fields: [] }),
          userId,
          userId,
          userId,
        );
      const credential = await passwordRecord(password);
      f.sqlite
        .prepare('INSERT INTO user_credentials VALUES(?,?,?,1,?,?)')
        .run(userId, credential.hash, credential.salt, now, now);
      const enrolledToken = await createHostedSessionForUser(f.db, userId, now);
      const sessionHash = hostedSessionHash(
        new Headers({ cookie: 'hastabazaar_session=' + enrolledToken }),
      )!;
      const store = new SecurityStore(f.db, context.key);
      await store.initialize([userId], now);
      const mfa = new MfaService(store);
      const setup = await mfa.beginSetup({ userId, sessionHash, now });
      await mfa.confirmSetup({
        userId,
        sessionHash,
        now,
        setupId: setup.setupId,
        code: totpAtCounter(setup.secret, Math.floor(now / 30_000)),
      });
      await mfa.activateSetup({
        userId,
        sessionHash,
        now,
        setupId: setup.setupId,
        passwordVerifiedAt: now,
        recoverySaved: true,
      });

      const [
        { middleware },
        { requireStaffPage },
        { default: LoginPage },
        { default: ContinuePage },
        { POST: login },
        { GET: status },
        { POST: verify },
        { POST: activity },
      ] = await Promise.all([
        import('../middleware'),
        import('../lib/auth/staff'),
        import('../app/login/page'),
        import('../app/auth/continue/page'),
        import('../app/api/auth/login/route'),
        import('../app/api/security/status/route'),
        import('../app/api/security/verify/route'),
        import('../app/api/security/activity/route'),
      ]);
      const bundle = await build({
        stdin: {
          resolveDir: process.cwd(),
          loader: 'tsx',
          contents:
            "import React from 'react';import {createRoot} from 'react-dom/client';import {SecurityWorkspace} from './components/security/security-workspace';import {AdminSessionActivity} from './components/security/session-activity';const root=createRoot(document.getElementById('root'));root.render(location.pathname==='/security'?<SecurityWorkspace returnTo={new URLSearchParams(location.search).get('return_to')??undefined}/>:<AdminSessionActivity/>);",
        },
        bundle: true,
        jsx: 'automatic',
        write: false,
        platform: 'browser',
        format: 'iife',
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [{ name: 'fixture-links', setup: stubFixtureLink }],
      });
      const posts: Record<string, unknown>[] = [];
      const failures: unknown[] = [];
      const html = (body: string) =>
        new Response('<!doctype html><html><body>' + body + '</body></html>', {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
      const script = '<div id="root"></div><script src="/fixture.js"></script>';
      const server = createServer(async (incoming, outgoing) => {
        try {
          const url = new URL(incoming.url ?? '/', context.origin);
          const requestHeaders = new Headers(
            incoming.headers as Record<string, string>,
          );
          const chunks: Buffer[] = [];
          for await (const chunk of incoming) chunks.push(chunk);
          const request = new Request(url, {
            method: incoming.method,
            headers: requestHeaders,
            ...(chunks.length
              ? { body: Uint8Array.from(Buffer.concat(chunks)) }
              : {}),
          });
          const render = async () => {
            if (url.pathname === '/fixture.js')
              return new Response(bundle.outputFiles[0].text, {
                headers: { 'Content-Type': 'text/javascript' },
              });
            if (url.pathname === '/login')
              return html(
                renderToStaticMarkup(
                  await LoginPage({
                    searchParams: Promise.resolve(
                      Object.fromEntries(url.searchParams),
                    ),
                  }),
                ),
              );
            if (url.pathname === '/auth/continue') {
              await ContinuePage({
                searchParams: Promise.resolve(
                  Object.fromEntries(url.searchParams),
                ),
              });
              throw new Error('Continuation should redirect');
            }
            if (url.pathname === '/security') return html(script);
            if (url.pathname === '/api/auth/login') return login(request);
            if (url.pathname === '/api/security/status') return status(request);
            if (url.pathname === '/api/security/verify') {
              posts.push(
                (await request.clone().json()) as Record<string, unknown>,
              );
              return verify(request);
            }
            if (url.pathname === '/api/security/activity')
              return activity(request);
            if (url.pathname === '/admin/orders') {
              const forwarded = middleware(
                new NextRequest(request.url, {
                  headers: requestHeaders,
                }) as unknown as FrameworkRequest,
              ).headers.get(
                'x-middleware-request-x-hastabazaar-admin-return-to',
              );
              if (forwarded)
                requestHeaders.set('x-hastabazaar-admin-return-to', forwarded);
              await requireStaffPage('/admin');
              return html('<h1>Fictional Admin orders</h1>' + script);
            }
            return new Response(null, { status: 404 });
          };
          const response = await context.headers
            .run(requestHeaders, render)
            .catch((error: unknown) => {
              if (
                error instanceof Error &&
                error.message.startsWith('REDIRECT:')
              )
                return Response.redirect(
                  context.origin + error.message.slice(9),
                  307,
                );
              throw error;
            });
          for (const [key, value] of response.headers)
            if (key !== 'set-cookie') outgoing.setHeader(key, value);
          if (response.headers.has('set-cookie'))
            outgoing.setHeader('Set-Cookie', response.headers.getSetCookie());
          outgoing.writeHead(response.status);
          outgoing.end(await response.text());
        } catch (error) {
          failures.push(error);
          outgoing.writeHead(500).end('Fixture request failed');
        }
      });
      server.listen(0, '127.0.0.1');
      try {
        await once(server, 'listening');
        const origin =
          'http://127.0.0.1:' + (server.address() as AddressInfo).port;
        context.origin = origin;
        const browser = await chromium.launch({
          headless: true,
          executablePath:
            process.env.CHROME_PATH ??
            'C:/Program Files/Google/Chrome/Application/chrome.exe',
        });
        try {
          const profile = await browser.newContext();
          await profile.route('**/*', (route) =>
            new URL(route.request().url()).origin === origin
              ? route.continue()
              : route.abort(),
          );
          await profile.addCookies([
            { url: origin, name: 'hastabazaar_session', value: enrolledToken },
          ]);
          const browserErrors: string[] = [];
          const page = await profile.newPage();
          page.setDefaultTimeout(5_000);
          page.on('pageerror', (error) => browserErrors.push(error.message));
          const expectLogin = async () => {
            await page.waitForURL((url) => url.pathname === '/login');
            const url = new URL(page.url());
            assert.equal(url.searchParams.get('return_to'), destination);
            assert.equal(url.searchParams.has('reauth'), false);
            await page
              .getByRole('alert')
              .filter({ hasText: 'Your session expired. Sign in again.' })
              .waitFor();
          };
          const enterPassword = async () => {
            const form = page.locator(
              'form[data-form-id="identity.login-password"]',
            );
            await form.getByLabel('Email address').fill(email);
            await form.getByLabel(/^Password(?:\s+\*)?$/).fill(password);
            await form
              .getByRole('button', { name: 'Sign in', exact: true })
              .click();
            await page.getByText(/^Password confirmed\./).waitFor();
            const signIn = page.locator(
              'form[data-form-id="system.security-mfa-verify"]',
            );
            assert.equal(await signIn.locator('input').count(), 1);
            assert.equal(
              await page.locator('input[type="password"]').count(),
              0,
            );
            assert.equal(
              await signIn
                .getByLabel('Authenticator code')
                .getAttribute('autocomplete'),
              'one-time-code',
            );
            return signIn.getByRole('button', { name: 'Verify and continue' });
          };

          now += ADMIN_IDLE_MS;
          await page.goto(origin + destination);
          assert.equal(
            new URL(page.url()).pathname,
            '/login',
            'idle expiry goes directly to normal sign-in',
          );
          await expectLogin();
          let submit = await enterPassword();
          const otherToken = await createHostedSessionForUser(
            f.db,
            userId,
            now,
          );
          const otherStatus = await status(
            new Request(origin + '/api/security/status', {
              headers: { cookie: 'hastabazaar_session=' + otherToken },
            }),
          );
          assert.equal(
            ((await otherStatus.json()) as { passwordVerified: boolean })
              .passwordVerified,
            false,
          );
          const code = page.getByLabel('Authenticator code', { exact: true });
          const counter = Math.floor(now / 30_000);
          const correct = new Set(
            [-1, 0, 1].map((offset) =>
              totpAtCounter(setup.secret, counter + offset),
            ),
          );
          const wrong = ['000000', '000001', '000002', '000003'].find(
            (value) => !correct.has(value),
          )!;
          await code.fill(wrong);
          await submit.click();
          await page
            .getByRole('alert')
            .filter({ hasText: /authenticator code is invalid/ })
            .waitFor();
          await code.waitFor();
          assert.equal(await code.inputValue(), '');
          assert.deepEqual(posts[0], {
            code: wrong,
            recovery: false,
            returnTo: destination,
          });
          await page
            .getByRole('button', { name: 'Use a recovery code' })
            .click();
          await page.getByLabel('Recovery code', { exact: true }).waitFor();
          await page
            .getByRole('button', { name: 'Use authenticator instead' })
            .click();
          await code.waitFor();
          await code.fill(
            totpAtCounter(setup.secret, Math.floor(now / 30_000)),
          );
          await submit.click();
          await page
            .getByRole('heading', { name: 'Fictional Admin orders' })
            .waitFor();
          assert.equal(page.url(), origin + destination);
          assert.equal(
            posts.length,
            2,
            'wrong code can be retried in the same password session',
          );

          const cookie = (await profile.cookies(origin)).find(
            (cookie) => cookie.name === 'hastabazaar_session',
          );
          assert.ok(cookie);
          now += ADMIN_ABSOLUTE_MS;
          const expired = await fetch(origin + destination, {
            redirect: 'manual',
            headers: { cookie: cookie.name + '=' + cookie.value },
          });
          assert.equal(expired.status, 307);
          assert.equal(
            new URL(expired.headers.get('location')!).searchParams.get('error'),
            'session_expired',
          );
          await page.waitForLoadState('load');
          await page.bringToFront();
          await page.keyboard.press('Tab');
          await expectLogin();
          submit = await enterPassword();
          now += FRESH_PASSWORD_MS + 1;
          await code.fill(wrong);
          await submit.click();
          await expectLogin();

          await page.clock.install();
          await enterPassword();
          now += FRESH_PASSWORD_MS + 1;
          await page.clock.fastForward(FRESH_PASSWORD_MS + 1);
          await expectLogin();
          assert.deepEqual(browserErrors, []);
        } finally {
          await browser.close();
        }
      } catch (error) {
        if (failures.length)
          throw new AggregateError(
            failures,
            'Failed isolated sign-in requests',
            { cause: failures[0] },
          );
        throw error;
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      assert.deepEqual(failures, []);
    } finally {
      context.db = null;
      context.key = '';
      f.dispose();
    }
  },
);
