import test from 'node:test';
import assert from 'node:assert/strict';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {seedIncentiveCustomer} from './helpers/incentive-db';
import {publishForm,ctx,TERMS,NOW} from './helpers/loyalty-fixture';
import * as promo from '../lib/db/repositories/promo-codes';
import * as loyalty from '../lib/db/repositories/loyalty';
import {processProgrammeDue,isCurrentProgrammeNotice} from '../lib/operations/programme-notice-sources';
import type {PromoMutationContext,PromoTerms} from '../lib/incentives/types';

async function fixture(){const f=await incentiveReportDatabase();assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));await seedIncentiveCustomer(f.db,'super');await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1)").run();await publishForm(f.db,'staff.promo-code');await publishForm(f.db,'staff.loyalty-settings');return f;}
function promoContext(requestId:string,expectedVersion:number):PromoMutationContext{return {actorId:'super',authSubject:'super',requestId,expectedVersion,now:NOW,reason:'Review the original fictional campaign without marketing distribution.',form:{formId:'staff.promo-code',versionId:'staff.promo-code-v1',answers:{formId:'staff.promo-code',version:1,answers:[]}}};}
const terms:PromoTerms={code:'PRIVATECODE',label:'Original internal campaign',kind:'fixed',fixedPaisa:100,minimumSubtotalPaisa:1000,startsAt:NOW-1,endsAt:NOW+3600000,totalUseLimit:20,perCustomerUseLimit:1,budgetPaisa:2000};
function setClock(f:Awaited<ReturnType<typeof fixture>>,now:number){f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));}
function legacyProgrammeMetadataOnly(f:Awaited<ReturnType<typeof fixture>>){f.sqlite.exec("DELETE FROM notification_messages WHERE template_key='business.programme.updated'; DELETE FROM operational_notice_states WHERE family IN('programme.promo','programme.loyalty')");}
const nativeSnapshot=(f:Awaited<ReturnType<typeof fixture>>)=>JSON.stringify(['promo_campaigns','promo_revisions','loyalty_config','loyalty_revisions','audit_logs','wallet_accounts','loyalty_daily_claims'].map(table=>f.sqlite.prepare('SELECT * FROM '+table+' ORDER BY 1').all()));

void test('pre-existing future campaign is baselined without historical mail then expires once at its original deadline',async()=>{
 const f=await fixture();try{
 const draft=await promo.savePromoDraft(f.db,promoContext('t29-promo-draft',0),terms),published=await promo.publishPromo(f.db,promoContext('t29-promo-published',draft.version),draft.campaignId);legacyProgrammeMetadataOnly(f);
 const original=nativeSnapshot(f);setClock(f,NOW);assert.equal(await processProgrammeDue(f.db,'promo',published.campaignId,NOW),0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.programme.updated'").get()!.n,0);
 setClock(f,terms.endsAt);assert.equal(await processProgrammeDue(f.db,'promo',published.campaignId,terms.endsAt),1);assert.equal(await processProgrammeDue(f.db,'promo',published.campaignId,terms.endsAt+1),0);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.programme.updated'").get()!.n,2);assert.equal(nativeSnapshot(f),original,'Only operational metadata/outbox changes, never campaign, audit, price, use or wallet facts.');
 assert.doesNotMatch(JSON.stringify(f.sqlite.prepare("SELECT body_en FROM notification_messages WHERE template_key='business.programme.updated'").all()),/PRIVATECODE/);
 }finally{f.dispose();}
});

void test('already-past programme transition is a retained baseline and never a catch-up alert',async()=>{
 const f=await fixture();try{
 const draft=await promo.savePromoDraft(f.db,promoContext('t29-past-draft',0),terms),published=await promo.publishPromo(f.db,promoContext('t29-past-published',draft.version),draft.campaignId);legacyProgrammeMetadataOnly(f);setClock(f,terms.endsAt+1);
 await processProgrammeDue(f.db,'promo',published.campaignId,terms.endsAt+1);await processProgrammeDue(f.db,'promo',published.campaignId,terms.endsAt+86400000);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.programme.updated'").get()!.n,0);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE milestone='observed_past:expired'").get()!.n,1);
 }finally{f.dispose();}
});

void test('a pause committed after expiry milestone wins the final current-notice marker race',async()=>{
 const f=await fixture();try{
 const draft=await promo.savePromoDraft(f.db,promoContext('t29-race-draft',0),terms),published=await promo.publishPromo(f.db,promoContext('t29-race-publish',draft.version),draft.campaignId);setClock(f,terms.endsAt);
 const original=f.db.batch.bind(f.db);let batches=0,raced=false;
 f.db.batch=(async(statements:D1PreparedStatement[])=>{batches++;if(batches===2){raced=true;await promo.pausePromo(f.db,{...promoContext('t29-race-real-pause',published.version),now:terms.endsAt},published.campaignId);}return original(statements);}) as typeof f.db.batch;
 await processProgrammeDue(f.db,'promo',published.campaignId,terms.endsAt);
 assert.equal(raced,true);assert.equal(f.sqlite.prepare("SELECT current_status FROM operational_notice_states WHERE family='programme.promo' AND source_id=?").get(published.campaignId)!.current_status,'promo_paused');
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.programme.updated' AND subject_en='Published promotion window ended'").get()!.n,0);
 }finally{f.dispose();}
});

void test('pre-existing scheduled loyalty uses existing effective projection and does not publish or credit through reminder dispatch',async()=>{
 const f=await fixture();try{
 await loyalty.saveLoyaltyDraft(f.db,ctx('t29-loyalty-original-draft'),TERMS);await loyalty.publishLoyalty(f.db,ctx('t29-loyalty-original-publish',2));
 const due=NOW+3600000;await loyalty.saveLoyaltyDraft(f.db,ctx('t29-loyalty-future-draft',3),{...TERMS,dailyPoints:15,startsAt:due});await loyalty.publishLoyalty(f.db,ctx('t29-loyalty-future-publish',4));legacyProgrammeMetadataOnly(f);
 setClock(f,NOW);await processProgrammeDue(f.db,'loyalty','default',NOW);const original=nativeSnapshot(f);
 setClock(f,due);assert.equal(await processProgrammeDue(f.db,'loyalty','default',due),1);assert.equal(await processProgrammeDue(f.db,'loyalty','default',due+1),0);assert.equal(nativeSnapshot(f),original);
 assert.equal(f.sqlite.prepare("SELECT current_status FROM operational_notice_states WHERE family='programme.loyalty'").get()!.current_status,'loyalty_effective');
 const notice=f.sqlite.prepare("SELECT template_key template,related_type relatedType,related_id relatedId,recipient_user_id userId,audience_role audience,channel,request_id requestId FROM notification_messages WHERE template_key='business.programme.updated' AND channel='email'").get()!;
 assert.equal(await isCurrentProgrammeNotice(f.db,notice as never,due),true);
 }finally{f.dispose();}
});

