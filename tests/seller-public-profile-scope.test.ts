import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {sellerProfileScopeFixture} from './helpers/seller-profile-scope-fixture';
import {registrationScopeOrigin as origin} from './helpers/seller-registration-scope-fixture';

void test('private public-profile reads bind the rendered internal actor rather than an external subject',async()=>{const f=await sellerProfileScopeFixture();try{
 const api=await import('../app/api/seller/public-profile/route');
 const request=(actor:string)=>new Request(origin+'/api/seller/public-profile',{headers:{'X-Hastabazaar-Actor':actor}});
 const wrong=await api.GET(request('external-profile-owner'));assert.equal(wrong.status,403,'a private workspace must not be returned to a mismatched rendered account');
 const own=await api.GET(request('registered-owner'));assert.equal(own.status,200);const body=await own.json()as{ownerId:string};assert.equal(body.ownerId,'registered-owner');
}finally{f.dispose();}});

void test('private location commands reject old intent before a lawful current-owner body can write',async()=>{const f=await sellerProfileScopeFixture();try{
 const api=await import('../app/api/seller/public-profile/route'),{getProfileContactLocations}=await import('../lib/sellers/profile-contact-locations');
 const before=await getProfileContactLocations(f.db,'registered','registered-owner');
 const body={sellerId:'registered',ownerId:'registered-owner',action:'save_locations',expectedRevision:before.locations.revision,pickupAddress:'SYNTHETIC PRIVATE PICKUP CURRENT OWNER',returnAddress:'SYNTHETIC PRIVATE RETURN CURRENT OWNER',requestId:crypto.randomUUID()};
 const request=(actor:string)=>new Request(origin+'/api/seller/public-profile',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});
 const wrong=await api.POST(request('external-profile-owner'));assert.equal(wrong.status,403);assert.deepEqual((await getProfileContactLocations(f.db,'registered','registered-owner')).locations,before.locations);
 const own=await api.POST(request('registered-owner'));assert.equal(own.status,200,await own.text());const saved=await getProfileContactLocations(f.db,'registered','registered-owner');assert.equal(saved.locations.pickupAddress,body.pickupAddress);
 const replay=await api.POST(request('registered-owner'));assert.equal(replay.status,200,await replay.text());assert.equal((await getProfileContactLocations(f.db,'registered','registered-owner')).locations.revision,saved.locations.revision);
}finally{f.dispose();}});

for(const entry of ['api','domain'] as const)void test('private public-profile '+entry+' refuses authority lost during private projections',async()=>{const f=await sellerProfileScopeFixture();const prepare=f.db.prepare.bind(f.db);try{
 const api=await import('../app/api/seller/public-profile/route'),{getPublicProfileWorkspace}=await import('../lib/sellers/public-profile-workflow');let changed=false;
 const wrap=(statement:D1PreparedStatement):D1PreparedStatement=>new Proxy(statement,{get(target,key){if(key==='bind')return(...values:unknown[])=>wrap(target.bind(...values));if(key==='all')return async()=>{const rows=await target.all();if(!changed){changed=true;f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='registered-owner'").run();}return rows;};const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
 f.db.prepare=(sql:string)=>/FROM seller_profile_media WHERE seller_id/.test(sql)?wrap(prepare.call(f.db,sql)):prepare.call(f.db,sql);
 if(entry==='api'){const response=await api.GET(new Request(origin+'/api/seller/public-profile',{headers:{'X-Hastabazaar-Actor':'registered-owner'}}));assert.equal(response.status,403);assert.equal((await response.json()as{ownerId?:string}).ownerId,undefined);}
 else await assert.rejects(getPublicProfileWorkspace(f.db,'registered','registered-owner','owner',Date.now()),(error:unknown)=>(error as{status?:number}).status===403);
 assert.equal(changed,true,'revoke after an actual private projection query, not before entry');
}finally{f.db.prepare=prepare;f.dispose();}});
