import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { build, type Plugin } from 'esbuild';
import { stubFixtureImage, stubFixtureLink } from './helpers/browser-fixture-link';
import type { FixtureBrowser } from './helpers/browser-fixture-types';

const fixtures = `
  import React from 'react';
  import AdminLayout from './app/admin/layout';
  import {StaffPermissionManager} from './components/admin/staff-permission-manager';
  import {StaffInvitationManager} from './components/admin/staff-invitation-manager';
  async function element(side, mismatch=false) {
    return <><p>{mismatch ? side : 'Stable shell'}</p>{await AdminLayout({children:<>
      <h1>Staff access test</h1>
      <StaffPermissionManager actorId="reviewer" requests={[]} presets={[]} members={[
        {userId:'colleague', displayName:'Test colleague', email:'colleague@local.hastabazaar.test', permissions:['order.manage'], version:1}
      ]}/>
      <StaffInvitationManager actorId="reviewer" pendingInvitations={[]}/>
    </>})}</>;
  }
`;
const plugin: Plugin = { name: 'admin-autofill-fixtures', setup(bundler) {
  stubFixtureLink(bundler);
  stubFixtureImage(bundler);
  bundler.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'navigation', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^next\/headers$/ }, () => ({ path: 'headers', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: 'workers', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^\.\/workspace\.css$/ }, () => ({ path: 'styles', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^@\/app\/auth$/ }, () => ({ path: 'auth', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^@\/lib\/auth\/staff$/ }, () => ({ path: 'staff', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^@\/components\/admin\/admin-review-data$/ }, () => ({ path: 'counts', namespace: 'admin-autofill' }));
  bundler.onResolve({ filter: /^@\/components\/forms\/form-config-client$/ }, () => ({ path: 'config', namespace: 'admin-autofill' }));
  const modules: Record<string, string> = {
    navigation: "export function usePathname(){return '/admin/team'}; export function useRouter(){return {refresh(){}}}; export function useSearchParams(){return new URLSearchParams()}",
    headers: "export async function headers(){return new Headers({host:'localhost'})}",
    workers: 'export const env = {}',
    styles: '',
    counts: 'export async function readAdminSidebarCounts(){return {}}',
    auth: "export function signOutPath(){return '/api/auth/logout'}",
    staff: "export async function requireStaffPage(){return {id:'reviewer',role:'super_admin',displayName:'Test reviewer',permissions:[]}}",
    config: "export function usePublishedFormConfig(formId){return {config:{formId,version:1,publishedAt:1,fields:[]},status:'ready',canSubmit:true,message:'',refresh(){},handleSubmissionResponse(){}}}",
  };
  bundler.onLoad({ filter: /.*/, namespace: 'admin-autofill' }, args => ({ contents: modules[args.path], loader: 'js' }));
} };

// Reproduce the exact extra attributes and sibling element seen in normal Chrome.
// The observer also decorates controls added later, as an autofill extension does.
const extension = `
  function decorate() {
    document.querySelectorAll('input,select,textarea').forEach((input,index)=>input.setAttribute('data-sharkid','__'+index));
    const email=document.getElementById('staff-email');
    if(email && !email.parentElement.querySelector('shark-icon-container')) {
      email.setAttribute('data-sharklabel','email');
      email.after(document.createElement('shark-icon-container'));
    }
  }
  decorate();
  new MutationObserver(decorate).observe(document.getElementById('root'),{subtree:true,childList:true});
`;

void test('staff workspace tolerates autofill DOM changes without hiding real hydration errors', async t => {
  const server = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'admin-autofill-server.tsx', loader: 'tsx',
    contents: fixtures + `import {renderToString} from 'react-dom/server';
      export async function markup(mismatch){return renderToString(await element('Server text',mismatch),{identifierPrefix:'admin-test-'})}` },
    bundle: true, write: false, platform: 'node', format: 'cjs', external: ['react', 'react-dom/server'], plugins: [plugin] });
  const serverModule = { exports: {} as { markup(mismatch: boolean): Promise<string> } };
  runInNewContext(server.outputFiles[0].text, { module: serverModule, exports: serverModule.exports,
    require: createRequire(import.meta.url), process, console, Headers, TextEncoder, TextDecoder });
  const client = await build({ stdin: { resolveDir: process.cwd(), sourcefile: 'admin-autofill-client.tsx', loader: 'tsx',
    contents: fixtures + `import {hydrateRoot} from 'react-dom/client';
      window.hydrationErrors=[];window.consoleErrors=[];
      const originalError=console.error; console.error=(...args)=>{window.consoleErrors.push(args.map(String).join(' '));originalError(...args)};
      (async()=>{hydrateRoot(document.getElementById('root'),await element('Client text',location.search.includes('mismatch')),
        {identifierPrefix:'admin-test-',onRecoverableError(error){window.hydrationErrors.push(error.message)}})})();` },
    bundle: true, write: false, platform: 'browser', format: 'iife', plugins: [plugin], define: { 'process.env.NODE_ENV': '"development"' } });
  const playwrightPath = process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const { chromium } = await import(playwrightPath) as { chromium: { launch(options: { headless: boolean; executablePath: string }): Promise<FixtureBrowser> } };
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    for (const mode of ['normal', 'autofill', 'mismatch']) await t.test(mode, async () => {
      const page = await browser.newPage();
      try {
        const markup = await serverModule.exports.markup(mode === 'mismatch');
        await page.route('https://admin-autofill.test/**', route => {
          const url = new URL(route.request().url());
          if (url.pathname === '/api/admin/search') {
            const results = url.searchParams.get('q') === 'form'
              ? [{ group: 'Pages', title: 'Forms', href: '/admin/forms' }]
              : [];
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
          }
          return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
            body: `<!doctype html><div id="root">${markup}</div>${mode === 'autofill' ? `<script>${extension}</script>` : ''}` });
        });
        await page.goto(`https://admin-autofill.test/admin/team${mode === 'mismatch' ? '?mismatch' : ''}`);
        await page.addScriptTag({ content: client.outputFiles[0].text });
        await page.getByLabel('Staff email').waitFor();
        const errors = await page.evaluate(() => ({
          recoverable: (window as unknown as { hydrationErrors: string[] }).hydrationErrors,
          console: (window as unknown as { consoleErrors: string[] }).consoleErrors,
        }));
        if (mode === 'mismatch') {
          assert.ok(errors.recoverable.length > 0, 'Real differences outside the interactive workspace must still be reported');
          return;
        }
        assert.deepEqual(errors.recoverable, [], 'Chrome autofill must not force the staff workspace to regenerate');
        assert.deepEqual(errors.console, [], 'The workspace must not produce hydration warnings');
        if (mode === 'autofill') assert.equal(await page.locator('shark-icon-container').count(), 1, 'Autofill decoration is retained');
        await page.getByRole('button', { name: 'Jump to an order, seller, phone or setting…' }).click();
        const search = page.getByRole('dialog', { name: 'Search everything', exact: true });
        await search.getByRole('combobox', { name: 'Search everything', exact: true }).fill('form');
        await search.getByRole('option', { name: 'Forms', exact: true }).waitFor();
        assert.ok(await search.getByRole('option', { name: 'Forms', exact: true }).isVisible());
        await search.getByRole('button', { name: 'Close search', exact: true }).click();
        await page.getByLabel('Staff email').fill('colleague@local.hastabazaar.test');
        await page.getByRole('button', { name: 'Review invitation', exact: true }).click();
        await page.getByRole('alertdialog').getByText('Create this staff invitation?', { exact: true }).waitFor();
        assert.equal(await page.getByLabel('Staff email').inputValue(), 'colleague@local.hastabazaar.test');
        assert.deepEqual(await page.evaluate(() => (window as unknown as { hydrationErrors: string[] }).hydrationErrors), []);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
});
