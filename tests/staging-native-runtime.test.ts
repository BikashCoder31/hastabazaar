import assert from 'node:assert/strict';
import {after,test} from 'node:test';
import mysql,{type Pool,type Connection} from 'mysql2/promise';
import {env} from '../lib/runtime/node-bindings';
import {stagingNativeFixture} from './helpers/staging-native-fixture';
import {seedIncentiveCustomer,seedIncentiveInventory,incentiveOrder,incentiveItem} from './helpers/incentive-db';
import {ctx,claim,TERMS,NOW,publishForm} from './helpers/loyalty-fixture';
import * as loyalty from '../lib/db/repositories/loyalty';
import {getReferralAdminReport} from '../lib/db/repositories/admin-referrals';
import {managedIdentityDocument,managedIdentityFields} from './helpers/managed-identity-fixture';
import {parseSellerApplication} from '../lib/sellers/application';
import {createSellerApplication} from '../lib/db/repositories/seller-applications';
import {getAcceptedManagedTerms,getManagedTermsOffers,acceptManagedTerms,managedTermsFormId} from '../lib/managed-commerce/accepted-terms';
import {currentManagedSaleEvidence} from '../lib/products/managed-sale-evidence';

const enabled=process.env.HATSKALA_STAGING_NATIVE==='1';
const pools:Pool[]=[]; const createPool=mysql.createPool;
let connection:Connection|undefined;
if(enabled){
  const scope=await stagingNativeFixture();
  mysql.createPool=((...args:Parameters<typeof createPool>)=>{const pool=createPool(...args);pools.push(pool);return pool;}) as typeof createPool;
  connection=await mysql.createConnection(scope);
}
after(async()=>{mysql.createPool=createPool;await connection?.end();for(const pool of pools)await pool.end();});
const db=env.DB as unknown as D1Database;

