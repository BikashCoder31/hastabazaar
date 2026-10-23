import assert from 'node:assert/strict';
import test from 'node:test';
import {assertRequiredNativeResults} from '../scripts/recovery/native-test-results.mjs';
import {readFile} from 'node:fs/promises';

const successful='TAP version 13\nok 1 - native journey\n# tests 1\n# pass 1\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';
void test('required native TAP accepts zero summary counts and rejects skips, deferred or absent tests',()=>{
 assertRequiredNativeResults(successful);
 assert.deepEqual(assertRequiredNativeResults(successful),{tests:1,skipped:0,todo:0});
 assertRequiredNativeResults(successful.replaceAll('\n','\r\n'));
 for(const output of [successful.replace('# tests 1','# tests 0'),successful.replace('# skipped 0','# skipped 1'),successful.replace('# todo 0','# todo 1'),successful.replace('ok 1 - native journey','ok 1 - native journey # SKIP'),successful.replace('ok 1 - native journey','    not ok 1 - nested native journey # TODO'),successful.replace('# todo 0\n','')])assert.throws(()=>assertRequiredNativeResults(output));
});

void test('native result contract rejects failed, inconsistent, duplicate and unreviewed exact scenario counts',()=>{
 for(const output of [successful.replace('# skipped 0','# pass 0\n# fail 1\n# skipped 0'),successful+'# tests 2\n',successful.replace('ok 1 - native journey','not ok 1 - native journey')])assert.throws(()=>assertRequiredNativeResults(output));
 assert.throws(()=>assertRequiredNativeResults(successful,22));
 assert.deepEqual(assertRequiredNativeResults(successful,1),{tests:1,skipped:0,todo:0});
});

void test('owned runner registers separate exact-count customer and retained legacy suites and removes 0074 from its old schema',async()=>{
 const source=await readFile(new URL('../scripts/verify-staging-native.mjs',import.meta.url),'utf8');
 assert.match(source,/'tests\/customer-fee-native\.test\.ts'/);
 assert.match(source,/'tests\/fee-waiver-native\.test\.ts'\s*:\s*5/);
 assert.match(source,/'tests\/customer-fee-native\.test\.ts'\s*:\s*29/);
 assert.match(source,/const companions=\[[^\]]*'mariadb-customer-service-fee-waivers\.sql'/);
 assert.match(source,/assert\.equal\([^\n]*customer_fee_waiver[^\n]*0[^\n]*0074/);
 assert.match(source,/staging-upgrade-'\+run/,'Runner evidence filenames must be unique per invocation');
 assert.ok(source.includes("await load('fixture-retained-0073-history'"),'Upgrade must preserve populated 0073 history while 0074 is absent');
 assert.ok(source.indexOf("await load('fixture-retained-0073-history'")<source.indexOf('const before={}'),'Retained legacy history must enter the exact pre-upgrade snapshot');
});
