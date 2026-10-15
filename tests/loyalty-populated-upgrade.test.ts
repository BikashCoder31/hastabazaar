import assert from 'node:assert/strict';
import test from 'node:test';
import { incentiveReportDatabase } from './helpers/incentive-report-database';
import { digestFormRequest } from '../lib/forms/submission';
import { claim, ctx, TERMS, NOW } from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';
import { nepalRewardDay } from '../lib/incentives/loyalty-policy';

void test('weekly upgrade preserves populated fixed claims, redemptions, balances and exact replay', async () => {
  const input = claim('legacy-request');
  const oldResult = {claimId:'legacy-claim',localDate:nepalRewardDay(NOW).localDate,awardedPoints:100,balancePoints:100};
  const snapshots: {table:string;columns:string[];rows:unknown[]}[] = [];
  const f = await incentiveReportDatabase(async (name, sqlite) => {
    if (!name.startsWith('0070_')) return;
    sqlite.exec(`INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at)
      VALUES ('super','super','super@example.test','Fictional owner','en-NP','active',1,1),
      ('customer','customer','customer@example.test','Fictional customer','en-NP','active',1,1);
      INSERT INTO user_roles(user_id,role,assigned_at) VALUES ('super','super_admin',1),('customer','customer',1);
      INSERT INTO wallet_accounts(user_id,referral_code,created_at) VALUES ('customer','LEGACY-CUSTOMER',1);
      INSERT INTO loyalty_accounts(user_id,created_at) VALUES ('customer',1);`);
    for (const id of ['staff.loyalty-settings','account.daily-reward','account.points-redemption']) {
      sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,revision,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
        VALUES (?,?,1,1,'published',?,'Legacy fixture','super',1,'super',1,'super',1,?)`).run(`${id}-v1`,id,JSON.stringify({formId:id,fields:[]}),id);
    }
    sqlite.exec(`INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at)
      VALUES (1,1,100,100,1000,0,253402300799999,1000,10000,'super','legacy-terms','Legacy fixed rewards','staff.loyalty-settings-v1',1);
      UPDATE loyalty_config SET current_revision=1,paused=0;`);
    const digest = await digestFormRequest({operation:'daily_claim',userId:input.userId,authSubject:input.authSubject,expectedVersion:input.expectedVersion,formVersionId:input.formVersionId});
    sqlite.prepare(`INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at)
      VALUES ('legacy-claim','customer','customer',?,?,1,?,100,?,'account.daily-reward-v1',?)`).run(input.requestId,digest,oldResult.localDate,JSON.stringify(oldResult),NOW);
    sqlite.prepare(`INSERT INTO loyalty_redemptions(id,user_id,actor_id,request_id,payload_digest,revision,points,credit_paisa,response_json,form_version_id,created_at)
      VALUES ('legacy-redeem','customer','customer','legacy-redeem',?,1,100,1000,?,'account.points-redemption-v1',?)`).run('a'.repeat(64),JSON.stringify({redemptionId:'legacy-redeem',points:100,creditPaisa:1000,balancePoints:0,walletBalancePaisa:1000}),NOW);
    for (const table of ['loyalty_revisions','loyalty_config','loyalty_accounts','loyalty_daily_claims','loyalty_redemptions','loyalty_points_entries','loyalty_day_issuance','wallet_accounts','wallet_entries']) {
      const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row=>String(row.name));
      snapshots.push({table,columns,rows:sqlite.prepare(`SELECT ${columns.join(',')} FROM ${table}`).all()});
    }
  });
  try {
    for (const before of snapshots) assert.deepEqual(f.sqlite.prepare(`SELECT ${before.columns.join(',')} FROM ${before.table}`).all(),before.rows,before.table);
    assert.deepEqual(await loyalty.claimDailyPoints(f.db,input),oldResult);
    const draft=await loyalty.saveLoyaltyDraft(f.db,ctx('upgrade-weekly-draft'),{...TERMS,dailyPoints:5,weeklyPoints:[5,7,9,10,11,13,15],graceEnabled:false});
    const published=await loyalty.publishLoyalty(f.db,ctx('upgrade-weekly-publish',draft.version));
    const next=await loyalty.claimDailyPoints(f.db,claim('first-weekly-claim',published.version,'customer',NOW+86_400_000));
    assert.equal(next.awardedPoints,5);
    assert.equal(next.cycle?.day,1);
    assert.equal(f.sqlite.prepare("SELECT balance_paisa FROM wallet_accounts WHERE user_id='customer'").get()?.balance_paisa,1000);
    assert.equal(f.sqlite.prepare("SELECT response_json FROM loyalty_daily_claims WHERE id='legacy-claim'").get()?.response_json,JSON.stringify(oldResult));
    assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);
  } finally { f.dispose(); }
});