void test('MariaDB keeps current loyalty until Nepal boundary and posts each scheduled award once',{skip:!enabled},async()=>{
  for(const id of ['customer','super','admin'])await seedIncentiveCustomer(db,id);
  await db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('super','super_admin',1),('admin','admin',1)").run();
  for(const id of ['staff.loyalty-settings','account.daily-reward','account.points-redemption'])await publishForm(db,id);
  await db.prepare(`INSERT INTO loyalty_revisions(revision,enabled,daily_points,points_per_block,credit_paisa_per_block,starts_at,ends_at,daily_budget_points,lifetime_budget_points,created_by,request_id,reason,form_version_id,created_at)
    VALUES(1,1,10,100,1000,0,253402300799999,1000,10000,'super','native-live','Fictional live rules','staff.loyalty-settings-v1',1)`).run();
  await db.prepare('UPDATE loyalty_config SET current_revision=1,paused=0').run();
  const starts=Date.parse('2026-09-29T00:00:00+05:45'), awards=[5,7,9,10,11,13,15];
  await loyalty.saveLoyaltyDraft(db,ctx('native-weekly-draft'),{...TERMS,dailyPoints:5,weeklyPoints:awards,graceEnabled:false,startsAt:starts});
  const scheduled=await loyalty.publishLoyalty(db,ctx('native-weekly-schedule',2));
  assert.deepEqual(await loyalty.publishLoyalty(db,ctx('native-weekly-schedule',2)),scheduled);
  assert.equal(scheduled.publishedRevision,1);assert.equal(scheduled.scheduledRevision,2);
  const old=await loyalty.claimDailyPoints(db,claim('native-old-claim',3,'customer',starts-1));assert.equal(old.awardedPoints,10);
  const due=await loyalty.getRewards(db,'customer',starts,undefined,20,'customer');assert.equal(due.state.revision,2);
  assert.equal((await db.prepare('SELECT current_revision FROM loyalty_config').first<{current_revision:number}>())?.current_revision,1);
  await assert.rejects(db.prepare(`INSERT INTO loyalty_daily_claims(id,user_id,actor_id,request_id,payload_digest,revision,local_date,awarded_points,response_json,form_version_id,created_at)
    VALUES('obsolete','customer','customer','obsolete',?,1,'2026-09-29',10,?,'account.daily-reward-v1',?)`).bind('a'.repeat(64),JSON.stringify({claimId:'obsolete',localDate:'2026-09-29',awardedPoints:10,balancePoints:20}),starts).run(),/scheduled_rules_due|loyalty_claim_invalid/);
  await assert.rejects(loyalty.claimDailyPoints(db,claim('stale-client',3,'customer',starts)));
  const receipts=[];
  for(let day=0;day<7;day++)receipts.push(await loyalty.claimDailyPoints(db,claim('native-day-'+day,4,'customer',starts+day*86400000)));
  assert.deepEqual(receipts.map(receipt=>receipt.awardedPoints),awards);
  const replayState=await db.prepare('SELECT * FROM loyalty_config').first();
  assert.deepEqual(await loyalty.claimDailyPoints(db,claim('native-day-0',4,'customer',starts)),receipts[0]);
  assert.deepEqual(await db.prepare('SELECT * FROM loyalty_config').first(),replayState);
  assert.deepEqual(await loyalty.claimDailyPoints(db,claim('native-old-claim',3,'customer',NOW+12*86400000)),old);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id='loyalty-schedule-activate:2'").first<{n:number}>())?.n,1);
  const paused=await loyalty.pauseLoyalty(db,{...ctx('native-pause',4),now:starts+6*86400000});assert.equal(paused.paused,true);
  await assert.rejects(loyalty.claimDailyPoints(db,claim('paused-claim',5,'customer',starts+7*86400000)));
  // Saving a future draft while paused retains pause, then cancellation keeps current history.
  await loyalty.saveLoyaltyDraft(db,{...ctx('native-next-draft',5),now:starts+7*86400000},{...TERMS,dailyPoints:5,weeklyPoints:awards,graceEnabled:false,startsAt:starts+10*86400000});
  await loyalty.publishLoyalty(db,{...ctx('native-next-schedule',6),now:starts+7*86400000});
  const cancelled=await loyalty.cancelScheduledLoyalty(db,{...ctx('native-cancel',7),now:starts+7*86400000});
  assert.deepEqual(await loyalty.cancelScheduledLoyalty(db,{...ctx('native-cancel',7),now:starts+7*86400000}),cancelled);
  const state=await db.prepare('SELECT paused,scheduled_revision,scheduled_for,scheduled_unpause FROM loyalty_config').first();
  assert.deepEqual(state,{paused:1,scheduled_revision:null,scheduled_for:null,scheduled_unpause:0});
  const future=starts+12*86400000;
  await loyalty.saveLoyaltyDraft(db,{...ctx('native-pause-draft',8),now:starts+7*86400000},{...TERMS,dailyPoints:5,weeklyPoints:awards,graceEnabled:false,startsAt:future});
  await loyalty.publishLoyalty(db,{...ctx('native-pause-schedule',9),now:starts+7*86400000});
  await loyalty.pauseLoyalty(db,{...ctx('native-pause-override',10),now:starts+8*86400000});
  assert.equal((await db.prepare('SELECT scheduled_unpause FROM loyalty_config').first<{scheduled_unpause:number}>())?.scheduled_unpause,0);
  assert.equal((await loyalty.getRewards(db,'customer',future,undefined,20,'customer')).state.paused,true);
  await assert.rejects(loyalty.claimDailyPoints(db,claim('paused-at-due',12,'customer',future)));
});

