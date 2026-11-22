import { compileFunction } from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
void test('delivery health UI distinguishes sender and evaluator evidence and never claims unknown recovery or independent contact', async () => {
  const code = (
    await build({
      stdin: {
        loader: 'tsx',
        resolveDir: process.cwd(),
        contents: `import React from 'react';import {renderToStaticMarkup} from 'react-dom/server';import {EmailDeliveryHealth} from './components/admin/email-delivery-health';export const html=renderToStaticMarkup(<EmailDeliveryHealth overview={{environment:'test',observedAt:2000000000000,expectedSince:null,independentContactConfigured:false,services:[{serviceKey:'email.sender',state:'unknown',reason:'no_observation',lastObservedAt:null,lastSuccessfulAt:null,eligibleBacklog:null,incident:null},{serviceKey:'email.evaluator',state:'degraded',reason:'recent_success',lastObservedAt:2000000000000,lastSuccessfulAt:2000000000000,eligibleBacklog:3,incident:{id:'case-one',episode:1,state:'monitoring',severity:'high',firstSeenAt:1999999900000,resolvedAt:null}}]}}/>);`,
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      external: ['react', 'react-dom/server'],
    })
  ).outputFiles[0].text;
  const loadedFixtureModule = { exports: {} as { html: string } };
  compileFunction(code, ['require', 'module', 'exports'])(
    createRequire(import.meta.url),
    loadedFixtureModule,
    loadedFixtureModule.exports,
  );
  const html = loadedFixtureModule.exports.html;
  assert.match(html, /Automatic sender/);
  assert.match(html, /Due-reminder evaluator/);
  assert.match(html, /Unknown/);
  assert.match(html, /Monitoring recovery/);
  assert.match(html, /not verified/);
  assert.match(html, /Reading or acknowledging/);
  assert.doesNotMatch(html, /All delivered|Inbox delivered|Backup|Retry all/);
});
