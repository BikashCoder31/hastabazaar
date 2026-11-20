import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {giftCardWorkspaceFixture} from './helpers/gift-card-workspace-fixture';
const fixture={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{giftIntentFixture:typeof fixture}).giftIntentFixture=fixture;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.giftIntentFixture.db}}',
 'next/navigation':'export function redirect(path){throw Error(path)}',
 '@/app/auth':'export async function getAuthenticatedUser(){const id=globalThis.giftIntentFixture.actor;return{userId:id,email:id+"@local.hastabazaar.test",fullName:"Fictional current gift actor"}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});
const request=(path:string,actor:string,body:unknown)=>new Request('http://localhost:3018'+path,{method:'POST',headers:{origin:'http://localhost:3018','Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});

void test('old issuer intent cannot create a gift liability as a different currently eligible staff account',async()=>{
 const f=await giftCardWorkspaceFixture();try{fixture.db=f.db;fixture.actor='second-staff';const {POST}=await import('../app/api/admin/gift-cards/route'),before=f.sqlite.prepare('SELECT COUNT(*)n FROM gift_cards').get()?.n;
  const response=await POST(request('/api/admin/gift-cards','reviewer',{amount:'100',requestId:'gift-old-issuer-intent',formVersion:f.issueConfig.version,customAnswers:[]}));assert.equal(response.status,403);assert.equal(f.sqlite.prepare('SELECT COUNT(*)n FROM gift_cards').get()?.n,before);
 }finally{fixture.db=null;f.dispose();}
});
void test('an old buyer gift code cannot be redeemed into another current account wallet',async()=>{
 const f=await giftCardWorkspaceFixture();try{fixture.db=f.db;const issued=await f.issue('gift-original-actor-code');assert.ok(issued.code);fixture.actor='foreign';const {POST}=await import('../app/api/account/gift-cards/route');
  const response=await POST(request('/api/account/gift-cards','customer',{code:issued.code,requestId:'gift-old-buyer-intent',formVersion:f.redeemConfig.version,customAnswers:[]}));assert.equal(response.status,403);assert.equal(f.sqlite.prepare('SELECT redeemed_by actor FROM gift_cards WHERE id=?').get(issued.id)?.actor,null);assert.equal(f.sqlite.prepare("SELECT COUNT(*)n FROM wallet_entries WHERE user_id='foreign' AND kind='gift_card'").get()?.n,0);
 }finally{fixture.db=null;f.dispose();}
});

for(const mode of ['issue','redeem']as const)void test('a native '+mode+' commit with a lost acknowledgement remains explicitly unconfirmed, not a rejected input',async()=>{
 const f=await giftCardWorkspaceFixture();try{fixture.db=f.db;fixture.actor='reviewer';const issued=mode==='redeem'?await f.issue('gift-lost-redemption-source'):null;let lost=false;
  fixture.db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){const result=await f.db.batch(statements);if(!lost){lost=true;throw Error('Fictional native acknowledgement lost AFTER atomic gift commit.');}return result;}}as D1Database;
  const requestId='gift-native-lost-'+mode;let response:Response;
  if(mode==='issue'){const api=await import('../app/api/admin/gift-cards/route');response=await api.POST(request('/api/admin/gift-cards','reviewer',{amount:'100',requestId,formVersion:f.issueConfig.version,customAnswers:[]}));assert.equal(f.sqlite.prepare('SELECT COUNT(*)n FROM gift_cards WHERE issuance_request_id=?').get(requestId)?.n,1);}
  else{assert.ok(issued?.code);fixture.actor='customer';const api=await import('../app/api/account/gift-cards/route');response=await api.POST(request('/api/account/gift-cards','customer',{code:issued.code,requestId,formVersion:f.redeemConfig.version,customAnswers:[]}));assert.equal(f.sqlite.prepare('SELECT COUNT(*)n FROM wallet_entries WHERE gift_card_id=?').get(issued.id)?.n,1);}
  assert.equal(lost,true);assert.equal(response.status,503);const result=await response.json()as{code?:unknown};assert.equal(result.code,'outcome_unconfirmed');
 }finally{fixture.db=null;f.dispose();}
});

for(const mode of ['issue','redeem']as const)void test('native '+mode+' current-role loss at the actual atomic batch returns a scoped403 with no financial or notice writes',async()=>{
 const f=await giftCardWorkspaceFixture();try{fixture.db=f.db;fixture.actor='reviewer';const gift=mode==='redeem'?await f.issue('gift-role-race-original'):null;const originalNotices=f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()?.n;let raced=false;
  fixture.db={prepare:f.db.prepare.bind(f.db),async batch(statements:D1PreparedStatement[]){if(!raced){raced=true;f.sqlite.prepare('DELETE FROM user_roles WHERE user_id=?').run(mode==='issue'?'reviewer':'customer');}return f.db.batch(statements);}}as D1Database;
  const requestId='gift-role-race-'+mode;let response:Response;if(mode==='issue'){const api=await import('../app/api/admin/gift-cards/route');response=await api.POST(request('/api/admin/gift-cards','reviewer',{amount:'100',requestId,formVersion:f.issueConfig.version,customAnswers:[]}));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM gift_cards WHERE issuance_request_id=?').get(requestId)?.n,0);}else{assert.ok(gift?.code);fixture.actor='customer';const api=await import('../app/api/account/gift-cards/route');response=await api.POST(request('/api/account/gift-cards','customer',{code:gift.code,requestId,formVersion:f.redeemConfig.version,customAnswers:[]}));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM wallet_entries WHERE gift_card_id=?').get(gift.id)?.n,0);assert.equal(f.sqlite.prepare('SELECT redeemed_by owner FROM gift_cards WHERE id=?').get(gift.id)?.owner,null);}
  assert.equal(raced,true);assert.equal(response.status,403);assert.equal((await response.json()as{code:string}).code,'outcome_unconfirmed','A post-batch current-access classification must not claim whether a failed transport committed.');assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM notification_messages').get()?.n,originalNotices);
 }finally{fixture.db=null;f.dispose();}
});
