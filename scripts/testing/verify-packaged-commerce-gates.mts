import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type { Pool } from 'mysql2/promise';
import type { ConfiguredField } from '../../lib/forms/types';
import { signedCommercePolicy } from '../../lib/security/isolated-commerce-policy';
import { assertLoopbackOrigin, safeChildEnvironment, withOwnedProcesses, createRecordedBrowserLauncher } from './verify-packaged-browser-gates.mjs';
import { verifyArtifactIdentity, verifySelectedPackage, assertSelectedConstraints, nativeReadinessAdapter } from './current-artifact-identity.mjs';
import { bindSelectedBrowserViews } from '../recovery/selected-native-views.mjs';
import { commerceRuntime, assertCommerceRuntime, prepareCommerceBrowser, prepareCommerceStaff, runCommerceBrowser, runSellerJourney, preparePackagedAdminJourney, runPackagedAdminJourney, prepareFinanceJourneyActors, openFinanceJourneySession, prepareFinancePrerequisites, prepareSharedTeamReviewer, runSharedTeamCurrentSession, runTeamDutyHandoff, runFailedParcelIncident, runIncidentRecoveryDrill } from './commerce-browser-fixture.mjs';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function contained(root: string, path: string) { const part=relative(root,path);return part!==''&&!part.startsWith('..'+sep)&&part!=='..'&&!isAbsolute(part); }
export async function main() {
  assert.equal(process.platform,'linux'); assert.equal(process.argv.length,2); assert.equal(resolve(process.cwd()),project);
  assert.equal(process.env.HASTABAZAAR_NATIVE_COMMERCE_EPOCH,'1','Controller must admit a dedicated commerce epoch');
  const { stagingNativeFixture } = await import('../../tests/helpers/staging-native-fixture');
  assert.ok(!process.env.DOCKER_HOST&&!process.env.DOCKER_CONTEXT&&!process.env.DOCKER_TLS_VERIFY&&!process.env.DOCKER_CERT_PATH);
  const fixture = await stagingNativeFixture();
  const nativeMarker=JSON.parse(await readFile(process.env.HATSKALA_NATIVE_MARKER!,'utf8'));
  const attestOwner=async()=>{assert.deepEqual(await stagingNativeFixture(),fixture);const container=JSON.parse(execFileSync('docker',['inspect','--type','container',nativeMarker.id],{encoding:'utf8',timeout:30000}))[0];assert.equal(container.Id,nativeMarker.id);assert.equal(container.Config.Labels['codex.native-owner'],process.env.HATSKALA_NATIVE_TOKEN);assert.equal(container.State.Running,true);};
  await attestOwner();
  const key=process.env.HASTABAZAAR_NATIVE_SECURITY_KEY!; assert.match(key,/^[A-Za-z0-9_-]{43}$/);
  const artifact=await realpath(process.env.HASTABAZAAR_NATIVE_ARTIFACT_DIRECTORY!);
  const admitted=await verifyArtifactIdentity({project,artifactDirectory:artifact}),inventory=admitted.inventory;
  assert.equal(inventory.artifactKind,'local-linux-candidate');
  const evidence=resolve(artifact,'commerce-browser-evidence');await mkdir(evidence,{mode:0o700});
  const root=await mkdtemp(resolve(tmpdir(),'hastabazaar-native-commerce-'));
  const own=(name:string)=>{const path=resolve(root,name);assert.ok(contained(root,path));return path;};
  const archive=resolve(artifact,inventory.archive);assert.match(inventory.archive,/^hastabazaar-release-[a-z0-9._-]+\.tar\.gz$/);
  assert.ok((await lstat(archive)).isFile()&&!(await lstat(archive)).isSymbolicLink());assert.equal(digest(await readFile(archive)),inventory.archiveSha256);
  const packageRoot=own('package');await mkdir(packageRoot,{mode:0o700});
  const temporary=own('temporary');await mkdir(temporary,{mode:0o700});
  const childEnv={...safeChildEnvironment(process.env),TEMP:temporary,TMP:temporary,TMPDIR:temporary};
  let phase='ownership',clean=false,launcher:Awaited<ReturnType<typeof createRecordedBrowserLauncher>>|undefined;
  const cancellation=new AbortController(); const cancel=()=>cancellation.abort();process.once('SIGINT',cancel);process.once('SIGTERM',cancel);
  const secrets=[key,fixture.password,process.env.HATSKALA_NATIVE_TOKEN!];
  const redact=(value:string)=>secrets.reduce((text,secret)=>secret?text.replaceAll(secret,'[redacted]'):text,value);
  const pools:Pool[]=[];let restore:(()=>void)|undefined;
  try {
    await withOwnedProcesses(async owner=>{
      phase = 'verified extraction';
      const listing = await owner.run('tar', ['-tzf', archive], { env: childEnv });
      assert.equal(listing.code, 0);
      for (const entry of listing.output.trim().split('\n')) {
        const name = entry.replace(/^\.\//, '').replace(/\/$/, '');
        if (!name || name === '.') continue;
        assert.ok(!isAbsolute(name) && !/[\\:]/.test(name) && !name.split('/').some((part) => part === '..' || part === '.' || !part), 'Unsafe archive path');
      }
      const types = await owner.run('tar', ['-tvzf', archive], { env: childEnv });
      assert.equal(types.code, 0);
      assert.ok(types.output.trim().split('\n').every((line) => /^[d-]/.test(line)), 'Archive links and special entries are forbidden');
      assert.equal((await owner.run('tar', ['-xzf', archive, '--no-same-owner', '-C', packageRoot], { env: childEnv })).code, 0);
      // tar may restore its root directory mode; retain private admission for this owned extraction.
      await chmod(packageRoot, 0o700);
      const manifest = JSON.parse(await readFile(resolve(packageRoot, 'deployment/babal/release-manifest.json'), 'utf8'));
      const { verifyRelease } = await import('../release-files.mjs');
      await verifyRelease(packageRoot, inventory.files, manifest.migrations.map((item: { path: string }) => item.path));
      const currentPackage = process.env.HASTABAZAAR_CURRENT_ARTIFACT_NATIVE === '1'
        ? await verifySelectedPackage(packageRoot, inventory) : null;
      assert.ok(inventory.artifactKind !== 'local-linux-candidate' || currentPackage, 'Local artifact requires selected-schema binding');
      await assert.rejects(lstat(resolve(packageRoot, '.staging')), { code: 'ENOENT' });


      assert.ok(currentPackage,'Selected package manifest is required');
      const {default:mysql}=await import('mysql2/promise');
      const createPool=mysql.createPool;mysql.createPool=((...args:Parameters<typeof createPool>)=>{const pool=createPool(...args);pools.push(pool);return pool;}) as typeof createPool;
      restore=()=>{mysql.createPool=createPool;};
      const source=await mysql.createConnection(fixture);
      try {
        await assertSelectedConstraints(source,currentPackage.manifest);
        const {inspectReadiness}=await import('../../lib/operations/readiness');
        assert.deepEqual(await inspectReadiness(nativeReadinessAdapter(source) as unknown as D1Database,'mariadb',currentPackage.manifest),{ready:true,missing:[]});
        phase = 'selected browser view inventory';
        const selectedViews = await bindSelectedBrowserViews({ connection: source, openReference: () => mysql.createConnection(fixture),
          database: fixture.database, selected: currentPackage, assertOwned: attestOwner, signal: cancellation.signal });
        const {env}=await import('../../lib/runtime/node-bindings');const db=env.DB;
        const {SecurityStore}=await import('../../lib/security/store');const store=new SecurityStore(db,key,true);
        const actor=await db.prepare("SELECT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role='super_admin' ORDER BY u.id LIMIT 1").first<{id:string}>();assert.ok(actor);
        assert.equal((await store.readAccount(actor.id))?.value.status,'active');
        const listener=createServer();const port=await new Promise<number>(done=>listener.listen(0,'127.0.0.1',()=>done((listener.address() as {port:number}).port)));await new Promise<void>((done,reject)=>listener.close(error=>error?reject(error):done()));
        const origin=assertLoopbackOrigin('http://127.0.0.1:'+port),media=own('media');await mkdir(media,{mode:0o700});
        const runtime={HASTABAZAAR_COMMERCE_NATIVE_MARKER:process.env.HATSKALA_NATIVE_MARKER!,HASTABAZAAR_COMMERCE_OWNER_TOKEN:process.env.HATSKALA_NATIVE_TOKEN!,HASTABAZAAR_COMMERCE_CONTAINER_ID:nativeMarker.id,...childEnv,...commerceRuntime,TEMP:tmpdir(),TMP:tmpdir(),TMPDIR:tmpdir(),HASTABAZAAR_RELEASE_ID:currentPackage.manifest.release,APP_ORIGIN:origin,APP_ALLOWED_ORIGINS:origin,HOST:'127.0.0.1',PORT:String(port),MEDIA_ROOT:media,HASTABAZAAR_SECURITY_KEY:key,HASTABAZAAR_COMMERCE_POLICY_FILE:own('commerce-policy.json'),HASTABAZAAR_COMMERCE_ARCHIVE_SHA256:inventory.archiveSha256,DB_HOST:fixture.host,DB_PORT:String(fixture.port),DB_NAME:fixture.database,DB_USER:fixture.user,DB_PASSWORD:fixture.password};
        assertCommerceRuntime(runtime);
        const epoch={db,runtime,assertOwned:async()=>{cancellation.signal.throwIfAborted();await attestOwner();assertCommerceRuntime(runtime);assert.equal(env.DB,db);}};
        phase='fictional enrolled staff preparation';
        const admin=await prepareCommerceStaff(db,store,actor.id);secrets.push(admin.password);
        const support=await prepareCommerceStaff(db,store,actor.id,'support.manage');secrets.push(support.password);
        const rootSuperAdmin = (await db.prepare("SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.status='active' AND r.role='super_admin'").all<{id:string}>()).results;
        assert.deepEqual(rootSuperAdmin.map(row => row.id), [actor.id], 'The authenticated bootstrap must admit exactly its one root Super Admin');
        const sharedReviewer=await prepareSharedTeamReviewer(epoch,store,actor.id);
        secrets.push(sharedReviewer.password);
        const financeActors=await prepareFinanceJourneyActors(epoch,store,actor.id);secrets.push(financeActors.preparer.password,financeActors.approver.password);
        phase='fictional admin journey enrollment';
        const adminJourneyActors=await preparePackagedAdminJourney(epoch,store,actor.id);
        secrets.push(adminJourneyActors.limitedStaff.password,adminJourneyActors.superAdmin.password);
        phase='actual checkout form publication';
        const {FORM_REGISTRY}=await import('../../lib/forms/registry');const {validateFormDraft}=await import('../../lib/forms/validation');
        const {saveFormDraft,publishFormDraft}=await import('../../lib/db/repositories/form-catalog');const {resolvePublishedForm}=await import('../../lib/forms/runtime');
        const formId='commerce.checkout',history=await db.prepare('SELECT status,config_json FROM form_config_versions WHERE form_id=? ORDER BY version').bind(formId).all<{status:string;config_json:string}>();
        for(const row of history.results)validateFormDraft(formId,JSON.parse(row.config_json));
        if(!history.results.some(row=>row.status==='published')){
          assert.equal(history.results.length,0,'Unpublished existing checkout requires review');
          const fields=FORM_REGISTRY[formId].baseFields.filter(field=>field.capability!=='protected'&&field.required!==undefined).map((field,order)=>({id:field.key,key:field.key,type:field.type,label:field.label,required:field.required,status:field.status,order,...(field.choices?{choices:field.choices}:{}),...(field.min!==undefined?{min:field.min}:{}),...(field.max!==undefined?{max:field.max}:{}),...(field.integerOnly!==undefined?{integerOnly:field.integerOnly}:{})} as ConfiguredField));
          const now=Date.now(),config=validateFormDraft(formId,{formId,fields});
          const draft=await saveFormDraft(db,{formId,actorId:actor.id,actorRole:'super_admin',expectedPublishedVersion:0,config,reason:'Isolated commerce checkout publication',requestId:randomUUID(),now});
          await publishFormDraft(db,{formId,draftId:draft.id,actorId:actor.id,actorRole:'super_admin',expectedPublishedVersion:0,expectedDraftRevision:draft.revision,reason:'Isolated commerce checkout publication',requestId:randomUUID(),now:now+1});
        }
        await resolvePublishedForm(db,formId);
        phase='fictional reviewed catalogue and stock preparation';
        const accounts=await prepareCommerceBrowser(epoch,actor.id);secrets.push(...[accounts.buyer,accounts.foreignBuyer,accounts.seller,accounts.foreignSeller].map(actor=>actor.password));
        await db.prepare('INSERT INTO marketplace_settings(`key`,value,updated_by,updated_at) VALUES(?,?,?,?)').bind('isolated-commerce-owner:'+runtime.HASTABAZAAR_COMMERCE_OWNER_TOKEN,JSON.stringify(signedCommercePolicy(runtime)),actor.id,Date.now()).run();
        await writeFile(runtime.HASTABAZAAR_COMMERCE_POLICY_FILE,JSON.stringify(signedCommercePolicy(runtime)),{flag:'wx',mode:0o600});
        assert.ok(process.env.CHROME_PATH);launcher=await createRecordedBrowserLauncher(root,process.env.CHROME_PATH);
        phase='owned local-staging packaged startup';const app=owner.start(process.execPath,['app.cjs'],{cwd:packageRoot,env:runtime});
        let live=false;for(let attempt=0;attempt<150;attempt++){cancellation.signal.throwIfAborted();assert.ok(!app.error&&app.process.exitCode===null);if(app.output.includes('[vinext] Production server running at '+origin)){try{const response=await fetch(origin+'/health/live',{signal:AbortSignal.timeout(1000)});live=response.status===200&&(await response.json() as {status:string}).status==='ok';}catch{}}if(live)break;await delay(200);}assert.ok(live,'Owned package failed liveness');
        phase='genuine commerce browser';const {chromium}=await import(process.env.PLAYWRIGHT_MODULE!);
        const browser=await chromium.launch({headless:true,executablePath:launcher.executablePath,env:Object.fromEntries(Object.entries(childEnv).filter((entry):entry is [string,string]=>typeof entry[1]==='string'))});
        let result,adminJourney,sharedTeam,dutyHandoff,incident,incidentRecovery; const financePages: import('playwright-core').Page[]=[];
        try{
          const preparer=await openFinanceJourneySession({epoch,browser,origin,signal:cancellation.signal,actor:financeActors.preparer});financePages.push(preparer);
          const approver=await openFinanceJourneySession({epoch,browser,origin,signal:cancellation.signal,actor:financeActors.approver});financePages.push(approver);
          const prerequisites=await prepareFinancePrerequisites(epoch,accounts,financeActors.approver.id);
          const finance={preparer,approver,preparerId:financeActors.preparer.id,approverId:financeActors.approver.id,accountVersionId:prerequisites.accountVersionId};
          result=await runCommerceBrowser({epoch,browser,origin,admin,signal:cancellation.signal,accounts,aftercareJourney:{support,finance},giftIssuer:{page:approver,id:financeActors.approver.id},referralManager:{page:approver,id:financeActors.approver.id},exceptionJourney:{db:source,ownerPage:approver,owner:financeActors.approver},sellerJourney: journey => runSellerJourney({ ...journey, evidenceDirectory: evidence })});
          assert.ok(result.referral?.rewardLifecycle, 'The packaged referral order must complete the reward hold journey');
          phase='genuine shared Team, notices and records';
          const reviewer=await openFinanceJourneySession({epoch,browser,origin,signal:cancellation.signal,actor:sharedReviewer});
          financePages.push(reviewer);
          sharedTeam=await runSharedTeamCurrentSession({epoch,db:source,origin,selectedViews,signal:cancellation.signal,reviewerPage:reviewer,
            ownerPage:approver,reviewer:sharedReviewer,owner:financeActors.approver,
            admittedSuperAdminIds:[actor.id,financeActors.approver.id,adminJourneyActors.superAdmin.id],
            formHealthScope:{environment:'local_staging',releaseId:runtime.HASTABAZAAR_RELEASE_ID}});
          phase='genuine packaged admin journey';
          adminJourney=await runPackagedAdminJourney({epoch,browser,origin,signal:cancellation.signal,
            actors:adminJourneyActors,commerce:result,productId:accounts.productId,commerceOperatorId:admin.id});
          phase='genuine Team duty handoff';
          dutyHandoff=await runTeamDutyHandoff({epoch,ownerPage:approver,ownerId:financeActors.approver.id,reviewerPage:reviewer,reviewerId:sharedReviewer.id,signal:cancellation.signal});
          phase='genuine failed parcel workflow incident';
          assert.ok(result.exception);
          incident=await runFailedParcelIncident({epoch,page:approver,actorId:financeActors.approver.id,signal:cancellation.signal,exception:result.exception});
          phase='genuine scoped incident recovery and authorized closure';
          incidentRecovery=await runIncidentRecoveryDrill({epoch,page:approver,actorId:financeActors.approver.id,signal:cancellation.signal});
        }finally{await Promise.all(financePages.map(page=>page.context().close()));await browser.close();}
        await owner.close();const groups=await launcher.close();assert.ok(groups>=1);await epoch.assertOwned();
        const {captureNativeInventory}=await import('../recovery/native-inventory.mjs');const after=await captureNativeInventory(source,selectedViews);
        await writeFile(resolve(evidence,'verification.json'),JSON.stringify({status:'PASS',archiveSha256:inventory.archiveSha256,sourceSha256:inventory.sourceSha256,commerce:result,adminJourney,sharedTeam,dutyHandoff,incident,incidentRecovery,recordedBrowserGroupsStopped:groups,childrenStopped:true,after,gaps:['J1 applicant private edit/preview and denied public link, pending private profile/operational locations, independent finance records and any unavailable historical task clocks','J2 workflow gaps in adminJourney.incomplete','J3 quote/eligibility replay','J4 physical disposition and named handoff remain separate','J5 browser evidence covers upcoming common-fee publication, seller consent, and wallet spend/refund. The checkout consent resolver checks the effective boundary at explicit times. Referral browser evidence covers paid delivery, the complaint hold and removal, and no credit within the original wait. Actual reward posting after natural maturity, post-effective browser checkout, replay, and native failure/race branches remain separate','J6 packaged delivery/retry, remaining staff/participant notice and negative branches']},null,2),{flag:'wx',mode:0o600});
      }finally{await source.end();}
    });
    await launcher?.close();clean=true;
  }catch(error){await writeFile(resolve(evidence,'failure.json'),JSON.stringify({status:'FAIL',phase,message:redact(error instanceof Error?error.message:'Unknown failure')}),{flag:'wx',mode:0o600});throw new Error('Isolated commerce gate failed during '+phase);}
  finally{process.removeListener('SIGINT',cancel);process.removeListener('SIGTERM',cancel);restore?.();await Promise.all(pools.map(pool=>pool.end()));await launcher?.close();if(clean)await rm(root,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await main();

// Additive admission hook, invoked by the merged J4 controller before its return
// branch and again after independent original-return entitlement review. This hook
// does not invent prerequisites or downgrade missing sources to a successful skip.
export async function runAdmittedFinanceBeforeReturn(
  cod: Parameters<typeof import('./commerce-browser-fixture.mjs').runFinanceCodRemittance>[0],
  payout: Parameters<typeof import('./commerce-browser-fixture.mjs').runFinancePayoutPacket>[0],
) {
  const driver=await import('./commerce-browser-fixture.mjs');
  assert.equal(cod.epoch,payout.epoch);assert.deepEqual(cod.source,payout.source);
  const remittance=await driver.runFinanceCodRemittance(cod);
  const paid=await driver.runFinancePayoutPacket(payout);
  return {remittance,paid};
}
export async function runAdmittedFinanceAfterReturn(
  input: Parameters<typeof import('./commerce-browser-fixture.mjs').runFinancePostPayoutRefund>[0],
) {
  return (await import('./commerce-browser-fixture.mjs')).runFinancePostPayoutRefund(input);
}
