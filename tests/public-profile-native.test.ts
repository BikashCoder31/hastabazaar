import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {getPublicProfileWorkspace,savePublicProfileDraft,submitPublicProfileRevision,reviewPublicProfileRevision} from '../lib/sellers/public-profile';
void test('native ephemeral D1 serializes profile publication and preserves the clock on exact retry and no-op',async()=>{
 // Fresh random nonpersistent D1; never the canonical .staging binding.
 const f=await createIncentiveDb();try{
  await f.db.batch([
   f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('owner','owner@local.hastabazaar.test','Fictional Owner','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional Reviewer','active',1,1)"),
   f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','customer',1),('reviewer','super_admin',1)"),
   f.db.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES('seller','owner','Fictional Name','Fictional Studio','Fixture','FIX-PROFILE','NONE','','Fictional Owner','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','approved',1,1)")
  ]);
  const view=await getPublicProfileWorkspace(f.db,'seller','owner','owner',10),values={...view.state.current,about:'A native fixture public story.'};
  const draft=await savePublicProfileDraft(f.db,{sellerId:'seller',actorId:'owner',baseVersion:0,expectedDraftRevision:null,values,requestId:'native-draft',now:10});
  const candidate=await submitPublicProfileRevision(f.db,{sellerId:'seller',actorId:'owner',baseVersion:0,draftRevision:draft.revision,requestId:'native-submit',now:11});assert.ok(candidate.candidateId);
  const review={candidateId:candidate.candidateId,actorId:'reviewer',expectedVersion:0,action:'approve_publish' as const,reason:'Review and explicitly publish this fictional presentation',now:12};
  const results=await Promise.allSettled([reviewPublicProfileRevision(f.db,{...review,requestId:'native-publish-a'}),reviewPublicProfileRevision(f.db,{...review,requestId:'native-publish-b'})]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1,results.map(result=>result.status==='rejected'?String(result.reason):'published').join('\n'));
  const winner=results[0].status==='fulfilled'?'native-publish-a':'native-publish-b';await reviewPublicProfileRevision(f.db,{...review,requestId:winner});
  const published=await getPublicProfileWorkspace(f.db,'seller','owner','owner',13);assert.equal(published.state.version,1);assert.equal(published.state.lastNormalPublicationAt,12);assert.equal(published.state.nextNormalSubmissionAt,12+168*3600000);
  await assert.rejects(f.db.prepare("UPDATE seller_public_profile_revisions SET values_json='{}' WHERE id=?").bind(candidate.candidateId).run(),/immutable/);
  const noop=await savePublicProfileDraft(f.db,{sellerId:'seller',actorId:'owner',baseVersion:1,expectedDraftRevision:draft.revision,values,requestId:'native-noop-draft',now:13});
  assert.deepEqual(await submitPublicProfileRevision(f.db,{sellerId:'seller',actorId:'owner',baseVersion:1,draftRevision:noop.revision,requestId:'native-noop-submit',now:14}),{candidateId:null,noop:true});
  assert.equal((await getPublicProfileWorkspace(f.db,'seller','owner','owner',15)).state.lastNormalPublicationAt,12);
 }finally{await f.dispose();}
});
