import assert from 'node:assert/strict';
import test from 'node:test';
import {companyStoreMakerFixture} from './helpers/company-store-maker-fixture';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {verifySellerDocument,submitUnverifiedDocumentCorrection,requestDocumentChange,reviewDocumentChange,submitDocumentReplacement} from '../lib/sellers/document-review';
import {sellerDocumentWorkspace} from '../lib/sellers/document-workspace';
import {ingestCommittedFormSaves,readFormHealth} from '../lib/operations/form-health';
import {nativeCommandMapping,nativeFormContract,validateNativeReceipt,type NativeReceiptRow} from '../lib/operations/native-form-health';
import {NATIVE_FORM_SOURCES} from '../lib/forms/native-source-contracts';
import {getProfileContactLocations,saveProfileSupport,saveProfileLocations} from '../lib/sellers/profile-contact-locations';
import {requestProtectedChange,reviewProtectedChangePermission} from '../lib/sellers/protected-change-requests';
import {submitProtectedIdentityChange,verifyProtectedIdentityChange} from '../lib/sellers/protected-identity-change';
import {withdrawProtectedChange,disposeProtectedHolds} from '../lib/sellers/protected-change-disposition';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {serviceHealthFixture} from './helpers/service-health-fixture';
import {readFileSync} from 'node:fs';
import {actionableOrderFixture} from './helpers/order-response-fixture';
import {readPreparationWorkspace} from '../lib/orders/response-workspace';
import {reportPreparationIssue,recordPreparationFollowup} from '../lib/orders/response-cases';
import * as profile from '../lib/sellers/public-profile';
import {savePublicProfileMedia} from '../lib/sellers/public-profile-media';
import {PNG} from 'pngjs';
import {protectedChangeWorkspace} from '../lib/sellers/protected-change-workspace';

