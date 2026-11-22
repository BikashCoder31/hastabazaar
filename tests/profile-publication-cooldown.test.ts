import assert from 'node:assert/strict';
import test from 'node:test';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {activateManagedMakerForSimulation} from '../lib/managed-commerce/activation';
import {reviewProduct} from '../lib/db/repositories/products';
import {getPublicMakerProfile,listPublishedProductsByMaker} from '../lib/db/repositories/customers';
import {listPublishedProducts} from '../lib/db/repositories/catalog';
import {getPublishedProductBySlug} from '../lib/db/repositories/products';
import {addCartItem} from '../lib/db/repositories/cart';
import {listSellerReviewTasks} from '../lib/workflows/review-tasks';
import {listNotifications} from '../lib/db/repositories/operations';

type Profile={publicName:string;publicCity:string;about:string;specialties:string;craftExperience:unknown[];socialLinks:Record<string,string>;media:unknown[]};
type Command={sellerId:string;actorId:string;requestId:string;now:number};
type Workspace={state:{version:number;current:Profile;nextNormalSubmissionAt:number};draft:{revision:string;values:Profile}|null;candidate:{id:string;caseId:string;version:number;status:string;firstSubmittedAt:number}|null};
interface Workflow{
  getPublicProfileWorkspace(db:D1Database,sellerId:string,actorId:string,audience:'owner'|'staff',now:number):Promise<Workspace>;
  savePublicProfileDraft(db:D1Database,input:Command&{expectedDraftRevision:string|null;baseVersion:number;values:Profile}):Promise<{revision:string}>;
  submitPublicProfileRevision(db:D1Database,input:Command&{draftRevision:string;baseVersion:number}):Promise<{candidateId:string|null;noop:boolean}>;
  reviewPublicProfileRevision(db:D1Database,input:{candidateId:string;actorId:string;expectedVersion:number;action:'approve_only'|'approve_publish'|'publish'|'request_changes'|'reject';reason:string;requestId:string;now:number}):Promise<void>;
  requestPublicProfileCorrection(db:D1Database,input:Command&{baseVersion:number;fields:readonly string[];desired:Partial<Profile>;category:string;reason:string}):Promise<string>;
  reviewPublicProfileCorrection(db:D1Database,input:{correctionId:string;actorId:string;expectedVersion:number;action:'apply'|'hide'|'decline'|'clarify';scopeConfirmed:boolean;reason:string;requestId:string;now:number;nextUpdateAt?:number}):Promise<void>;
  requestStaffPublicProfileCorrection(db:D1Database,input:Command&{baseVersion:number;fields:readonly string[];reason:string;nextUpdateAt:number}):Promise<string>;
  respondPublicProfileCorrection(db:D1Database,input:Command&{correctionId:string;expectedVersion:number;baseVersion:number;desired:Partial<Profile>;reason:string}):Promise<void>;
  withdrawPublicProfileRevision(db:D1Database,input:Command&{candidateId:string;expectedVersion:number;reason:string}):Promise<void>;
}
async function workflow(){const loadedFixtureModule=await import('../lib/sellers/public-profile');
  assert.equal(typeof Reflect.get(loadedFixtureModule,'savePublicProfileDraft'),'function','The approved private-draft and reviewed-publication workflow must exist');
  return loadedFixtureModule as unknown as Workflow;
}

