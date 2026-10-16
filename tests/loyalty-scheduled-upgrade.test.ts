import assert from 'node:assert/strict';
import test from 'node:test';
import {incentiveReportDatabase} from './helpers/incentive-report-database';
import {existingRecordSnapshot,assertExistingRecordsPreserved} from '../scripts/staging/company-store-readiness-upgrade.mjs';
import {digestFormRequest} from '../lib/forms/submission';
import {claim,NOW} from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';

void test('scheduled storage preserves every existing record including populated claims redemption pause and draft',async()=>{
  let before:ReturnType<typeof existingRecordSnapshot>;
  const input=claim('before-scheduled-upgrade');const result={claimId:'before-scheduled-claim',localDate:'2026-09-28',awardedPoints:100,balancePoints:100};
  const f=await incentiveReportDatabase(async(name,sqlite)=>{
    if(!name.startsWith('0072_'))return;
    sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES
      ('super','super','super@local.hastabazaar.test','Fictional Super Admin','active',1,1),('customer','customer','customer@local.hastabazaar.test','Fictional customer','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1),('customer','customer',1);
      INSERT INTO wallet_accounts(user_id,referral_code,created_at) VALUES('customer','BEFORE-SCHEDULE',1);
      INSERT INTO loyalty_accounts(user_id,created_at) VALUES('customer',1);`);
    for(const id of ['staff.loyalty-settings','account.daily-reward','account.points-redemption'])sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
      VALUES(?,?,1,1,'published',?,'Fictional old form','super',1,'super',1,'super',1,?)`).run(`${id}-v1`,id,JSON.stringify({formId:id,fields:[]}),`old-${id}`);
    sqlite.exec(`INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at)
      VALUES(1,1,100,100,1000,0,253402300799999,1000,10000,'super','old-current','Fictional old current','staff.loyalty-settings-v1',1);
      UPDATE loyalty_config SET current_revision=1,paused=0;`);
    const digest=await digestFormRequest({operation:'daily_claim',userId:input.userId,authSubject:input.authSubject,expectedVersion:input.expectedVersion,formVersionId:input.formVersionId});
    sqlite.prepare(`INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at)
      VALUES('before-scheduled-claim','customer','customer',?,?,1,'2026-09-28',100,?,'account.daily-reward-v1',?)`).run(input.requestId,digest,JSON.stringify(result),NOW);
    sqlite.prepare(`INSERT INTO loyalty_redemptions(id,user_id,actor_id,request_id,payload_digest,revision,points,credit_paisa,response_json,form_version_id,created_at)
      VALUES('before-scheduled-redemption','customer','customer','old-redemption',?,1,100,1000,?,'account.points-redemption-v1',?)`).run('b'.repeat(64),JSON.stringify({redemptionId:'before-scheduled-redemption',points:100,creditPaisa:1000,balancePoints:0,walletBalancePaisa:1000}),NOW);
    sqlite.prepare(`INSERT INTO loyalty_revisions(revision,enabled,daily_points,weekly_points_json,grace_enabled,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at)
      VALUES(2,0,5,?,0,100,1000,?,253402300799999,1000,10000,'super','old-draft','Fictional saved draft','staff.loyalty-settings-v1',?)`).run(JSON.stringify([5,7,9,10,11,13,15]),NOW+1,NOW);
    sqlite.exec('UPDATE loyalty_config SET version=4,draft_revision=2,paused=1');before=existingRecordSnapshot(sqlite);
  });
  try {
    assertExistingRecordsPreserved(f.sqlite,before!);
    const state=await loyalty.getLoyaltyState(f.db,'super',NOW,'super');assert.equal(state.version,4);assert.equal(state.paused,true);assert.equal(state.publishedRevision,1);assert.equal(state.draftRevision,2);
    assert.equal(state.scheduledRevision,null);assert.equal(state.scheduledFor,null);assert.equal(state.scheduledUnpause,false);
    assert.deepEqual(state.terms.weeklyPoints,[5,7,9,10,11,13,15]);assert.equal(state.publishedTerms.dailyPoints,100);
    assert.deepEqual(await loyalty.claimDailyPoints(f.db,{...input,now:NOW+86400000}),result);
    assert.throws(()=>f.sqlite.exec('UPDATE loyalty_config SET scheduled_unpause=1'),/Invalid scheduled/);
    assert.throws(()=>f.sqlite.exec('UPDATE loyalty_config SET scheduled_revision=2'),/Invalid scheduled/);
    assertExistingRecordsPreserved(f.sqlite,before!);
    assert.equal(f.sqlite.prepare('PRAGMA integrity_check').get()?.integrity_check,'ok');assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  }finally{f.dispose();}
});
