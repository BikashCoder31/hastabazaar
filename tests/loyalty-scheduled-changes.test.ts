import assert from 'node:assert/strict';
import test from 'node:test';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {seedIncentiveCustomer} from './helpers/incentive-db';
import {publishForm,ctx,claim,TERMS,beforeBatch} from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';
import {getLoyaltyAdminReport} from '../lib/db/repositories/incentive-reporting';
const boundary=Date.parse('2026-09-29T00:00:00+05:45');
const weekly={...TERMS,dailyPoints:5,weeklyPoints:[5,7,9,10,11,13,15],graceEnabled:false,startsAt:boundary};
async function fixture(){
  const f=await incentiveReportDatabase();
  for(const id of ['super','customer','other'])await seedIncentiveCustomer(f.db,id);
  await f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1)").run();
  await publishForm(f.db,'staff.loyalty-settings');await publishForm(f.db,'account.daily-reward');await publishForm(f.db,'account.points-redemption');
  await loyalty.saveLoyaltyDraft(f.db,ctx('initial-draft'),TERMS);await loyalty.publishLoyalty(f.db,ctx('initial-publication',2));
  return f;
}
void test('current rewards continue until the scheduled Nepal boundary with a read-only reserved version',async()=>{
  const f=await fixture();
  try {
    await loyalty.saveLoyaltyDraft(f.db,ctx('future-weekly-draft',3),weekly);
    const scheduled=await loyalty.publishLoyalty(f.db,ctx('future-weekly-publication',4));
    assert.equal(scheduled.publishedRevision,1);
    assert.equal(scheduled.scheduledRevision,2);
    assert.equal(scheduled.scheduledFor,boundary);
    assert.equal(scheduled.terms.dailyPoints,10);
    const before=await loyalty.claimDailyPoints(f.db,claim('last-old-day',5,'customer',boundary-1));assert.equal(before.awardedPoints,10);
    const stored=JSON.stringify(f.sqlite.prepare('SELECT * FROM loyalty_config').all());const audits=f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n;
    const due=await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer');
    assert.equal(due.state.revision,2);assert.equal(due.state.version,6);assert.equal(due.state.dailyPoints,5);
    const report=await getLoyaltyAdminReport(f.db,{id:'super',authSubject:'super'},{},boundary);
    assert.equal(report.liveTerms.revision,2);assert.deepEqual(report.liveTerms.weeklyPoints,weekly.weeklyPoints);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM loyalty_config').all()),stored);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM audit_logs').get()?.n,audits);
    await assert.rejects(loyalty.claimDailyPoints(f.db,claim('stale-at-boundary',5,'customer',boundary)),{code:'stale'});
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM loyalty_config').all()),stored);
    const first=await loyalty.claimDailyPoints(f.db,claim('first-new-day',6,'customer',boundary));assert.equal(first.awardedPoints,5);
    assert.deepEqual(await loyalty.claimDailyPoints(f.db,claim('last-old-day',5,'customer',boundary+1)),before);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='loyalty-schedule-activate:2'").get()?.n,1);
    assert.equal(f.sqlite.prepare('SELECT current_revision FROM loyalty_config').get()?.current_revision,2);
  }finally{f.dispose();}
});
async function schedule(f:Awaited<ReturnType<typeof fixture>>,terms=weekly){await loyalty.saveLoyaltyDraft(f.db,ctx('scheduled-draft',3),terms);return loyalty.publishLoyalty(f.db,ctx('scheduled-publication',4));}
void test('pause after scheduling overrides activation and saving a draft preserves current and pending rules',async()=>{
  const f=await fixture();
  try {
    await schedule(f);
    const draft=await loyalty.saveLoyaltyDraft(f.db,ctx('another-draft',5),{...TERMS,dailyPoints:12});
    assert.equal(draft.draftRevision,3);assert.equal(draft.publishedRevision,1);assert.equal(draft.scheduledRevision,2);
    await assert.rejects(loyalty.publishLoyalty(f.db,ctx('pending-conflict',6)),{code:'conflict'});
    const paused=await loyalty.pauseLoyalty(f.db,ctx('deliberate-later-pause',6));assert.equal(paused.scheduledUnpause,false);
    const due=await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer');assert.equal(due.state.revision,2);assert.equal(due.state.version,8);assert.equal(due.state.paused,true);
    await assert.rejects(loyalty.claimDailyPoints(f.db,claim('no-forced-unpause',8,'customer',boundary)),{code:'unavailable'});
    assert.equal(f.sqlite.prepare('SELECT current_revision FROM loyalty_config').get()?.current_revision,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM loyalty_daily_claims').get()?.n,0);
  }finally{f.dispose();}
});
void test('cancel pending publication preserves current rules and immutable revision history',async()=>{
  const f=await fixture();
  try {
    await schedule(f);const revisions=JSON.stringify(f.sqlite.prepare('SELECT * FROM loyalty_revisions ORDER BY revision').all());
    const cancelled=await loyalty.cancelScheduledLoyalty(f.db,ctx('cancel-future',5));assert.equal(cancelled.scheduledRevision,null);assert.equal(cancelled.publishedRevision,1);assert.equal(cancelled.paused,false);
    assert.equal(JSON.stringify(f.sqlite.prepare('SELECT * FROM loyalty_revisions ORDER BY revision').all()),revisions);
    assert.deepEqual(await loyalty.cancelScheduledLoyalty(f.db,ctx('cancel-future',5)),cancelled);
    await assert.rejects(loyalty.cancelScheduledLoyalty(f.db,ctx('cancel-again',6)),{code:'conflict'});
    assert.equal((await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer')).state.revision,1);
  }finally{f.dispose();}
});
void test('due incompatible shared limits stop earning and allow an audited cancellation',async()=>{
  const f=await fixture();
  try {
    await schedule(f,{...weekly,dailyBudgetPoints:15,lifetimeBudgetPoints:100});
    await loyalty.claimDailyPoints(f.db,claim('old-customer-award',5,'customer',boundary-1));
    await loyalty.claimDailyPoints(f.db,claim('old-other-award',5,'other',boundary-1));
    const due=await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer');assert.equal(due.state.status,'review_required');assert.equal(due.state.version,5);
    const state=await loyalty.getLoyaltyState(f.db,'super',boundary,'super');assert.match(state.scheduleBlockedReason!,/limits.*issued/);
    await assert.rejects(loyalty.claimDailyPoints(f.db,claim('blocked-new-award',5,'customer',boundary)),{code:'unavailable'});
    assert.equal(f.sqlite.prepare('SELECT issued_points FROM loyalty_config').get()?.issued_points,20);
    await loyalty.cancelScheduledLoyalty(f.db,{...ctx('cancel-blocked',5),now:boundary});
    assert.equal((await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer')).state.status,'active');
  }finally{f.dispose();}
});
void test('a conversion locked after scheduling stops the due change while preserving redemption',async()=>{
  const f=await fixture();
  try {
    await loyalty.saveLoyaltyDraft(f.db,ctx('larger-current-draft',3),{...TERMS,dailyPoints:100});await loyalty.publishLoyalty(f.db,ctx('larger-current-publish',4));
    await loyalty.saveLoyaltyDraft(f.db,ctx('different-future-conversion',5),{...weekly,pointsPerBlock:200});await loyalty.publishLoyalty(f.db,ctx('schedule-conversion',6));
    await loyalty.claimDailyPoints(f.db,claim('lock-current-conversion',7,'customer',boundary-1));
    const due=await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer');assert.equal(due.state.status,'review_required');assert.equal(due.state.pointsPerBlock,100);
    const result=await loyalty.redeemPoints(f.db,{...claim('redeem-old-points',7,'customer',boundary),points:100,formVersionId:'account.points-redemption-v1'});
    assert.equal(result.creditPaisa,1000);assert.equal(result.balancePoints,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM loyalty_daily_claims').get()?.n,1);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='loyalty.schedule_activated'").get()?.n,0);
  }finally{f.dispose();}
});
void test('a rejected claim rolls due promotion back with every financial write',async()=>{
  for(const race of ['form','role','cancellation'] as const){
    const f=await fixture();
    try {
      await schedule(f);const config=f.sqlite.prepare('SELECT * FROM loyalty_config').get();
      const raced=beforeBatch(f.db,async()=>{
        if(race==='form')await publishForm(f.db,'account.daily-reward',2);
        if(race==='role')await f.db.prepare("DELETE FROM user_roles WHERE user_id='customer' AND role='customer'").run();
        if(race==='cancellation')await loyalty.cancelScheduledLoyalty(f.db,{...ctx('concurrent-cancellation',5),now:boundary-1});
      });
      await assert.rejects(loyalty.claimDailyPoints(raced,claim('racing-due-claim',6,'customer',boundary)));
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM loyalty_daily_claims').get()?.n,0,race);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM loyalty_points_entries').get()?.n,0,race);
      assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE action='loyalty.schedule_activated'").get()?.n,0,race);
      if(race!=='cancellation')assert.deepEqual(f.sqlite.prepare('SELECT * FROM loyalty_config').get(),config,race);
    }finally{f.dispose();}
  }
});
void test('an effective valid schedule cannot be cancelled and paused scheduling does not resume current earning early',async()=>{
  const f=await fixture();
  try {
    await loyalty.pauseLoyalty(f.db,ctx('pause-before-scheduling',3));
    await loyalty.saveLoyaltyDraft(f.db,ctx('paused-future-draft',4),weekly);const scheduled=await loyalty.publishLoyalty(f.db,ctx('paused-future-publication',5));
    assert.equal(scheduled.paused,true);assert.equal(scheduled.scheduledUnpause,true);
    assert.equal((await loyalty.getRewards(f.db,'customer',boundary-1,undefined,20,'customer')).state.status,'paused');
    await assert.rejects(loyalty.cancelScheduledLoyalty(f.db,{...ctx('cancel-effective-rules',7),now:boundary}),{code:'conflict'});
    assert.equal(f.sqlite.prepare('SELECT current_revision FROM loyalty_config').get()?.current_revision,1,'Rejected cancellation does not persist a promotion');
    const due=await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer');assert.equal(due.state.version,7);assert.equal(due.state.status,'active');
    assert.equal((await loyalty.claimDailyPoints(f.db,claim('deliberate-scheduled-start',7,'customer',boundary))).awardedPoints,5);
  }finally{f.dispose();}
});
void test('publication refuses a draft whose shared limits became too small before scheduling',async()=>{
  const f=await fixture();
  try {
    await loyalty.saveLoyaltyDraft(f.db,ctx('small-future-draft',3),{...weekly,dailyBudgetPoints:15,lifetimeBudgetPoints:100});
    await loyalty.claimDailyPoints(f.db,claim('consume-before-publication-one',4,'customer',boundary-1));
    await loyalty.claimDailyPoints(f.db,claim('consume-before-publication-two',4,'other',boundary-1));
    await assert.rejects(loyalty.publishLoyalty(f.db,{...ctx('reject-already-small-schedule',4),now:boundary-1}),{code:'invalid'});
    assert.equal(f.sqlite.prepare('SELECT scheduled_revision FROM loyalty_config').get()?.scheduled_revision,null);
  }finally{f.dispose();}
});
void test('the native claim guard blocks obsolete current-rule awards after a scheduled start',async()=>{
  const f=await fixture();
  try {
    await schedule(f);f.sqlite.exec("INSERT INTO loyalty_accounts(user_id,created_at) VALUES('customer',1)");
    const result={claimId:'obsolete-direct-claim',localDate:'2026-09-29',awardedPoints:10,balancePoints:10};
    assert.throws(()=>f.sqlite.prepare(`INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at)
      VALUES('obsolete-direct-claim','customer','customer','obsolete-direct-request',?,1,'2026-09-29',10,?,'account.daily-reward-v1',?)`).run('a'.repeat(64),JSON.stringify(result),boundary),/scheduled_rules_due/);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM loyalty_points_entries').get()?.n,0);
  }finally{f.dispose();}
});
void test('a scheduled replacement and its cancellation never extend expired current rules',async()=>{
  const f=await fixture();
  try {
    const now=Date.parse('2026-09-28T12:00:00Z');
    await loyalty.saveLoyaltyDraft(f.db,ctx('short-current-draft',3),{...TERMS,endsAt:now+1000});await loyalty.publishLoyalty(f.db,ctx('short-current-publication',4));
    await loyalty.saveLoyaltyDraft(f.db,ctx('later-small-draft',5),{...weekly,dailyBudgetPoints:15,lifetimeBudgetPoints:100});await loyalty.publishLoyalty(f.db,ctx('later-small-publication',6));
    await loyalty.claimDailyPoints(f.db,claim('short-current-one',7,'customer',now+500));await loyalty.claimDailyPoints(f.db,claim('short-current-two',7,'other',now+500));
    assert.equal((await loyalty.getRewards(f.db,'customer',now+1000,undefined,20,'customer')).state.status,'expired');
    assert.equal((await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer')).state.status,'review_required');
    await loyalty.cancelScheduledLoyalty(f.db,{...ctx('cancel-expired-blocked-replacement',7),now:boundary});
    assert.equal((await loyalty.getRewards(f.db,'customer',boundary,undefined,20,'customer')).state.status,'expired');
    await assert.rejects(loyalty.claimDailyPoints(f.db,claim('no-extended-old-offer',8,'customer',boundary)),{code:'unavailable'});
    assert.equal(f.sqlite.prepare('SELECT issued_points FROM loyalty_config').get()?.issued_points,20);
  }finally{f.dispose();}
});
