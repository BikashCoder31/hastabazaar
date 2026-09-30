import { stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixtureBrowser } from './helpers/browser-fixture-types';
import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

const actions = [
  ['rule.create', 'staff.governance-rule-create'],
  ['promotion.create', 'staff.governance-promotion-create'],
  ['incident.create', 'staff.governance-incident-create'],
  ['incident.update', 'staff.governance-incident-update'],
  ['backup.verify', 'staff.governance-backup-verify'],
] as const;

void test('all five mounted governance forms retain opaque attempts through uncertain, changed and reload retries', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const bundle = await build({ stdin: { contents: `
    import React from 'react';
    import {createRoot} from 'react-dom/client';
    import {GovernanceConsole} from './components/admin/governance-console';
    const data={users:[],rules:[],products:[],promotions:[],backups:[],incidents:[{
      id:'incident-one',referenceNumber:'INC-1',title:'Fictional incident',severity:'medium',status:'open'
    }]};
    createRoot(document.getElementById('root')).render(<GovernanceConsole data={data} superAdmin={true} actorId="super-one"/>);
  `, resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false,
    platform: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{ name: 'governance-retry-stubs', setup(bundler) { stubFixtureLink(bundler);
      bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'form-config', namespace: 'governance-stub' }));
      bundler.onResolve({ filter: /^@\/components\/ui\/tabs$/ }, () => ({ path: 'tabs', namespace: 'governance-stub' }));
      bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'governance-stub' }));
      bundler.onLoad({ filter: /^form-config$/, namespace: 'governance-stub' }, () => ({ contents: `
        export function usePublishedFormConfig(formId){return {config:{formId,version:2,publishedAt:1,fields:[{
          id:'review_context',key:'review_context',label:'Review context',type:'short_text',required:true,order:0,status:'active'
        }]},canSubmit:true,status:'ready',message:'',refresh(){},handleSubmissionResponse(){window.__staleCalls=(window.__staleCalls||0)+1;return true}}}
      `, loader: 'js' }));
      bundler.onLoad({ filter: /^tabs$/, namespace: 'governance-stub' }, () => ({ resolveDir: process.cwd(), contents: `
        import React from 'react';
        export const Tabs=({children})=><div>{children}</div>;
        export const TabsContent=({children})=><div>{children}</div>;
        export const TabsList=({children})=><div>{children}</div>;
        export const TabsTrigger=({children})=><button type="button">{children}</button>;
      `, loader: 'tsx' }));
      bundler.onLoad({ filter: /^navigation$/, namespace: 'governance-stub' }, () => ({ contents: 'export function useRouter(){return {refresh(){}}}', loader: 'js' }));
    } }],
  });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const page = await browser.newPage();
  const seen = new Map<string, Record<string, unknown>[]>();
  try {
    await page.route('https://governance-retry.test/**', (route) => {
      if (route.request().method() === 'POST') {
        const body = JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>;
        const action = String(body.action);
        const rows = seen.get(action) ?? [];
        rows.push(body); seen.set(action, rows);
        const status = rows.length === 1 ? 503 : rows.length === 2 ? 409 : rows.length === 3 ? 400 : rows.length === 6 ? 409 : 200;
        return route.fulfill({ status, contentType: 'application/json',
          body: status === 200 ? rows.length === 4 ? '{}' : '{"ok":true}' : JSON.stringify({ error: `Fictional ${status} retry`,
            ...(rows.length === 6 ? { code: 'stale_version' } : {}) }) });
      }
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
    });
    const mount = async () => { await page.goto('https://governance-retry.test/'); await page.addScriptTag({ content: bundle.outputFiles[0].text }); };
    const fillAndSubmit = async (formId: string, changed = false) => {
      await page.locator(`form[data-form-id="${formId}"]`).first().waitFor();
      await page.evaluate(({ formId, changed }: { formId: string; changed: boolean }) => {
        const form = document.querySelector(`form[data-form-id="${formId}"]`) as HTMLFormElement;
        const fields: Record<string, string> = {
          code: 'FIXTURE_RULE', titleEn: 'Fictional rule', descriptionEn: 'Fictional detailed guidance',
          nameEn: 'Fictional campaign', startsAt: '2026-10-01T10:00', endsAt: '2026-10-02T10:00',
          note: 'Fictional evidence note', title: 'Fictional incident', detail: 'Fictional incident detail and response',
          resolution: 'Fictional resolution', evidenceReference: 'FICTIONAL-REF',
          'custom.review_context': changed ? 'Changed fictional context' : 'Initial fictional context',
        };
        for (const [name, value] of Object.entries(fields)) {
          const field = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement | null;
          if (field) field.value = value;
        }
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }, { formId, changed });
    };
    for (const [action, formId] of actions) {
      await mount();
      await fillAndSubmit(formId);
      await page.getByText('Fictional 503 retry').waitFor();
      assert.equal(seen.get(action)?.length, 1, `${action} first response`);
      const first = seen.get(action)![0];
      assert.equal(first.formVersion, 2);
      assert.match(String(first.requestId), /^[0-9a-f-]{36}$/i);
      assert.equal((first.customAnswers as { fieldId: string }[])[0].fieldId, 'review_context');
      await mount();
      await fillAndSubmit(formId, true);
      await page.getByText('Fictional 409 retry').waitFor();
      assert.equal(seen.get(action)?.[1].requestId, first.requestId, `${action} reload and edit must keep ID`);
      await fillAndSubmit(formId, true);
      await page.getByText('Fictional 400 retry').waitFor();
      assert.equal(seen.get(action)?.[2].requestId, first.requestId, `${action} domain error must keep ID`);
      if (action === 'rule.create') {
        const reset = page.getByRole('button', { name: 'Start a new attempt' }).first();
        await reset.waitFor();
        await page.evaluate(() => { window.confirm = () => false; });
        await reset.click();
        assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), String(first.requestId)), true);
        await page.evaluate(() => { window.confirm = () => true; });
        await reset.click();
        assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), String(first.requestId)), false);
      }
      await fillAndSubmit(formId, true);
      await page.getByText(/response could not be verified/i).waitFor({ timeout: 5000 });
      const uncertain = String(seen.get(action)?.[3].requestId);
      assert.equal(uncertain === String(first.requestId), action !== 'rule.create',
        `${action} must rotate only after explicit reset`);
      assert.ok((await page.evaluate(() => Object.values(sessionStorage))).includes(uncertain),
        `${action} ambiguous 2xx must keep the attempt`);
      await fillAndSubmit(formId, true);
      await page.getByText('Saved. The operation has been recorded in audit history.').waitFor();
      assert.equal(seen.get(action)?.[4].requestId, uncertain);
      await page.evaluate((key: string) => {
        for (const stored of Object.keys(sessionStorage)) if (stored.includes(key)) throw new Error('Confirmed success kept an opaque attempt');
      }, formId);
    }
    assert.equal(await page.evaluate(() => (window as Window & { __staleCalls?: number }).__staleCalls ?? 0), 0,
      'generic 400/409/503 responses must not trigger stale-form handling');
    await fillAndSubmit('staff.governance-rule-create');
    await page.getByText('Fictional 409 retry').waitFor();
    assert.equal(await page.evaluate(() => (window as Window & { __staleCalls?: number }).__staleCalls ?? 0), 1,
      'only the stale_version code triggers stale-form handling');
  } finally { await browser.close(); }
});
