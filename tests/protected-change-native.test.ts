import assert from 'node:assert/strict';
import test from 'node:test';
import {createIncentiveDb} from './helpers/incentive-db';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../lib/sellers/bank-details';
import {requestProtectedChange,reviewProtectedChangePermission} from '../lib/sellers/protected-change-requests';
import {submitProtectedIdentityChange,verifyProtectedIdentityChange} from '../lib/sellers/protected-identity-change';
import {disposeProtectedHolds,revalidateCurrentBankAfterIdentity} from '../lib/sellers/protected-change-disposition';
import {protectedCapabilityState} from '../lib/sellers/protected-change-policy';

void test('native ephemeral D1 verifies identity and beneficiary versions while retaining explicit order readiness',async()=>{
  // Random, nonpersistent Miniflare database; no canonical bindings or paths.
  const f=await createIncentiveDb();try{
    await f.db.batch([
      f.db.prepare("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('owner','owner@local.hastabazaar.test','Fictional Owner','active',1,1),('reviewer','reviewer@local.hastabazaar.test','Fictional Reviewer','active',1,1)"),
      f.db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('owner','customer',1),('reviewer','super_admin',1)"),
      f.db.prepare(`INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,applicant_type,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at)
        VALUES('native-seller','owner','Fictional Native','Fictional Native Studio','individual','Fixture','FIX-NATIVE','NONE','','Fictional Native','9800000000','owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional Workshop','submitted',1,1)`),
      f.db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at)
        VALUES('native-original','native-seller','representative_identity','private/seller-documents/native-seller/native-original','original.png','image/png',20,'verified',1,'reviewer',1)`),
    ]);
    const initial=await sellerBankState(f.db,'native-seller');
    await submitSellerBankDetails(f.db,{sellerId:'native-seller',actorId:'owner',revision:initial.revision,commandId:'native-bank-submit',now:10,
      details:{payoutBeneficiary:'Fictional Native',bankName:'Fictional Bank',bankBranch:'Fictional Branch',bankAccountNumber:'123456789'},
      document:{id:'native-bank',kind:'bank_verification',objectKey:'private/seller-documents/native-seller/native-bank',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
    const pending=await sellerBankState(f.db,'native-seller');
    await reviewSellerBankDetails(f.db,{sellerId:'native-seller',actorId:'reviewer',revision:pending.revision,reference:'NATIVE-BANK-OWNERSHIP',reason:'Actual fictional identity and bank ownership inspected',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'native-bank-verify',now:11});
    const bank=await sellerBankState(f.db,'native-seller');
    const caseId=await requestProtectedChange(f.db,{sellerId:'native-seller',actorId:'owner',kind:'identity',fields:['legalName','representative_identity'],reason:'Correct the legal spelling for this same native fixture person',expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,requestId:'native-identity-request',now:12});
    const permissionId=await reviewProtectedChangePermission(f.db,{caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,decision:'permit',reason:'Permit only the exact identity name and proof correction',requestId:'native-identity-permit',now:13});
    const submission={sellerId:'native-seller',caseId,permissionId:permissionId!,actorId:'owner',values:{legalName:'Fictional Native Corrected'},documents:[{id:'native-replacement',kind:'representative_identity' as const,objectKey:'private/seller-documents/native-seller/native-replacement',originalName:'new-id.png',mimeType:'image/png',sizeBytes:20}],requestId:'native-identity-upload',now:14};
    await submitProtectedIdentityChange(f.db,submission);await submitProtectedIdentityChange(f.db,submission);
    await verifyProtectedIdentityChange(f.db,{caseId,actorId:'reviewer',expectedVersion:2,expectedIdentityRevision:bank.identityRevision,expectedBankRevision:bank.bankRevision,sameLegalPersonConfirmed:true,evidenceReference:'NATIVE-SAME-PERSON-REVIEW',reason:'Actual fictional evidence confirms this same person and corrected name',requestId:'native-identity-verify',now:15});
    const changed=await sellerBankState(f.db,'native-seller');
    const release={caseId,actorId:'reviewer',expectedVersion:3,expectedIdentityRevision:changed.identityRevision,expectedBankRevision:changed.bankRevision,release:true,capabilities:['payouts'] as Array<'payouts'>,currentEvidenceValidConfirmed:true,bankOwnershipConfirmed:true,evidenceReference:'NATIVE-READINESS-REVIEW',reason:'Current bank must be revalidated before resolving the payout hold',requestId:'native-release',now:17};
    await assert.rejects(disposeProtectedHolds(f.db,release));
    await revalidateCurrentBankAfterIdentity(f.db,{caseId,actorId:'reviewer',expectedVersion:3,expectedIdentityRevision:changed.identityRevision,expectedBankRevision:changed.bankRevision,ownershipConfirmed:true,ownershipBasis:'same_person',evidenceReference:'NATIVE-BANK-REVALIDATED',reason:'Current original account belongs to this corrected legal identity',requestId:'native-revalidate',now:16});
    const current=await sellerBankState(f.db,'native-seller');
    await disposeProtectedHolds(f.db,{...release,expectedVersion:4,expectedIdentityRevision:current.identityRevision,expectedBankRevision:current.bankRevision});
    const state=await protectedCapabilityState(f.db,'native-seller');assert.equal(state.payoutsHeld,false);assert.equal(state.newOrdersHeld,true);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM seller_identity_fact_versions").first<{n:number}>())?.n,1);
    assert.equal((await f.db.prepare("SELECT COUNT(*) AS n FROM seller_beneficiary_versions").first<{n:number}>())?.n,2);
    await assert.rejects(f.db.prepare('DELETE FROM seller_identity_fact_versions').run(),/retained/);
  }finally{await f.dispose();}
});
