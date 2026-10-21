import assert from 'node:assert/strict';
import test from 'node:test';
import {assertRequiredNativeResults} from '../scripts/recovery/native-test-results.mjs';

const successful='TAP version 13\nok 1 - native journey\n# tests 1\n# skipped 0\n# todo 0\n';
void test('required native TAP accepts zero summary counts and rejects skips, deferred or absent tests',()=>{
 assertRequiredNativeResults(successful);
 assertRequiredNativeResults(successful.replaceAll('\n','\r\n'));
 for(const output of [successful.replace('# tests 1','# tests 0'),successful.replace('# skipped 0','# skipped 1'),successful.replace('# todo 0','# todo 1'),successful.replace('ok 1 - native journey','ok 1 - native journey # SKIP'),successful.replace('ok 1 - native journey','    not ok 1 - nested native journey # TODO'),successful.replace('# todo 0\n','')])assert.throws(()=>assertRequiredNativeResults(output));
});
