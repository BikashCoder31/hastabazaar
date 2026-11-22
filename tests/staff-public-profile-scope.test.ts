import './helpers/seller-registration-runtime';
import assert from 'node:assert/strict';
import test from 'node:test';
import {staffPublicProfileScopeFixture} from './helpers/staff-public-profile-scope-fixture';
import {registrationScopeOrigin as origin} from './helpers/seller-registration-scope-fixture';

void test('actual staff profile receiver refuses rendered reviewer A under current authorized reviewer B',async()=>{const f=await staffPublicProfileScopeFixture();try{
 const payload=f.payload(),before=f.sqlite.prepare("SELECT COUNT(*) n FROM seller_public_profile_corrections WHERE seller_id='registered'").get()!.n;
 const request=(actor:string)=>new Request(origin+'/api/admin/sellers/registered/public-profile',{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(payload)}),context={params:Promise.resolve({id:'registered'})};
 const wrong=await f.api.POST(request('reviewer'),context);assert.equal(wrong.status,403,'the header must reject old intent even when B independently has native authority');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_public_profile_corrections WHERE seller_id='registered'").get()!.n,before);
 const own=await f.api.POST(request('profile-reviewer-b'),context);assert.equal(own.status,200,await own.text());const replay=await f.api.POST(request('profile-reviewer-b'),context);assert.equal(replay.status,200,await replay.text());assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM seller_public_profile_corrections WHERE seller_id='registered'").get()!.n,Number(before)+1);
}finally{globalThis.registrationScopeIdentity=null;f.dispose();}});
