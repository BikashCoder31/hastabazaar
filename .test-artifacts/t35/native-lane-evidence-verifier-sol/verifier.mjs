import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assertRequiredNativeResults} from '../../../scripts/recovery/native-test-results.mjs';

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = /^[a-f0-9]{64}$/;
const pin = value => assert.match(value ?? '', hex);
const nativeFiles = ['staging-native-runtime', 'accounting-native-runtime', 'commerce-financial-native', 'billing-release-native', 'fee-waiver-native', 'customer-fee-native', 'hosted-security-native'].map(name => 'tests/' + name + '.test.ts');
const historicalCounts = [4, 1, 8, 1, 5, 29, 1];
const historicalLabels = ['fresh bootstrap and maintained companion sequence', 'real native repository and financial guard tests', 'populated pre-weekly schema upgrades conserve every original value', 'current accounting, financial, billing, fee waiver and hosted MFA native journeys execute without skips'];
const packagedPlan = [
  {file:nativeFiles[1], expected:1}, {file:nativeFiles[2], expected:8},
  {file:nativeFiles[3], expected:1}, {file:nativeFiles[4], expected:5},
  ...['catchup','rollback','repair'].map(scenario => ({file:'tests/form-health-maria-native.test.ts', expected:1, scenario})),
  {file:nativeFiles[5], expected:29, recovery:true},
];
const packagedResults = [...packagedPlan.map(({file, expected, scenario}) => ({file, ...(scenario ? {scenario} : {}), tests:expected, skipped:0, todo:0})), {file:nativeFiles[6], tests:1, skipped:0, todo:0}];

function counts(result, file, count) {
  assert.deepEqual(result, {files:[file], tests:count, skipped:0, todo:0});
}

/** Pure verifier of ORIGINAL receipt bytes. The custodian supplies authenticated
 * byte reads, exact inventories and reviewed expectations. This does no IO and
 * cannot independently establish provenance, custody or native observations. */
