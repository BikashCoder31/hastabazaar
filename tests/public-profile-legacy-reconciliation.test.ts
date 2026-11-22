import assert from 'node:assert/strict';
import test from 'node:test';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import * as workflow from '../lib/sellers/public-profile-workflow';
void test('ambiguous legacy time requires a scoped audited reconciliation without fabricated publication or a new cooldown',async()=>{
 const f=await readyMaker();try{
  const reconcile=Reflect.get(workflow,'reconcilePublicProfileLegacyClock');assert.equal(typeof reconcile,'function');
  f.sqlite.prepare("UPDATE seller_public_profile_states SET provenance='legacy_baseline',legacy_saved_at=? WHERE seller_id='maker'").run(f.now+100000);
  const original=await workflow.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now);
  assert.equal(original.state.historyNeedsReview,true);
  const draft=await workflow.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',requestId:'legacy-private',now:f.now,baseVersion:0,expectedDraftRevision:null,values:{...original.state.current,about:'A retained new private story.'}});
  await assert.rejects(workflow.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',requestId:'legacy-submit',now:f.now,draftRevision:draft.revision,baseVersion:0}),/history|reconcil/i);
  const request={sellerId:'maker',actorId:'reviewer',requestId:'legacy-reconcile',now:f.now+1,expectedVersion:0,reliableSavedAt:null,evidenceReference:'FIXTURE-SOURCE-INVENTORY-01',reason:'Inspected original audit source; its future timestamp is unreliable'};
  await assert.rejects(reconcile(f.db,{...request,actorId:'maker-user',requestId:'legacy-self'}));
  await assert.rejects(reconcile(f.db,{...request,reliableSavedAt:f.now+10,requestId:'legacy-future'}));
  await reconcile(f.db,request);await reconcile(f.db,request);
  const result=await workflow.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+2);
  assert.equal(result.state.historyNeedsReview,false);assert.equal(result.state.lastNormalPublicationAt,null);assert.equal(result.state.nextNormalSubmissionAt,0);assert.equal(result.state.legacySavedAt,f.now+100000);assert.deepEqual(result.state.current,original.state.current);assert.equal(result.draft?.revision,draft.revision);
  assert.equal(result.history.filter(row=>row.action==='legacy_history_reconciled').length,1);
  await assert.rejects(workflow.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',requestId:'legacy-old-base',now:f.now+3,draftRevision:draft.revision,baseVersion:0}),/compare|current/i);
 }finally{f.dispose();}
});
