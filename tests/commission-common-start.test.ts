import { commonFeeKeys, getCommonFeeState } from '../lib/commission/coordinated-policy';
import { translateSqliteSql } from '../lib/runtime/node-bindings';
import assert from 'node:assert/strict';
import test from 'node:test';
import {historicalCommissionDatabase} from './helpers/commission-database';
import {getSellerCommissionTerms,getCommissionCheckoutAcceptance,getSellerCommissionNotices} from '../lib/db/repositories/commission-rates';
import {getCommissionSetting} from '../lib/db/repositories/marketplace-settings';
import {SELLER_AGREEMENT_VERSION} from '../lib/content/legal-policies';
const day=86400000,now=Date.UTC(2026,10,1),ctx=(actorId:string,requestId:string,expectedRevision:string|null=null)=>({actorId,requestId,expectedRevision,now});
async function policy(){const path='../lib/commission/coordinated-policy';const m=await import(path).catch(()=>null);assert.equal(typeof m?.publishCommonFeePolicy,'function','The registered and sale-linked maker schedules require one guarded publication/replacement');return m!;}
void test('old accepted supplements cannot override the current common fee and acceptance of a future supplement cannot hide unmet current terms',async()=>{
 const f=await historicalCommissionDatabase(true);try{
 f.sqlite.prepare("INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at) VALUES('old-nine',900,1382400000,?,'Original fictional terms','Original fictional terms','owner',1)").run(SELLER_AGREEMENT_VERSION);f.sqlite.exec("INSERT INTO commission_rate_acceptances(rate_id,seller_id,actor_id,accepted_at) VALUES('old-nine','seller-a','user-a',3)");
 for(const key of ['independent_seller_commission_bps','managed_sale_linked_platform_retention_bps']){f.sqlite.prepare("UPDATE business_setting_versions SET effective_until=? WHERE setting_key=? AND status='published'").run(now+15*day,key);f.sqlite.prepare("INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,published_at,last_request_id) VALUES(?,?,2,'1200','published',1,'controlled',?,'Fictional common start','owner',?,?,?)").run('new-'+key,key,now+15*day,now,now,'new-'+key);}
 assert.equal((await getSellerCommissionTerms(f.database,'seller-a',now+15*day-1)).basisPoints,900);
 assert.equal((await getSellerCommissionTerms(f.database,'seller-a',now+15*day)).basisPoints,1200);
 assert.equal(await getCommissionCheckoutAcceptance(f.database,'seller-a',await getCommissionSetting(f.database,now+15*day),now+15*day),null);
 for(const [id,at]of [['current-required',now+16*day],['future-accepted',now+40*day]] as const)f.sqlite.prepare("INSERT INTO commission_rate_changes(id,basis_points,effective_at,agreement_version,terms_text,reason,created_by,created_at) VALUES(?,1300,?,?,'Fictional explicit terms','Fictional schedule','owner',?)").run(id,at,SELLER_AGREEMENT_VERSION,now);
 f.sqlite.exec("INSERT INTO commission_rate_acceptances(rate_id,seller_id,actor_id,accepted_at) VALUES('future-accepted','seller-a','user-a',4)");
 const notices=await getSellerCommissionNotices(f.database,'seller-a',now+17*day);assert.ok(notices.some(row=>row.id==='current-required'));
 }finally{await f.dispose();}
});
void test('one common publication and a fresh 15-day replacement preserve current consent and reject stale, partial or unauthorized changes',async()=>{
 const m=await policy(),f=await historicalCommissionDatabase(true);try{
 const original=await m.getCommonFeeState(f.database,now),input={expectedContext:original.context,basisPoints:1200,effectiveAt:now+15*day,reason:'Publish the reviewed fictional common fee schedule',replacesId:null};
 await assert.rejects(()=>m.publishCommonFeePolicy(f.database,ctx('staff','denied-policy'),input));const saved=await m.publishCommonFeePolicy(f.database,ctx('owner','common-policy'),input);assert.deepEqual(await m.publishCommonFeePolicy(f.database,{...ctx('owner','common-policy'),now:now+20*day},input),saved);
 const state=await m.getCommonFeeState(f.database,now+5*day);assert.equal(state.upcoming.basisPoints,1200);assert.equal(state.upcoming.effectiveAt,now+15*day);assert.equal(state.current.registered.basisPoints,900);assert.equal(state.current.managed.basisPoints,900);
 const replace={...input,expectedContext:state.context,replacesId:saved.id,basisPoints:1300,reason:'Replace the fictional common schedule with full fresh notice'};
 await assert.rejects(()=>m.publishCommonFeePolicy(f.database,{...ctx('owner','short-notice'),now:now+5*day},replace),/15/);
 const replacement=await m.publishCommonFeePolicy(f.database,{...ctx('owner','replacement'),now:now+5*day},{...replace,effectiveAt:now+20*day});const final=await m.getCommonFeeState(f.database,now+16*day);assert.equal(final.current.registered.basisPoints,900);assert.equal(final.current.managed.basisPoints,900);assert.equal(final.upcoming.id,replacement.id);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_agreement_acceptance_history").get()?.n,2);
 await assert.rejects(()=>m.publishCommonFeePolicy(f.database,ctx('owner','stale-common'),input));assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM business_setting_versions WHERE status='published' AND effective_from>?").get(now)?.n,2);
 }finally{await f.dispose();}
});
void test('explicit future acceptance uses the shared start, never accepts for another owner, and becomes a new-order gate at the boundary',async()=>{
 const m=await policy(),f=await historicalCommissionDatabase(true);try{
 const state=await m.getCommonFeeState(f.database,now),saved=await m.publishCommonFeePolicy(f.database,ctx('owner','future-policy'),{expectedContext:state.context,basisPoints:1200,effectiveAt:now+15*day,reason:'Publish the fictional common acceptance transition',replacesId:null});const offers=await m.getRegisteredFeeOffers(f.database,'seller-a',now+day);assert.equal(offers.current.accepted,true);assert.equal(offers.upcoming.length,1);
 const offer=offers.upcoming[0],input={sellerId:'seller-a',versionId:offer.versionId,context:offer.context,accepted:true};await assert.rejects(()=>m.acceptRegisteredFeeOffer(f.database,{...ctx('owner','staff-cannot-consent'),now:now+day},input));await m.acceptRegisteredFeeOffer(f.database,{...ctx('user-a','accept-future'),now:now+day},input);
 assert.equal((await getSellerCommissionTerms(f.database,'seller-a',now+14*day)).basisPoints,900);assert.equal((await getSellerCommissionTerms(f.database,'seller-a',now+15*day)).basisPoints,1200);assert.ok(await getCommissionCheckoutAcceptance(f.database,'seller-a',await getCommissionSetting(f.database,now+15*day),now+15*day));assert.equal(await getCommissionCheckoutAcceptance(f.database,'seller-b',await getCommissionSetting(f.database,now+15*day),now+15*day),null);assert.ok(saved.id);
 }finally{await f.dispose();}
});

void test('common fee source and maximum reads quote the MariaDB reserved key alias and preserve SQLite results', async () => {
  const fixture = await historicalCommissionDatabase();
  const queries: string[] = [];
  const db = {
    prepare(sql: string) {
      const translated = translateSqliteSql(sql);
      queries.push(translated);
      return fixture.database.prepare(translated);
    },
  } as D1Database;
  try {
    const state = await getCommonFeeState(db, Date.UTC(2026, 10, 1));
    const settingReads = queries.filter(sql => /SELECT (?:id,)?setting_key AS/.test(sql));
    assert.equal(settingReads.length, 2, 'Cover both source versions and maximum version lookup.');
    for (const sql of settingReads) {
      assert.match(sql, /setting_key AS `key`/, 'KEY is reserved in MariaDB; the native translator must retain its identifier quotes.');
    }
    assert.deepEqual(state.sources.map(row => row.key).sort(), [...commonFeeKeys].sort());
    assert.deepEqual(state.maximums.map(row => row.key).sort(), [...commonFeeKeys].sort());
    assert.equal(state.current.registered?.basisPoints, 900);
    assert.equal(state.current.managed?.basisPoints, 900);
    assert.deepEqual(state.issues, []);
  } finally {
    await fixture.dispose();
  }
});