void test('MariaDB referral filters remain SELECT only and reject Admin direct access',{skip:!enabled},async()=>{
  assert.ok(connection);
  const reportNow=Date.parse('2026-10-15T18:15:00.000Z'); // Exact Nepal midnight.
  const day=86400000;
  for(const [i,acceptedAt] of [reportNow,reportNow-1,reportNow-6*day,reportNow-7*day,reportNow-29*day,reportNow-30*day].entries()){
    const buyer='native-referral-buyer-'+i,id='native-referral-order-'+i,phone='980009999'+i;
    await seedIncentiveCustomer(db,buyer);
    await db.prepare(`INSERT INTO orders(id,order_number,customer_id,customer_email,customer_phone,status,locale,policy_version,shipping_address_json,item_subtotal_paisa,delivery_charge_paisa,grand_total_paisa,payment_mode,payment_status,created_at,updated_at,referral_discount_paisa)
      VALUES(?,?,?,?,?,'confirmed','en-NP','fictional','{}',10000,500,9500,'cod','unpaid',?,?,1000)`).bind(id,'HK-native-referral-'+i,buyer,buyer+'@example.test',phone,acceptedAt,acceptedAt).run();
    await db.prepare("INSERT INTO referral_redemptions(customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at) VALUES(?,'customer',?,?,500,7,?)").bind(buyer,id,phone,acceptedAt).run();
  }
  const before=(await connection.query('SELECT COUNT(*) n FROM wallet_entries'))[0];
  const queries:string[]=[];
  const readDb={prepare(sql:string){assert.match(sql.trim(),/^(SELECT|WITH)\b/i);queries.push(sql);return db.prepare(sql);}} as D1Database;
  for(const [period,count] of [['today',1],['7d',3],['30d',5],['all',6]] as const){
    const report=await getReferralAdminReport(readDb,{id:'super',authSubject:'super'},{period,query:'HK-native-referral',status:'waiting_delivery'},reportNow);
    assert.equal(report.activityCount,count);assert.equal(report.activity[0].reason,'delivery_pending');
    assert.equal((await getReferralAdminReport(readDb,{id:'super',authSubject:'super'},{period,query:'50%_'},reportNow)).activityCount,0);
  }
  await assert.rejects(getReferralAdminReport(readDb,{id:'admin',authSubject:'admin'}));
  assert.deepEqual((await connection.query('SELECT COUNT(*) n FROM wallet_entries'))[0],before);
  assert.ok(queries.some(sql=>sql.startsWith('WITH activity')));
  for(const [json,n] of [['{"catalogDigest":"text"}',1],['{"catalogDigest":10}',0],['{}',0]] as const){
    const rows=await db.prepare("SELECT 1 n FROM (SELECT ? AS next_json) audit WHERE json_type(audit.next_json,'$.catalogDigest')='text'").bind(json).all();
    assert.equal(rows.results.length,n);
  }
});

void test('MariaDB maker acceptance retains exact private ownership and replay',{skip:!enabled},async()=>{
  const now=Date.now()-60_000;
  // This fictional historical agreement explicitly uses nine-percent retention.
  // Current bootstrap intentionally has no silently effective commission default.
  await db.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
    VALUES('native-maker-retention','managed_sale_linked_platform_retention_bps',1,'900','published',1,'controlled',1,'Explicit fictional native maker agreement','super',1,'native-maker-retention')`).run();
  await publishForm(db,managedTermsFormId);
  async function application(id:string,phone:string){
    const form=new FormData();for(const [key,value]of Object.entries({hasBusinessTaxRegistration:'no',applicantType:'individual',legalName:'Fictional Native Maker',tradingName:'Fictional Studio',email:id+'@example.test',phone,province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional workshop',publicCity:'Kathmandu',businessDescription:'Fictional native maker application.',productCategories:'Clay work',applicationAcknowledgement:'yes',...managedIdentityFields()}))form.set(key,value);
    const parsed=parseSellerApplication(form);assert.ok(parsed.input,parsed.errors.join('\n'));
    await createSellerApplication(db,{sellerId:id,userId:'owner-'+id,input:parsed.input,applicationReference:'SIMULATED-'+id,documents:[managedIdentityDocument(id)],now});
  }
  const seller='12345678-1234-4234-8234-123456789abc';await application(seller,'9800000001');
  assert.equal((await getAcceptedManagedTerms(db,seller,now))?.retentionBps,900);
  const offer=(await getManagedTermsOffers(db,seller,now)).current;
  const input={sellerId:seller,actorId:'owner-'+seller,offerId:offer.id,context:offer.context,language:'en' as const,requestId:'native-terms-renewal',now:now+1,form:{versionId:managedTermsFormId+'-v1',answers:{formId:managedTermsFormId,version:1,answers:[]}}};
  const receipt=await acceptManagedTerms(db,input);assert.deepEqual(await acceptManagedTerms(db,input),receipt);
  const publicRow=()=>db.prepare(`SELECT s.id FROM seller_profiles s WHERE s.id=? AND EXISTS(SELECT 1 ${currentManagedSaleEvidence('s.id','s.user_id',now+2)})`).bind(seller).first();
  assert.ok(await publicRow());
  const originalDocument=managedIdentityDocument(seller).id;
  for(const key of [`PRIVATE/seller-documents/${seller}/file`,`private/seller-documents/${seller}-suffix/file`,`archive/private/seller-documents/${seller}/file`,`private/seller-documents/foreign/file`]){
    await assert.rejects(db.prepare('UPDATE seller_documents SET object_key=? WHERE id=?').bind(key,originalDocument).run(),/seller_document_version_immutable/);
    // Insert separate historical evidence so the read guards face the malformed path.
    const documentId=crypto.randomUUID();
    await db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      SELECT ?,seller_id,kind,?,original_name,mime_type,size_bytes,'pending',uploaded_at FROM seller_documents WHERE id=?`)
      .bind(documentId,key,originalDocument).run();
    await db.prepare(`INSERT INTO managed_maker_application_details(id,seller_id,identity_document_id,government_id_type,agreement_version,
      agreement_snapshot_json,agreement_accepted_at,agreement_accepted_by,created_at,agreement_language,agreement_form_version_id,government_id_description,personal_pan)
      SELECT ?,seller_id,?,government_id_type,agreement_version,agreement_snapshot_json,agreement_accepted_at,agreement_accepted_by,
        created_at,agreement_language,agreement_form_version_id,government_id_description,personal_pan FROM managed_maker_application_details WHERE id=?`)
      .bind(crypto.randomUUID(),documentId,receipt.detailId).run();
    await db.prepare("UPDATE seller_documents SET status='rejected' WHERE id=?").bind(originalDocument).run();
    assert.equal(await getAcceptedManagedTerms(db,seller,now+2),null);assert.equal(await publicRow(),null);
  }
});

