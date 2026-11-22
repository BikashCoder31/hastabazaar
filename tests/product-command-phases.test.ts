import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {productPublicationFixture} from './helpers/product-publication-fixture';
import {getProductPublicationReview} from '../lib/products/publication';
import {staffMutationGuard} from '../lib/db/repositories/staff-mutation-guard';
declare global{var productPhaseDb:D1Database;var productPhaseAuthority:(permission:string)=>Promise<{id:string;role:string}>;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.productPhaseDb}}',shortCircuit:true};
 if(specifier==='@/lib/auth/staff')return{url:'data:text/javascript,export class StaffAuthorizationError extends Error{constructor(message,status=403){super(message);this.status=status}};export async function requireStaffApi(permission){return globalThis.productPhaseAuthority(permission)}',shortCircuit:true};
 return next(specifier,context);
}});
function receiptReadFailure(statement:D1PreparedStatement,failed:()=>boolean):D1PreparedStatement{
 return new Proxy(statement,{get(target,key){if(key==='bind')return(...values:unknown[])=>receiptReadFailure(target.bind(...values),failed);if(key==='first')return(...values:[])=>{if(failed())throw Error('guard receipt readback unavailable');return target.first(...values);};const value:unknown=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}});
}
for(const loseReadback of [false,true])void test(`actual Product COMMIT acknowledgement loss ${loseReadback?'with unavailable original receipt stays unconfirmed':'recovers its native original receipt'}`,async()=>{
 const f=await productPublicationFixture('',Date.now()-1000);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const view=await getProductPublicationReview(f.db,'reviewer',f.sent.caseId),requestId=loseReadback?'product-commit-readback-lost':'product-commit-ack-lost';let committed=false;
  globalThis.productPhaseDb={prepare(sql:string){const statement=f.db.prepare(sql);return /^\s*SELECT/i.test(sql)&&sql.includes('command_key')?receiptReadFailure(statement,()=>committed&&loseReadback):statement;},async batch(statements:D1PreparedStatement[]){const result=await f.db.batch(statements);if(!committed&&f.sqlite.prepare("SELECT 1 FROM audit_logs WHERE request_id=? AND action='product.publication.request_changes'").get(requestId)){committed=true;throw Error('guard transport response lost after actual COMMIT');}return result;}} as D1Database;
  globalThis.productPhaseAuthority=async permission=>{const proof=await staffMutationGuard(f.db,'reviewer',permission as never,Error);return{id:'reviewer',role:proof.role};};
  const api=await import('../app/api/admin/product-publications/route'),body={action:'request_changes',caseId:f.sent.caseId,versionId:view.candidate.versionId,expectedCaseRevision:String(view.caseRevision),expectedRevision:String(view.revision),checks:null,reason:'Actual native commit acknowledgement test.',requestId};
  const send=(value:unknown)=>api.POST(new Request('https://product-phase.test/api/admin/product-publications',{method:'POST',headers:{origin:'https://product-phase.test','content-type':'application/json','X-Hastabazaar-Actor':'reviewer'},body:JSON.stringify(value)}));
  const response=await send(body),data:unknown=await response.json();assert.equal(committed,true);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND action='product.publication.request_changes'").get(requestId)?.n,1);
  if(loseReadback){assert.equal(response.status,503);assert.ok(data&&typeof data==='object'&&'phase'in data);assert.equal(data.phase,'outcome_unconfirmed');}
  else assert.equal(response.status,200);
  globalThis.productPhaseDb=f.db;assert.equal((await send(body)).status,200,'Exact original replay survives acknowledgement/readback loss');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE request_id=? AND action='product.publication.request_changes'").get(requestId)?.n,1);
  const invalid=await send({...body,requestId:'different-native-attempt',unsupported:true}),invalidData:unknown=await invalid.json();assert.equal(invalid.status,400);assert.ok(invalidData&&typeof invalidData==='object'&&'phase'in invalidData);assert.equal(invalidData.phase,'rejected_before_write');
 }finally{f.dispose();}
});
