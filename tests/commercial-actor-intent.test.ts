import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
import {seedIncentiveCustomer} from './helpers/incentive-db';
import {publishForm} from './helpers/loyalty-fixture';
import {isCurrentProgrammeNotice} from '../lib/operations/programme-notice-sources';
import {readFinancialNoticeDestination} from '../lib/operations/financial-notice-destination';
import {createBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {getReferralCampaign,getReferralCampaignForManagement} from '../lib/db/repositories/wallet';
declare global{var commercialIntentDb:D1Database;var commercialIntentAuthority:()=>Promise<{id:string;authSubject:string;role:string}>;}
registerHooks({resolve(specifier,context,next){if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.commercialIntentDb}}',shortCircuit:true};if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(){return globalThis.commercialIntentAuthority()}',shortCircuit:true};return next(specifier,context);}});
void test('a valid old-actor waiver draft cannot be attributed to a newly authenticated Super Admin',async()=>{
 const f=await payoutTransferFixture();try{
  f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('commercial-b','commercial-b','commercial-b@local.hastabazaar.test','Fictional commercial B','active',?,?)").run(f.now,f.now);f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('commercial-b','super_admin',?)").run(f.now);
  globalThis.commercialIntentDb=f.db;globalThis.commercialIntentAuthority=async()=>{const p=await staffMutationGuard(f.db,'commercial-b','commercial_policy.manage',Error);return{id:'commercial-b',authSubject:'commercial-b',role:p.role};};
  const api=await import('../app/api/admin/customer-fee-waivers/route'),origin='https://commercial-intent.test',payload={feeTarget:'customer_service_fee',reason:'PRIVATE independently reviewed original customer-fee campaign.',expectedRevision:0,requestId:'commercial-original-attempt',command:{type:'create',terms:{name:'Original actor private campaign',description:'Fictional private draft',startsAt:f.now+1000,endsAt:f.now+2000}}};
  const post=(actor:string)=>new Request(origin+'/api/admin/customer-fee-waivers',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(payload)});
  assert.equal((await api.POST(post('reviewer'))).status,403);
  for(const [path,method,module] of [
   ['/api/admin/promo-codes','POST',await import('../app/api/admin/promo-codes/route')],
   ['/api/admin/loyalty','POST',await import('../app/api/admin/loyalty/route')],
   ['/api/admin/referrals','PUT',await import('../app/api/admin/referrals/route')],
   ['/api/admin/common-fee-policy','POST',await import('../app/api/admin/common-fee-policy/route')],
   ['/api/admin/business-settings','POST',await import('../app/api/admin/business-settings/route')],
  ] as const){const request=new Request(origin+path,{method,headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:'{}'});assert.equal((await (module as unknown as Record<string,(request:Request)=>Promise<Response>>)[method](request)).status,403,path);}
  const changes=await import('../app/api/admin/business-settings/changes/[id]/route');assert.equal((await changes.POST(new Request(origin+'/api/admin/business-settings/changes/original',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:'{}'}),{params:Promise.resolve({id:'original'})})).status,403);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests').get()!.n,0);
  const {reason:_reason,...withoutReason}=payload;assert.equal((await api.POST(new Request(origin+'/api/admin/customer-fee-waivers',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'commercial-b'},body:JSON.stringify(withoutReason)}))).status,422);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM customer_fee_waiver_requests').get()!.n,0);
  const saved=await api.POST(post('commercial-b'));assert.equal(saved.status,200);const campaign=(await saved.json() as {campaign:{id:string}}).campaign;const recovered=await api.GET(new Request(origin+'/api/admin/customer-fee-waivers?attempt='+payload.requestId,{headers:{'X-Hastabazaar-Actor':'commercial-b'}}));assert.equal(recovered.status,200);assert.equal((await recovered.json() as {outcome:{sourceId:string}}).outcome.sourceId,campaign.id);
 }finally{f.dispose();}
});

