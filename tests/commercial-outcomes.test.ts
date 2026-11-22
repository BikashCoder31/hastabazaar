import assert from 'node:assert/strict';
import test from 'node:test';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {seedIncentiveCustomer} from './helpers/incentive-db';
import {publishForm,NOW,TERMS,ctx} from './helpers/loyalty-fixture';
import {savePromoDraft,publishPromo,pausePromo} from '../lib/db/repositories/promo-codes';
import {saveLoyaltyDraft,publishLoyalty} from '../lib/db/repositories/loyalty';
import {readCommercialOutcome} from '../lib/admin/commercial-outcome';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {getCommonFeeState,publishCommonFeePolicy} from '../lib/commission/coordinated-policy';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';

void test('own original promo and loyalty native receipts recover without private terms and current revoked authority fails',async()=>{
 const f=await incentiveReportDatabase();try{
  await seedIncentiveCustomer(f.db,'super');await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1)").run();
  await publishForm(f.db,'staff.promo-code');await publishForm(f.db,'staff.loyalty-settings');
  await publishForm(f.db,'staff.business-settings-manager');
  const actor={id:'super',authSubject:'super'},context=(requestId:string,expectedVersion:number)=>({actorId:'super',authSubject:'super',requestId,expectedVersion,now:NOW,reason:'Original private fictional reason must stay private.',form:{formId:'staff.promo-code' as const,versionId:'staff.promo-code-v1',answers:{formId:'staff.promo-code' as const,version:1,answers:[]}}});
  const draft=await savePromoDraft(f.db,context('original-commercial-draft',0),{code:'PRIVATECODE',label:'Private original draft',kind:'fixed',fixedPaisa:100,minimumSubtotalPaisa:1000,startsAt:NOW-1,endsAt:NOW+100000,totalUseLimit:10,perCustomerUseLimit:1,budgetPaisa:1000});
  const published=await publishPromo(f.db,context('original-commercial-publish',draft.version),draft.campaignId);await pausePromo(f.db,context('original-commercial-pause',published.version),draft.campaignId);
  for(const attempt of ['original-commercial-draft','original-commercial-publish','original-commercial-pause'])assert.equal((await readCommercialOutcome(f.db,actor,'promo',attempt))?.sourceId,draft.campaignId);
  await saveLoyaltyDraft(f.db,ctx('original-loyalty-draft'),TERMS);await publishLoyalty(f.db,ctx('original-loyalty-publish',2));
  const outcome=await readCommercialOutcome(f.db,actor,'loyalty','original-loyalty-publish');assert.equal(outcome?.sourceId,'default');assert.doesNotMatch(JSON.stringify(outcome),/PRIVATECODE|private fictional|points|budget/i);
  const form={formId:'staff.business-settings-manager',versionId:'staff.business-settings-manager-v1',answers:{formId:'staff.business-settings-manager',version:1,answers:[]}};
  const setting=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:1000},actorId:'super',reason:'Original private customer charge draft reason.',requestId:'original-setting-draft',now:NOW,form});
  assert.equal((await readCommercialOutcome(f.db,actor,'business-setting','original-setting-draft'))?.sourceId,setting.id);
  await publishBusinessSettingDraft(f.db,{id:setting.id,actorId:'super',expectedRevision:setting.revision,effectiveFrom:NOW,reason:'Original reviewed future-facing customer charge publication.',requestId:'original-setting-publish',now:NOW,form});
  assert.equal((await readCommercialOutcome(f.db,actor,'business-setting','original-setting-publish'))?.sourceId,setting.id);
  assert.equal(await readCommercialOutcome(f.db,actor,'promo','unknown-original-reference'),null);
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='super' AND role='super_admin'").run();await assert.rejects(()=>readCommercialOutcome(f.db,actor,'promo','original-commercial-publish'));
 }finally{f.dispose();}
});

void test('actual paired common-fee publication recovers its original policy identity without another publication',async()=>{
 const f=await historicalCommissionDatabase(true);try{
  const now=Date.UTC(2026,10,1),state=await getCommonFeeState(f.database,now),actor={id:'owner',authSubject:'owner'};
  const identity=await f.database.prepare('SELECT auth_subject AS subject FROM users WHERE id=?').bind(actor.id).first<{subject:string}>();actor.authSubject=identity!.subject;
  const saved=await publishCommonFeePolicy(f.database,{actorId:actor.id,requestId:'original-common-publication',expectedRevision:null,now},{expectedContext:state.context,basisPoints:1200,effectiveAt:now+15*86400000,replacesId:null,reason:'Original reviewed fictional paired common fee publication.'});
  const before=f.sqlite.prepare('SELECT COUNT(*) n FROM commission_common_policies').get()!.n;
  assert.equal((await readCommercialOutcome(f.database,actor,'common-fee','original-common-publication'))?.sourceId,saved.id);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM commission_common_policies').get()!.n,before);
 }finally{await f.dispose();}
});
