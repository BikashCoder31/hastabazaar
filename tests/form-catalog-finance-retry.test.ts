import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

type Route = { request(): { url(): string; method(): string; postData(): string | null }; abort(code: string): Promise<void>; fulfill(options: { status: number; contentType: string; body: string }): Promise<void> };

void test('seven finance and staff forms retain opaque attempts across uncertain outcomes and explicit reset', async () => {
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ??
    'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<{newPage(): Promise<any>; close(): Promise<void>}> } }; // oxlint-disable-line typescript/no-explicit-any -- Playwright runtime type.
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'finance-retry-fixture.tsx', contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {PreparePayoutButton,PayoutWorkflowActions} from './components/admin/payout-actions';
    import {DeliveryRateSettings} from './components/admin/delivery-rate-settings';
    import {ReferralSettings} from './components/admin/referral-settings';
    import {StaffInvitationManager} from './components/admin/staff-invitation-manager';
    import {StaffPermissionManager} from './components/admin/staff-permission-manager';
    const mode=new URLSearchParams(location.search).get('mode');
    const element=mode==='prepare'?<PreparePayoutButton sellerId="seller-one" sellerName="Fictional Maker" amount="NPR 100"/>
      :mode==='payout'?<PayoutWorkflowActions payoutId="payout-one" status="prepared" canApprove={true} canProcess={true} isPreparer={false}/>
      :mode==='delivery'?<DeliveryRateSettings rates={{version:'rates-v1',zones:{valley:15000,terai:18000,nationwide:25000},districts:{}}}/>
      :mode==='referral'?<ReferralSettings campaign={{enabled:1,friendDiscountPaisa:1000,rewardPaisa:500,minimumSubtotalPaisa:5000,returnWindowDays:14}}/>
      :mode==='invitation'?<StaffInvitationManager pendingInvitations={[]}/>
      :<StaffPermissionManager actorId="reviewer" members={[{userId:'admin-one',displayName:'Fictional Admin',email:'admin@example.test',permissions:[],version:1,updatedAt:0,updatedBy:''}]} requests={mode==='decision'?[{id:'permission-one',userId:'admin-one',status:'pending',permissionsJson:'[]',reason:'Fictional proposal',proposedBy:'proposer',proposedAt:1,expectedVersion:1,decidedBy:null,decisionNote:null}]:[]} presets={[]}/>;
    createRoot(document.getElementById('root')!).render(element);
  `, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', format: 'iife',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'finance-retry-stubs', setup(bundler) {
    bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'fixture' }));
    bundler.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    bundler.onResolve({ filter: /^@\/components\/admin\/confirm-operation$/ }, () => ({ path: 'confirm', namespace: 'fixture' }));
    bundler.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ loader: 'js', resolveDir: process.cwd(), contents: args.path === 'navigation'
      ? 'export function useRouter(){return {refresh(){}}}'
      : args.path === 'link' ? 'import React from "react";export default function Link(p){return React.createElement("a",p)}'
      : args.path === 'confirm'
        ? 'import React from "react";export function ConfirmOperation(p){return p.open?React.createElement("button",{type:"button",onClick:p.onConfirm},"Confirm decision"):null}'
        : '',
    }));
  } }], });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  const targets = [
    { mode: 'prepare', form: 'staff.payout-1', path: '/api/admin/payouts', key: 'idempotencyKey' },
    { mode: 'payout', form: 'staff.payout-2', path: '/api/admin/payouts/payout-one', key: 'idempotencyKey' },
    { mode: 'delivery', form: 'staff.delivery-rate', path: '/api/admin/delivery-rates', key: 'requestId' },
    { mode: 'referral', form: 'staff.referral-settings', path: '/api/admin/referrals', key: 'requestId' },
    { mode: 'invitation', form: 'staff.staff-invitation', path: '/api/admin/staff-invitations', key: 'requestId' },
    { mode: 'proposal', form: 'staff.staff-permission-1', path: '/api/admin/staff-permissions', key: 'requestId' },
    { mode: 'decision', form: 'staff.staff-permission-2', path: '/api/admin/staff-permissions', key: 'formRequestId' },
  ] as const;
  try {
    for (const target of targets) {
      const page = await browser.newPage();
      const bodies: Record<string, unknown>[] = [];
      let response: 'lost' | 'bad' | 'conflict' | 'stale' | 'ambiguous' | 'success' = 'lost';
      let ambiguousBody = '';
      let configReads = 0;
      const configVersions = new Map<string, number>();
      try {
        await page.route('https://finance-retry.test/**', (route: Route) => {
          if (new URL(route.request().url()).pathname.startsWith('/api/forms/')) {
            configReads++;
            const formId = new URL(route.request().url()).pathname.split('/').at(-1)!;
            const version = (configVersions.get(formId) ?? 0) + 1;
            configVersions.set(formId, version);
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({config:{formId,version,publishedAt:1,fields:[{id:'context_note',key:'context_note',label:'Finance context',type:'short_text',required:true,order:0,status:'active'}]}}) });
          }
          if (new URL(route.request().url()).pathname === target.path && route.request().method() !== 'GET') {
            bodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
            if (response === 'lost') return route.abort('failed');
            if (response === 'bad') return route.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"Correct the field."}' });
            if (response === 'conflict') return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Different content for prior request."}' });
            if (response === 'stale') return route.fulfill({ status: 409, contentType: 'application/json', body: '{"error":"Form changed.","code":"stale_version"}' });
            if (response === 'ambiguous') return route.fulfill({ status: 200, contentType: 'application/json', body: ambiguousBody });
            const result = target.mode === 'prepare' ? '{"id":"prepared-one","duplicate":false}'
              : target.mode === 'delivery' || target.mode === 'referral' ? '{"saved":true}'
                : target.mode === 'invitation' ? '{"id":"invited-one","message":"Created."}'
                  : target.mode === 'proposal' ? '{"id":"proposal-one","message":"Saved."}'
                    : target.mode === 'decision' ? '{"message":"Saved."}' : '{"ok":true}';
            return route.fulfill({ status: 200, contentType: 'application/json', body: result });
          }
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
        });
        const mount = async () => {
          await page.goto(`https://finance-retry.test/?mode=${target.mode}`);
          await page.addScriptTag({ content: bundle.outputFiles[0].text });
          if (target.mode === 'prepare') await page.getByRole('button', { name: 'Prepare payout' }).click();
          const form = page.locator(`form[data-form-id="${target.form}"]`).first();
          await form.waitFor();
          await form.getByLabel('Finance context').fill('Fictional finance review context');
          assert.equal(await form.getByRole('link', { name: /form history/i }).count(), 1, `${target.form}: reachable history link`);
          if (target.mode === 'prepare') await form.getByLabel('Preparation note').fill('Fictional payout note');
          if (target.mode === 'payout') await form.getByLabel('Operational note').fill('Fictional payout approval');
          if (target.mode === 'delivery') await form.locator('[name="reason"]').fill('Fictional rate revision');
          if (target.mode === 'referral') await form.locator('[name="reason"]').fill('Fictional referral revision');
          if (target.mode === 'invitation') await form.getByLabel('Staff email *').fill('invited@example.test');
          if (target.mode === 'proposal') await form.getByLabel('Reason *').fill('Fictional permission revision');
          if (target.mode === 'decision') await form.getByLabel('Decision reason').fill('Fictional permission decision');
          return form;
        };
        const send = async (form: any) => { // oxlint-disable-line typescript/no-explicit-any -- Playwright runtime locator.
          if (target.mode === 'payout') { await form.getByRole('button', { name: 'Review decision' }).click(); await page.getByRole('button', { name: 'Confirm decision' }).click(); }
          else if (target.mode === 'invitation') { await form.getByRole('button', { name: 'Review invitation' }).click(); await page.getByRole('button', { name: 'Confirm decision' }).click(); }
          else await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
          await page.waitForTimeout(80);
        };
        let form = await mount();
        await send(form);
        assert.equal(bodies.length, 1, `${target.form}: first request`);
        const original = String(bodies[0][target.key]);
        assert.match(original, /^[0-9a-f-]{36}$/i, target.form);
        assert.equal(bodies[0].formVersion, 1);
        assert.deepEqual(bodies[0].customAnswers, [{fieldId:'context_note',value:'Fictional finance review context'}]);
        form = await mount();
        assert.equal(await page.getByRole('button', { name: 'Start a new attempt' }).count(), 1, `${target.form}: pending warning after reload`);
        if (target.mode === 'prepare' || target.mode === 'payout') await form.getByLabel(target.mode === 'prepare' ? 'Preparation note' : 'Operational note').fill('Fictional changed payout note');
        else if (target.mode === 'delivery' || target.mode === 'referral') await form.locator('[name="reason"]').fill('Fictional changed revision');
        else if (target.mode === 'invitation') await form.getByLabel('Staff email *').fill('changed@example.test');
        else await form.getByLabel(target.mode === 'proposal' ? 'Reason *' : 'Decision reason').fill('Fictional changed decision');
        response = 'bad'; await send(form); assert.equal(bodies[1][target.key], original, `${target.form}: known 400`);
        response = 'conflict'; await send(form); assert.equal(bodies[2][target.key], original, `${target.form}: domain 409`);
        for (const body of ['{"id":{"unconfirmed":true},"message":{"unconfirmed":true},"saved":"true","ok":"true"}', '{}', 'null', '{"id":" ","message":" "}', '{"id":"unconfirmed","message":"","saved":false,"ok":false}']) {
          response = 'ambiguous'; ambiguousBody = body; await send(form);
          assert.equal(bodies.at(-1)?.[target.key], original, `${target.form}: malformed2xx keeps same request`);
          assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), original), true, `${target.form}: malformed2xx retains opaque attempt`);
          form = await mount();
          assert.equal(await page.getByRole('button', { name: 'Start a new attempt' }).count(), 1, `${target.form}: malformed2xx reload warning`);
        }
        response = 'stale'; await send(form); assert.equal(bodies.at(-1)?.[target.key], original, `${target.form}: stale version`);
        const submitName = {prepare:'Prepare for approval',payout:'Review decision',delivery:'Save rates for future orders',referral:'Save offer',invitation:'Review invitation',proposal:'Propose permission change',decision:'Approve'}[target.mode];
        const submitButton = form.getByRole('button', { name: submitName, exact: true });
        assert.equal(await submitButton.isDisabled(), true, `${target.form}: real stale hook freezes submission`);
        const frozenBodyCount = bodies.length;
        const frozenConfigReads = configReads;
        const preservedContext = await form.getByLabel('Finance context').inputValue();
        const readValues = () => form.evaluate((element: HTMLFormElement) => Array.from(element.querySelectorAll('input:not([name="formVersion"]),textarea,select')).map((field) => { const control = field as HTMLInputElement; return {name:control.name,id:control.id,value:control.value,checked:field instanceof HTMLInputElement ? field.checked : undefined}; }));
        const preservedValues = await readValues();
        page.once('dialog', (dialog: {dismiss(): Promise<void>}) => void dialog.dismiss());
        await page.getByRole('button', { name: 'Start a new attempt' }).evaluate((button: HTMLButtonElement) => button.click());
        assert.equal(await submitButton.isDisabled(), true, `${target.form}: cancelled stale reset stays frozen`);
        assert.equal(configReads, frozenConfigReads, `${target.form}: cancelled reset does not refresh`);
        assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), original), true, `${target.form}: cancelled reset keeps request`);
        assert.equal(bodies.length, frozenBodyCount);
        page.once('dialog', (dialog: {accept(): Promise<void>}) => void dialog.accept());
        await page.getByRole('button', { name: 'Start a new attempt' }).evaluate((button: HTMLButtonElement) => button.click());
        await page.waitForTimeout(80);
        assert.ok(configReads > frozenConfigReads, `${target.form}: confirmed stale reset refreshes catalog`);
        assert.equal(await submitButton.isDisabled(), false, `${target.form}: refreshed configuration permits review`);
        assert.equal(await form.getByLabel('Finance context').inputValue(), preservedContext, `${target.form}: reset preserves entered context`);
        assert.deepEqual(await readValues(), preservedValues, `${target.form}: reset preserves all built-in and custom values`);
        response = 'success'; await send(form);
        assert.notEqual(bodies.at(-1)?.[target.key], original, `${target.form}: confirmed reset`);
        assert.equal(bodies.at(-1)?.formVersion, configVersions.get(target.form), `${target.form}: new attempt uses refreshed publication`);
        assert.equal(await page.evaluate((id: string) => Object.values(sessionStorage).includes(id), String(bodies.at(-1)?.[target.key])), false, `${target.form}: confirmed success clears`);
        assert.ok((await page.evaluate(() => Object.values(sessionStorage))).every((value: string) => !value.includes('Fictional') && !value.includes('@')));
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
});
