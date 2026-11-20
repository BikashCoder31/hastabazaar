import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
/** Upgrade only a declared old synthetic request fixture, never a retained bank history or file database. */
export async function payoutRequestBankFixture(sqlite:DatabaseSync,db:D1Database,sellerId:string){
 assert.ok(sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM seller_beneficiary_versions WHERE seller_id=?').get(sellerId)!.n,0);
 const existing=sqlite.prepare("SELECT r.user_id FROM user_roles r JOIN users u ON u.id=r.user_id WHERE r.role='super_admin' AND u.status='active' LIMIT 1").get();
 const reviewer=existing?String(existing.user_id):'fixture-bank-reviewer';
 if(!existing)sqlite.exec("INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('fixture-bank-reviewer','fixture-bank-reviewer@local.hastabazaar.test','Fictional bank reviewer','active',1,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('fixture-bank-reviewer','super_admin',1)");
 sqlite.prepare("UPDATE seller_profiles SET applicant_type='individual',tax_mode='NONE',payout_account_reference=NULL WHERE id=?").run(sellerId);
 const seller=sqlite.prepare('SELECT user_id,legal_name FROM seller_profiles WHERE id=?').get(sellerId)!;
 assert.notEqual(seller.user_id,reviewer);
 const identity='request-fixture-identity-'+sellerId;
 sqlite.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at) VALUES(?,?,'representative_identity',?,'identity.png','image/png',20,'verified',?,?,?)").run(identity,sellerId,'private/seller-documents/'+sellerId+'/'+identity,Date.now(),reviewer,Date.now());
 const before=await sellerBankState(db,sellerId),bankId='request-fixture-bank-'+sellerId;
 await submitSellerBankDetails(db,{sellerId,actorId:String(seller.user_id),revision:before.revision,now:Date.now(),details:{payoutBeneficiary:String(seller.legal_name),bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'TEST-REQUEST-001'},document:{id:bankId,kind:'bank_verification',objectKey:'private/seller-documents/'+sellerId+'/'+bankId,originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
 const pending=await sellerBankState(db,sellerId);await reviewSellerBankDetails(db,{sellerId,actorId:reviewer,revision:pending.revision,reference:'FICTIONAL-REQUEST-OWNER-VERIFICATION',reason:'Independent fictional owner and bank identity verification for this request fixture.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'request-fixture-verify-'+sellerId,now:Date.now()});
}
