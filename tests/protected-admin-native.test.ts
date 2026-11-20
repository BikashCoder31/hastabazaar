import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../lib/sellers/bank-details';
import {requestProtectedChange,reviewProtectedChangePermission} from '../lib/sellers/protected-change-requests';
import {submitProtectedIdentityChange,verifyProtectedIdentityChange} from '../lib/sellers/protected-identity-change';
import {revalidateCurrentBankAfterIdentity} from '../lib/sellers/protected-change-disposition';
import {readProtectedAdminOutcome,type ProtectedAdminAction} from '../lib/sellers/protected-admin-recovery';

void test('nonpersistent native D1 proves original protected bank identity permission and disposition outcomes',async()=>{
 const f=await createIncentiveDb();try{
  await f.db.batch([
   f.db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('owner','owner','owner@local.hastabazaar.test','Fictional Owner','active',1,1),('reviewer','reviewer','reviewer@local.hastabazaar.test','Fictional Reviewer','active',1,1)"),
   f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','customer',1),('reviewer','super_admin',1)"),
   f.db.prepare("INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,applicant_type,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES('native-seller','owner','Fictional Native','Fictional Native Studio','individual','Fixture','FIX-NATIVE','NONE','','Fictional Native','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','submitted',1,1)"),
   f.db.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at) VALUES('native-original','native-seller','representative_identity','private/seller-documents/native-seller/native-original','original.png','image/png',20,'verified',1,'reviewer',1)"),
  ]);
  const initial=await sellerBankState(f.db,'native-seller');
  await submitSellerBankDetails(f.db,{sellerId:'native-seller',actorId:'owner',revision:initial.revision,commandId:'native-bank-submit',now:10,details:{payoutBeneficiary:'Fictional Native',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'123456789'},document:{id:'native-bank',kind:'bank_verification',objectKey:'private/seller-documents/native-seller/native-bank',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
  const pending=await sellerBankState(f.db,'native-seller');
  await reviewSellerBankDetails(f.db,{sellerId:'native-seller',actorId:'reviewer',actorAuthSubject:'reviewer',revision:pending.revision,reference:'NATIVE-ORIGINAL-BANK',reason:'Actual fictional bank ownership independently inspected.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'native-bank-verify',now:11});
  const bank=await sellerBankState(f.db,'native-seller');
  const caseId=await requestProtectedChange(f.db,{sellerId:'native-seller',actorId:'owner',kind:'identity',fields:['legalName','representative_identity'],reason:'Correct the same original fictional legal identity.',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:'native-request',now:12});
  const permission={caseId,actorId:'reviewer',actorAuthSubject:'reviewer',expectedVersion:0,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,decision:'permit' as const,reason:'Permit only the same legal identity correction.',requestId:'native-permission',now:13};
  let arrivals=0,release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),concurrentDb=Object.create(f.db) as D1Database;
  concurrentDb.batch=(async(statements:D1PreparedStatement[])=>{arrivals++;if(arrivals===2)release();await gate;return f.db.batch(statements);}) as D1Database['batch'];
  const [permissionId,concurrentPermissionId]=await Promise.all([reviewProtectedChangePermission(concurrentDb,permission),reviewProtectedChangePermission(concurrentDb,permission)]);
  assert.equal(arrivals,2);assert.equal(concurrentPermissionId,permissionId);
  const savedPermissions=(await f.db.prepare('SELECT id FROM seller_protected_change_permissions WHERE case_id=?').bind(caseId).all<{id:string}>()).results;
  assert.deepEqual(savedPermissions,[{id:permissionId}]);
  await submitProtectedIdentityChange(f.db,{sellerId:'native-seller',caseId,permissionId:permissionId!,actorId:'owner',values:{legalName:'Fictional Native Corrected'},documents:[{id:'native-replacement',kind:'representative_identity',objectKey:'private/seller-documents/native-seller/native-replacement',originalName:'new-id.png',mimeType:'image/png',sizeBytes:20}],requestId:'native-upload',now:14});
  await verifyProtectedIdentityChange(f.db,{...permission,expectedVersion:2,sameLegalPersonConfirmed:true,evidenceReference:'NATIVE-IDENTITY',requestId:'native-identity',now:15});
  const changed=await sellerBankState(f.db,'native-seller');
  await revalidateCurrentBankAfterIdentity(f.db,{...permission,expectedVersion:3,expectedIdentityRevision:changed.identityRevision,expectedBankRevision:changed.bankRevision,ownershipConfirmed:true,ownershipBasis:'same_person',evidenceReference:'NATIVE-REVALIDATION',requestId:'native-disposition',now:16});
  for(const [action,requestId,sourceId] of [['bank-details','native-bank-verify','native-seller'],['permission','native-permission',caseId],['verify-identity','native-identity',caseId],['disposition','native-disposition',caseId]] as [ProtectedAdminAction,string,string][]){
   const outcome=await readProtectedAdminOutcome(f.db,{actorId:'reviewer',actorAuthSubject:'reviewer',action,requestId,sourceId,now:17});assert.equal(outcome?.recorded,true);assert.equal(outcome?.requestId,requestId);assert.equal(outcome?.action,action);
  }
  assert.equal(await reviewProtectedChangePermission(f.db,permission),permissionId);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM seller_protected_change_events WHERE action='admin_command_recorded'").first<{n:number}>())!.n,4);
  await assert.rejects(f.db.prepare("UPDATE seller_protected_change_events SET payload_json='{}' WHERE action='admin_command_recorded'").run(),/immutable/);
  await f.db.prepare("UPDATE users SET auth_subject='rebound' WHERE id='reviewer'").run();
  await assert.rejects(readProtectedAdminOutcome(f.db,{actorId:'reviewer',actorAuthSubject:'rebound',action:'permission',requestId:'native-permission',sourceId:caseId,now:18}),/original reviewer identity/);
 }finally{await f.dispose();}
});
