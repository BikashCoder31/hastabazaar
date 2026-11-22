import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {publishedLiveMakerFixture} from './helpers/live-maker-offer-fixture';
import {addReviewedLiveClearance} from './helpers/live-clearance-fixture';
declare global{var managedLiveApiDb:D1Database;var managedLiveApiBucket:R2Bucket;var managedLiveApiActor:string;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return {url:'data:text/javascript,export const env={get DB(){return globalThis.managedLiveApiDb},get MEDIA(){return globalThis.managedLiveApiBucket}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return {url:'data:text/javascript,export class StaffAuthorizationError extends Error{status=403};export async function requireStaffApi(){return {id:globalThis.managedLiveApiActor}}',shortCircuit:true};
 return next(specifier,context);
}});

void test('protected live API checks actor/origin/exact context and recovers one genuine activation',async()=>{
 const f=await publishedLiveMakerFixture();try{
  globalThis.managedLiveApiDb=f.db;globalThis.managedLiveApiBucket=f.bucket;globalThis.managedLiveApiActor='reviewer';
  const clearance=await addReviewedLiveClearance(f,'live-api');
  const api=await import('../app/api/admin/managed-makers/[id]/live/route'),context={params:Promise.resolve({id:f.sellerId})},url='https://managed-live.test/api/admin/managed-makers/'+f.sellerId+'/live';
  const response=await api.GET(new Request(url),context);assert.equal(response.status,200);
  const {review}=await response.json() as {review:{readinessDigest:string;participationVersion:number;readyForActivation:boolean}};assert.equal(review.readyForActivation,true);
  const body={sourceFormId:'system.managed-live-activation',action:'activate',requestId:'live-api-activation',expectedRevision:String(review.participationVersion),input:{readinessDigest:review.readinessDigest,clearanceId:clearance.clearanceId,reason:'Enable only this actual independently cleared fictional commercial scope.'}};
  const send=(payload:unknown,origin='https://managed-live.test')=>api.POST(new Request(url,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(payload)}),context);
  assert.equal((await send(body,'https://foreign.test')).status,403);
  assert.equal((await send({...body,input:{...body.input,sellerId:'another-maker'}})).status,400);
  globalThis.managedLiveApiActor=f.ownerId;assert.equal((await send(body)).status,403);
  globalThis.managedLiveApiActor='reviewer';const saved=await send(body);assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json();
  assert.deepEqual(await (await send(body)).json(),result);
  assert.equal((await send({...body,input:{...body.input,reason:'Different later review content cannot reuse the original activation reference.'}})).status,409);
  const recovered=await api.GET(new Request(url+'?attempt='+body.requestId),context);assert.equal(recovered.status,200);assert.deepEqual((await recovered.json() as {outcome:unknown}).outcome,result);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_live_activation_decisions WHERE seller_id=?').get(f.sellerId)!.n,1);
  f.sqlite.exec("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'");
  assert.equal((await api.GET(new Request(url+'?attempt='+body.requestId),context)).status,403);
 }finally{f.dispose();}
});

void test('private live evidence upload recovers its retained file and rejects cross-seller download',async()=>{
 const f=await publishedLiveMakerFixture();try{
  globalThis.managedLiveApiDb=f.db;globalThis.managedLiveApiBucket=f.bucket;globalThis.managedLiveApiActor='reviewer';
  const {getManagedClearanceScope}=await import('../lib/managed-commerce/live-clearance');
  const scope=await getManagedClearanceScope(f.db,f.sellerId,Date.now()),api=await import('../app/api/admin/managed-makers/[id]/live-evidence/route'),context={params:Promise.resolve({id:f.sellerId})},url='https://managed-live.test/api/admin/managed-makers/'+f.sellerId+'/live-evidence';
  const upload=(includeFile:boolean)=>{const body=new FormData();body.set('requestId','live-api-private-file');body.set('materialScopeDigest',scope.materialScopeDigest);if(includeFile)body.set('file',f.externalFile());return api.POST(new Request(url,{method:'POST',headers:{origin:'https://managed-live.test'},body}),context);};
  const saved=await upload(true);assert.equal(saved.status,200,await saved.clone().text());const result=await saved.json() as {id:string};
  const recovered=await upload(false);assert.equal(recovered.status,200);assert.equal((await recovered.json() as {id:string}).id,result.id);
  const read=await api.GET(new Request(url+'?file='+result.id),context);assert.equal(read.status,200);assert.match(read.headers.get('Cache-Control')!,/private, no-store/);assert.match(read.headers.get('Content-Security-Policy')!,/sandbox/);
  assert.equal((await api.GET(new Request(url+'?file='+result.id),{params:Promise.resolve({id:'another-maker'})})).status,404);
  globalThis.managedLiveApiActor=f.ownerId;assert.equal((await api.GET(new Request(url+'?file='+result.id),context)).status,403);
 }finally{f.dispose();}
});
