import assert from 'node:assert/strict';
import {refundPacketFixture} from './refund-funding-fixture';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
import {prepareSellerPayout} from '../../lib/db/repositories/payouts';
/** Fresh memory-only actual-money facts; all people/banks are fictional. */
export async function payoutTransferFixture(){const f=await refundPacketFixture();try{
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.exec(`INSERT INTO users(id,email,display_name,status,created_at,updated_at) VALUES('payout-owner','payout-owner@local.hastabazaar.test','Fictional registered owner','active',1,1);
 INSERT INTO user_roles(user_id,role,assigned_at) VALUES('payout-owner','seller',1);
 INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,applicant_type,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at)
 VALUES('payout-seller','payout-owner','Fictional Registered Owner','Fictional payout shop','individual','Local','TEST-PAYOUT','NONE','','Fictional owner','9800000000','payout-owner@local.hastabazaar.test','Bagmati','Kathmandu','Kathmandu','Fictional street','approved',1,1);
 INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at,reviewed_by,reviewed_at) VALUES('payout-identity','payout-seller','representative_identity','private/seller-documents/payout-seller/payout-identity','identity.png','image/png',20,'verified',1,'reviewer',1);
 INSERT INTO seller_ledger_entries(id,seller_id,type,amount_paisa,available_at,description,created_at) VALUES('payout-earned','payout-seller','sale',20000,1,'Explicit independent fictional original earned balance',1)`);
 const state=await sellerBankState(f.db,'payout-seller');
 await submitSellerBankDetails(f.db,{sellerId:'payout-seller',actorId:'payout-owner',revision:state.revision,now:Date.now(),details:{payoutBeneficiary:'Fictional Registered Owner',bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'TEST-PAYOUT-001'},document:{id:'payout-bank-proof',kind:'bank_verification',objectKey:'private/seller-documents/payout-seller/payout-bank-proof',originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
 const pending=await sellerBankState(f.db,'payout-seller');await reviewSellerBankDetails(f.db,{sellerId:'payout-seller',actorId:'reviewer',revision:pending.revision,reference:'FICTIONAL-INDEPENDENT-BANK-OWNERSHIP',reason:'Reviewed the original fictional identity and actual beneficiary ownership.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'payout-bank-verification',now:Date.now()});
 const payout=await prepareSellerPayout(f.db,{sellerId:'payout-seller',actorId:'reviewer',actorRole:'super_admin',note:'Prepare all original eligible registered earnings for manual payout.',requestId:'native-payout-prepared',now:Date.now()});
 return {...f,payoutId:payout.id,sellerId:'payout-seller'};
 }catch(error){f.dispose();throw error;}}
