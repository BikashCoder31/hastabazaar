import assert from 'node:assert/strict';
import * as refunds from '../../lib/payments/refund-obligations';
import {saveCompanyAccountDraft,submitCompanyAccountForReview,verifyCompanyAccount} from '../../lib/payments/company-accounts';
import {companyDetails} from '../../lib/content/company-details';
import {checkoutCommitClock} from '../../lib/checkout/commit-policy-guards';

/** Call only on a separately inspected disposable target. These are explicit fictional bank facts, never transfers. */
export async function executeFixtureRefund(db:D1Database,input:{actorId:string;kind:'return_refund'|'service_fee'|'cancellation';sourceId:string;customerId:string;deferCompletion?:boolean}){
 const actor=await db.prepare('SELECT email FROM users WHERE id=?').bind(input.actorId).first<{email:string}>();
 assert.match(actor?.email??'',/@(?:example\.test|local\.hastabazaar\.test)$/);
 const prefix=crypto.randomUUID(),ctx=(suffix:string,revision:string|null=null)=>({actorId:input.actorId,requestId:prefix+'-'+suffix,expectedRevision:revision,now:Date.now()});
 const obligation=await refunds.openRefundObligation(db,ctx('open'),{kind:input.kind,sourceId:input.sourceId,reason:'Execute the original authorized fictional entitlement on an isolated fixture only.'});
 const row=await refunds.getRefundObligation(db,obligation.id);assert.ok(row);
 let destinationId:string|null=null,fundingId:string|null=null;
 if(row.cashPaisa>0){
  await db.prepare('CREATE TABLE IF NOT EXISTS user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL,last_seen_at INTEGER NOT NULL)').run();
  const session=prefix+'-session';await db.prepare('INSERT INTO user_sessions VALUES(?,?,?,?,?)').bind(session,input.customerId,Date.now()+3600000,Date.now()-1000,Date.now()).run();
  const retained=await db.prepare("SELECT v.id FROM refund_destination_heads h JOIN refund_destination_versions v ON v.id=h.version_id WHERE h.obligation_id=? AND v.status='verified'").bind(row.id).first<{id:string}>();
  if(retained)destinationId=retained.id;else{
  const destination=await refunds.submitRefundDestination(db,{...ctx('destination'),actorId:input.customerId,sessionHash:session},{obligationId:row.id,details:{holder:'Fictional original customer',bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-ORIGINAL-CUSTOMER',currency:'NPR'},relationship:'own_account',authorization:'I authorize this exact fictional original customer-owned destination.',evidenceReference:'FICTIONAL-PRIVATE-OWNERSHIP',reason:'Retain actual fictional authenticated instructions for this isolated obligation.'});
  destinationId=destination.id;
  await refunds.verifyRefundDestination(db,ctx('verify-destination','0'),{versionId:destinationId,ownershipConfirmed:true,relationshipConfirmed:true,verificationReference:'FICTIONAL-INDEPENDENT-OWNERSHIP',reason:'Independently verify this exact fictional customer account and relationship.'});
  }
  let account=await db.prepare("SELECT id FROM company_payment_account_versions WHERE json_extract(details_json,'$.accountNumber')='TEST-REFUND-CAPITAL' AND status='verified'").first<{id:string}>();
  if(!account){
   const draft=await saveCompanyAccountDraft(db,ctx('account'),{accountId:null,basedOnVersionId:null,details:{holder:companyDetails.legalName,bank:'Fictional Bank',branch:'Fictional Branch',accountNumber:'TEST-REFUND-CAPITAL',currency:'NPR',purpose:'both'},evidenceReference:'FICTIONAL-COMPANY-CAPITAL-OWNERSHIP',conflictUserIds:[],reason:'Retain independently verified fictional company capital, separately from customer receipts.'});
   await submitCompanyAccountForReview(db,ctx('submit-account','0'),{versionId:draft.versionId,reason:'Submit fictional company ownership for independent review.'});
   await verifyCompanyAccount(db,ctx('verify-account','1'),{versionId:draft.versionId,ownershipConfirmed:true,currencyConfirmed:true,verificationReference:'FICTIONAL-COMPANY-OWNERSHIP-VERIFIED',reason:'Independently verify fictional company capital account ownership and currency.'});
   account={id:draft.versionId};
   const observedAt=(await db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`).first<{now:number}>())!.now;
   const statement=await refunds.recordRefundFundingStatement(db,ctx('capital-statement'),{accountVersionId:account.id,statementIdentity:'FICTIONAL-CAPITAL-STATEMENT',asOf:observedAt,cashPaisa:100000000,restrictedPaisa:0,evidenceReference:'FICTIONAL-ACTUAL-COMPANY-CAPITAL',restrictionsReference:'FICTIONAL-RECONCILED-NO-OTHER-ENCUMBRANCES',availableFundsConfirmed:true,reason:'Explicit independent fictional company capital with no other encumbrances on this disposable target.'});fundingId=statement.id;
  }else fundingId=(await db.prepare('SELECT id FROM company_funding_statements WHERE account_version_id=? ORDER BY as_of DESC LIMIT 1').bind(account.id).first<{id:string}>())!.id;
 }
 const packet=await refunds.prepareRefundPacket(db,ctx('prepare',String(row.revision)),{obligationId:row.id,destinationVersionId:destinationId,fundingStatementId:fundingId,reason:'Prepare this exact original entitlement without recording a transfer.'});
 await refunds.approveRefundPacket(db,ctx('approve','0'),{packetId:packet.id,reason:'Approve the exact verified destination and actual available fictional funds.'});
 await refunds.startRefundPacket(db,ctx('start','1'),{packetId:packet.id,reason:'Record the actual fictional start while retaining the original reserved money.'});
 const bankAt=(await db.prepare(`SELECT ${checkoutCommitClock(db)} AS now`).first<{now:number}>())!.now;
 const outcome={packetId:packet.id,outcome:'paid' as const,amountPaisa:row.cashPaisa,...(row.cashPaisa>0?{bankAt,transactionIdentity:'FICTIONAL-PAID-'+prefix}:{}),evidenceReference:'FICTIONAL-INDEPENDENT-COMPLETED-PAYMENT',completedTransferConfirmed:row.cashPaisa>0,exactBeneficiaryConfirmed:row.cashPaisa>0,creditRestorationConfirmed:row.cashPaisa===0,reason:'Record actual independently verified fictional completion exactly once.'},completion=ctx('completed','2');
 const complete=(target:D1Database=db,command:Partial<Pick<typeof completion,'actorId'|'requestId'>>={})=>refunds.recordRefundPacketOutcome(target,{...completion,...command},outcome);
 if(!input.deferCompletion){const paid=await complete();assert.deepEqual(await complete(),paid);}
 return {obligationId:row.id,packetId:packet.id,complete};
}