function bindScope(db:D1Database,releaseId='native-health-test'){
 captureDatabaseHealthScope(db,{HASTABAZAAR_RUNTIME_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:releaseId,NODE_ENV:'test'});
}
void test('real authorized native load and committed document review provide separate scoped health evidence',async()=>{
 const f=await companyStoreMakerFixture();try{
  bindScope(f.db);const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
  await sellerDocumentWorkspace(f.db,'maker','reviewer','staff');
  const now=Date.now();await verifySellerDocument(f.db,{sellerId:'maker',documentId:doc.id,actorId:'reviewer',commandId:'health-review',reason:'PRIVATE-REVIEW-REASON-FOR-HEALTH-TEST',now});
  const scope={environment:'test' as const,releaseId:'native-health-test',now:now+100,formId:'staff.seller-document-review'};
  assert.equal(await ingestCommittedFormSaves(f.db,scope),1);
  assert.equal(await ingestCommittedFormSaves(f.db,scope),0);
  const [health]=await readFormHealth(f.db,'reviewer',scope);
  assert.equal(health.state,'healthy');assert.equal(health.lastLoad?.outcome,'compatible');assert.equal(health.lastSave?.outcome,'saved');
  assert.equal(health.lastSave?.observedAt,now);
  assert.doesNotMatch(JSON.stringify(health),/PRIVATE-|representative_identity|maker-user/);
  assert.equal(f.sqlite.prepare("SELECT evidence_kind FROM form_health_observations WHERE phase='save'").get()?.evidence_kind,'native_command');
 }finally{f.sqlite.close();}
});
void test('all 21 native save IDs have explicit action and trusted audience contracts; queries never do',async()=>{
 const expected:Record<string,string>={
  'seller.document.command.request':'seller.document-change-request','seller.document.command.unverified_correction':'seller.document-correction-upload','seller.document.command.replacement':'seller.document-replacement-upload','seller.document.command.review':'staff.seller-document-review','seller.document.command.permission':'staff.seller-document-change-permission',
  'seller.protected_change.requested':'seller.protected-change-request','seller.protected_change.withdrawn':'seller.protected-change-withdrawal','seller.protected_change.identity_submitted':'seller.protected-identity-upload','seller.protected_change.permission':'staff.protected-change-permission','seller.protected_change.identity_verified':'staff.protected-identity-review',
  'seller.protected_change.hold_disposition':'staff.protected-change-disposition','seller.protected_change.bank_revalidated':'staff.protected-change-disposition','seller.protected_change.evidence_only':'staff.protected-change-disposition','seller.protected_change.packet_retired':'staff.protected-change-disposition',
  'seller.public_profile.withdrawn':'seller.public-profile-withdrawal','seller.public_profile.correction_requested':'seller.public-profile-correction','seller.public_profile.correction_answered':'seller.public-profile-correction','seller.public_profile.support_saved':'seller.public-support-contacts','seller.public_profile.locations_saved':'seller.operational-locations','seller.public_profile.media_uploaded':'seller.public-profile-media','seller.public_profile.reviewed':'staff.public-profile-review','seller.public_profile.correction_reviewed':'staff.public-profile-review','seller.public_profile.staff_correction_requested':'staff.public-profile-correction-request','seller.public_profile.legacy_history_reconciled':'staff.public-profile-history-reconciliation',
 };
 const covered=new Set<string>();
 for(const [action,id] of Object.entries(expected)){const mapping=nativeCommandMapping(action);assert.equal(mapping?.formId,id);assert.equal(mapping?.audience,NATIVE_FORM_SOURCES.find(source=>source.id===id)?.audience);assert.ok(await nativeFormContract(id));covered.add(id);}
 for(const audience of ['seller','staff'] as const){const id=audience+'.order-preparation';assert.equal(nativeCommandMapping('order.response.issue.reported',audience)?.formId,id);covered.add(id);}
 assert.equal(nativeCommandMapping('order.response.issue.reported'),null);assert.equal(nativeCommandMapping('order.response.followup.recorded','seller'),null);assert.equal(nativeCommandMapping('order.response.followup.recorded','staff')?.formId,'staff.order-preparation');
 assert.equal(covered.size,21);assert.deepEqual([...covered].sort(),NATIVE_FORM_SOURCES.filter(s=>s.mode!=='query').map(s=>s.id).sort());
 for(const source of NATIVE_FORM_SOURCES.filter(s=>s.mode==='query'))assert.equal(nativeFormContract(source.id),null);
});
void test('native receipts reject stale versions, wrong outcomes and scopes; retained provenance cannot be rewritten',async()=>{
 const f=await companyStoreMakerFixture();try{
  bindScope(f.db);const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
  const now=Date.now();await verifySellerDocument(f.db,{sellerId:'maker',documentId:doc.id,actorId:'reviewer',commandId:'validation-review',reason:'Inspect the exact native outcome',now});
  const row=f.sqlite.prepare("SELECT id,action,subject_type subjectType,subject_id subjectId,actor_id actorId,request_id requestId,command_result_json result,next_json metadata,created_at observedAt,command_key commandKey,command_digest commandDigest FROM audit_logs WHERE request_id='validation-review' AND command_key IS NOT NULL").get() as unknown as NativeReceiptRow;
  assert.ok(await validateNativeReceipt(f.db,row,'test','native-health-test'));
  const base=JSON.parse(row.metadata);
  for(const change of [{version:1},{sourceHash:'a'.repeat(64)},{audience:'seller'},{environment:'production'},{releaseId:'other'},{configurationHash:'0'.repeat(64)}])assert.equal(await validateNativeReceipt(f.db,{...row,metadata:JSON.stringify({nativeFormHealth:{...base.nativeFormHealth,...change}})},'test','native-health-test'),null);
  for(const change of [{result:JSON.stringify('nonexistent-document')},{subjectId:'nonexistent-document'},{metadata:'{}'},{requestId:'unrecorded-request'},{commandDigest:'invalid'}])assert.equal(await validateNativeReceipt(f.db,{...row,...change},'test','native-health-test'),null);
  assert.throws(()=>f.sqlite.prepare('UPDATE audit_logs SET next_json=NULL WHERE id=?').run(row.id),/immutable|retained/);
  assert.throws(()=>f.sqlite.prepare('DELETE FROM audit_logs WHERE id=?').run(row.id),/retained/);
  const currentVersion=(await nativeFormContract('staff.seller-document-review'))!.version,staleVersion=currentVersion===1?2:1;
  f.sqlite.prepare("INSERT INTO form_health_observations VALUES('stale-load','form-health-stale-load','test','native-health-test','staff.seller-document-review',?,'staff.seller-document-review','load','compatible',NULL,'runtime',NULL,?)").run(staleVersion,now);
  f.sqlite.prepare("INSERT INTO form_health_observations VALUES('stale-save','form-health-stale-save','test','native-health-test','staff.seller-document-review',?,'staff.seller-document-review','save','saved','durable_submission','native_command',?,?)").run(staleVersion,row.id,now);
  const [stale]=await readFormHealth(f.db,'reviewer',{environment:'test',releaseId:'native-health-test',now:now+10,formId:'staff.seller-document-review'});
  assert.equal(stale.state,'unknown');assert.equal(stale.lastLoad,null);assert.equal(stale.lastSave,null);
  f.sqlite.exec("UPDATE users SET status='suspended' WHERE id='reviewer'");
  await assert.rejects(verifySellerDocument(f.db,{sellerId:'maker',documentId:doc.id,actorId:'reviewer',commandId:'validation-review',reason:'Inspect the exact native outcome',now}));
 }finally{f.sqlite.close();}
});
void test('authorized load failures are scoped, sanitized, and cannot be hidden by a saved event',async()=>{
 const f=await companyStoreMakerFixture();try{
  bindScope(f.db);const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:doc.id,actorId:'reviewer',commandId:'failure-load-review',reason:'Inspect the exact native outcome',now:Date.now()});
  const wrapped=Object.create(f.db) as D1Database;bindScope(wrapped);
  wrapped.prepare=((sql:string)=>{if(sql.includes('SELECT d.id,d.kind'))throw new Error('PRIVATE-DB-DETAIL-DO-NOT-EXPOSE');return f.db.prepare(sql);}) as D1Database['prepare'];
  await assert.rejects(sellerDocumentWorkspace(wrapped,'maker','reviewer','staff'),/PRIVATE-DB/);
  const scope={environment:'test' as const,releaseId:'native-health-test',now:Date.now()+100,formId:'staff.seller-document-review'};
  await ingestCommittedFormSaves(f.db,scope);const [health]=await readFormHealth(f.db,'reviewer',scope);assert.equal(health.state,'action_needed');assert.equal(health.lastLoad?.category,'read_unavailable');assert.doesNotMatch(JSON.stringify(health),/PRIVATE-DB/);
  const before=f.sqlite.prepare('SELECT COUNT(*) n FROM form_health_observations').get()?.n;
  await assert.rejects(sellerDocumentWorkspace(f.db,'maker','maker-user','staff'));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM form_health_observations').get()?.n,before);
 }finally{f.sqlite.close();}
});
void test('public contacts and private locations use real native outcomes without exposing values or generic answers',async()=>{
 const f=await companyStoreMakerFixture();try{
  bindScope(f.db);const view=await getProfileContactLocations(f.db,'maker','maker-user'),now=Date.now();
  const contact={sellerId:'maker',actorId:'maker-user',expectedRevision:view.support.revision,email:'native-private-value@local.hastabazaar.test',phoneCountry:'NP',phone:'9800000012',publicDisclosureConfirmed:true,requestId:'native-support',now};
  await saveProfileSupport(f.db,contact);await saveProfileSupport(f.db,contact);
  await saveProfileLocations(f.db,{sellerId:'maker',actorId:'maker-user',expectedRevision:view.locations.revision,pickupAddress:'PRIVATE NATIVE PICKUP LOCATION',returnAddress:'PRIVATE NATIVE RETURN LOCATION',requestId:'native-locations',now:now+1});
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),2);
  for(const formId of ['seller.public-support-contacts','seller.operational-locations']){const [health]=await readFormHealth(f.db,'reviewer',{environment:'test',releaseId:'native-health-test',now:now+100,formId});assert.equal(health.state,'healthy');assert.doesNotMatch(JSON.stringify(health),/PRIVATE|native-private-value/);}
  const receipt=f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE request_id='native-support' AND command_key IS NOT NULL").get();assert.doesNotMatch(String(receipt?.next_json),/native-private-value|9800000012/);
  await assert.rejects(getProfileContactLocations(f.db,'maker','reviewer'));await assert.rejects(saveProfileSupport(f.db,{...contact,actorId:'reviewer'}));
 }finally{f.sqlite.close();}
});
void test('protected request, permission, identity and disposition commands retain their exact native outcome evidence',async()=>{
 const f=await completeVersionFixture(Date.now()-100000);try{
  const original=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id as string;
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:original,actorId:'reviewer',reason:'Inspect fictional identity before native bridge',now:f.now});
  bindScope(f.db);await sellerDocumentWorkspace(f.db,'maker','maker-user','seller');const rev=f.sqlite.prepare("SELECT identity_revision,bank_revision FROM seller_protected_revisions WHERE seller_id='maker'").get()!,now=Date.now();
  const revision={expectedIdentityRevision:Number(rev.identity_revision),expectedBankRevision:Number(rev.bank_revision)};
  const id=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'identity',fields:['legalName','representative_identity'],reason:'Correct the legal spelling for the same person',...revision,requestId:'native-protected-request',now});
  await protectedChangeWorkspace(f.db,id,'maker-user','owner',now);await protectedChangeWorkspace(f.db,id,'reviewer','staff',now);
  const permission=await reviewProtectedChangePermission(f.db,{caseId:id,actorId:'reviewer',expectedVersion:0,...revision,decision:'permit',reason:'Permit exact fictional identity proof',requestId:'native-protected-permission',now:now+1});
  await submitProtectedIdentityChange(f.db,{sellerId:'maker',caseId:id,permissionId:permission!,actorId:'maker-user',values:{legalName:'Fictional Maker Corrected'},documents:[{id:'native-proof',kind:'representative_identity',objectKey:'private/seller-documents/maker/native-proof',originalName:'fictional.png',mimeType:'image/png',sizeBytes:20}],requestId:'native-protected-upload',now:now+2});
  await verifyProtectedIdentityChange(f.db,{caseId:id,actorId:'reviewer',expectedVersion:2,...revision,sameLegalPersonConfirmed:true,evidenceReference:'PRIVATE-NATIVE-EVIDENCE',reason:'Exact proof confirms same person and corrected spelling',requestId:'native-protected-verify',now:now+3});
  const current=f.sqlite.prepare("SELECT identity_revision,bank_revision FROM seller_protected_revisions WHERE seller_id='maker'").get()!;
  await disposeProtectedHolds(f.db,{caseId:id,actorId:'reviewer',expectedVersion:3,expectedIdentityRevision:Number(current.identity_revision),expectedBankRevision:Number(current.bank_revision),release:false,capabilities:['payouts'],currentEvidenceValidConfirmed:false,bankOwnershipConfirmed:false,evidenceReference:'PRIVATE-NATIVE-HOLD',reason:'Retain payout hold pending bank ownership evidence',requestId:'native-protected-hold',now:now+4});
  const second=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'identity',fields:['representative_identity'],reason:'Refresh original supporting identity evidence',expectedIdentityRevision:Number(current.identity_revision),expectedBankRevision:Number(current.bank_revision),requestId:'native-withdraw-request',now:now+5});
  await withdrawProtectedChange(f.db,{caseId:second,actorId:'maker-user',expectedVersion:0,reason:'Withdraw the fictional evidence refresh request',requestId:'native-withdraw',now:now+6});
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),7);
  const ids=f.sqlite.prepare("SELECT DISTINCT form_id FROM form_health_observations WHERE evidence_kind='native_command' ORDER BY form_id").all().map(row=>row.form_id);
  assert.deepEqual(ids,['seller.protected-change-request','seller.protected-change-withdrawal','seller.protected-identity-upload','staff.protected-change-disposition','staff.protected-change-permission','staff.protected-identity-review'].sort());
  for(const formId of ids as string[]){const [health]=await readFormHealth(f.db,'reviewer',{environment:'test',releaseId:'native-health-test',now:Math.max(Date.now(),now+100),formId});assert.equal(health.state,'healthy',formId);}
  assert.doesNotMatch(JSON.stringify(f.sqlite.prepare('SELECT * FROM form_health_observations').all()),/PRIVATE-NATIVE|Fictional Maker Corrected|private\/seller-documents/);
 }finally{f.dispose();}
});
void test('0156 retains original observations, incident links and all guards with SQLite foreign keys enabled',()=>{
 const f=serviceHealthFixture();try{
  f.sqlite.exec("PRAGMA foreign_keys=ON; CREATE TABLE form_answer_sets(id TEXT PRIMARY KEY); CREATE TABLE audit_logs(id TEXT PRIMARY KEY,command_key TEXT,next_json TEXT);");
  f.sqlite.exec(readFileSync(new URL('../drizzle/0151_form_health_records.sql',import.meta.url),'utf8'));
  f.sqlite.exec("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('retained-incident','test','form.example',1,'detected',1,1); INSERT INTO form_health_observations VALUES('retained','form-health-retained','test','original','staff.seller-document-review',7,'original','load','blocked','read_unavailable','runtime',NULL,1); INSERT INTO form_health_incident_links VALUES('retained','retained-incident',2); INSERT INTO audit_logs VALUES('historic','key',NULL);");
  const before=f.sqlite.prepare('SELECT * FROM form_health_observations').all(),links=f.sqlite.prepare('SELECT * FROM form_health_incident_links').all();
  f.sqlite.exec('BEGIN');f.sqlite.exec(readFileSync(new URL('../drizzle/0156_native_form_health.sql',import.meta.url),'utf8'));f.sqlite.exec('COMMIT');
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM form_health_observations').all(),before);assert.deepEqual(f.sqlite.prepare('SELECT * FROM form_health_incident_links').all(),links);assert.deepEqual(f.sqlite.prepare('PRAGMA foreign_key_check').all(),[]);
  for(const table of ['form_health_observations','form_health_incident_links']){assert.throws(()=>f.sqlite.exec('DELETE FROM '+table),/retained|cleanup/);assert.throws(()=>f.sqlite.exec('UPDATE '+table+' SET '+(table.endsWith('links')?'retained_at=3':'observed_at=3')),/retained/);}
  assert.throws(()=>f.sqlite.exec("UPDATE audit_logs SET next_json='{}' WHERE id='historic'"),/retained/);
  assert.throws(()=>f.sqlite.exec("INSERT INTO form_health_incident_links VALUES('missing','retained-incident',1)"),/FOREIGN KEY/);
 }finally{f.sqlite.close();}
});
void test('order receipts retain original server audience across later role changes and deduplicate a committed lost response',async()=>{
 const f=await actionableOrderFixture({secondOffer:true});try{
  assert.ok(f.rows.length>=2);bindScope(f.db);const first=f.rows[0],second=f.rows[1],now=Date.now();
  await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'seller');await readPreparationWorkspace(f.db,'reviewer',f.orderId,'staff');
  const report=await reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:'native-seller-report',expectedRevision:null,now},{portionId:String(first.portionId),itemIds:[String(first.id)],kind:'delay',detail:'PRIVATE original seller preparation issue for the exact item.',proposedReadyAt:null},'seller');
  const lost=Object.create(f.db) as D1Database;bindScope(lost);let uncertain=true;
  lost.batch=(async(statements:D1PreparedStatement[])=>{const result=await f.db.batch(statements);if(uncertain){uncertain=false;throw new Error('Fictional committed lost response');}return result;}) as D1Database['batch'];
  const context={actorId:'reviewer',requestId:'native-staff-report',expectedRevision:null,now:now+1},input={portionId:String(second.portionId),itemIds:[String(second.id)],kind:'delay' as const,detail:'PRIVATE independent staff preparation report.',proposedReadyAt:null};
  const original=await reportPreparationIssue(lost,context,input,'staff');assert.deepEqual(await reportPreparationIssue(f.db,context,input,'staff'),original);
  await recordPreparationFollowup(f.db,{actorId:'reviewer',requestId:'native-staff-followup',expectedRevision:'0',now:now+2},{caseId:report.id,ownerId:'reviewer',backupId:null,state:'waiting',nextUpdateAt:f.releasedAt+3600000,privateNote:'PRIVATE follow-up note requires source authority.',customerMessage:'The preparation team is checking your item and will update you.'});
  f.sqlite.exec("DELETE FROM user_roles WHERE user_id='registered-owner'; INSERT INTO user_roles(user_id,role,assigned_at) VALUES('registered-owner','admin',1);");
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),3);
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),0);
  for(const formId of ['seller.order-preparation','staff.order-preparation']){const [health]=await readFormHealth(f.db,'reviewer',{environment:'test',releaseId:'native-health-test',now:now+100,formId});assert.equal(health.state,'healthy');assert.doesNotMatch(JSON.stringify(health),/PRIVATE|registered-owner/);}
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM form_health_observations WHERE form_id='seller.order-preparation' AND phase='save'").get()?.n,1);
  assert.equal(await readPreparationWorkspace(f.db,'registered-owner',f.orderId,'seller'),null);
  await assert.rejects(reportPreparationIssue(f.db,{actorId:'registered-owner',requestId:'native-seller-report',expectedRevision:null,now},{portionId:String(first.portionId),itemIds:[String(first.id)],kind:'delay',detail:'PRIVATE original seller preparation issue for the exact item.',proposedReadyAt:null},'seller'));
 }finally{f.dispose();}
});
void test('historic unscoped native receipt stays unknown when retried in the current release',async()=>{
 const f=await companyStoreMakerFixture();try{
  const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
  const now=Date.now(),input={sellerId:'maker',documentId:doc.id,actorId:'reviewer',commandId:'unscoped-review',reason:'Preserve historic unscoped command outcome',now};
  await verifySellerDocument(f.db,input);bindScope(f.db);await verifySellerDocument(f.db,input);await sellerDocumentWorkspace(f.db,'maker','reviewer','staff');
  const scope={environment:'test' as const,releaseId:'native-health-test',now:Date.now()+100,formId:'staff.seller-document-review'};
  assert.equal(await ingestCommittedFormSaves(f.db,scope),0);const [health]=await readFormHealth(f.db,'reviewer',scope);assert.equal(health.state,'unknown');assert.equal(health.lastSave,null);
  assert.equal(f.sqlite.prepare("SELECT next_json FROM audit_logs WHERE request_id='unscoped-review' AND command_key IS NOT NULL").get()?.next_json,null);
 }finally{f.sqlite.close();}
});
void test('document correction, permission and replacement forms ingest their actual retained native outcomes',async()=>{
 const f=await companyStoreMakerFixture();try{
  bindScope(f.db);const original=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id),now=Date.now();
  await sellerDocumentWorkspace(f.db,'maker','maker-user','seller');await sellerDocumentWorkspace(f.db,'maker','reviewer','staff');
  const document=(id:string)=>({id,kind:'representative_identity' as const,objectKey:'private/seller-documents/maker/'+id,originalName:'PRIVATE-DOCUMENT.png',mimeType:'image/png',sizeBytes:20});
  const corrected=await submitUnverifiedDocumentCorrection(f.db,{sellerId:'maker',documentId:original,document:document('native-corrected'),actorId:'maker-user',commandId:'native-doc-correct',now});
  await verifySellerDocument(f.db,{sellerId:'maker',documentId:corrected,actorId:'reviewer',commandId:'native-doc-review',reason:'Verify exact corrected fictional evidence',now:now+1});
  const requestId=await requestDocumentChange(f.db,{sellerId:'maker',documentId:corrected,actorId:'maker-user',reason:'Request exact verified evidence replacement',commandId:'native-doc-request',now:now+2});
  await reviewDocumentChange(f.db,{requestId,actorId:'reviewer',decision:'approve',reason:'Permit the exact fictional evidence replacement',commandId:'native-doc-permit',now:now+3});
  const permissionId=String(f.sqlite.prepare('SELECT active_permission_id FROM seller_document_change_requests WHERE id=?').get(requestId)!.active_permission_id);
  await submitDocumentReplacement(f.db,{sellerId:'maker',requestId,permissionId,document:document('native-replacement'),actorId:'maker-user',commandId:'native-doc-replace',now:now+4});
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),5);
  for(const formId of ['seller.document-change-request','seller.document-correction-upload','seller.document-replacement-upload','staff.seller-document-review','staff.seller-document-change-permission']){
   const [health]=await readFormHealth(f.db,'reviewer',{environment:'test',releaseId:'native-health-test',now:now+100,formId});assert.equal(health.state,'healthy',formId);assert.doesNotMatch(JSON.stringify(health),/PRIVATE-DOCUMENT|private\/seller-documents/);
  }
 }finally{f.sqlite.close();}
});
void test('public profile withdrawal, correction, staff review, history and media forms ingest original outcomes',async()=>{
 const f=await companyStoreMakerFixture();try{
  const now=Date.now();f.sqlite.prepare("UPDATE seller_public_profile_states SET provenance='legacy_baseline',legacy_saved_at=? WHERE seller_id='maker'").run(now+100000);
  bindScope(f.db);await profile.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',now);await profile.getPublicProfileWorkspace(f.db,'maker','reviewer','staff',now);
  await profile.reconcilePublicProfileLegacyClock(f.db,{sellerId:'maker',actorId:'reviewer',expectedVersion:0,reliableSavedAt:null,evidenceReference:'PRIVATE-ORIGINAL-HISTORY',reason:'Original future timestamp cannot prove the historical publication time',requestId:'native-history',now});
  const view=await profile.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',now+1),values={...view.state.current,publicName:'Fictional native profile',publicCity:'Kathmandu',about:'A fictional native public-profile story.'};
  const draft=await profile.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:1,expectedDraftRevision:null,values,requestId:'native-profile-draft',now:now+1});
  const candidate=await profile.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:1,draftRevision:draft.revision,requestId:'native-profile-submit',now:now+2});assert.ok(candidate.candidateId);
  await profile.reviewPublicProfileRevision(f.db,{candidateId:candidate.candidateId,actorId:'reviewer',expectedVersion:0,action:'approve_only',reason:'Review exact fictional public profile without publishing',requestId:'native-profile-review',now:now+3});
  await profile.withdrawPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',candidateId:candidate.candidateId,expectedVersion:1,reason:'Withdraw original fictional public profile candidate',requestId:'native-profile-withdraw',now:now+4});
  const correction=await profile.requestPublicProfileCorrection(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:1,fields:['about'],desired:{about:'Corrected factual fictional public history'},category:'wrong_detail',reason:'Correct the factual public history description',requestId:'native-profile-correction',now:now+5});
  await profile.reviewPublicProfileCorrection(f.db,{correctionId:correction,actorId:'reviewer',expectedVersion:0,action:'clarify',scopeConfirmed:true,reason:'Clarify the exact evidence for the requested correction',nextUpdateAt:now+3600000,requestId:'native-profile-clarify',now:now+6});
  await profile.respondPublicProfileCorrection(f.db,{sellerId:'maker',actorId:'maker-user',correctionId:correction,expectedVersion:1,baseVersion:1,desired:{about:'Reviewed factual fictional public history'},reason:'Supply the clarified factual public history description',requestId:'native-profile-answer',now:now+7});
  await profile.requestStaffPublicProfileCorrection(f.db,{sellerId:'maker',actorId:'reviewer',baseVersion:1,fields:['publicCity'],reason:'Clarify exact current public workshop city',nextUpdateAt:now+3600000,requestId:'native-profile-staff-correction',now:now+8});
  const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png)),objects=new Map<string,unknown>();
  await savePublicProfileMedia(f.db,{async put(key:string,value:unknown){objects.set(key,value);return{};}} as unknown as R2Bucket,{sellerId:'maker',actorId:'maker-user',kind:'profile_image',file:new File([bytes],'PRIVATE-MEDIA.png',{type:'image/png'}),requestId:'native-profile-media',now:now+9});assert.equal(objects.size,1);
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),8);
  for(const formId of ['seller.public-profile-withdrawal','seller.public-profile-correction','seller.public-profile-media','staff.public-profile-review','staff.public-profile-correction-request','staff.public-profile-history-reconciliation']){
   const [health]=await readFormHealth(f.db,'reviewer',{environment:'test',releaseId:'native-health-test',now:now+100,formId});assert.equal(health.state,'healthy',formId);assert.doesNotMatch(JSON.stringify(health),/PRIVATE-|Corrected factual|private\/seller-profile/);
  }
 }finally{f.sqlite.close();}
});
void test('rolled-back native review creates no save and retry keeps original scoped receipt',async()=>{
 const f=await companyStoreMakerFixture();try{
  bindScope(f.db);const doc=f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get() as {id:string};
  const now=Date.now(),input={sellerId:'maker',documentId:doc.id,actorId:'reviewer',commandId:'rollback-review',reason:'Independently verified fictional evidence',now};
  f.setBeforeBatch(()=>{f.sqlite.exec("CREATE TEMP TRIGGER fail_native_receipt BEFORE INSERT ON audit_logs WHEN NEW.command_key IS NOT NULL BEGIN SELECT RAISE(ABORT,'forced rollback'); END;");});
  await assert.rejects(verifySellerDocument(f.db,input));
  assert.equal(f.sqlite.prepare('SELECT status FROM seller_documents WHERE id=?').get(doc.id)?.status,'pending');
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),0);
  f.sqlite.exec('DROP TRIGGER fail_native_receipt');await verifySellerDocument(f.db,input);
  bindScope(f.db,'different-release');await verifySellerDocument(f.db,{...input,now:now+1});
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'different-release',now:now+100}),0);
  assert.equal(await ingestCommittedFormSaves(f.db,{environment:'test',releaseId:'native-health-test',now:now+100}),1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').get(input.commandId)?.n,1);
 }finally{f.sqlite.close();}
});
