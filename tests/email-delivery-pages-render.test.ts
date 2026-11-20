import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const modules: Record<string, string> = {
  'cloudflare:workers': `export const env={HASTABAZAAR_RUNTIME_ENV:'test',EMAIL_AUTOMATION_EXPECTED_SINCE:'1000'};`,
  '@/lib/auth/staff': `export async function requireStaffPage(path,permission){if(permission!=='email.delivery.manage')throw Error('Incorrect global email gate');return{id:'sa'}}`,
  '@/lib/db/d1': `export function requireDatabase(){return{}}`,
  '@/lib/operations/email-delivery-overview': `export function readEmailHealthRuntimeConfig(){return{environment:'test',expectedSince:null}};export async function readEmailDeliveryOverview(){return {environment:'test',observedAt:2000000000000,expectedSince:null,independentContactConfigured:false,services:[{serviceKey:'email.sender',state:'unknown',reason:'no_observation',lastObservedAt:null,lastSuccessfulAt:null,eligibleBacklog:null,incident:null},{serviceKey:'email.evaluator',state:'unknown',reason:'no_observation',lastObservedAt:null,lastSuccessfulAt:null,eligibleBacklog:null,incident:null}]}}`,
  '@/lib/operations/business-notifications': `export async function businessEmailQueue(){return[{id:'notice-one',subject:'A saved operational event',audience:'staff',displayStatus:'Outcome uncertain',deliveryState:'uncertain',attempts:12,nextAt:0,leaseUntil:0,createdAt:1,maskedRecipient:'s***@local.hastabazaar.test',sourceReference:'/admin/business-emails'}]};export async function businessEmailQueueSummary(){return{pending:1,due:0,oldestAgeMinutes:10,failures:1,intervention:0,uncertain:1,activeLeases:0}}`,
  '@/lib/operations/email-queue': `export async function listOrderEmailHistory(){return{jobs:[{id:'order-email-one',orderId:'order-one',orderNumber:'ORDER-ONE',orderStatus:'packing',currentStatus:'packing',status:'retry',displayStatus:'uncertain',attempts:12,createdAt:1,sentAt:null,failureCode:'outcome_uncertain',skipReason:null,nextAttemptAt:0,leaseUntil:0}],total:1,page:1,pageCount:1,filters:{}}};export async function emailQueueSummary(){return{pending:1,due:0,retryWaiting:0,exhausted:0,uncertain:1,oldestAgeMinutes:10,skipped:0,expired:0,expiredLeases:0}}`,
  '@/lib/forms/query-presentation': `export async function loadQueryPresentationConfig(){return{config:null,unavailable:false}};export function queryFieldPresentation(a,b,c,fallback){return fallback}`,
  'next/link': `import React from'react';export default function Link({href,children,...props}){return React.createElement('a',{href,...props},children)}`,
  'next/navigation': `export function useRouter(){return{refresh(){}}}`,
};
for (const page of ['business', 'order'])
  void test(`actual ${page} delivery page shows reserved health and exceptional recovery without fake limits`, async () => {
    const code = (
      await build({
        stdin: {
          loader: 'tsx',
          resolveDir: process.cwd(),
          contents: `import React from'react';import{renderToStaticMarkup}from'react-dom/server';import Page from'./app/admin/${page}-emails/page';export async function render(){return renderToStaticMarkup(await Page({searchParams:Promise.resolve({})}))}`,
        },
        bundle: true,
        write: false,
        platform: 'node',
        format: 'cjs',
        external: ['react', 'react-dom/server'],
        plugins: [
          {
            name: 'isolated-page-dependencies',
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
    const html = await loadedFixtureModule.exports.render();
    assert.match(html, /Automatic sender/);
    assert.match(html, /Due-reminder evaluator/);
    assert.match(html, /Recovery tools/);
    assert.match(html, /Outcome uncertain/);
    assert.match(html, /12/);
    assert.doesNotMatch(
      html,
      /at most five|stop after five|Attempt limit reached|9007199254740991/,
    );
  });
