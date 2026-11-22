import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {verifySellerDocument} from '../../lib/sellers/document-review';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../../lib/payments/company-accounts';
import {recordRefundFundingStatement} from '../../lib/payments/refund-funding';
import {companyDetails} from '../../lib/content/company-details';
/** Adds independently verified fictional source/destination facts only to an already-inspected memory fixture. */
export async function verifiedPayoutSources(f:{db:D1Database;sqlite:DatabaseSync},sellerId:string){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const seller=f.sqlite.prepare('SELECT user_id AS owner,legal_name AS holder FROM seller_profiles WHERE id=?').get(sellerId)!;
 const identity=f.sqlite.prepare("SELECT id,status FROM seller_documents WHERE seller_id=? AND kind='representative_identity' ORDER BY uploaded_at DESC,id DESC LIMIT 1").get(sellerId)!;
 if(identity.status!=='verified')await verifySellerDocument(f.db,{sellerId,documentId:String(identity.id),actorId:'reviewer',reason:'Independently inspect the actual fictional representative identity.',now:Date.now()});
 // This fixture starts without a bank instruction. No historical bank record is overwritten.
 f.sqlite.prepare('UPDATE seller_profiles SET payout_account_reference=NULL WHERE id=?').run(sellerId);
 const state=await sellerBankState(f.db,sellerId),documentId='bank-proof-'+sellerId;
 await submitSellerBankDetails(f.db,{sellerId,actorId:String(seller.owner),revision:state.revision,now:Date.now(),details:{payoutBeneficiary:String(seller.holder),bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'TEST-MANAGED-001'},document:{id:documentId,kind:'bank_verification',objectKey:'private/seller-documents/'+sellerId+'/'+documentId,originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
 const pending=await sellerBankState(f.db,sellerId);await reviewSellerBankDetails(f.db,{sellerId,actorId:'reviewer',revision:pending.revision,reference:'FICTIONAL-INDEPENDENT-BENEFICIARY',reason:'Reviewed actual fictional identity and ownership of the original beneficiary.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'managed-bank-verification',now:Date.now()});
 const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId:'reviewer',requestId,expectedRevision,now:Date.now()});
 const saved=await saveCompanyAccountDraft(f.db,ctx('managed-company-source'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Capital Bank',branch:'Fictional branch',accountNumber:'TEST-COMPANY-CAPITAL',currency:'NPR',purpose:'payment_source'},evidenceReference:'FICTIONAL-COMPANY-OWNERSHIP',conflictUserIds:[],reason:'Retain actual fictional capital-source ownership evidence.'});
 await submitCompanyAccountForReview(f.db,ctx('managed-company-submit','0'),{versionId:saved.versionId,reason:'Submit exact fictional company capital-source ownership for review.'});
 await verifyCompanyAccount(f.db,ctx('managed-company-verify','1'),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-COMPANY-SOURCE',reason:'Independently verify original company ownership and currency evidence.'});
 const funding=await recordRefundFundingStatement(f.db,ctx('managed-actual-funds'),{accountVersionId:saved.versionId,statementIdentity:'FICTIONAL-MANAGED-CAPITAL-STATEMENT',asOf:Date.now()-1000,cashPaisa:2000000,restrictedPaisa:500000,evidenceReference:'FICTIONAL-ACTUAL-COMPANY-CAPITAL',restrictionsReference:'FICTIONAL-OTHER-PEOPLES-MONEY-EXCLUDED',availableFundsConfirmed:true,reason:'Record independent actual company capital, never treating seller earnings as bank cash.'});
 return {ctx,accountVersionId:saved.versionId,fundingId:funding.id,beneficiaryReference:(await sellerBankState(f.db,sellerId)).reference!};
}
