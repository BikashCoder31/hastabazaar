import assert from 'node:assert/strict';
import test from 'node:test';
import {payoutTransferFixture} from './helpers/payout-transfer-fixture';
import {readFeeProgramWorkspace,FEE_PROGRAM_VIEWS} from '../lib/admin/fee-program-workspace';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';

void test('six-view commercial workspace preserves unknown native sources and denies ordinary/currently revoked readers',async()=>{
 const f=await payoutTransferFixture();try{
  assert.equal(FEE_PROGRAM_VIEWS.length,6);
  const result=await readFeeProgramWorkspace(f.db,{id:'reviewer',authSubject:'reviewer'},{now:f.now});
  assert.equal(result.views.length,6);assert.ok(result.sources.some(source=>source.status==='unknown'));
  assert.ok(result.sources.every(source=>source.href.startsWith('/admin/')));
  assert.ok(!JSON.stringify(result).includes('Fictional Test Bank'));
  await assert.rejects(()=>readFeeProgramWorkspace(f.db,{id:'customer',authSubject:'customer'},{now:f.now}));
  f.sqlite.prepare("DELETE FROM user_roles WHERE user_id='reviewer' AND role='super_admin'").run();
  await assert.rejects(()=>readFeeProgramWorkspace(f.db,{id:'reviewer',authSubject:'reviewer'},{now:f.now}));
 }finally{f.dispose();}
});

void test('actual current and published upcoming customer charge stay separate from an unpublished draft',async()=>{
 const f=await payoutTransferFixture();try{
  const publish=async(value:number,at:number,key:string)=>{const draft=await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:value},actorId:'reviewer',reason:'Fictional exact customer-charge policy source.',requestId:key+'-draft',now:f.now});await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:draft.revision,effectiveFrom:at,reason:'Publish this fictional policy at its original intended time.',requestId:key+'-publish',now:f.now});return draft;};
  const current=await publish(700,f.now,'hub-current'),future=await publish(1200,f.now+100000,'hub-future');
  await createBusinessSettingDraft(f.db,{key:'platform_service_fee_policy',value:{enabled:true,amountPaisa:1900},actorId:'reviewer',reason:'Unpublished fictional draft is not an effective change.',requestId:'hub-unpublished',now:f.now});
  const result=await readFeeProgramWorkspace(f.db,{id:'reviewer',authSubject:'reviewer'},{now:f.now});
  const rows=result.sources.filter(row=>row.key.startsWith('platform_service_fee_policy'));
  assert.equal(rows.find(row=>row.status==='current')?.sourceId,current.id);assert.match(rows.find(row=>row.status==='current')!.summary,/7\.00/);
  assert.equal(rows.find(row=>row.status==='upcoming')?.sourceId,future.id);assert.match(rows.find(row=>row.status==='upcoming')!.summary,/12\.00/);
  assert.ok(!rows.filter(row=>row.status==='current'||row.status==='upcoming').some(row=>row.summary.includes('19.00')));
 }finally{f.dispose();}
});
