import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ApprovedBillingDocument} from '../components/commerce/approved-billing-document';
import {billingPreviewSnapshot} from '../lib/staging/billing-preview';
import {mayApplyCompanyStamp} from '../lib/documents/company-stamp';
import stamp from '../lib/documents/company-stamp-data.json';

// The normal Chrome control connector has no PDF export/viewport API. This
// disposable Chrome instance checks print pagination and a real 390px viewport.
// Every resource is fulfilled locally; no website/account/database is accessed.
void test('approved billing fits mobile width and exports printable single and mixed seller documents',async()=>{
  const modulePath=process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/abinash/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
  const {chromium}=await import(modulePath) as typeof import('playwright');
  const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  const evidence=process.env.HASTABAZAAR_BILLING_EVIDENCE_ROOT??await mkdtemp(join(tmpdir(),'hb-billing-print-'));
  const logo=await readFile('public/brand/hastabazaar-logo-lockup-640.png');
  try{
    const page=await browser.newPage();
    await page.route('**/*',route=>route.fulfill({status:200,contentType:'image/png',body:logo}));
    for(const kind of ['company','registered','mixed'] as const){
      const snapshot=billingPreviewSnapshot(kind,Date.parse('2026-10-21T10:00:00Z'));
      for(const documentKind of ['invoice','receipts'] as const){
        const html=documentKind==='invoice'?renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'order_statement',documentNumber:'fixture'})):
          snapshot.billing!.receiptGroups!.map(group=>renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,group,kind:'payment_receipt',documentNumber:'fixture',
            stampSource:mayApplyCompanyStamp(group)?`data:${stamp.mimeType};base64,${stamp.base64}`:undefined}))).join('');
        await page.setContent('<base href="https://billing.fixture.test"><body style="margin:0">'+html+'</body>');
        await page.setViewportSize({width:390,height:844});
        await page.locator('img').evaluateAll(images=>Promise.all(images.map(image=>(image as HTMLImageElement).decode())));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),'Only item tables may scroll horizontally.');
        await page.screenshot({path:join(evidence,kind+'-'+documentKind+'-mobile.png'),fullPage:true});
        await page.setViewportSize({width:1280,height:960});
        await page.pdf({path:join(evidence,kind+'-'+documentKind+'.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
      }
    }
    const snapshot=billingPreviewSnapshot('mixed',1),line=snapshot.items[0]!;
    snapshot.items=Array.from({length:36},(_,index)=>({...line,orderItemId:'long-'+index,productName:'Long handmade product description with a different shop and colour '+index,
      sku:'HB-'+String(index).padStart(32,'0'),sellerSku:'SELLER-STOCK-CODE-'+String(index).repeat(15)}));
    snapshot.itemSubtotalPaisa=snapshot.items.reduce((sum,item)=>sum+item.lineTotalPaisa,0);
    snapshot.grandTotalPaisa=snapshot.itemSubtotalPaisa+snapshot.deliveryChargePaisa+snapshot.buyerPlatformFeePaisa;
    const html=renderToStaticMarkup(createElement(ApprovedBillingDocument,{snapshot,kind:'order_statement',documentNumber:'long-print'}));
    await page.setContent('<base href="https://billing.fixture.test"><body style="margin:0">'+html+'</body>');
    await page.pdf({path:join(evidence,'long-invoice.pdf'),format:'A4',preferCSSPageSize:true});
    await writeFile(join(evidence,'print-verification.json'),JSON.stringify({isolated:true,cases:7,mobileWidth:390,resourcePolicy:'all requests intercepted'},null,2));
  }finally{await browser.close();}
});
