import assert from 'node:assert/strict';
import test from 'node:test';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductPublicationReview,reviewProductPublication} from '../lib/products/publication';
import {getProductWorkspace,saveProductWorkspace,submitProductIntake} from '../lib/products/intake-workspace';
import {rebaseProductWorkspace} from '../lib/products/publication-candidates';

async function outcomes(){const path='../lib/products/command-outcomes',loadedContract=await import(path).catch(()=>null);assert.equal(typeof loadedContract?.readProductCommandOutcome,'function','Native current-source Product outcome recovery is required');return loadedContract!;}
async function recorded(){const f=await productPublicationFixture('',Date.now()-1000);try{const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),requestId='opaque-product-original-request';await reviewProductPublication(f.db,{actorId:'reviewer',requestId,expectedRevision:String(view.revision),now:f.now+20},{action:'request_changes',caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),reason:'PRIVATE-ORIGINAL-REASON retained only in its authorized native history.',checks:null});return{...f,requestId,view};}catch(error){f.dispose();throw error;}}

void test('native Product receipt recovery returns only an owned recorded fact, distinguishing missing receipt and original source',async()=>{
 const loadedContract=await outcomes(),f=await recorded();try{const input={kind:'publication_review',action:'request_changes',sourceId:f.sent.caseId,requestId:f.requestId},before=f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n;
  assert.deepEqual(await loadedContract.readProductCommandOutcome(f.db,'reviewer','admin',input),{requestId:f.requestId,status:'recorded'});
  assert.deepEqual(await loadedContract.readProductCommandOutcome(f.db,'reviewer','admin',{...input,requestId:'no-product-receipt-yet'}),{requestId:'no-product-receipt-yet',status:'unconfirmed'});
  assert.deepEqual(await loadedContract.readProductCommandOutcome(f.db,'delegate','admin',input),{requestId:f.requestId,status:'unconfirmed'});
  await assert.rejects(loadedContract.readProductCommandOutcome(f.db,'reviewer','admin',{...input,requestId:'cups-policy'}),/source|action|original/i);
  await assert.rejects(loadedContract.readProductCommandOutcome(f.db,'reviewer','admin',{...input,action:'reject'}),/source|action|original/i);
  await assert.rejects(loadedContract.readProductCommandOutcome(f.db,'registered-owner','admin',input));
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs').get()!.n,before);
 }finally{f.dispose();}
});

void test('a recorded decision cannot be rebound to a later actual review case for the same product',async()=>{
 const loadedContract=await outcomes(),f=await productPublicationFixture('',Date.now()-1000);try{
  const original=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),requestId='original-exact-case-publication',published=await reviewProductPublication(f.db,{actorId:'reviewer',requestId,expectedRevision:String(original.revision),now:f.now+20},{action:'approve_and_publish',caseId:f.sent.caseId,versionId:original.candidate.versionId,expectedCaseRevision:String(original.caseRevision),reason:'Reviewed the actual original whole-product candidate and its usable cover.',checks:{sameItem:true,accurateCover:true,eligibilityEvidence:[]}}),work=await getProductWorkspace(f.db,'registered-owner',f.attached.id);
  await rebaseProductWorkspace(f.db,{actorId:'registered-owner',requestId:'rebase-for-new-outcome-case',expectedRevision:String(published.revision),now:f.now+21},{draftId:work.id,publicVersionId:published.versionId,expectedDraftRevision:String(work.revision),retainDraft:true});
  const rebased=await getProductWorkspace(f.db,'registered-owner',work.id),newer=await saveProductWorkspace(f.db,{actorId:'registered-owner',requestId:'new-source-owned-draft',expectedRevision:String(rebased.revision),now:f.now+22},{...f.input,answers:{...f.input.answers,nameEn:'Fictional genuinely newer product revision'}}),next=await submitProductIntake(f.db,{actorId:'registered-owner',requestId:'send-second-outcome-case',expectedRevision:String(newer.revision),now:f.now+23},{draftId:work.id,versionId:newer.versionId,intent:'review',note:'',expectedCaseId:rebased.case?.caseId,expectedCaseRevision:String(rebased.case?.revision),replaceVersionId:rebased.case?.versionId});
  assert.notEqual(next.caseId,f.sent.caseId);assert.equal((await getProductPublicationReview(f.db,'reviewer',next.caseId)).productId,original.productId);
  await assert.rejects(loadedContract.readProductCommandOutcome(f.db,'reviewer','admin',{kind:'publication_review',sourceId:next.caseId,action:'approve_and_publish',requestId}),/source|action|original/i);
 }finally{f.dispose();}
});

void test('native Product outcome recovery rechecks revoked role and source parties in its final batch',async()=>{
 const loadedContract=await outcomes(),f=await recorded();try{const input={kind:'publication_review',action:'request_changes',sourceId:f.sent.caseId,requestId:f.requestId};let raced=false,change=()=>{f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='reviewer'").run();};
  const db=Object.create(f.db)as D1Database,queries=new WeakMap<D1PreparedStatement,string>();db.prepare=(sql:string)=>{const statement=f.db.prepare(sql);queries.set(statement,sql);return statement;};
  db.batch=(async(statements:D1PreparedStatement[])=>{if(!raced&&statements.some(statement=>queries.get(statement)?.includes('EXISTS(SELECT 1 FROM audit_logs WHERE id='))){raced=true;change();}return f.db.batch(statements);})as D1Database['batch'];
  await assert.rejects(loadedContract.readProductCommandOutcome(db,'reviewer','admin',input),/authority|access|changed|permission/i);assert.equal(raced,true,'The race must occur at the outcome receipt fence, after private-reader checks');
  f.sqlite.prepare("UPDATE users SET status='active' WHERE id='reviewer'").run();raced=false;change=()=>{f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='registered'").run();};
  await assert.rejects(loadedContract.readProductCommandOutcome(db,'reviewer','admin',input),/authority|access|changed|permission/i);assert.equal(raced,true);
 }finally{f.dispose();}
});
