import {preparePayoutTransfer,approvePayoutTransfer,startPayoutTransfer,recordPayoutTransferOutcome} from '../../lib/payments/payout-transfers';
import type {RuntimeEnvironment} from '../../lib/staging/environment';
import assert from 'node:assert/strict';
import type {DatabaseSync} from 'node:sqlite';
import {verifySellerDocument} from '../../lib/sellers/document-review';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../../lib/payments/company-accounts';
import {recordRefundFundingStatement} from '../../lib/payments/refund-funding';
import {companyDetails} from '../../lib/content/company-details';
/** Adds independently verified fictional source/destination facts only to an already-inspected memory fixture. */
export async function cataloguePayoutSources(f:{db:D1Database;sqlite:DatabaseSync},sellerId:string,actorId:string){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const seller=f.sqlite.prepare('SELECT user_id AS owner,legal_name AS holder FROM seller_profiles WHERE id=?').get(sellerId)!;
 // These fixtures begin with unreviewed fictional evidence, never preverified receipts.
 const profile=f.sqlite.prepare('SELECT tax_mode,applicant_type FROM seller_profiles WHERE id=?').get(sellerId)!;
 assert.ok(['individual','company'].includes(String(profile.applicant_type)),'Original fixture must retain its legal identity type.');
 const kinds=['representative_identity',...(profile.tax_mode!=='NONE'?['pan_certificate']:[]),...(profile.applicant_type==='company'?['business_registration']:[])];
 for(const kind of kinds){
  const documentId='catalogue-'+sellerId+'-'+kind;
  f.sqlite.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
   VALUES(?,?,?,?,?,'application/pdf',24,'pending',1)`).run(documentId,sellerId,kind,'private/seller-documents/'+sellerId+'/'+documentId,'FICTIONAL-evidence.pdf');
  await verifySellerDocument(f.db,{sellerId,documentId,actorId,reason:'Inspect the exact original fictional legal identity and ownership evidence.',commandId:'catalogue-identity-'+kind,now:Date.now(),expectedReviewId:null});
 }
 // This fixture starts without a bank instruction. No historical bank record is overwritten.
 assert.equal(f.sqlite.prepare('SELECT payout_account_reference FROM seller_profiles WHERE id=?').get(sellerId)?.payout_account_reference,null);
 const state=await sellerBankState(f.db,sellerId),documentId='bank-proof-'+sellerId;
 await submitSellerBankDetails(f.db,{sellerId,actorId:String(seller.owner),revision:state.revision,now:Date.now(),details:{payoutBeneficiary:String(seller.holder),bankName:'Fictional Bank',bankBranch:'Fictional branch',bankAccountNumber:'TEST-MANAGED-001'},document:{id:documentId,kind:'bank_verification',objectKey:'private/seller-documents/'+sellerId+'/'+documentId,originalName:'bank.png',mimeType:'image/png',sizeBytes:20}});
 const pending=await sellerBankState(f.db,sellerId);await reviewSellerBankDetails(f.db,{sellerId,actorId,revision:pending.revision,reference:'FICTIONAL-INDEPENDENT-BENEFICIARY',reason:'Reviewed actual fictional identity and ownership of the original beneficiary.',ownershipBasis:profile.applicant_type==='company'?'same_legal_entity':'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:'managed-bank-verification',now:Date.now()});
 const ctx=(requestId:string,expectedRevision:string|null=null)=>({actorId,requestId,expectedRevision,now:Date.now()});
 const saved=await saveCompanyAccountDraft(f.db,ctx('managed-company-source'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Capital Bank',branch:'Fictional branch',accountNumber:'TEST-COMPANY-CAPITAL',currency:'NPR',purpose:'payment_source'},evidenceReference:'FICTIONAL-COMPANY-OWNERSHIP',conflictUserIds:[],reason:'Retain actual fictional capital-source ownership evidence.'});
 await submitCompanyAccountForReview(f.db,ctx('managed-company-submit','0'),{versionId:saved.versionId,reason:'Submit exact fictional company capital-source ownership for review.'});
 await verifyCompanyAccount(f.db,ctx('managed-company-verify','1'),{versionId:saved.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-COMPANY-SOURCE',reason:'Independently verify original company ownership and currency evidence.'});
 const funding=await recordRefundFundingStatement(f.db,ctx('managed-actual-funds'),{accountVersionId:saved.versionId,statementIdentity:'FICTIONAL-MANAGED-CAPITAL-STATEMENT',asOf:Date.now()-1000,cashPaisa:2000000,restrictedPaisa:500000,evidenceReference:'FICTIONAL-ACTUAL-COMPANY-CAPITAL',restrictionsReference:'FICTIONAL-OTHER-PEOPLES-MONEY-EXCLUDED',availableFundsConfirmed:true,reason:'Record independent actual company capital, never treating seller earnings as bank cash.'});
 return {ctx,accountVersionId:saved.versionId,fundingId:funding.id,beneficiaryReference:(await sellerBankState(f.db,sellerId)).reference!};
}

/** Native packet commands record explicit fictional manual evidence; they never initiate a transfer. */
export async function cataloguePayoutPacket(f:{db:D1Database;sqlite:DatabaseSync},input:{actorId:string;model:'registered'|'managed'|'fixed';payoutId:string;accountVersionId:string;amountPaisa:number;environment?:RuntimeEnvironment}){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 const prefix='catalogue-'+input.model,ctx=(suffix:string,expectedRevision:string|null=null)=>({actorId:input.actorId,requestId:prefix+'-'+suffix,expectedRevision,now:Date.now()});
 const packet=await preparePayoutTransfer(f.db,ctx('packet'),{model:input.model,payoutId:input.payoutId,accountVersionId:input.accountVersionId,...(input.environment?{environment:input.environment}:{}),reason:'Bind only the original lawful entitlement and exact verified fictional beneficiary.'});
 const approved=await approvePayoutTransfer(f.db,ctx('approve','0'),{packetId:packet.id,...(input.environment?{environment:input.environment}:{}),reason:'Approve original verified company funding without assuming bank completion.'});
 assert.notEqual(approved.blocked,true);
 await startPayoutTransfer(f.db,ctx('start','1'),{packetId:packet.id,...(input.environment?{environment:input.environment}:{}),reason:'Record the original fictional manual instruction without inventing its outcome.'});
 assert.equal(f.sqlite.prepare('SELECT state FROM payout_transfer_packets WHERE id=?').get(packet.id)?.state,'processing');
 assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM company_outgoing_bank_identities WHERE packet_id=?').get(packet.id)?.n,0);
 const completion=ctx('paid','2'),outcome={packetId:packet.id,...(input.environment?{environment:input.environment}:{}),outcome:'paid' as const,amountPaisa:input.amountPaisa,bankAt:Date.now()-1,transactionIdentity:'FICTIONAL-CATALOGUE-'+input.model,evidenceReference:'FICTIONAL-INDEPENDENT-CATALOGUE-BANK-DEBIT',completedTransferConfirmed:true,exactBeneficiaryConfirmed:true,reason:'Record the independently inspected exact original completed fictional debit once.'};
 const source=f.sqlite.prepare('SELECT source_snapshot_json,beneficiary_version_id,identity_revision,bank_revision FROM payout_transfer_packets WHERE id=?').get(packet.id);
 const complete=async()=>{
  const result=await recordPayoutTransferOutcome(f.db,completion,outcome);
  assert.deepEqual(f.sqlite.prepare('SELECT source_snapshot_json,beneficiary_version_id,identity_revision,bank_revision FROM payout_transfer_packets WHERE id=?').get(packet.id),source,'original source, beneficiary and identity remain unchanged');
  const actual=f.sqlite.prepare(`SELECT account_version_id,amount_paisa,bank_at,transaction_identity FROM company_outgoing_bank_identities WHERE packet_id=? AND packet_kind='payout'`).get(packet.id);
  assert.deepEqual({...actual},{account_version_id:input.accountVersionId,amount_paisa:input.amountPaisa,bank_at:outcome.bankAt,transaction_identity:outcome.transactionIdentity});
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE command_key IS NOT NULL AND action LIKE 'payout.transfer.%'").get()?.n,4,'exact native prepare, approve, start and outcome receipts');
  assert.deepEqual({...f.sqlite.prepare('SELECT prepared_by,approved_by,started_by,recorded_by FROM payout_transfer_packets WHERE id=?').get(packet.id)},
   {prepared_by:input.actorId,approved_by:input.actorId,started_by:input.actorId,recorded_by:input.actorId});
  return result;
 };
 return {packetId:packet.id,completion,outcome,complete};
}
