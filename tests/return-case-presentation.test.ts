import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { stubFixtureLink } from './helpers/browser-fixture-link';

async function load(file: string, append = '', stubs: Record<string, string> = {}) {
  const compiled = await build({
    stdin: { contents: await readFile(file, 'utf8') + append, resolveDir: dirname(resolve(file)), sourcefile: resolve(file), loader: 'tsx' },
    jsx: 'automatic', bundle: true, write: false, platform: 'node', format: 'cjs',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{ name: 'return-fixture', setup(b) {
      stubFixtureLink(b);
      b.onResolve({ filter: /.*/ }, ({ path }) => path in stubs ? { path, namespace: 'return-stub' } : undefined);
      b.onLoad({ filter: /.*/, namespace: 'return-stub' }, ({ path }) => ({ contents: stubs[path], loader: 'js' }));
    } }],
  });
  const result = { exports: {} as Record<string, unknown> };
  runInNewContext(compiled.outputFiles[0].text, { require: createRequire(import.meta.url), module: result, exports: result.exports, process, crypto, URL, URLSearchParams });
  return result.exports;
}

void test('return detail identifies the original order delivery snapshot without changing its amount', async () => {
  const item = { id: 'return-fixture', referenceNumber: 'RETURN-TEST', productName: 'Test product', orderNumber: 'ORDER-TEST', sellerName: 'Test seller', status: 'requested', reason: 'damaged', requestedResolution: 'refund', quantity: 1, itemQuantity: 2, eligibilityDecision: 'manual_review', originalSealIntact: false, lineTotalPaisa: 250000, deliveryChargePaisa: 12345, eligibilityReasonEn: 'Review required', detail: 'Damaged item', customerEmail: 'test@example.invalid', customerPhone: '0000000000', sellerResponse: null, evidence: [], events: [], resolutionOutcome: null, refundStatus: null, refundId: null };
  const loaded = await load('app/admin/cases/returns/[id]/page.tsx', '', {
    'cloudflare:workers': 'exports.env={};',
    'next/navigation': 'exports.notFound=()=>{throw new Error("Unexpected notFound")};',
    '@/lib/auth/staff': 'exports.requireStaffPage=async()=>({id:"staff-test",role:"admin",permissions:["refund.approve.standard"]});',
    '@/lib/db/d1': 'exports.requireDatabase=()=>({});',
    '@/lib/db/repositories/returns': `exports.getOperationsReturnDetail=async()=>(${JSON.stringify(item)});`,
    '@/lib/returns/courier-expenses': 'exports.recordedReturnCourierExpenses=async()=>({needsPricingReconciliation:true,expenses:[{id:"invoice",direction:"outbound",amountPaisa:12000,evidenceReference:"outbound-invoice",claimReference:null}]});',
    '@/lib/db/repositories/form-answers': 'exports.listFormAnswersForSubjectPage=async()=>({answers:[],next:null});',
    '@/lib/forms/access': 'exports.authorizeFormAnswerRead=async()=>true;',
    '@/components/admin/return-case-actions': 'exports.ReturnCaseActions=()=>null;',
  });
  const Page = loaded.default as (props: { params: Promise<{ id: string }> }) => Promise<ReactNode>;
  const html = renderToStaticMarkup(await Page({ params: Promise.resolve({ id: item.id }) }));
  const details = html.match(/<dt\b[^>]*>[\s\S]*?<\/dt>\s*<dd\b[^>]*>[\s\S]*?<\/dd>/g) ?? [];
  const delivery = details.find(value => value.includes('Original delivery charge (order snapshot)'));
  assert.ok(delivery, 'Original delivery snapshot label must identify the displayed charge');
  assert.match(delivery, /<dd\b[^>]*>NPR(?:\s|\u00a0)123\.45<\/dd>/);
  assert.doesNotMatch(html, /Delivery paid/);
  assert.match(html, /The saved buyer price needs reconciliation/);
  assert.match(html, /outbound-invoice/);
});

void test('return action fields associate distinct labels with input, select and textarea while preserving control props', async () => {
  const loaded = await load('components/admin/return-case-actions.tsx', '\nexport { Field as Tested };', {
    'next/navigation': 'exports.useRouter=()=>({refresh(){}});',
  });
  const Field = loaded.Tested as ComponentType<{ label: string; children?: ReactNode }>;
  const html = renderToStaticMarkup(createElement('form', {}, ...['input', 'select', 'textarea'].map((tag, index) =>
    createElement(Field, { key: tag, label: `Evidence ${tag}` }, createElement(tag, { required: true, name: `evidence-${index}`, disabled: true, ...(tag === 'input' ? { type: 'number', min: 0, max: 5, defaultValue: 2 } : {}) }))
  )));
  const labels = html.match(/<label\b[^>]*>[\s\S]*?<\/label>/g) ?? [];
  assert.equal(labels.length, 3);
  const ids: string[] = [];
  for (const [index, tag] of ['input', 'select', 'textarea'].entries()) {
    const label = labels[index];
    const control = html.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0];
    assert.ok(control);
    const associatedId = label.match(/\bfor="([^"]+)"/)?.[1];
    const wrapped = new RegExp(`<${tag}\\b`).test(label);
    assert.ok(wrapped || (associatedId && control.includes(`id="${associatedId}"`)), `${tag} must have an associated visible label`);
    if (associatedId) ids.push(associatedId);
    assert.match(control, /required=""/);
    assert.match(control, /disabled=""/);
    assert.match(control, new RegExp(`name="evidence-${index}"`));
  }
  assert.equal(new Set(ids).size, ids.length, 'Labels must not collide');
  assert.match(html, /type="number"/);
  assert.match(html, /min="0"/);
  assert.match(html, /max="5"/);
  assert.match(html, /value="2"/);
});
