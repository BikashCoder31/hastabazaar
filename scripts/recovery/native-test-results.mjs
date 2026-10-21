import assert from 'node:assert/strict';

/** Required native journeys must execute, including nested TAP subtests. */
export function assertRequiredNativeResults(output){
 assert.match(output,/# tests [1-9]\d*(?:\r?\n|$)/,'Required native tests must execute');
 assert.match(output,/# skipped 0(?:\r?\n|$)/,'Required native checks cannot be skipped');
 assert.match(output,/# todo 0(?:\r?\n|$)/,'Required native checks cannot be deferred');
 assert.doesNotMatch(output,/^\s*(?:not )?ok .*#\s*(?:SKIP|TODO)\b/im,'Required native checks cannot be skipped or deferred');
 return {tests:Number(output.match(/# tests (\d+)(?:\r?\n|$)/)[1]),skipped:0,todo:0};
}