void test('first draft and approval remain private across eligibility changes until explicit publication starts 168 hours',async()=>{
  const w=await workflow(),f=await readyMaker();try{
    const original=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now);
    const values={...original.state.current,publicName:'Fictional Reviewed Studio',publicCity:'Bhaktapur',about:'An explicitly reviewed public story.'};
    const draft=await w.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:null,baseVersion:original.state.version,values,requestId:'first-profile-draft',now:f.now+10});
    let view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+11);
    assert.equal(view.state.current.publicName,original.state.current.publicName);assert.equal(view.state.nextNormalSubmissionAt,0);
    const submitted=await w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:draft.revision,baseVersion:original.state.version,requestId:'first-profile-submit',now:f.now+12});
    assert.ok(submitted.candidateId);
    await w.reviewPublicProfileRevision(f.db,{candidateId:submitted.candidateId,actorId:'reviewer',expectedVersion:0,action:'approve_only',reason:'Presentation checked; publication remains an explicit later action',requestId:'first-profile-approve-only',now:f.now+13});
    await activateManagedMakerForSimulation(f.db,{...f.activation,now:f.now+14});
    await reviewProduct(f.db,{productId:'cup',actorId:'reviewer',action:'publish',reason:'Publish the eligible fictional listing independently of the private profile',requestId:'first-product-public',now:f.now+15});
    view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+16);
    assert.equal(view.candidate?.status,'approved');assert.equal(view.state.nextNormalSubmissionAt,0);
    assert.equal((await getPublicMakerProfile(f.db,'maker'))?.tradingName,original.state.current.publicName);
    const publication={candidateId:submitted.candidateId,actorId:'reviewer',expectedVersion:1,action:'publish' as const,reason:'Explicitly publish this exact reviewed profile now the shop is eligible',requestId:'first-profile-publish',now:f.now+17};
    await w.reviewPublicProfileRevision(f.db,publication);await w.reviewPublicProfileRevision(f.db,publication);
    view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+18);
    assert.equal(view.state.current.publicName,values.publicName);assert.equal(view.state.nextNormalSubmissionAt,publication.now+168*60*60_000);
    assert.equal((await getPublicMakerProfile(f.db,'maker'))?.tradingName,values.publicName);
    assert.equal((await listPublishedProductsByMaker(f.db,'maker'))[0]?.tradingName,values.publicName);
    assert.equal((await listPublishedProducts(f.db))[0]?.sellerName,values.publicName);
    assert.equal((await getPublishedProductBySlug(f.db,'fictional-cup'))?.tradingName,values.publicName);
    // This fixture enables simulation only. Public presentation must not create live order authority.
    await assert.rejects(addCartItem(f.db,'public-profile-fixture-cart','cup',1,publication.now+1),/not currently accepting orders/);
    const next=await w.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:view.draft?.revision??null,baseVersion:view.state.version,values:{...values,about:'Prepare the next private story during the active cooldown.'},requestId:'next-private-draft',now:publication.now+1});
    await assert.rejects(w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:next.revision,baseVersion:view.state.version,requestId:'too-early-submit',now:view.state.nextNormalSubmissionAt-1}),/168|cooldown|normal submission/i);
    const boundary=await w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:next.revision,baseVersion:view.state.version,requestId:'boundary-submit',now:view.state.nextNormalSubmissionAt});assert.ok(boundary.candidateId);
    assert.equal((await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',view.state.nextNormalSubmissionAt)).state.nextNormalSubmissionAt,view.state.nextNormalSubmissionAt);
  }finally{f.dispose();}
});

void test('an exact urgent city correction retains the ordinary deadline and unrelated private draft',async()=>{
  const w=await workflow();assert.equal(typeof w.requestPublicProfileCorrection,'function','Scoped urgent corrections must not reset or unlock the whole profile');
  const f=await readyMaker();try{
    await activateManagedMakerForSimulation(f.db,f.activation);await reviewProduct(f.db,{productId:'cup',actorId:'reviewer',action:'publish',reason:'Publish the independently reviewed fixture product',requestId:'correction-product',now:f.now+4});
    let view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+5);
    const draft=await w.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:null,baseVersion:0,values:{...view.state.current,about:'The first reviewed story.'},requestId:'correction-first-draft',now:f.now+5});
    const submitted=await w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:draft.revision,baseVersion:0,requestId:'correction-first-submit',now:f.now+6});
    await w.reviewPublicProfileRevision(f.db,{candidateId:submitted.candidateId!,actorId:'reviewer',expectedVersion:0,action:'approve_publish',reason:'Explicit first publication after complete presentation review',requestId:'correction-first-publish',now:f.now+7});
    view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+8);const deadline=view.state.nextNormalSubmissionAt;
    await w.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:view.draft!.revision,baseVersion:view.state.version,values:{...view.state.current,about:'Keep this separate next story private.'},requestId:'correction-next-draft',now:f.now+8});
    const request={sellerId:'maker',actorId:'maker-user',baseVersion:view.state.version,fields:['publicCity'],desired:{publicCity:'Patan'},category:'location_correction',reason:'A genuine move requires this exact public city correction',requestId:'correct-city',now:f.now+9};
    await assert.rejects(w.requestPublicProfileCorrection(f.db,{...request,desired:{publicCity:'Patan',publicName:'Unrelated new branding'}}));
    const correctionId=await w.requestPublicProfileCorrection(f.db,request);
    const decision={correctionId,actorId:'reviewer',expectedVersion:0,action:'apply' as const,scopeConfirmed:true,reason:'The move is confirmed; change only the requested public city',requestId:'apply-city',now:f.now+10};
    await w.reviewPublicProfileCorrection(f.db,decision);await w.reviewPublicProfileCorrection(f.db,decision);
    const corrected=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+11);
    assert.equal(corrected.state.current.publicCity,'Patan');assert.equal(corrected.state.current.about,'The first reviewed story.');assert.equal(corrected.state.nextNormalSubmissionAt,deadline);
    assert.equal(corrected.draft?.values.about,'Keep this separate next story private.');
    await assert.rejects(w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:corrected.draft!.revision,baseVersion:view.state.version,requestId:'stale-after-city',now:deadline}),/compare|current/i);
    f.sqlite.prepare("UPDATE seller_profiles SET municipality='Private operational move',support_email='public-support@local.hastabazaar.test' WHERE id='maker'").run();
    assert.equal((await getPublicMakerProfile(f.db,'maker'))?.publicCity,'Patan');
  }finally{f.dispose();}
});