export function verifyLaneEvidence({lane, plan, absences, exitBytes, expected, after, artifacts}) {
  assert.ok(['historical','packaged'].includes(lane));
  assert.equal(plan.deploymentAuthorized, false);
  for (const key of ['source','archive','manifest','inventory','snapshot','acceptance']) pin(plan.digests[key]);
  // Both inventories must come from complete independent after-state reads.
  assert.deepEqual(after.originalInputs, expected.originalInputs);
  assert.deepEqual(after.sealedInputs, expected.sealedInputs);
  assert.deepEqual(after.originalCandidate, expected.originalCandidate);
  for (const key of ['originalInputs','sealedInputs','originalCandidate']) assert.ok(expected[key]?.length > 0);
  assert.deepEqual(JSON.parse(Buffer.from(exitBytes).toString('utf8')), {code:0, signal:null, cancellation:null});
  assert.equal(sha256(exitBytes), expected.exitSha256);
  assert.equal(absences.length, lane === 'historical' ? 1 : 8);
  assert.deepEqual(absences, expected.absences);
  assert.equal(new Set(absences.map(record => record.id)).size, absences.length);
  assert.equal(new Set(absences.map(record => record.volumeName)).size, absences.length);
  for (const record of absences) {
    pin(record.id); pin(record.volumeName);
    assert.match(record.name, /^hastabazaar-native-[0-9]{13}$/);
  }
  const consumed = new Set();
  const bytes = name => {
    assert.ok(Object.hasOwn(artifacts, name), 'Missing original artifact');
    const record = artifacts[name];
    assert.ok(Buffer.isBuffer(record.bytes) || record.bytes instanceof Uint8Array);
    pin(record.sha256); assert.equal(sha256(record.bytes), record.sha256);
    consumed.add(name); return Buffer.from(record.bytes);
  };
  const json = name => JSON.parse(bytes(name).toString('utf8'));
  const tap = (name, count) => assertRequiredNativeResults(bytes(name).toString('utf8'), count);
  if (lane === 'historical') {
    const receipt = json('historicalResults');
    assert.deepEqual(Object.keys(receipt).sort(), ['observations','nativeRuns','container','databasesPreserved','stopped'].sort());
    assert.deepEqual(receipt.observations, historicalLabels.map(label => ({label,status:'PASS'})));
    assert.equal(receipt.container, absences[0].name);
    assert.equal(receipt.databasesPreserved, true); assert.equal(receipt.stopped, true);
    assert.equal(receipt.nativeRuns.length, nativeFiles.length);
    const stdout=bytes('historicalStdout').toString('utf8');
    const sections=stdout.split(/^TAP version 13\r?$/m).slice(1);
    assert.equal(sections.length,7);
    nativeFiles.forEach((file, index) => { counts(receipt.nativeRuns[index], file, historicalCounts[index]); assertRequiredNativeResults(sections[index],historicalCounts[index]); });
    for (const label of historicalLabels) assert.equal(stdout.split('PASS: '+label).length,2);
    assert.ok(stdout.includes('HISTORICAL GATE ONLY: selected artifact browser/recovery acceptance is required separately'));
    // Upgrade receipt is separately required, including all six source pins.
    const upgrade = json('upgradeInventory');
    assert.deepEqual(upgrade, expected.upgradeInventory);
    assert.equal(upgrade.sources.length, 6); pin(upgrade.sha256);
    assert.deepEqual(upgrade.sources.map(record=>record.name),['mariadb-commission-workspace.sql','mariadb-loyalty-points.sql','mariadb-company-store-maker-readiness.sql','mariadb-loyalty-scheduled-changes.sql','mariadb-marketplace-fee-waivers.sql','mariadb-customer-service-fee-waivers.sql']);
    assert.equal(sha256(bytes('upgradeSql')), upgrade.sha256);
    upgrade.sources.forEach(record => pin(record.sourceSha256));
    assert.deepEqual(after.candidate, expected.candidate);
  } else {
    const native = json('currentNative');
    const identity = receipt => {
      assert.equal(receipt.artifactKind, 'local-linux-candidate'); assert.equal(receipt.commit, null);
      assert.equal(receipt.sourceSha256, plan.digests.source);
      assert.equal(receipt.archiveSha256, plan.digests.archive);
      assert.equal(receipt.bootstrapSha256, expected.bootstrapSha256);
      assert.equal(receipt.requiredExactChecks, 309);
    };
    pin(expected.bootstrapSha256); identity(native);
    assert.equal(native.manifestSha256, plan.digests.manifest);
    assert.equal(native.passed, true); assert.equal(native.productionReady, false); assert.equal(native.deploymentAuthorized, false);
    assert.deepEqual(native.results, packagedResults);
    for (const [index, target] of packagedPlan.entries()) {
      const receipt = json('suite' + index);
      assert.deepEqual(receipt.target, target); assert.equal(receipt.id, absences[index].id);
      assert.equal(receipt.stopped, true); assert.equal(receipt.failure, null); assert.deepEqual(receipt.cleanupErrors, []);
      assert.equal(receipt.databasesPreserved, true); assert.equal(receipt.archiveSha256, plan.digests.archive);
      assert.equal(receipt.bootstrapSha256, expected.bootstrapSha256); assert.equal(receipt.manifestSha256, plan.digests.manifest);
      assert.equal(receipt.requiredExactChecks, 309);
      assert.deepEqual(receipt.results, packagedResults.slice(0, index === 7 ? 9 : index + 1));
      tap('nativeTap' + index, target.expected);
    }
    tap('hostedTap', 1);
    const browser = json('browser'); identity(browser);
    assert.equal(browser.releaseManifestSha256, plan.digests.manifest); assert.equal(browser.status, 'PASS');
    for (const [name,count] of [['catalog',1],['summary',3],['registration',1],['recordedWork',1]]) {
      assert.equal(browser[name].tests, count); assert.equal(browser[name].skipped, 0);
    }
    tap('catalogTap',1); tap('summaryTap',3);
    assert.equal(browser.catalog.name,'contact and catalog controls fit a 232px viewport without hiding real fields');
    assert.equal(browser.summary.name,'populated summary fits desktop and small screens');
    assert.equal(browser.catalog.transport,'owned HTTP loopback with unchanged Secure/HttpOnly hosted session');
    assert.equal(browser.registration.transport,'genuine packaged HTTP, password sign-in, Secure HttpOnly sessions');
    assert.equal(browser.registration.fixtureDocumentVerifiedOnly,true); assert.equal(browser.registration.applicationApproved,false);
    assert.equal(browser.registration.exactBytesRetained,true); assert.ok(browser.registration.retainedObjects > 0); pin(browser.registration.manifestSha256);
    const work=browser.recordedWork;
    assert.deepEqual(work.widths,[320,390,1440]); assert.deepEqual(work.completedSteps,{reviewer:2,superAdmin:1});
    assert.equal(work.source,'seller application review'); assert.equal(work.startedReviewsExcludedFromCounts,3);
    assert.equal(work.transport,'real packaged HTTP with genuine browser password sessions'); assert.equal(work.auditRowsUnchanged,true); assert.ok(work.businessTablesUnchanged > 0);
    assert.deepEqual(work.denied,['foreign actor','overlong date range','missing capability','hidden navigation','unauthorised source']);
    for (const key of ['childrenStopped','originalEnrolledSecurityExact','appendedOptionalAdminRetainedForRecovery']) assert.equal(browser[key],true);
    assert.ok(browser.recordedBrowserGroupsStopped >= 4); assert.ok(browser.originalProtectedTables > 0); assert.ok(browser.originalSettingsRecords > 0);
    assert.deepEqual(browser.sourceAppends,{seller_protected_revisions:4,seller_public_profile_states:4,review_tasks:4,moderation_events:6});
    const recovery=json('recovery');
    // recovery.archiveSha256 hashes the ENCRYPTED BACKUP, not the package.
    assert.equal(recovery.artifactSha256, plan.digests.archive);
    assert.equal(recovery.sourceSha256,plan.digests.source); assert.equal(recovery.commit,null);
    assert.equal(recovery.artifactKind,'local-linux-candidate');
    assert.equal(recovery.releaseManifestSha256,plan.digests.manifest); assert.equal(recovery.bootstrapSha256,expected.bootstrapSha256); assert.equal(recovery.requiredExactChecks,309);
    for (const key of ['passed','containerOwned','dispatchPaused','linuxRuntimeVerified','externalPolicyRecovered','transientAuthorityCleared','sourceUnchanged','genuineMediaRestored']) assert.equal(recovery[key],true);
    assert.equal(recovery.activationAllowed,false); assert.match(recovery.engine,/^10\.11\./);
    for (const key of ['archiveSha256','manifestSha256','keyArchiveSha256','schemaSha256','selectedViewSchemaSha256','feeClearanceMediaManifestSha256']) pin(recovery[key]);
    assert.equal(sha256(bytes('encryptedDatabase')),recovery.archiveSha256);
    assert.equal(sha256(bytes('encryptedKeys')),recovery.keyArchiveSha256);
    assert.deepEqual(recovery.keyIds,expected.keyIds); assert.equal(recovery.keyIds.length,1); assert.match(recovery.keyIds[0],/^[a-f0-9]{32}$/);
    for (const key of ['tables','rows','mediaObjects','enrolledAccountsVerified','genuineMediaObjects','genuineMediaBytes','genuineMediaSidecarBytes','requiredMediaReferences','packagedHomepageMediaObjects']) assert.ok(Number.isSafeInteger(recovery[key]) && recovery[key] > 0);
    assert.equal(recovery.genuineMediaManifestSha256,browser.registration.manifestSha256);
    assert.equal(recovery.genuineMediaObjects,browser.registration.retainedObjects);
    assert.equal(recovery.feeClearanceMediaObjects,1);
    for (const [kind,producer,digest] of [['registration','packaged-registration-browser-v1',recovery.genuineMediaManifestSha256],['fee','native-fee-clearance-fixture-v1',recovery.feeClearanceMediaManifestSha256]]) {
      const manifest=json(kind+'Media');
      assert.equal(artifacts[kind+'Media'].sha256,digest);
      assert.equal(manifest.version,1); assert.equal(manifest.producer,producer);
      assert.equal(manifest.archiveSha256,plan.digests.archive);
      assert.equal(manifest.database,'native_'+absences[7].name.slice('hastabazaar-native-'.length)+'_fresh');
      if(kind==='fee')assert.equal(manifest.containerId,absences[7].id);
      else assert.equal(manifest.ownerName,absences[7].name);
      assert.ok(manifest.files.length>0 && manifest.files.length%2===0);
      assert.equal(manifest.files.length,kind==='fee'?2:browser.registration.retainedObjects*2);
      assert.equal(new Set(manifest.files.map(file=>file.path)).size,manifest.files.length);
      for(const file of manifest.files){
        assert.match(file.path,/^private\/[A-Za-z0-9_/.\-]+$/);
        assert.ok(!file.path.split('/').some(part=>!part||part==='.'||part==='..'));
        pin(file.sha256); const body=bytes(kind+'Media:'+file.path);
        assert.equal(body.length,file.bytes); assert.equal(sha256(body),file.sha256);
      }
    }
    assert.deepEqual(recovery.feeEvidence,expected.feeEvidence);
    const minima={customer_fee_waiver_control:1,customer_fee_waiver_campaigns:1,customer_fee_waiver_revisions:2,customer_fee_waiver_requests:2,order_customer_service_fees:1,marketplace_fee_waiver_control:1,marketplace_fee_waiver_campaigns:1,marketplace_fee_waiver_revisions:2,marketplace_fee_waiver_requests:2,order_item_marketplace_fees:1};
    assert.equal(recovery.feeEvidence.length,Object.keys(minima).length);
    for (const [name,minimum] of Object.entries(minima)) { const rows=recovery.feeEvidence.filter(row=>row.name===name); assert.equal(rows.length,1); assert.equal(rows[0].classification,'durable'); assert.ok(rows[0].rows>=minimum); pin(rows[0].sha256); }
    assert.deepEqual(after.candidate,expected.candidate);
    const required=[...expected.candidateInputs,'browser-evidence','current-native-verification.json','native-recovery-verification.json'].sort();
    assert.deepEqual(after.candidate.map(record=>record.path).sort(),required);
    for (const name of expected.candidateInputs) {const record=after.candidate.find(record=>record.path===name);assert.equal(record.bytes,0);assert.equal(record.sha256,sha256(''));assert.equal(record.type,'file');}
    for (const [name,key] of [['current-native-verification.json','currentNative'],['native-recovery-verification.json','recovery']]) assert.equal(after.candidate.find(record=>record.path===name).sha256,artifacts[key].sha256);
    assert.deepEqual(after.browserEntries,expected.browserEntries);
    assert.deepEqual(after.browserEntries.map(record=>record.path).sort(),['catalog-232.png','catalog.tap','contact-232.png','summary-1280.png','summary-390.png','summary.tap','verification.json'].sort());
    for(const [path,key] of [['verification.json','browser'],['catalog.tap','catalogTap'],['summary.tap','summaryTap']]){
      const record=after.browserEntries.find(entry=>entry.path===path);
      assert.equal(record.type,'file');assert.equal(record.sha256,artifacts[key].sha256);assert.equal(record.bytes,artifacts[key].bytes.length);
    }
  }
  assert.deepEqual([...consumed].sort(),Object.keys(artifacts).sort(),'Unclassified evidence is refused');
  return true;
}
