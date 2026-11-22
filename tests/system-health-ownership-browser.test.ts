/** Isolated real component/API/form journey. Every request is intercepted; SQLite is :memory: only. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { build } from 'esbuild';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { stubFixtureLink } from './helpers/browser-fixture-link';
import { staffMutationGuard } from '../lib/db/repositories/staff-mutation-guard';
import { captureDatabaseHealthScope } from '../lib/db/health-context';
import {
  createIncident,
  executeIncidentCommand,
  listIncidents,
  readIncident,
} from '../lib/operations/incident-review';

declare global {
  var incidentBrowserDb: D1Database;
  var incidentBrowserAuthority: (
    permission: string,
  ) => Promise<{ id: string; role: string }>;
}
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'cloudflare:workers')
      return {
        url: 'data:text/javascript,export const env={get DB(){return globalThis.incidentBrowserDb},HASTABAZAAR_RUNTIME_ENV:"test",APP_ORIGIN:"https://incident-browser.test",HASTABAZAAR_RELEASE_ID:"fixture-release"}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/staff')
      return {
        url: 'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){try{return await globalThis.incidentBrowserAuthority(permission)}catch{throw new StaffAuthorizationError("Current staff permission is required.")}}',
        shortCircuit: true,
      };
    if (specifier === '@/app/auth')
      return {
        url: 'data:text/javascript,export async function getAuthenticatedUser(){return{userId:"incident-browser-admin"}}',
        shortCircuit: true,
      };
    if (specifier === '@/lib/auth/seller-commercial-access')
      return {
        url: 'data:text/javascript,export async function getSellerTermsViewer(){return null}',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
void test('real incident controls replay an exact lost plan request, acknowledge without closure and reject an old revoked tab', async () => {
  assert.notEqual(process.env.HATSKALA_STAGING_NATIVE, '1');
  const f = await incentiveReportDatabase();
  try {
    assert.ok(
      f.sqlite
        .prepare('PRAGMA database_list')
        .all()
        .every((row) => row.file === ''),
    );
    const now = Date.now(),
      actor = 'incident-browser-admin',
      sa = 'incident-browser-sa',
      origin = 'https://incident-browser.test';
    for (const [id, role] of [
      [actor, 'admin'],
      [sa, 'super_admin'],
    ]) {
      f.sqlite
        .prepare(
          "INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'Fictional incident responder','active',?,?)",
        )
        .run(id, id, id + '@local.hastabazaar.test', now, now);
      f.sqlite
        .prepare(
          'INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,?)',
        )
        .run(id, role, now);
    }
    f.sqlite
      .prepare(
        'INSERT INTO staff_permission_profiles(user_id,permissions_json,updated_by,updated_at) VALUES(?,?,?,?)',
      )
      .run(actor, '["system.incidents.manage"]', sa, now);
    f.sqlite
      .prepare(
        "INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('incident-browser-form','staff.incident-review',1,'published',?,'Fictional compatible incident controls',?,?,?,?,?,?,'incident-browser-publish')",
      )
      .run(
        JSON.stringify({ formId: 'staff.incident-review', fields: [] }),
        sa,
        now,
        sa,
        now,
        sa,
        now,
      );
    captureDatabaseHealthScope(f.db, {
      HASTABAZAAR_RUNTIME_ENV: 'test',
      APP_ORIGIN: origin,
      HASTABAZAAR_RELEASE_ID: 'fixture-release',
      NODE_ENV: 'development',
    });
    globalThis.incidentBrowserDb = f.db;
    globalThis.incidentBrowserAuthority = async (permission) => {
      const authority = await staffMutationGuard(
        f.db,
        actor,
        permission as never,
        Error,
      );
      return { id: actor, authSubject: actor, role: authority.role };
    };
    const created = await createIncident(
      f.db,
      { actorId: sa, requestId: 'browser-open', expectedRevision: null, now },
      {
        environment: 'test',
        serviceKey: 'application.availability',
        failureSignature: 'fictional-workflow-blocked',
        title: 'Fictional supported action blocked',
        impactSummary:
          'The supported fictional workflow cannot currently complete.',
        impactClass: 'ordinary',
        severity: 'high',
      },
    );
    await executeIncidentCommand(
      f.db,
      {
        actorId: sa,
        requestId: 'browser-assign',
        expectedRevision: '0:0',
        now,
      },
      {
        incidentId: created.incidentId,
        action: 'assign',
        ownerId: actor,
        reason: 'Assign the eligible available fictional responder',
      },
    );
    const api = await import('../app/api/admin/system-health/incidents/route'),
      forms = await import('../app/api/forms/[formId]/route');
    const boot = async () => ({
      actorId: actor,
      rows: await listIncidents(f.db, actor, 'test'),
      detail: await readIncident(f.db, actor, created.incidentId, 'test'),
      legacy: [],
      responders: [{ id: actor, name: 'Fictional incident responder' }],
      manage: true,
      canAct: true,
      superAdmin: false,
    });
    const code = (
      await build({
        stdin: {
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: `import React,{useEffect,useState}from'react';import{createRoot}from'react-dom/client';import{IncidentWorkspace}from'./components/admin/incident-workspace';function App(){const[props,setProps]=useState(window.__INCIDENT_BOOT__);useEffect(()=>{const refresh=async()=>{const response=await fetch('/fixture-workspace');if(response.ok)setProps(await response.json())};window.addEventListener('fixture-refresh',refresh);return()=>window.removeEventListener('fixture-refresh',refresh)},[]);return <main className="mx-auto max-w-5xl p-6"><h1 className="mb-4 text-2xl font-semibold">Fictional incident workspace</h1><IncidentWorkspace {...props}/></main>};createRoot(document.getElementById('root')).render(<App/>);`,
        },
        bundle: true,
        write: false,
        platform: 'browser',
        format: 'iife',
        define: { 'process.env.NODE_ENV': '"production"' },
        plugins: [
          {
            name: 'incident-fixture-navigation',
            setup(builder) {
              stubFixtureLink(builder);
              builder.onResolve({ filter: /^next\/navigation$/ }, () => ({
                path: 'navigation',
                namespace: 'incident-fixture',
              }));
              builder.onLoad(
                { filter: /.*/, namespace: 'incident-fixture' },
                () => ({
                  loader: 'js',
                  contents: `export function useRouter(){return{push(url){history.pushState(null,'',url)},refresh(){window.dispatchEvent(new Event('fixture-refresh'))}}}`,
                }),
              );
            },
          },
        ],
      })
    ).outputFiles[0].text;
    const css = (
      await postcss([tailwind()]).process(
        (await readFile('app/globals.css', 'utf8')).replace(
          /@import\s+(['"])tailwindcss\1;/,
          "@import 'tailwindcss' source(none);\n@source '../app';\n@source '../components';\n@source '../hooks';\n@source '../lib';",
        ),
        { from: resolve('app/globals.css') },
      )
    ).css;
    const { chromium } = await import(
        process.env.PLAYWRIGHT_MODULE ??
          'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'
      ),
      browser = await chromium.launch({
        headless: true,
        executablePath:
          process.env.CHROME_PATH ??
          'C:/Program Files/Google/Chrome/Application/chrome.exe',
      });
    try {
      const context = await browser.newContext({
          viewport: { width: 1200, height: 900 },
        }),
        bodies: string[] = [],
        statuses: number[] = [],
        errors: string[] = [];
      let losePlan = true;
      await context.route(
        '**/*',
        async (route: {
          request(): {
            url(): string;
            postData(): string | null;
            method(): string;
            headers(): Record<string,string>;
          };
          fulfill(response: unknown): Promise<void>;
          abort(): Promise<void>;
        }) => {
          const incoming = route.request(),
            url = new URL(incoming.url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname === '/fixture-incident')
            return route.fulfill({
              status: 200,
              contentType: 'text/html',
              body:
                '<!doctype html><html><head><title>Fictional incident workspace</title><link rel="icon" href="data:,"></head><body><div id="root"></div><script>window.__INCIDENT_BOOT__=' +
                JSON.stringify(await boot()).replaceAll('<', '\\u003c') +
                '</script></body></html>',
            });
          if (url.pathname === '/fixture-workspace'){
            try{return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(await boot())});}
            catch{const response=await api.GET(new Request(origin+'/api/admin/system-health/incidents'));return route.fulfill({status:response.status,contentType:'application/json',body:await response.text()});}
          }
          if (url.pathname === '/api/forms/staff.incident-review') {
            const response = await forms.GET(new Request(url,{headers:incoming.headers()}), {
              params: Promise.resolve({ formId: 'staff.incident-review' }),
            });
            return route.fulfill({
              status: response.status,
              contentType: 'application/json',
              body: await response.text(),
            });
          }
          if (url.pathname !== '/api/admin/system-health/incidents')
            return route.abort();
          assert.equal(incoming.method(), 'POST');
          const body = incoming.postData()!;
          bodies.push(body);
          const response = await api.POST(
            new Request(url, {
              method: 'POST',
              headers: {
                ...incoming.headers(),
                origin,
                'content-type': 'application/json',
                'sec-fetch-site': 'same-origin',
              },
              body,
            }),
          );
          statuses.push(response.status);
          const result = await response.text();
          if (JSON.parse(body).action === 'plan' && losePlan) {
            losePlan = false;
            assert.equal(response.status, 200, result);
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: '{"error":"Fictional lost plan acknowledgement; retry unchanged."}',
            });
          }
          return route.fulfill({
            status: response.status,
            contentType: 'application/json',
            body: result,
          });
        },
      );
      const page = await context.newPage();
      page.on('pageerror', (error: Error) => errors.push(error.message));
      page.on('console', (message: { type(): string; text(): string }) => {
        if (
          ['error', 'warning'].includes(message.type()) &&
          !/Failed to load resource:.*(?:503|403)/.test(message.text())
        )
          errors.push(message.text());
      });
      const submitAction = () =>
        Promise.all([
          page.waitForResponse(
            (response: { url(): string; request(): { method(): string } }) =>
              response.url().endsWith('/api/admin/system-health/incidents') &&
              response.request().method() === 'POST',
          ),
          page
            .getByRole('button', { name: 'Save incident action', exact: true })
            .click(),
        ]);
      await page.goto(origin + '/fixture-incident');
      await page.addStyleTag({ content: css });
      await page.addScriptTag({ content: code });
      assert.equal(await page.title(), 'Fictional incident workspace');
      await page
        .getByRole('heading', { name: 'Fictional incident workspace' })
        .waitFor();
      assert.equal(
        await page.locator('nextjs-portal,vite-error-overlay').count(),
        0,
      );
      await page.screenshot({
        path: '.test-artifacts/t30/incident-initial.png',
        fullPage: true,
      });
      await page.getByLabel(/^Action/).selectOption('plan');
      await page
        .getByLabel('Containment plan', { exact: true })
        .fill(
          'Contain the fictional blocked workflow and retain every submitted answer.',
        );
      await page
        .getByLabel('Next safe action', { exact: true })
        .fill('Verify the current supported functional path');
      await page
        .getByLabel('Next update in elapsed minutes', { exact: true })
        .fill('30');
      await page
        .getByLabel(/^Reason or substantive update/)
        .fill(
          'Record actual containment while preserving the original detection clock',
        );
      await submitAction();
      await page
        .getByText('The original outcome is uncertain.', {exact:false})
        .waitFor();
      assert.equal(
        f.sqlite
          .prepare(
            "SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'",
          )
          .get()?.n,
        1,
      );
      await page.evaluate(() => {
        const original = Date.now;
        Date.now = () => original() + 12_345;
      });
      await Promise.all([page.waitForResponse((response:{url():string;request():{method():string}})=>response.url().endsWith('/api/admin/system-health/incidents')&&response.request().method()==='POST'),page.getByRole('button',{name:'Retry original incident action',exact:true}).click()]);
      await page.getByText('The original incident action is recorded.',{exact:false}).waitFor({timeout:5000});
      assert.equal(bodies[1], bodies[0]);
      assert.deepEqual(statuses, [200, 200]);
      await page.getByText(/plan · version 2:2/).waitFor();
      assert.equal(
        f.sqlite
          .prepare(
            "SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'",
          )
          .get()?.n,
        1,
      );
      await page.getByRole('button',{name:'Review current incident evidence',exact:true}).click();
      await page.getByLabel(/^Action/).selectOption('acknowledge');
      await page
        .getByLabel(/^Reason or substantive update/)
        .fill(
          'The assigned responder acknowledges duty; recovery remains unproven',
        );
      await submitAction();
      await page
        .getByText('The original incident action is recorded.', {exact:false})
        .waitFor();
      await page.getByText(/acknowledge · version 3:3/).waitFor();
      assert.notEqual(
        JSON.parse(bodies[2]).requestId,
        JSON.parse(bodies[0]).requestId,
      );
      const acknowledged = f.sqlite
        .prepare(
          'SELECT h.state,h.resolved_at,g.acknowledged_at FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.id=?',
        )
        .get(created.incidentId)!;
      assert.equal(acknowledged.state, 'working');
      assert.ok(acknowledged.acknowledged_at);
      assert.equal(acknowledged.resolved_at, null);
      await mkdir('.test-artifacts/t30', { recursive: true });
      await page.screenshot({
        path: '.test-artifacts/t30/incident-plan-recovered.png',
        fullPage: true,
      });
      await page.getByRole('button',{name:'Review current incident evidence',exact:true}).click();
      await page.getByLabel(/^Action/).selectOption('update');
      await page
        .getByLabel('Next safe action', { exact: true })
        .fill('Retain this entered action when the old tab loses authority');
      await page
        .getByLabel(/^Reason or substantive update/)
        .fill('An old tab must not retain incident mutation authority');
      f.sqlite
        .prepare(
          'UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?',
        )
        .run('[]', actor);
      await submitAction();
      await page.getByRole('heading',{name:'Review access changed',exact:true}).waitFor();
      assert.equal(await page.getByLabel('Next safe action',{exact:true}).count(),0,'Revoked staff must not retain private form controls.');
      assert.equal(statuses.at(-1), 403);
      assert.equal(
        f.sqlite
          .prepare(
            "SELECT COUNT(*) n FROM service_incident_events WHERE action='update'",
          )
          .get()?.n,
        0,
      );
      const denied=JSON.parse(bodies.at(-1)!) as {requestId:string};
      const retained=await page.evaluate(()=>Object.entries(sessionStorage));assert.match(JSON.stringify(retained),new RegExp(denied.requestId));assert.doesNotMatch(JSON.stringify(retained),/Retain this entered action|old tab must not/);
      assert.equal(await page.getByRole('button',{name:'Save incident action',exact:true}).count(),0);assert.equal(bodies.length,4,'A denied workspace cannot edit and send a replacement action.');
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      await page.screenshot({
        path: '.test-artifacts/t30/incident-revoked-tab-mobile.png',
        fullPage: true,
      });
      assert.deepEqual(errors, []);
      await context.close();
    } finally {
      await browser.close();
    }
  } finally {
    f.dispose();
  }
});
