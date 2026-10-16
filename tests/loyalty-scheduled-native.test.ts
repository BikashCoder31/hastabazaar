import assert from 'node:assert/strict';
import test from 'node:test';
import {fixture,ctx,claim,TERMS,NOW,publishForm} from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';

void test('native D1 preserves current earning then applies one scheduled weekly cycle and paused redemption',async()=>{
  const f=await fixture();const starts=Date.parse('2026-09-29T00:00:00+05:45');const awards=[5,7,9,10,11,13,15];
  try {
    await publishForm(f.db,'account.points-redemption');
    await loyalty.saveLoyaltyDraft(f.db,ctx('native-weekly-draft'),{...TERMS,dailyPoints:5,weeklyPoints:awards,graceEnabled:false,startsAt:starts});
    const scheduled=await loyalty.publishLoyalty(f.db,ctx('native-weekly-schedule',2));assert.equal(scheduled.publishedRevision,1);assert.equal(scheduled.scheduledRevision,2);
    const old=await loyalty.claimDailyPoints(f.db,claim('native-last-old-claim',3,'customer',starts-1));assert.equal(old.awardedPoints,10);
    const due=await loyalty.getRewards(f.db,'customer',starts,undefined,20,'customer');assert.equal(due.state.version,4);assert.equal(due.state.revision,2);
    assert.equal((await f.db.prepare('SELECT current_revision FROM loyalty_config').first<{current_revision:number}>())?.current_revision,1);
    await assert.rejects(f.db.prepare(`INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at)
      VALUES('native-obsolete-source','customer','customer','native-obsolete-source',?,1,'2026-09-29',10,?,'account.daily-reward-v1',?)`).bind('a'.repeat(64),JSON.stringify({claimId:'native-obsolete-source',localDate:'2026-09-29',awardedPoints:10,balancePoints:20}),starts).run(),/scheduled_rules_due/);
    const observed=[];
    for(let day=0;day<7;day++)observed.push((await loyalty.claimDailyPoints(f.db,claim(`native-week-${day+1}`,4,'customer',starts+day*86400000))).awardedPoints);
    assert.deepEqual(observed,awards);assert.equal(observed.reduce((sum,value)=>sum+value,0),70);
    const repeated=await loyalty.claimDailyPoints(f.db,claim('native-repeat',4,'customer',starts+7*86400000));assert.equal(repeated.awardedPoints,5);assert.equal(repeated.cycle?.resetReason,'cycle_complete');
    const missed=await loyalty.claimDailyPoints(f.db,claim('native-missed-day',4,'customer',starts+9*86400000));assert.equal(missed.awardedPoints,5);assert.equal(missed.cycle?.resetReason,'missed_day');
    await loyalty.claimDailyPoints(f.db,claim('native-next-two',4,'customer',starts+10*86400000));await loyalty.claimDailyPoints(f.db,claim('native-next-three',4,'customer',starts+11*86400000));
    const paused=await loyalty.pauseLoyalty(f.db,{...ctx('native-pause',4),now:starts+11*86400000});assert.equal(paused.paused,true);
    const redeemed=await loyalty.redeemPoints(f.db,{...claim('native-redeem',5,'customer',starts+11*86400000),points:100,formVersionId:'account.points-redemption-v1'});assert.equal(redeemed.creditPaisa,1000);assert.equal(redeemed.balancePoints,6);
    assert.deepEqual(await loyalty.claimDailyPoints(f.db,claim('native-last-old-claim',3,'customer',NOW+12*86400000)),old);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM audit_logs WHERE request_id='loyalty-schedule-activate:2'").first<{n:number}>())?.n,1);
  }finally{await f.dispose();}
});
