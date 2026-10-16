import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { earnedMaker } from './helpers/company-store-financial-fixture';
const context=globalThis as typeof globalThis & {companyPrepDb:D1Database;companyPrepRole:'admin'|'super_admin'|null;companyPrepSends:number};
registerHooks({resolve(specifier,ctx,next){const stubs:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.companyPrepDb}}',
 '@/lib/auth/staff':'export class StaffAuthorizationError extends Error{constructor(message,status){super(message);this.status=status}};export async function requireStaffApi(permission){if(permission!=="order.manage")throw Error("Wrong permission");if(!globalThis.companyPrepRole)throw new StaffAuthorizationError("Authentication required",401);return {id:"reviewer",role:globalThis.companyPrepRole}}',
 '@/lib/email/send-order-updates':'export async function sendPendingOrderUpdates(){globalThis.companyPrepSends++}',
 };return stubs[specifier]?{url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true}:next(specifier,ctx);}});
void test('actual admin fulfillment handler restricts company preparation and saves its published form and notifications',async()=>{
 const f=await earnedMaker('calculated');context.companyPrepDb=f.db;context.companyPrepRole=null;context.companyPrepSends=0;
 try{
  f.sqlite.prepare(`INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
   VALUES('route-prepare-v1','staff.order-fulfillment',1,'published',?,'SIMULATED','reviewer',1,'reviewer',1,'reviewer',1,'route-publish')`)
   .run(JSON.stringify({formId:'staff.order-fulfillment',fields:[]}));
  const {POST}=await import('../app/api/admin/orders/[id]/fulfillment/route');
  const body={action:'start_packing',sellerId:f.sellerId,note:'SIMULATED route packing',requestId:'route-company-pack',formVersion:1,customAnswers:[]};
  const send=(data:Record<string,unknown>=body,origin='https://company-prep.test')=>POST(new Request('https://company-prep.test/api/admin/orders/'+f.orderId+'/fulfillment',{
   method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(data)}),{params:Promise.resolve({id:f.orderId})});
  assert.equal((await send(body,'https://hostile.test')).status,403);
  assert.equal((await send()).status,401);
  context.companyPrepRole='admin';
  for(const action of ['start_packing','ready_for_pickup'])assert.equal((await send({...body,action})).status,403);
  context.companyPrepRole='super_admin';
  assert.equal((await send({...body,sellerId:undefined})).status,400);
  assert.equal((await send({...body,sellerId:''})).status,400);
  assert.equal((await send({...body,action:'dispatch'})).status,400,'Ordinary order actions cannot accept a maker selector');
  assert.equal((await send({...body,sellerId:'foreign'})).status,409);
  assert.equal((await send()).status,200);
  assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items').get()?.fulfillment_status,'packing');
  assert.equal(context.companyPrepSends,1,'Committed company preparation must flush queued order updates');
  assert.equal((await send({...body,action:'ready_for_pickup',requestId:'route-company-ready'})).status,200);
  assert.equal(f.sqlite.prepare('SELECT fulfillment_status FROM order_items').get()?.fulfillment_status,'ready_for_pickup');
  assert.equal(context.companyPrepSends,2);
  assert.equal(f.sqlite.prepare("SELECT count(*) n FROM form_answer_sets WHERE form_id='staff.order-fulfillment'").get()?.n,2);
 }finally{f.dispose();}
});
