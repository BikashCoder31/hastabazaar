import { compileFunction } from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { systemHealthChecks } from '../app/admin/system-health/check-model';

async function renderWorkspace() {
  const code = (await build({
    stdin: {
      loader: 'tsx', resolveDir: process.cwd(), contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import { SystemHealthWorkspace } from './components/admin/system-health-workspace';
        const overview = {
          environment: 'test', releaseId: 'fictional-release', observedAt: 1800000,
          forms: [{formId:'seller.inventory', journey:'inventory', state:'unknown',
            lastLoad:{outcome:'compatible', observedAt:1800000, supportReference:'form-health-fictional'}, lastSave:null,
            meaning:'Definition compatibility is separate from durable submission evidence.'}],
          services: [
            {serviceKey:'application.availability', state:'healthy', lastObservedAt:1800000},
            {serviceKey:'database.readiness', state:'healthy', lastObservedAt:null},
            {serviceKey:'email.sender', state:'unknown', lastObservedAt:null},
            {serviceKey:'email.evaluator', state:'action_needed', lastObservedAt:1200000},
          ],
          incidents:[], retention:{routineDays:30,cleanupEnabled:false}, unobserved:['Full business save journeys'],
        };
        export const html = renderToStaticMarkup(<SystemHealthWorkspace actorId="fictional-owner" overview={overview}
          backup={{available:true, completedAt:null, verification:null}} canReport />);
        export const restricted = renderToStaticMarkup(<SystemHealthWorkspace actorId="fictional-responder" overview={overview} />);
        export const documented = renderToStaticMarkup(<SystemHealthWorkspace actorId="fictional-owner" overview={overview}
          backup={{available:true, completedAt:1700000, verification:{scope:'full',status:'verified',verifiedAt:1750000}}} />);
      `,
    },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom/server'],
    plugins: [{ name: 'link', setup(bundle) {
      bundle.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
      bundle.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: "import React from 'react'; export default function Link(p) { return React.createElement('a', p, p.children); }", loader: 'js',
      }));
    }}],
  })).outputFiles[0].text;
  const fixture = { exports: {} as { html: string; restricted: string; documented: string } };
  compileFunction(code, ['require', 'module', 'exports'])(createRequire(import.meta.url), fixture, fixture.exports);
  return fixture.exports;
}

void test('system health only marks checks with genuine observations as working', async () => {
  const { html } = await renderWorkspace();
  assert.match(html, /data-health-check="website" data-health-status="working"/);
  assert.match(html, /data-health-check="database" data-health-status="unchecked"/);
  assert.match(html, /data-health-check="reminders" data-health-status="attention"/);
  assert.match(html, /data-health-check="sms" data-health-status="off"/);
  assert.match(html, /Run all checks/);
  assert.match(html, /Not built yet/);
  assert.match(html, /fictional-release/);
  assert.match(html, /No durable submission evidence/);
  assert.match(html, /Full business save journeys/);
});

void test('only authorized health readers see backup evidence and the incident reporting action', async () => {
  const { html, restricted, documented } = await renderWorkspace();
  assert.match(html, /Last backup/);
  assert.match(html, /Last restore test/);
  assert.match(html, /Not recorded/);
  assert.match(html, /Open Backup &amp; transfer/);
  assert.match(html, /Report an incident/);
  assert.doesNotMatch(restricted, /Last backup|Last restore test|Open Backup|Report an incident/i);
  assert.match(restricted, /View incidents/);
  assert.match(documented, /dateTime="1970-01-01T00:28:20.000Z"/i);
  assert.match(documented, /Preliminary data export/);
  assert.match(documented, /Database and photos/);
  assert.match(documented, /Last restore test<\/dt><dd[^>]*>Not recorded/);
  assert.match(documented, /Last verification.*Full backup.*Verified/);
});

void test('manual probes leave recorded issues visible and keep unchecked dependencies neutral', () => {
  const services = [
    { serviceKey: 'application.availability', state: 'action_needed', lastObservedAt: 2000 },
    { serviceKey: 'files.private', state: 'healthy', lastObservedAt: 2000 },
  ];
  const orderMail = { pending: 0, oldestAgeMinutes: 0, overdueFirstAttempts: false, exhausted: 0, uncertain: 0, providerBlockedUntil: null };
  const checks = systemHealthChecks(services, { website: true, database: true, orderMail });
  const status = (id: string) => checks.find(row => row.id === id)?.status;
  assert.equal(status('website'), 'attention');
  assert.equal(status('database'), 'working');
  assert.equal(status('order-mail'), 'unchecked');
  assert.equal(status('photos'), 'unchecked');
  assert.equal(status('sms'), 'off');
});
