import assert from 'node:assert/strict';
import test from 'node:test';
import {PNG} from 'pngjs';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {activateManagedMakerForSimulation} from '../lib/managed-commerce/activation';
import {getPublicProfileWorkspace,savePublicProfileDraft,submitPublicProfileRevision,reviewPublicProfileRevision,requestPublicProfileCorrection,reviewPublicProfileCorrection} from '../lib/sellers/public-profile';
void test('profile media stays private until exact publication, cannot reference identity files or foreign owners, and retains versions',async()=>{
 const loadedFixtureModule=await import('../lib/sellers/public-profile-media');
 const f=await readyMaker();try{
  const png=new PNG({width:2,height:2});png.data.fill(255);const bytes=new Uint8Array(PNG.sync.write(png));
  const objects=new Map<string,unknown>(),bucket={async put(key:string,value:unknown){objects.set(key,value);return{};}} as unknown as R2Bucket;
  const upload={sellerId:'maker',actorId:'maker-user',kind:'profile_image' as const,file:new File([bytes],'fictional.png',{type:'image/png'}),requestId:'owned-profile-photo',now:f.now+10};
  const id=await loadedFixtureModule.savePublicProfileMedia(f.db,bucket,upload);assert.equal(await loadedFixtureModule.savePublicProfileMedia(f.db,bucket,upload),id);assert.equal(objects.size,1);
  assert.equal(await loadedFixtureModule.getPublishedProfileMedia(f.db,id,f.now+11),null);
  await assert.rejects(loadedFixtureModule.getPrivateProfileMedia(f.db,'maker',id,'foreign','owner'),/account|required|permission/i);
  const view=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+12);
  const draft=await savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:null,baseVersion:0,values:{...view.state.current,media:[{mediaId:id,caption:'A fictional maker at work'}]},requestId:'photo-draft',now:f.now+12});
  const candidate=await submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:draft.revision,baseVersion:0,requestId:'photo-submit',now:f.now+13});
  await reviewPublicProfileRevision(f.db,{candidateId:candidate.candidateId!,actorId:'reviewer',expectedVersion:0,action:'approve_only',reason:'Review the exact fictional media and preserve private approval',requestId:'photo-approve',now:f.now+14});
  assert.equal(await loadedFixtureModule.getPublishedProfileMedia(f.db,id,f.now+15),null);
  await activateManagedMakerForSimulation(f.db,f.activation);
  await reviewPublicProfileRevision(f.db,{candidateId:candidate.candidateId!,actorId:'reviewer',expectedVersion:1,action:'publish',reason:'Explicitly publish this approved photo for the eligible shop',requestId:'photo-publish',now:f.now+16});
  assert.equal((await loadedFixtureModule.getPublishedProfileMedia(f.db,id,f.now+17))?.mimeType,'image/png');
  assert.throws(()=>f.sqlite.prepare('UPDATE seller_profile_media SET object_key=? WHERE id=?').run('private/seller-documents/maker/identity',id),/immutable/);
  const next=await loadedFixtureModule.savePublicProfileMedia(f.db,bucket,{...upload,requestId:'next-profile-photo',now:f.now+18});assert.notEqual(next,id);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_profile_media WHERE seller_id='maker'").get()?.n,2);
  assert.equal(await loadedFixtureModule.getPublishedProfileMedia(f.db,next,f.now+19),null);
  const deadline=(await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+19)).state.nextNormalSubmissionAt;
  const hide=await requestPublicProfileCorrection(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:1,fields:['media'],desired:{media:[]},category:'privacy',reason:'Remove the pictured person while their public consent is checked',requestId:'photo-hide-request',now:f.now+20});
  await reviewPublicProfileCorrection(f.db,{correctionId:hide,actorId:'reviewer',expectedVersion:0,action:'hide',scopeConfirmed:true,reason:'Hide only this public media pending its consent clarification',requestId:'photo-hide',now:f.now+21});
  assert.equal(await loadedFixtureModule.getPublishedProfileMedia(f.db,id,f.now+22),null);assert.equal(objects.size,2);
  const restore=await requestPublicProfileCorrection(f.db,{sellerId:'maker',actorId:'maker-user',baseVersion:2,fields:['media'],desired:{media:[{mediaId:id,caption:'A fictional maker at work'}]},category:'wrong_detail',reason:'The pictured fictional person has supplied the reviewed consent clarification',requestId:'photo-restore-request',now:f.now+23});
  await reviewPublicProfileCorrection(f.db,{correctionId:restore,actorId:'reviewer',expectedVersion:0,action:'apply',scopeConfirmed:true,reason:'Reviewed consent permits restoration of this exact retained photo',requestId:'photo-restore',now:f.now+24});
  assert.equal((await loadedFixtureModule.getPublishedProfileMedia(f.db,id,f.now+25))?.mimeType,'image/png');assert.equal((await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+25)).state.nextNormalSubmissionAt,deadline);
 }finally{f.dispose();}
});
