import assert from 'node:assert/strict';
import test from 'node:test';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {activateManagedMakerForSimulation} from '../lib/managed-commerce/activation';
import {getPublicProfileWorkspace,savePublicProfileDraft,submitPublicProfileRevision,reviewPublicProfileRevision} from '../lib/sellers/public-profile';
for(const boundary of ['role','owner','restriction'] as const)void test(`profile publication rechecks ${boundary} at the transaction boundary`,async()=>{
 const f=await readyMaker();try{
  await activateManagedMakerForSimulation(f.db,f.activation);
  const current=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now);
  const draft=await savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:0,expectedDraftRevision:null,values:{...current.state.current,about:'A private proposal before the authority race.'},requestId:'race-draft',now:f.now+10});
  const candidate=await submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:0,draftRevision:draft.revision,requestId:'race-submit',now:f.now+11});
  let injected=false;const db=new Proxy(f.db,{get(target,key){if(key==='batch')return async(statements:D1PreparedStatement[])=>{
   if(!injected){injected=true;if(boundary==='role')f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
    else if(boundary==='owner')f.sqlite.prepare("UPDATE seller_profiles SET user_id='reviewer' WHERE id='maker'").run();
    else f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='maker-user'").run();}
   return target.batch(statements);
  };const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
  await assert.rejects(reviewPublicProfileRevision(db,{candidateId:candidate.candidateId!,actorId:'reviewer',expectedVersion:0,action:'approve_publish',reason:'Attempt publication against the now-revoked current authority',requestId:'race-review',now:f.now+12}));
  assert.equal(injected,true);assert.equal(f.sqlite.prepare("SELECT last_normal_publication_at FROM seller_public_profile_states WHERE seller_id='maker'").get()?.last_normal_publication_at,null);
  assert.equal(f.sqlite.prepare('SELECT status FROM seller_public_profile_revisions WHERE id=?').get(candidate.candidateId!)?.status,'submitted');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_public_profile_events WHERE action='published'").get()?.n,0);
 }finally{f.dispose();}
});