void test('same-millisecond replacement keeps the frozen history, original case age and the actual latest candidate',async(t)=>{
  const w=await workflow(),f=await readyMaker();try{
    let serial=999999;t.mock.method(globalThis.crypto,'randomUUID',()=>`ffffffff-ffff-4fff-8fff-${String(serial--).padStart(12,'0')}`);
    const now=f.now+10,original=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',now),proposed={...original.state.current,about:'Original frozen proposal.'};
    const firstDraft=await w.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:null,baseVersion:0,values:proposed,requestId:'same-time-draft',now});
    const first=await w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:firstDraft.revision,baseVersion:0,requestId:'same-time-submit',now});
    await w.reviewPublicProfileRevision(f.db,{candidateId:first.candidateId!,actorId:'reviewer',expectedVersion:0,action:'request_changes',reason:'Clarify the public story without changing the original case age',requestId:'same-time-clarify',now});
    const nextDraft=await w.savePublicProfileDraft(f.db,{sellerId:'maker',actorId:'maker-user',expectedDraftRevision:firstDraft.revision,baseVersion:0,values:{...proposed,about:'Corrected proposed public story.'},requestId:'same-time-correction',now});
    const next=await w.submitPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',draftRevision:nextDraft.revision,baseVersion:0,requestId:'same-time-resubmit',now});
    const view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',now);
    assert.equal(view.candidate?.id,next.candidateId);assert.equal(view.candidate?.caseId,first.candidateId);assert.equal(view.candidate?.firstSubmittedAt,now);
    assert.equal(JSON.parse(String(f.sqlite.prepare('SELECT values_json FROM seller_public_profile_revisions WHERE id=?').get(first.candidateId!)?.values_json)).about,proposed.about);
    const tasks=(await listSellerReviewTasks(f.db,'maker-user')).filter(task=>String(task.sourceType)==='public_profile');
    assert.equal(tasks.length,1);assert.equal(tasks[0].startedAt,now);assert.equal(tasks[0].dueAt,now+24*60*60_000);
    const notices=(await listNotifications(f.db,'maker-user',100,'seller')).filter(item=>item.relatedType==='seller_public_profile');
    assert.equal(notices.length,1,'Only the current normal-profile outcome is actionable');
    await w.withdrawPublicProfileRevision(f.db,{sellerId:'maker',actorId:'maker-user',candidateId:next.candidateId!,expectedVersion:0,reason:'Withdraw only the proposed replacement, preserving the current public version',requestId:'same-time-withdraw',now});
    assert.equal((await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',now)).state.nextNormalSubmissionAt,0);
  }finally{f.dispose();}
});

void test('staff requests authorize only frozen correction scope and preserve clarification history and stale-review recovery',async()=>{
  const w=await workflow();assert.equal(typeof w.requestStaffPublicProfileCorrection,'function');
  const f=await readyMaker();try{
    await activateManagedMakerForSimulation(f.db,f.activation);
    const input={sellerId:'maker',actorId:'reviewer',baseVersion:0,fields:['publicCity'],reason:'Confirm the actual public city after the reported factual error',nextUpdateAt:f.now+60_000,requestId:'staff-city-request',now:f.now+10};
    const id=await w.requestStaffPublicProfileCorrection(f.db,input);assert.equal(await w.requestStaffPublicProfileCorrection(f.db,input),id);
    const answer={sellerId:'maker',actorId:'maker-user',correctionId:id,expectedVersion:0,baseVersion:0,desired:{publicCity:'Lalitpur'},reason:'The correct publicly listed city is Lalitpur',requestId:'staff-city-response',now:f.now+11};
    await assert.rejects(w.respondPublicProfileCorrection(f.db,{...answer,desired:{...answer.desired,publicName:'Unrelated branding change'}}),/exact|scope/i);
    await w.respondPublicProfileCorrection(f.db,answer);await w.respondPublicProfileCorrection(f.db,answer);
    const decision={correctionId:id,actorId:'reviewer',expectedVersion:0,action:'apply' as const,scopeConfirmed:true,reason:'The exact factual city correction has now been checked',requestId:'staff-city-apply',now:f.now+12};
    await assert.rejects(w.reviewPublicProfileCorrection(f.db,decision),/changed|current/i);
    await w.reviewPublicProfileCorrection(f.db,{...decision,expectedVersion:1,requestId:'staff-city-apply-current'});
    const view=await w.getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+13);assert.equal(view.state.current.publicCity,'Lalitpur');assert.equal(view.state.nextNormalSubmissionAt,0);
    const record=f.sqlite.prepare('SELECT requested_at,reason,fields_json FROM seller_public_profile_corrections WHERE id=?').get(id)!;
    assert.equal(record.requested_at,input.now);assert.equal(record.reason,input.reason);assert.equal(record.fields_json,'["publicCity"]');
    await assert.rejects(w.respondPublicProfileCorrection(f.db,{...answer,expectedVersion:2,requestId:'reuse-applied-scope',desired:{publicCity:'Pokhara'}}));
  }finally{f.dispose();}
});
