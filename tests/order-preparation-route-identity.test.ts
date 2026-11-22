import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {actionableOrderFixture} from './helpers/order-response-fixture';

const state={db:null as D1Database|null,subject:'',email:''};
(globalThis as typeof globalThis&{preparationIdentityFixture:typeof state}).preparationIdentityFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.preparationIdentityFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",NODE_ENV:"development",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const s=globalThis.preparationIdentityFixture;return{userId:s.subject,email:s.email,fullName:"Fictional preparation staff",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

for(const method of ['GET','POST'] as const)void test(`preparation ${method} rejects unadopted identity before invitation acceptance or provisioning`,async()=>{
 const f=await actionableOrderFixture();state.db=f.db;try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const {createStaffInvitation}=await import('../lib/db/repositories/staff');
  const invitation=await createStaffInvitation(f.db,{email:'pending-preparation-staff@local.hastabazaar.test',role:'admin',permissions:['order.manage'],invitedBy:'reviewer',now:Date.now()});
  state.subject='unadopted-preparation-subject';state.email='pending-preparation-staff@local.hastabazaar.test';
  const rows=()=>JSON.stringify(['users','user_roles','staff_permission_profiles','staff_invitations','staff_invitation_grants','audit_logs'].map(table=>[table,f.sqlite.prepare('SELECT * FROM '+table+' ORDER BY 1').all()]));const before=rows();
  const query=new URL('http://localhost:3018/api/admin/order-responses');for(const[k,v]of Object.entries({orderId:f.orderId,action:'report',sourceId:String(f.rows[0].portionId),attempt:crypto.randomUUID()}))query.searchParams.set(k,v);
  const api=await import('../app/api/admin/order-responses/route');
  const response=await api[method](new Request(query,{method,headers:{origin:'http://localhost:3018',...(method==='POST'?{'X-Hastabazaar-Actor':'reviewer','content-type':'application/json'}:{})},...(method==='POST'?{body:JSON.stringify({action:'report',requestId:crypto.randomUUID(),expectedRevision:null,input:{portionId:String(f.rows[0].portionId),itemIds:[String(f.rows[0].id)],kind:'delay',detail:'PRIVATE old actor preparation text must not be adopted.',proposedReadyAt:null}})}:{})}));
  assert.equal(response.status,403,await response.clone().text());assert.equal(rows(),before,'Rejected intent/read-only recovery must not accept an invitation or create staff.');
  assert.equal(f.sqlite.prepare('SELECT status FROM staff_invitations WHERE id=?').get(invitation.id)!.status,'pending');
 }finally{f.dispose();state.db=null;}
});

void test('preparation native commit fences the authenticated staff subject captured by its actual API',async()=>{
 const f=await actionableOrderFixture();state.db=f.db;state.subject='reviewer';state.email='reviewer@local.hastabazaar.test';try{
  const requestId=crypto.randomUUID(),row=f.rows[0];f.setBeforeBatch(()=>{f.sqlite.exec("UPDATE users SET auth_subject='rebound-preparation-reviewer' WHERE id='reviewer'");});
  const api=await import('../app/api/admin/order-responses/route');
  const response=await api.POST(new Request('http://localhost:3018/api/admin/order-responses',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify({action:'report',requestId,expectedRevision:null,input:{portionId:String(row.portionId),itemIds:[String(row.id)],kind:'delay',detail:'The original authenticated reviewer reports this fictional preparation issue.',proposedReadyAt:null}})}));
  assert.ok([403,409].includes(response.status),await response.clone().text());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').get(requestId)!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_response_cases').get()!.n,0);
 }finally{f.dispose();state.db=null;}
});

void test('preparation owner report cannot commit after its last Seller Center role is revoked',async()=>{
 const f=await actionableOrderFixture();state.db=f.db;state.subject='registered-owner';state.email='registered-owner@local.hastabazaar.test';try{
  let revoked=false;f.setBeforeBatch(()=>{revoked=true;f.sqlite.exec("DELETE FROM user_roles WHERE user_id='registered-owner' AND role IN('customer','seller')");});
  const row=f.rows[0],requestId=crypto.randomUUID(),api=await import('../app/api/seller/order-responses/route');
  const response=await api.POST(new Request('http://localhost:3018/api/seller/order-responses',{method:'POST',headers:{origin:'http://localhost:3018','content-type':'application/json','X-Hastabazaar-Actor':'registered-owner'},body:JSON.stringify({action:'report',requestId,expectedRevision:null,input:{portionId:String(row.portionId),itemIds:[String(row.id)],kind:'delay',detail:'Private owner preparation detail must not commit after current access is revoked.',proposedReadyAt:null}})}));
  assert.equal(revoked,true);assert.equal(response.status,403,await response.clone().text());
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND request_id=?').get(requestId)!.n,0);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM order_response_cases').get()!.n,0);
 }finally{f.dispose();state.db=null;}
});
