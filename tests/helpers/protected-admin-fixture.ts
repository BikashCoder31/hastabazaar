import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './complete-version-fixture';

export const origin='http://localhost:3018';export const state={db:null as D1Database|null,actor:'reviewer'};
(globalThis as typeof globalThis&{protectedAdminFixture:typeof state}).protectedAdminFixture=state;
registerHooks({resolve(specifier,context,next){const modules:Record<string,string>={
 'cloudflare:workers':'export const env={get DB(){return globalThis.protectedAdminFixture.db},HASTABAZAAR_RUNTIME_ENV:"local_staging",APP_ORIGIN:"http://localhost:3018"};',
 'next/navigation':'export function redirect(url){throw Error(url)};',
 '@/app/auth':'export async function getAuthenticatedUser(){const actor=globalThis.protectedAdminFixture.actor;return{userId:actor,email:actor+"@local.hastabazaar.test",fullName:"Fictional protected reviewer",mailboxVerified:true}};export const requireAuthenticatedUser=getAuthenticatedUser;',
 };return modules[specifier]?{url:'data:text/javascript,'+encodeURIComponent(modules[specifier]),shortCircuit:true}:next(specifier,context);}});

type Kind='permission'|'verify-identity'|'disposition'|'bank-details';
export async function protectedTarget(kind:Kind){
 const f=await completeVersionFixture(Date.now()-60_000);state.db=f.db;state.actor='reviewer';
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','super_admin',?)").run(f.now);
 const {verifySellerDocument}=await import('../../lib/sellers/document-review');
 const {sellerBankState,submitSellerBankDetails}=await import('../../lib/sellers/bank-details');
 const {requestProtectedChange,reviewProtectedChangePermission}=await import('../../lib/sellers/protected-change-requests');
 const documentId=String(f.sqlite.prepare("SELECT id FROM seller_documents WHERE seller_id='maker' AND kind='representative_identity'").get()!.id);
 await verifySellerDocument(f.db,{sellerId:'maker',documentId,actorId:'reviewer',reason:'Inspect the original fictional identity evidence.',now:f.now});
 let bank=await sellerBankState(f.db,'maker'),caseId:string,body:Record<string,unknown>;
 if(kind==='bank-details'){
  f.sqlite.prepare("UPDATE seller_profiles SET payout_account_reference=NULL WHERE id='maker'").run();bank=await sellerBankState(f.db,'maker');
  await submitSellerBankDetails(f.db,{sellerId:'maker',actorId:'maker-user',revision:bank.revision,now:f.now+1,details:{payoutBeneficiary:'Fictional Maker',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'123456789'},document:{id:'proof-bank',kind:'bank_verification',objectKey:'private/seller-documents/maker/proof-bank',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
  bank=await sellerBankState(f.db,'maker');caseId=bank.change!.id;
  body={revision:bank.revision,reference:'ORIGINAL-REVIEW',reason:'Actual fictional identity and bank ownership inspected.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:false};
 }else{
  caseId=await requestProtectedChange(f.db,{sellerId:'maker',actorId:'maker-user',kind:'identity',fields:['legalName','representative_identity'],reason:'Correct this same fictional legal person and evidence.',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:crypto.randomUUID(),now:f.now+1});
  let version=0;
  if(kind==='verify-identity'){
   const permissionId=await reviewProtectedChangePermission(f.db,{caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,decision:'permit',reason:'Permit only this fictional identity correction.',requestId:crypto.randomUUID(),now:f.now+2});
   const {submitProtectedIdentityChange}=await import('../../lib/sellers/protected-identity-change');
   await submitProtectedIdentityChange(f.db,{sellerId:'maker',caseId,permissionId:permissionId!,actorId:'maker-user',values:{legalName:'Fictional Corrected Maker'},documents:[{id:'proof-identity',kind:'representative_identity',objectKey:'private/seller-documents/maker/proof-identity',originalName:'identity.png',mimeType:'image/png',sizeBytes:20}],requestId:crypto.randomUUID(),now:f.now+3});version=2;
  }
  body={version,identityRevision:bank.identityRevision,bankRevision:bank.bankRevision,reason:'The original reviewer inspected this fictional protected evidence.',...(kind==='permission'?{decision:'permit'}:kind==='verify-identity'?{sameLegalPersonConfirmed:true,evidenceReference:'ORIGINAL-IDENTITY'}:{action:'retain_holds',capabilities:['new_orders','payouts'],currentEvidenceValidConfirmed:false,bankOwnershipConfirmed:false,evidenceReference:'ORIGINAL-HOLDS'})};
 }
 const api=kind==='bank-details'?await import('../../app/api/admin/seller-applications/[id]/bank-details/route'):kind==='permission'?await import('../../app/api/admin/seller-protected-changes/[id]/permission/route'):kind==='verify-identity'?await import('../../app/api/admin/seller-protected-changes/[id]/verify-identity/route'):await import('../../app/api/admin/seller-protected-changes/[id]/disposition/route');
 const sourceId=kind==='bank-details'?'maker':caseId,path=kind==='bank-details'?`/api/admin/seller-applications/${sourceId}/bank-details`:`/api/admin/seller-protected-changes/${sourceId}/${kind}`;
 const commandId=crypto.randomUUID();body.commandId=commandId;
 const request=(actor='reviewer')=>new Request(origin+path,{method:'POST',headers:{origin,'Content-Type':'application/json','X-Hastabazaar-Actor':actor},body:JSON.stringify(body)});
 const query=(actor='reviewer')=>new Request(origin+path+'?commandId='+commandId,{headers:{'X-Hastabazaar-Actor':actor}});
 return{...f,kind,caseId,sourceId,api,path,body,commandId,request,query,context:{params:Promise.resolve({id:sourceId})}};
}
