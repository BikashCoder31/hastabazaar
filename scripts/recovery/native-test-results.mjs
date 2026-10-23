import assert from 'node:assert/strict';

/** Required native journeys must execute, including nested TAP subtests. */
export function assertRequiredNativeResults(output,expectedTests){
 const summary=name=>{
  const matches=[...output.matchAll(new RegExp('^# '+name+' (\\d+)\\r?$','gm'))];
  assert.equal(matches.length,1,'Required native summary must occur exactly once: '+name);
  return Number(matches[0][1]);
 };
 const tests=summary('tests');assert.ok(tests>0,'Required native tests must execute');
 assert.equal(summary('pass'),tests,'Every required native scenario must pass');
 for(const name of ['fail','cancelled','skipped','todo'])assert.equal(summary(name),0,'Required native checks cannot fail, cancel, skip or defer');
 assert.doesNotMatch(output,/^\s*not ok\b/m,'Required native scenario failed');
 assert.doesNotMatch(output,/^\s*(?:not )?ok .*#\s*(?:SKIP|TODO)\b/im,'Required native checks cannot be skipped or deferred');
 if(expectedTests!==undefined)assert.equal(tests,expectedTests,'Required native scenario count changed; review the runner contract');
 return {tests,skipped:0,todo:0};
}
