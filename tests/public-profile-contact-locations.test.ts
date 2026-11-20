import assert from 'node:assert/strict';
import test from 'node:test';
import {earnedMaker} from './helpers/company-store-financial-fixture';
import {getPublicProfileWorkspace} from '../lib/sellers/public-profile';
import {listNotifications} from '../lib/db/repositories/operations';
void test('support and pickup/return updates are independent of publication and retain security routing and old order destinations',async()=>{
 const loadedFixtureModule=await import('../lib/sellers/profile-contact-locations'),f=await earnedMaker('calculated');try{
  const account=f.sqlite.prepare("SELECT email,phone,auth_subject FROM users WHERE id='maker-user'").get();
  const orders=f.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(f.orderId),items=f.sqlite.prepare('SELECT * FROM order_items WHERE id=?').get(f.itemId);
  const before=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+20),view=await loadedFixtureModule.getProfileContactLocations(f.db,'maker','maker-user');
  const contact={sellerId:'maker',actorId:'maker-user',expectedRevision:view.support.revision,email:'public-support@local.hastabazaar.test',phoneCountry:'NP',phone:'9800000012',publicDisclosureConfirmed:true,requestId:'public-support-update',now:f.now+21};
  await assert.rejects(loadedFixtureModule.saveProfileSupport(f.db,{...contact,publicDisclosureConfirmed:false}),/public|disclos/i);
  await loadedFixtureModule.saveProfileSupport(f.db,contact);await loadedFixtureModule.saveProfileSupport(f.db,contact);
  const next=await loadedFixtureModule.getProfileContactLocations(f.db,'maker','maker-user');assert.equal(next.support.email,contact.email);assert.equal(next.support.phone,'+9779800000012');
  assert.deepEqual(f.sqlite.prepare("SELECT email,phone,auth_subject FROM users WHERE id='maker-user'").get(),account);
  const locations={sellerId:'maker',actorId:'maker-user',expectedRevision:view.locations.revision,pickupAddress:'Fictional new pickup, Birgunj 11, Parsa',returnAddress:'Fictional edited return, Birgunj 12, Parsa',requestId:'private-locations-update',now:f.now+22};
  await loadedFixtureModule.saveProfileLocations(f.db,locations);
  await assert.rejects(loadedFixtureModule.saveProfileLocations(f.db,{...locations,pickupAddress:'A stale second tab address',requestId:'stale-location-update'}),/changed|compare|current/i);
  assert.deepEqual(f.sqlite.prepare('SELECT * FROM orders WHERE id=?').get(f.orderId),orders);assert.deepEqual(f.sqlite.prepare('SELECT * FROM order_items WHERE id=?').get(f.itemId),items);
  const after=await getPublicProfileWorkspace(f.db,'maker','maker-user','owner',f.now+23);assert.deepEqual(after.state.current,before.state.current);assert.equal(after.state.nextNormalSubmissionAt,before.state.nextNormalSubmissionAt);
  const notices=(await listNotifications(f.db,'reviewer',100,'staff')).filter(item=>item.relatedType==='seller_support_contact');assert.equal(notices.length,1);
 }finally{f.dispose();}
});