void test('actual referral offer changes issue one original staff outcome and exact replay issues none',async()=>{
 const f=await payoutTransferFixture();try{
  await seedIncentiveCustomer(f.db,'super');await publishForm(f.db,'staff.referral-settings');
  globalThis.commercialIntentDb=f.db;globalThis.commercialIntentAuthority=async()=>{const p=await staffMutationGuard(f.db,'reviewer','commercial_policy.manage',Error);return{id:'reviewer',authSubject:'reviewer',role:p.role};};
  const api=await import('../app/api/admin/referrals/route'),origin='https://commercial-intent.test';
  const originalAt=f.sqlite.prepare("SELECT updated_at AS at FROM referral_campaign WHERE id='default'").get()!.at;
  assert.equal(Object.hasOwn(await getReferralCampaign(f.db),'updatedAt'),false,'Checkout/wallet snapshot shape is retained');assert.equal((await getReferralCampaignForManagement(f.db)).updatedAt,originalAt,'Management token comes from that same original native row');
  const input={enabled:true,friendDiscountPaisa:1000,rewardPaisa:500,minimumSubtotalPaisa:5000,returnWindowDays:14,reason:'PRIVATE original reviewed referral evidence.',requestId:'original-referral-operational',formVersion:1,customAnswers:[],expectedUpdatedAt:Number(originalAt)};
  const request=(payload:unknown)=>new Request(origin+'/api/admin/referrals',{method:'PUT',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(payload)});
  const changed=await api.PUT(request(input));assert.equal(changed.status,200,await changed.clone().text());
  const rows=()=>f.sqlite.prepare("SELECT recipient_user_id userId,channel,body_en body FROM notification_messages WHERE related_type='referral_campaign_notice'").all();assert.equal(rows().length,2);assert.doesNotMatch(JSON.stringify(rows()),/PRIVATE|reviewed referral evidence/);
  assert.equal((await api.PUT(request(input))).status,200);assert.equal(rows().length,2);
  const stale=await api.PUT(request({...input,requestId:'stale-referral-review',rewardPaisa:650}));assert.equal(stale.status,409,'An original reviewed source cannot overwrite the newer committed offer.');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='stale-referral-review'").get()!.n,0);
  const notice=f.sqlite.prepare("SELECT template_key template,related_type relatedType,related_id relatedId,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE related_type='referral_campaign_notice' AND channel='email'").get()!;
  assert.equal(await isCurrentProgrammeNotice(f.db,notice as never,Date.now()),true);const destination=await readFinancialNoticeDestination(f.db,{actorId:'reviewer',audience:'staff',type:'referral_campaign_notice',id:'default'});assert.equal(destination?.actionHref,'/admin/referrals?view=settings');
  const currentAt=f.sqlite.prepare("SELECT updated_at AS at FROM referral_campaign WHERE id='default'").get()!.at;assert.equal((await api.PUT(request({...input,expectedUpdatedAt:Number(currentAt),requestId:'next-referral-operational',rewardPaisa:600}))).status,200);assert.equal(await isCurrentProgrammeNotice(f.db,notice as never,Date.now()),false);
 }finally{f.dispose();}
});

void test('same-millisecond referral reviewers advance the native token and stale reviewed input cannot overwrite the winner',async()=>{
 const f=await payoutTransferFixture(),originalNow=Date.now;try{
  await seedIncentiveCustomer(f.db,'super');await seedIncentiveCustomer(f.db,'referral-reviewer-b');await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('referral-reviewer-b','super_admin',1)").run();await publishForm(f.db,'staff.referral-settings');
  let actor='reviewer';globalThis.commercialIntentDb=f.db;globalThis.commercialIntentAuthority=async()=>{const p=await staffMutationGuard(f.db,actor,'commercial_policy.manage',Error);return{id:actor,authSubject:actor,role:p.role};};
  const api=await import('../app/api/admin/referrals/route'),origin='https://commercial-intent.test',fixed=f.now+100000;Date.now=()=>fixed;
  const at=()=>Number(f.sqlite.prepare("SELECT updated_at AS at FROM referral_campaign WHERE id='default'").get()!.at),initialAt=at();
  const base={enabled:true,friendDiscountPaisa:1000,rewardPaisa:500,minimumSubtotalPaisa:5000,returnWindowDays:14,reason:'Original independently reviewed fictional referral source.',formVersion:1,customAnswers:[]};
  const put=(body:unknown)=>api.PUT(new Request(origin+'/api/admin/referrals',{method:'PUT',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)}));
  const first={...base,requestId:'same-ms-first',expectedUpdatedAt:initialAt};assert.equal((await put(first)).status,200);const reviewedAt=at();assert.equal(reviewedAt,fixed);
  actor='referral-reviewer-b';assert.equal((await put({...base,rewardPaisa:600,requestId:'same-ms-winner',expectedUpdatedAt:reviewedAt})).status,200);assert.equal(at(),fixed+1);
  actor='reviewer';assert.equal((await put({...base,rewardPaisa:700,requestId:'same-ms-stale',expectedUpdatedAt:reviewedAt})).status,409);assert.equal(f.sqlite.prepare("SELECT reward_paisa AS reward FROM referral_campaign WHERE id='default'").get()!.reward,600);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='same-ms-stale'").get()!.n,0);
  assert.equal((await put(first)).status,200,'The exact original committed receipt remains replayable after the newer winner.');assert.equal(at(),fixed+1);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='referral.offer.updated'").get()!.n,2);
 }finally{Date.now=originalNow;f.dispose();}
});

void test('matching actor reaches the actual settings change permission gate and publishes the original native draft',async()=>{
 const f=await payoutTransferFixture();try{
  await seedIncentiveCustomer(f.db,'super');await publishForm(f.db,'staff.business-settings-manager');globalThis.commercialIntentDb=f.db;globalThis.commercialIntentAuthority=async()=>{const p=await staffMutationGuard(f.db,'reviewer','commercial_policy.manage',Error);return{id:'reviewer',authSubject:'reviewer',role:p.role};};
  const draft=await createBusinessSettingDraft(f.db,{actorId:'reviewer',key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:700},reason:'Fictional original prospective customer charge draft.',requestId:'settings-api-original-draft',now:f.now});
  const api=await import('../app/api/admin/business-settings/changes/[id]/route'),origin='https://commercial-intent.test',body={action:'publish',sourceFormId:'staff.business-settings-manager',expectedRevision:draft.revision,effectiveFrom:Date.now()+60000,reason:'Publish only the reviewed original source for future orders.',requestId:'settings-api-original-publication',formVersion:1,customAnswers:[]};
  const response=await api.POST(new Request(origin+'/api/admin/business-settings/changes/'+draft.id,{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(body)}),{params:Promise.resolve({id:draft.id})});assert.equal(response.status,200,await response.clone().text());assert.equal(f.sqlite.prepare('SELECT status FROM business_setting_versions WHERE id=?').get(draft.id)!.status,'published');
 }finally{f.dispose();}
});
