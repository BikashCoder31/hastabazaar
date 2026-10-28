import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

void test('Accounting dates stay synchronized through submissions, period and section changes', async () => {
  // oxlint-disable-next-line typescript/no-explicit-any -- Match the existing isolated browser fixture tests.
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs') as any;
  const bundle = await build({
    stdin: {
      resolveDir: process.cwd(), sourcefile: 'accounting-filter-fixture.tsx', loader: 'tsx',
      contents: `
        import React from 'react';
        import {createRoot} from 'react-dom/client';
        import {AccountingWorkspaceView} from './components/admin/accounting-workspace';
        import {parseAccountingQuery} from './lib/accounting/filters';
        const root=createRoot(document.getElementById('root'));
        const now=Date.parse('2026-10-18T05:00:00Z');
        function render(){
          const query=parseAccountingQuery(new URLSearchParams(location.search),now);
          root.render(<AccountingWorkspaceView workspace={{query,observedAt:now,environment:'Isolated fixture',metrics:[],rows:[],issues:[],coverage:[],nextCursor:null}}/>);
        }
        document.addEventListener('click',event=>{
          const link=event.target.closest?.('a');
          if(link&&new URL(link.href).pathname==='/admin/accounting'){
            event.preventDefault();history.pushState(null,'',link.href);render();
          }
        });
        render();
      `,
    },
    bundle: true, write: false, platform: 'browser', format: 'iife',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{name:'fixture-link',setup(builder){
      builder.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'fixture'}));
      builder.onLoad({filter:/.*/,namespace:'fixture'},()=>({
        contents:'import React from "react";export default function Link({children,prefetch,...props}){return <a {...props}>{children}</a>}',
        loader:'jsx',resolveDir:process.cwd(),
      }));
    }}],
  });
  const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const page = await browser.newPage();
  const requests: {method:string; url:string}[] = [];
  try {
    // oxlint-disable-next-line typescript/no-explicit-any -- Runtime-supplied Playwright route.
    await page.route('**/*', async (route:any) => {
      const request=route.request(), url=new URL(request.url());
      assert.equal(url.origin,'https://accounting.fixture','No request may escape the isolated fixture');
      if(url.pathname==='/fixture.js')return route.fulfill({contentType:'text/javascript',body:bundle.outputFiles[0].text});
      assert.equal(url.pathname,'/admin/accounting');
      assert.equal(request.method(),'GET');
      requests.push({method:request.method(),url:request.url()});
      return route.fulfill({contentType:'text/html',body:'<div id="root"></div><script src="/fixture.js"></script>'});
    });
    await page.goto('https://accounting.fixture/admin/accounting?section=makers&period=custom&from=2026-10-01&to=2026-10-18&pageSize=1');
    const from=page.getByLabel('From date',{exact:true}), to=page.getByLabel('To date (inclusive)',{exact:true});
    await from.fill('2026-10-16');await to.fill('2026-10-16');
    await Promise.all([page.waitForURL(/from=2026-10-16&to=2026-10-16/),page.getByRole('button',{name:/Custom dates|Apply custom dates/i}).click()]);
    await from.waitFor();
    let applied=new URL(page.url());
    assert.equal(applied.searchParams.get('section'),'makers');
    assert.equal(applied.searchParams.get('pageSize'),'1');
    assert.equal(applied.searchParams.has('cursor'),false);
    assert.equal(await from.inputValue(),'2026-10-16');
    assert.equal(await to.inputValue(),'2026-10-16');
    // Keep the same mounted React root and dirty native inputs before navigation.
    await from.fill('2026-10-02');await to.fill('2026-10-03');
    await page.getByRole('link',{name:'Today',exact:true}).click();
    await page.getByText(/^2026-10-18 to 2026-10-18\./).waitFor();
    assert.equal(await from.inputValue(),'2026-10-18','From date must match the applied Today report');
    assert.equal(await to.inputValue(),'2026-10-18','To date must match the applied Today report');
    for(const [label,start] of [['Last 7 days','2026-10-12'],['Last 30 days','2026-09-19']] as const){
      await from.fill('2026-10-02');await to.fill('2026-10-03');
      await page.getByRole('link',{name:label,exact:true}).click();
      await page.getByText(new RegExp('^'+start+' to 2026-10-18\\.')).waitFor();
      assert.equal(await from.inputValue(),start);
      assert.equal(await to.inputValue(),'2026-10-18');
    }
    await from.fill('2026-10-02');await to.fill('2026-10-03');
    await page.getByRole('link',{name:'All time',exact:true}).click();
    await page.getByText(/All recorded time through the first page/).waitFor();
    assert.equal(await from.inputValue(),'1970-01-01');
    assert.equal(await to.inputValue(),'2026-10-18');
    await from.fill('2026-10-17');await to.fill('2026-10-18');
    await Promise.all([page.waitForURL(/from=2026-10-17&to=2026-10-18/),to.press('Enter')]);
    await from.waitFor();
    assert.equal(await from.inputValue(),'2026-10-17');
    await from.fill('2026-10-02');
    await page.getByRole('link',{name:'Cash & refunds',exact:true}).click();
    await page.getByRole('heading',{name:'Cash & refunds',exact:true}).waitFor();
    assert.equal(await from.inputValue(),'2026-10-17','Section navigation discards unapplied dates');
    assert.equal(await to.inputValue(),'2026-10-18');
    applied=new URL(page.url());
    assert.equal(applied.searchParams.get('period'),'custom');
    assert.equal(applied.searchParams.get('section'),'cash');
    assert.equal(applied.searchParams.get('pageSize'),'1');
    assert.equal(requests.length,3,'Only the initial load and two explicit custom GET submissions navigate documents');
  } finally {await browser.close();}
});