void test('MariaDB allocation history permits re-reservation and blocks double reservation or edits',{skip:!enabled},async()=>{
  await seedIncentiveInventory(db);await incentiveOrder(db,'allocation-order').run();await incentiveItem(db,'allocation-item','allocation-order').run();
  await db.prepare(`INSERT INTO managed_commercial_snapshots(id,order_item_id,seller_id,participation_route,commercial_model,legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,agreement_version,agreement_language,product_value_paisa,eligible_base_paisa,platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,simulation_label,created_at)
    VALUES('allocation-snapshot','allocation-item','seller','managed_maker','managed_sale_linked_v1','Fictional company','Fictional company','Fictional maker','fictional-v1','en',10000,10000,900,900,9100,'SIMULATED',1)`).run();
  await db.prepare("INSERT INTO managed_entitlements(id,snapshot_id,seller_id,status,calculated_paisa,created_at,updated_at) VALUES('entitlement','allocation-snapshot','seller','earned',9100,1,1)").run();
  // The second payout models a paid record retained from before execution packets.
  await db.prepare(`INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,
    simulation_label,prepared_by,scheduled_for,request_id,created_at,updated_at,paid_at,provider_reference)
    VALUES('payout-one','seller','payout-one',9100,'prepared','Fictional destination','SIMULATED','super',1,'payout-one',1,1,NULL,NULL),
          ('payout-two','seller','payout-two',9100,'paid','Fictional destination','SIMULATED','super',1,'payout-two',1,1,3,'SIMULATED')`).run();
  const reserve=(id:string,entitlement='entitlement')=>db.prepare("INSERT INTO managed_payout_allocations(payout_id,entitlement_id,amount_paisa,disposition,created_at,request_id,actor_id) VALUES(?,?,9100,'reserved',1,?,'super')").bind(id,entitlement,id).run();
  await reserve('payout-one');await assert.rejects(reserve('payout-two','ENTITLEMENT'),/UNIQUE/);
  await assert.rejects(reserve('payout-two'),/UNIQUE/);
  await db.prepare("UPDATE managed_payout_allocations SET disposition='released',terminal_at=2 WHERE payout_id='payout-one'").run();
  await reserve('payout-two');
  await assert.rejects(db.prepare("UPDATE managed_payout_allocations SET amount_paisa=1 WHERE payout_id='payout-two'").run(),/immutable/);
  await assert.rejects(db.prepare("DELETE FROM managed_payout_allocations WHERE payout_id='payout-one'").run(),/permanent/);
  await assert.rejects(db.prepare("UPDATE managed_payouts SET destination_reference='changed' WHERE id='payout-one'").run(),/immutable/);
  await db.prepare("UPDATE managed_payout_allocations SET disposition='paid',terminal_at=3 WHERE payout_id='payout-two'").run();
  await assert.rejects(db.prepare("UPDATE managed_payout_allocations SET disposition='released',terminal_at=4 WHERE payout_id='payout-two'").run(),/immutable/);
  await assert.rejects(db.prepare("UPDATE managed_payouts SET status='paid',paid_at=3,provider_reference='SIMULATED' WHERE id='payout-one'").run(),/managed_payout_requires_actual_execution_packet/);
  await assert.rejects(db.prepare("UPDATE managed_payouts SET status='prepared' WHERE id='payout-two'").run(),/immutable/);
});
