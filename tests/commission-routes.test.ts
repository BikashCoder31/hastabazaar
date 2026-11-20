import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { commissionDatabase } from './helpers/commission-database';
import { nepalDateTimeInput } from '../lib/commission/rates';
import {scheduleCommissionRate,cancelCommissionRate} from '../lib/db/repositories/commission-rates';

declare global {
  var commissionHttpDb: D1Database;
  var commissionHttpStaff: {id:string;role:'admin'|'super_admin'}|null;
  var commissionHttpSeller: {sellerId:string;userId:string}|null;
}
registerHooks({resolve(specifier,context,nextResolve){
  const source=specifier==='cloudflare:workers'?'export const env={get DB(){return globalThis.commissionHttpDb}}':
    specifier==='@/lib/auth/staff'?`export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){if(permission!=='commercial_policy.manage')throw Error('Wrong capability');const a=globalThis.commissionHttpStaff;if(!a)throw new StaffAuthorizationError('Sign in.',401);if(a.role!=='super_admin')throw new StaffAuthorizationError('Not allowed.',403);return a;}`:
    specifier==='@/lib/auth/seller'?`export class SellerAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireSellerApi(){if(!globalThis.commissionHttpSeller)throw new SellerAuthorizationError('Sign in.',401);return globalThis.commissionHttpSeller;}`:null;
  return source?{url:'data:text/javascript,'+encodeURIComponent(source),shortCircuit:true}:nextResolve(specifier,context);
}});

function request(path:string,body:unknown,origin='http://localhost:3018',raw=false){
  return new Request('http://localhost:3018'+path,{method:'POST',headers:{origin,'Content-Type':'application/json'},body:raw?String(body):JSON.stringify(body)});
}
void test('Commission HTTP routes reject blocked requests and derive actors and sellers from the signed-in session',async()=>{
  const f=await commissionDatabase();
  globalThis.commissionHttpDb=f.database;
  globalThis.commissionHttpStaff=null;
  globalThis.commissionHttpSeller=null;
  const admin=await import('../app/api/admin/commission/route');
  const seller=await import('../app/api/seller/commission/route');
  const body={action:'schedule',percent:'12.25',effectiveAt:nepalDateTimeInput(Date.now()+16*86_400_000),expectedRevision:0,requestId:'http-rate',reason:'Review the fictional future fee schedule.'};
  try{
    for(const route of [admin,seller]){
      assert.equal((await route.POST(request('/api/commission',body,'https://untrusted.example'))).status,403);
      assert.equal((await route.POST(request('/api/commission',body))).status,401);
    }
    globalThis.commissionHttpStaff={id:'staff',role:'admin'};
    assert.equal((await admin.POST(request('/api/admin/commission',{...body,actorId:'owner'}))).status,403);
    globalThis.commissionHttpStaff={id:'owner',role:'super_admin'};
    for(const invalid of [null,[],{}, {...body,percent:'9.001'}]) assert.equal((await admin.POST(request('/api/admin/commission',invalid))).status,400);
    assert.equal((await admin.POST(request('/api/admin/commission','{','http://localhost:3018',true))).status,400);
    const saved=await admin.POST(request('/api/admin/commission',{...body,actorId:'staff'}));
    assert.equal(saved.status,409);
    assert.equal(saved.headers.get('cache-control'),'no-store');
    assert.equal((await admin.POST(request('/api/admin/commission',body))).status,409);
    await scheduleCommissionRate(f.database,{actorId:'owner',requestId:'http-rate',expectedRevision:0,basisPoints:1225,effectiveAt:Date.now()+16*86400000,reason:body.reason,now:Date.now()});
    assert.equal((await f.database.prepare('SELECT COUNT(*) n FROM commission_rate_changes').first<{n:number}>())?.n,1);
    assert.equal((await f.database.prepare('SELECT created_by FROM commission_rate_changes').first<{created_by:string}>())?.created_by,'owner');
    globalThis.commissionHttpSeller={sellerId:'seller-a',userId:'user-a'};
    for(const invalid of [null,{}, {accepted:false,rateId:'http-rate'}]) assert.equal((await seller.POST(request('/api/seller/commission',invalid))).status,400);
    assert.equal((await seller.POST(request('/api/seller/commission','{','http://localhost:3018',true))).status,400);
    assert.equal((await seller.POST(request('/api/seller/commission',{accepted:true,rateId:'http-rate',sellerId:'seller-b',userId:'user-b'}))).status,200);
    assert.deepEqual((await f.database.prepare('SELECT seller_id,actor_id FROM commission_rate_acceptances').all()).results.map(row=>({...row})),[{seller_id:'seller-a',actor_id:'user-a'}]);
    assert.equal((await admin.POST(request('/api/admin/commission',{action:'cancel',rateId:'http-rate',requestId:'http-cancel',expectedRevision:1,reason:'Cancel the fictional future schedule.'}))).status,409);
    await cancelCommissionRate(f.database,{actorId:'owner',rateId:'http-rate',requestId:'http-cancel',expectedRevision:1,reason:'Cancel the isolated historical fixture schedule.',now:Date.now()});
    assert.equal((await seller.POST(request('/api/seller/commission',{accepted:true,rateId:'http-rate'}))).status,409);
  }finally{await f.dispose();}
});
