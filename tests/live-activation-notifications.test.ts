import test from 'node:test';
import assert from 'node:assert/strict';
import {activatedLiveMakerFixture} from './helpers/activated-live-maker-fixture';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {notificationDestination,canViewStaffNotification} from '../lib/operations/notification-links';
import {revokeManagedClearance} from '../lib/managed-commerce/live-clearance';
void test('activation common notices use exact saved source and audience, safe current actions, and suppress revoked or blocked decisions',async()=>{
 const f=await activatedLiveMakerFixture('notice-validity');try{
  const rows=(await f.db.prepare("SELECT template_key template,request_id requestId,recipient_user_id userId,audience_role audience,channel,related_type relatedType,related_id relatedId,subject_en subject,body_en body FROM notification_messages WHERE template_key='business.seller.live_activation'").all<{template:string;requestId:string;userId:string;audience:string;channel:string;relatedType:string;relatedId:string;subject:string;body:string}>()).results;
  assert.ok(rows.some(r=>r.audience==='seller'&&r.userId===f.ownerId));assert.ok(rows.some(r=>r.audience==='staff'));assert.equal(new Set(rows.map(r=>r.requestId)).size,rows.length);
  for(const row of rows){assert.equal(row.relatedId,f.activation.id);assert.equal(await isCurrentOperationalNotice(f.db,row),true);assert.doesNotMatch(row.body,/123456789|TEST-MANAGED|private\//);}
  const owner=rows.find(r=>r.audience==='seller')!;
  assert.equal(await isCurrentOperationalNotice(f.db,{...owner,audience:'customer'}),false);assert.equal(await isCurrentOperationalNotice(f.db,{...owner,audience:'staff'}),false);
  assert.equal(await isCurrentOperationalNotice(f.db,{...owner,requestId:'another-source-namespace'}),false);assert.equal(await isCurrentOperationalNotice(f.db,{...owner,relatedType:'seller_public_profile'}),false);
  assert.equal(notificationDestination('seller','seller','managed_live_activation',f.activation.id),'/seller');assert.equal(notificationDestination('staff','staff','managed_live_activation',f.activation.id),'/admin/sellers?liveActivation='+f.activation.id);
  assert.equal(notificationDestination('customer','seller','managed_live_activation',f.activation.id),null);assert.equal(canViewStaffNotification({role:'admin',permissions:[]},'managed_live_activation'),false);
  await revokeManagedClearance(f.db,f.ctx('notice-clearance-revoke','0'),{clearanceId:f.clearance.clearanceId,reason:'Withdraw the externally issued clearance and suppress stale queued order-acceptance action notices.'});
  for(const row of rows)assert.equal(await isCurrentOperationalNotice(f.db,row),false);
 }finally{f.dispose();}
});
