import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
async function render(contents: string, modules: Record<string, string> = {}) {
  const code = (
    await build({
      stdin: { loader: 'tsx', resolveDir: process.cwd(), contents },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      external: ['react', 'react-dom/server'],
      plugins: [
        {
          name: 'financial-destination-framework',
          setup(b) {
            b.onResolve({ filter: /.*/ }, (args) =>
              modules[args.path]
                ? { path: args.path, namespace: 'fixture' }
                : null,
            );
            b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
              contents: modules[args.path],
              loader: 'jsx',
            }));
          },
        },
      ],
    })
  ).outputFiles[0].text;
  const loadedFixtureModule = { exports: {} as { render(): Promise<string> } };
  compileFunction(code, ['require', 'module', 'exports'])(
    createRequire(import.meta.url),
    loadedFixtureModule,
    loadedFixtureModule.exports,
  );
  return loadedFixtureModule.exports.render();
}
const link = `import React from'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`;
void test('exact financial record renders its safe original reference and guarded next step without execution controls', async () => {
  const html = await render(
    `import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{FinancialNoticeRecord}from'./components/commerce/financial-notice-record';export async function render(){return renderToStaticMarkup(<FinancialNoticeRecord record={{recordId:'fee-original',title:'Lawful fee refund authorization',reference:'fee-original',status:'authorized',recordedAt:1,amountPaisa:1200,explanation:'Authorized separately from an actual completed payment.',actionHref:'/account/refunds',actionLabel:'Open your Finance refund history'}}/>);}`,
    { 'next/link': link },
  );
  assert.match(html, /fee-original/);
  assert.match(html, /authorized/);
  assert.match(html, /separately from an actual completed payment/);
  assert.match(html, /href="\/account\/refunds"/);
  assert.doesNotMatch(
    html,
    /<form|<button|Mark paid|accountNumber|evidenceReference/,
  );
});
void test('customer refund destination has the actual per-record anchor referenced by its notice', async () => {
  const modules = {
    'cloudflare:workers': `export const env={};`,
    'next/link': link,
    'next/image': `export default function Image(){return null}`,
    'next/navigation': `export function useRouter(){return{refresh(){}}}`,
    '@/lib/auth/customer': `export async function requireCustomerPage(){return{userId:'customer'}}`,
    '@/lib/db/d1': `export function requireDatabase(){return{}}`,
    '@/lib/returns/customer-aftercare-context': `export async function listCustomerRequestIndex(){return []};export async function readOwnedCustomerRequest(){return null}`,
    '@/lib/payments/refund-workspace': `export async function getCustomerRefundWorkspace(){return[{id:'original-refund',orderNumber:'ORDER-ONE',state:'completed',cashPaisa:100,walletPaisa:0,alreadyRestoredWalletPaisa:0,bankSatisfiedPaisa:0,originalCashPaisa:100,initiationDueAt:null,bindingDueAt:null,nextUpdateAt:null,events:[]}]}`,
    '@/components/commerce/refund-destination-form': `export function RefundDestinationForm(){throw Error('Completed refund must not request another destination')}`,
  };
  const html = await render(
    `import React from'react';import{renderToStaticMarkup}from'react-dom/server';import Page from'./app/account/refunds/page';export async function render(){return renderToStaticMarkup(await Page())}`,
    modules,
  );
  assert.match(html, /id="refund-original-refund"/);
  assert.doesNotMatch(html, /<form/);
});
void test('the original live invoice contains the exact immutable credit anchor used by customer notices', async () => {
  const html = await render(
    `import React from'react';import{renderToStaticMarkup}from'react-dom/server';import{LiveManagedInvoiceDocumentView}from'./components/commerce/live-managed-invoice-document';export async function render(){return renderToStaticMarkup(<LiveManagedInvoiceDocumentView document={{snapshot:{orderNumber:'ORDER-ONE'},invoiceNumber:'INV-ONE',status:'issued',group:{},adjustments:[{id:'credit-original',adjustmentNumber:'CREDIT-ONE',kind:'credit_note',issuedAt:1,amountPaisa:1200}]}}/>);}`,
    {
      './approved-billing-document': `export function ApprovedBillingDocument(){return null}`,
      './print-document-button': `export function PrintDocumentButton(){return null}`,
    },
  );
  assert.match(html, /id="adjustment-credit-original"/);
  assert.match(html, /CREDIT-ONE/);
  assert.match(html, /original invoice remains unchanged/i);
});
