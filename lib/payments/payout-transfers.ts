import {financialNoticeStatements} from '../operations/financial-notices';
import {financialNoticeIdentity} from '../operations/financial-notice-sources';
import {livePayoutPartySql} from '../managed-commerce/live-financial-parties';
import {isFundingBankReversalFreshnessError,FUNDING_BANK_REVERSAL_REVERIFY_MESSAGE} from './funding-bank-reversal-freshness';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {fixedTransferOperation} from './payout-transfer-fixed';
import {assertSimulationAllowed,type RuntimeEnvironment} from '../staging/environment';
import {managedTransferOperation} from './payout-transfer-managed';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {preparePayoutOperationStatements} from '../db/repositories/payouts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {responseScopeContains} from '../orders/response-sql';
import {paymentGuard} from './manual-receipts';
import {preparePaymentException} from './payment-exceptions';
import {currentFundingAccount,getRefundFundingAvailability,fundingAvailableSql} from './refund-funding';
import {refundText} from './refund-obligations';
import {readPayoutSource,PayoutTransferError,type PayoutModel} from './payout-transfer-sources';
export {PayoutTransferError} from './payout-transfer-sources';

class PayoutAuthorityError extends PayoutTransferError{constructor(message:string){super(message,403);}}
async function executionGate(db:D1Database,model:PayoutModel,payoutId:string,environment?:RuntimeEnvironment){
 if(model==='registered')return;
 if(model==='managed'&&await db.prepare(`SELECT 1 FROM managed_payouts p WHERE p.id=? AND p.record_kind='live' AND p.simulation_label IS NULL
  AND EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id WHERE a.payout_id=p.id AND (s.record_kind<>'live' OR s.live_activation_decision_id IS NULL OR s.live_clearance_id IS NULL OR s.live_financial_scope_id IS NULL OR e.seller_id<>p.seller_id))
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries pe WHERE pe.payout_id=p.id)`).bind(payoutId).first())return;
 if(!environment)throw new PayoutTransferError('The guarded local simulation environment is required for this managed route.');
 assertSimulationAllowed(environment);
}
interface Packet {id:string;model:PayoutModel;payoutId:string;sellerId:string;beneficiaryVersionId:string;identityRevision:number;bankRevision:number;snapshot:string;accountVersionId:string;fundingStatementId:string;amountPaisa:number;state:string;revision:number;startedAt:number|null;}
async function packetRow(db:D1Database,id:string){const p=await db.prepare(`SELECT id,payout_model AS model,COALESCE(registered_payout_id,managed_payout_id,supplier_payment_id) AS payoutId,seller_id AS sellerId,beneficiary_version_id AS beneficiaryVersionId,identity_revision AS identityRevision,bank_revision AS bankRevision,source_snapshot_json AS snapshot,account_version_id AS accountVersionId,funding_statement_id AS fundingStatementId,amount_paisa AS amountPaisa,state,revision,started_at AS startedAt FROM payout_transfer_packets WHERE id=?`).bind(id).first<Packet>();if(!p)throw new PayoutTransferError('Open the original retained payout execution packet.');return p;}
async function command(db:D1Database,ctx:CommandContext,action:string,subjectId:string,sellerId:string,payload:unknown,nativeSource?:{model:PayoutModel;id:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,action==='prepared'?'payout.prepare':action==='approved'?'payout.approve':'payout.mark_paid',PayoutAuthorityError,action==='prepared'?undefined:'super_admin');
 const retained=nativeSource?.model==='managed'?' AND NOT '+livePayoutPartySql('?','?'):'';
 const personal="EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?)"+retained,personalBindings=[sellerId,ctx.actorId,...(retained?[nativeSource!.id,...Array.from({length:4},()=>ctx.actorId)]:[])];
 if(!await db.prepare('SELECT 1 WHERE '+personal).bind(...personalBindings).first())throw new PayoutTransferError('An eligible operator without a personal beneficiary interest is required.',403);
 const source={action:'payout.transfer.'+action,subjectType:'payout_transfer',subjectId};
 const read=async()=>{try{return await commandReceipt(db,ctx,source,payload);}catch(error){if(error instanceof Error&&error.message==='Request reference was already used for different command content.')throw new PayoutTransferError(error.message);throw error;}};
 const receipt=await read();
 return {receipt,async commit<T>(statements:D1PreparedStatement[],result:T):Promise<T>{if(receipt.replayed)return receipt.result as T;const value=result as {id:string;blocked?:boolean},data=payload as {outcome?:string};const status=value.blocked?'funding_blocked':action==='outcome'?'packet_'+data.outcome:action==='started'?'packet_started':action==='voided'?'packet_voided':'packet_'+action;const notices=await financialNoticeStatements(db,ctx,{kind:'finance.payout',sourceId:value.id,status});try{await db.batch([...authority.statements,...paymentGuard(db,personal,personalBindings),...statements,...notices,...authority.statements,receipt.insert(result)]);return result;}catch(error){const recovered=await read();if(recovered.replayed)return recovered.result as T;if(isFundingBankReversalFreshnessError(error))throw new PayoutTransferError(FUNDING_BANK_REVERSAL_REVERIFY_MESSAGE);if(error instanceof Error&&/CHECK constraint failed: valid\s*=\s*1|CONSTRAINT.*(?:operation_transaction_guards|staff_permission_guards)/i.test(error.message))throw new PayoutTransferError('The original source, balance or authority changed during the decision. Reconcile the current record before retrying.');throw error;}}};
}
async function audit(db:D1Database,ctx:CommandContext,p:Pick<Packet,'id'|'model'|'payoutId'>,action:string,input:unknown){return db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'payout.transfer.event','payout_transfer',?,?,?, ?,${checkoutCommitClock(db)})`).bind(await financialNoticeIdentity(ctx.actorId,ctx.requestId,action==='outcome'?'packet_'+(input as {outcome:string}).outcome:action==='started'?'packet_started':action==='voided'?'packet_voided':action==='funding_blocked'?action:'packet_'+action,'finance.payout',p.id),ctx.actorId,p.id,action,JSON.stringify({model:p.model,payoutId:p.payoutId,input}),ctx.requestId);}
async function bound(db:D1Database,ctx:CommandContext,p:Packet){
 const source=await readPayoutSource(db,p.model,p.payoutId,ctx.actorId,Date.now());
 if(source.snapshot!==p.snapshot)throw new PayoutTransferError('The original earnings, identity or beneficiary changed. Retire the unsent packet and prepare a freshly reviewed one.');
 const account=await currentFundingAccount(db,p.accountVersionId,ctx.actorId),funding=await getRefundFundingAvailability(db,p.accountVersionId);
 if(funding.id!==p.fundingStatementId)throw new PayoutTransferError('The company funding statement changed. Retire the unsent packet and prepare against the current verified statement.');
 return {source,funding,guards:[...source.guards,...paymentGuard(db,`EXISTS(SELECT 1 FROM company_payment_account_versions v JOIN company_payment_accounts a ON a.latest_version_id=v.id JOIN company_funding_accounts f ON f.account_id=v.account_id WHERE v.id=? AND v.status='verified' AND v.revision=? AND f.statement_id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`,[account.id,account.revision,funding.id,ctx.actorId])]};
}
function reserveFunding(db:D1Database,p:Packet,minimum:number){return [db.prepare('UPDATE company_funding_accounts SET revision=revision+1 WHERE statement_id=?').bind(p.fundingStatementId),...paymentGuard(db,'changes()=1'),...paymentGuard(db,`EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=? AND ${fundingAvailableSql()}>=?)`,[p.fundingStatementId,minimum])];}
async function native(db:D1Database,ctx:CommandContext,p:Packet,action:'approve'|'start_processing'|'mark_paid'|'mark_failed',reference?:string){
 if(p.model==='fixed')return fixedTransferOperation(db,ctx,p,action,reference);
 if(p.model==='managed')return managedTransferOperation(db,ctx,p,action,reference);
 if(p.model!=='registered')throw new PayoutTransferError('Use the native managed payout execution adapter.');
 return preparePayoutOperationStatements(db,{payoutId:p.payoutId,actorId:ctx.actorId,actorRole:'super_admin',action,note:'Actual retained payout execution packet '+p.id,requestId:ctx.requestId,now:ctx.now,...(reference?{providerReference:reference}:{})},{packetId:p.id});
}
export async function preparePayoutTransfer(db:D1Database,ctx:CommandContext,input:{model:PayoutModel;payoutId:string;accountVersionId:string;reason:string;environment?:RuntimeEnvironment}){
 // Find the native owner before permission/receipt evaluation, without returning any bank details.
 await executionGate(db,input.model,input.payoutId,input.environment);
 if(!['registered','managed','fixed'].includes(input.model))throw new PayoutTransferError('Choose an original supported native payout record.');
 const table=input.model==='registered'?'payouts':'managed_payouts',column=input.model==='registered'?'registered_payout_id':input.model==='managed'?'managed_payout_id':'supplier_payment_id';
 const owner=await db.prepare(input.model==='fixed'?'SELECT o.seller_id AS id FROM managed_supplier_payments p JOIN managed_supplier_obligations o ON o.id=p.obligation_id WHERE p.id=?':`SELECT seller_id AS id FROM ${table} WHERE id=?`).bind(input.payoutId).first<{id:string}>();if(!owner)throw new PayoutTransferError('Open the original native payout.');
 const cmd=await command(db,ctx,'prepared',input.model+':'+input.payoutId,owner.id,input,{model:input.model,id:input.payoutId});if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==null)throw new PayoutTransferError('Use a fresh command to prepare a new execution packet.');refundText(input.reason,'payout preparation reason',10);
 const source=await readPayoutSource(db,input.model,input.payoutId,ctx.actorId,Date.now()),account=await currentFundingAccount(db,input.accountVersionId,ctx.actorId),funding=await getRefundFundingAvailability(db,account.id),id=crypto.randomUUID();
 const p:Packet={id,model:input.model,payoutId:source.id,sellerId:source.sellerId,beneficiaryVersionId:source.beneficiaryVersionId,identityRevision:source.identityRevision,bankRevision:source.bankRevision,snapshot:source.snapshot,accountVersionId:account.id,fundingStatementId:funding.id,amountPaisa:source.amountPaisa,state:'prepared',revision:0,startedAt:null};
 const sources=await bound(db,ctx,p);
 return cmd.commit([...sources.guards,db.prepare(`INSERT INTO payout_transfer_packets(id,payout_model,${column},seller_id,beneficiary_version_id,identity_revision,bank_revision,source_snapshot_json,account_version_id,funding_statement_id,amount_paisa,prepared_by,prepared_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(id,input.model,source.id,source.sellerId,source.beneficiaryVersionId,source.identityRevision,source.bankRevision,source.snapshot,account.id,funding.id,source.amountPaisa,ctx.actorId),await audit(db,ctx,p,'prepared',input)],{id,revision:0});
}
async function approvePayoutTransferAttempt(db:D1Database,ctx:CommandContext,input:{packetId:string;reason:string;environment?:RuntimeEnvironment},retry=1):Promise<{id:string;revision:number;blocked?:boolean}>{
 const p=await packetRow(db,input.packetId);await executionGate(db,p.model,p.payoutId,input.environment);const cmd=await command(db,ctx,'approved',p.id,p.sellerId,input,{model:p.model,id:p.payoutId});if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number;blocked?:boolean};
 if(ctx.expectedRevision!==String(p.revision)||p.state!=='prepared')throw new PayoutTransferError('Approve the exact current prepared packet.');refundText(input.reason,'exact payout approval reason',10);
 const sources=await bound(db,ctx,p);
 if(sources.funding.availablePaisa<p.amountPaisa)return cmd.commit([...sources.guards,...paymentGuard(db,`EXISTS(SELECT 1 FROM company_funding_statements s WHERE s.id=? AND ${fundingAvailableSql()}<?)`,[p.fundingStatementId,p.amountPaisa]),...await preparePaymentException(db,{sourceKey:'payout:'+p.model+':'+p.payoutId,orderId:null,receiptId:null,kind:'payout_funding',ownerId:ctx.actorId,now:ctx.now,reason:'Insufficient actual free company funds for the original payout. '+input.reason}),await audit(db,ctx,p,'funding_blocked',input)],{id:p.id,revision:p.revision,blocked:true});
 const operations=sources.source.status==='approved'?[]:await native(db,ctx,p,'approve');
 try{return await cmd.commit([...sources.guards,...reserveFunding(db,p,p.amountPaisa),db.prepare(`UPDATE payout_transfer_packets SET state='approved',revision=revision+1,approved_by=?,approved_at=${checkoutCommitClock(db)} WHERE id=? AND revision=? AND state='prepared'`).bind(ctx.actorId,p.id,p.revision),...paymentGuard(db,'changes()=1'),...operations,await audit(db,ctx,p,'approved',input)],{id:p.id,revision:p.revision+1});
 }catch(error){
  // A lost native funding race is an owned business shortage, not an unexplained retry prompt.
  // One bounded reread preserves all original source, permission and CAS checks on the retry.
  if(retry>0){const latest=await packetRow(db,input.packetId);
   if(latest.state==='prepared'&&latest.revision===p.revision&&latest.accountVersionId&&(await getRefundFundingAvailability(db,latest.accountVersionId)).availablePaisa<latest.amountPaisa)
    return approvePayoutTransferAttempt(db,ctx,input,retry-1);
  }
  throw error;
 }
}
export async function approvePayoutTransfer(db:D1Database,ctx:CommandContext,input:{packetId:string;reason:string;environment?:RuntimeEnvironment}){return approvePayoutTransferAttempt(db,ctx,input);}

export async function startPayoutTransfer(db:D1Database,ctx:CommandContext,input:{packetId:string;reason:string;environment?:RuntimeEnvironment}){
 const p=await packetRow(db,input.packetId);await executionGate(db,p.model,p.payoutId,input.environment);const cmd=await command(db,ctx,'started',p.id,p.sellerId,input,{model:p.model,id:p.payoutId});if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(p.revision)||p.state!=='approved')throw new PayoutTransferError('Only the exact current approved unsent packet can begin processing.');refundText(input.reason,'original manual instruction reason',10);
 const sources=await bound(db,ctx,p),operations=await native(db,ctx,p,'start_processing');
 return cmd.commit([...sources.guards,...reserveFunding(db,p,0),db.prepare(`UPDATE payout_transfer_packets SET state='processing',revision=revision+1,started_by=?,started_at=${checkoutCommitClock(db)} WHERE id=? AND revision=? AND state='approved'`).bind(ctx.actorId,p.id,p.revision),...paymentGuard(db,'changes()=1'),...operations,await audit(db,ctx,p,'started',input)],{id:p.id,revision:p.revision+1});
}
export interface PayoutTransferOutcome {environment?:RuntimeEnvironment;packetId:string;outcome:'uncertain'|'paid'|'failed';reason:string;evidenceReference:string;amountPaisa?:number;bankAt?:number;transactionIdentity?:string;completedTransferConfirmed?:boolean;exactBeneficiaryConfirmed?:boolean;failureBasis?:'not_sent'|'no_debit'|'debit_returned';noDebitConfirmed?:boolean;returnedAmountPaisa?:number;returnedDebitConfirmed?:boolean;}
/** Retires only the instruction. Native earnings stay reserved until explicit source disposition/repreparation. */
export async function voidUnsentPayoutTransfer(db:D1Database,ctx:CommandContext,input:{packetId:string;notSentConfirmed:boolean;reason:string;evidenceReference:string;environment?:RuntimeEnvironment}){
 const p=await packetRow(db,input.packetId);await executionGate(db,p.model,p.payoutId,input.environment);const cmd=await command(db,ctx,'voided',p.id,p.sellerId,input,{model:p.model,id:p.payoutId});if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 if(ctx.expectedRevision!==String(p.revision)||!['prepared','approved'].includes(p.state)||p.startedAt!==null||input.notSentConfirmed!==true)throw new PayoutTransferError('Only an independently confirmed unsent instruction may be retired; an initiated or uncertain payment stays reserved.');
 refundText(input.reason,'unsent instruction retirement reason',10);refundText(input.evidenceReference,'independent unsent instruction evidence');
 return cmd.commit([...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'company_account',id:p.accountVersionId}),db.prepare(`UPDATE payout_transfer_packets SET state='void',revision=revision+1,recorded_by=?,recorded_at=${checkoutCommitClock(db)},evidence_reference=? WHERE id=? AND revision=? AND state IN('prepared','approved') AND started_at IS NULL`).bind(ctx.actorId,input.evidenceReference,p.id,p.revision),...paymentGuard(db,'changes()=1'),await audit(db,ctx,p,'voided',input)],{id:p.id,revision:p.revision+1});
}
export async function recordPayoutTransferOutcome(db:D1Database,ctx:CommandContext,input:PayoutTransferOutcome){
 const p=await packetRow(db,input.packetId);await executionGate(db,p.model,p.payoutId,input.environment);const cmd=await command(db,ctx,'outcome',p.id,p.sellerId,input,{model:p.model,id:p.payoutId});if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number;state:string};
 if(ctx.expectedRevision!==String(p.revision)||!['processing','uncertain'].includes(p.state)||!['uncertain','paid','failed'].includes(input.outcome))throw new PayoutTransferError('Reconcile the original processing or uncertain instruction before any new attempt.');
 refundText(input.reason,'actual payout outcome reason',10);refundText(input.evidenceReference,'independent actual bank evidence');
 const clock=checkoutCommitClock(db),now=(await db.prepare(`SELECT ${clock} AS now`).first<{now:number}>())!.now;
 let hash:string|null=null,transaction:string|null=null,bankAt:number|null=null;
 if(input.outcome==='paid'){
  if(input.amountPaisa!==p.amountPaisa||input.completedTransferConfirmed!==true||input.exactBeneficiaryConfirmed!==true||!Number.isSafeInteger(input.bankAt)||input.bankAt!<=0||input.bankAt!>now)throw new PayoutTransferError('Match the actual full bank debit, exact retained beneficiary and non-future transaction time.');
  transaction=refundText(input.transactionIdentity,'actual bank transaction identity',4,120);bankAt=input.bankAt!;
  const account=(await db.prepare('SELECT account_id AS id FROM company_payment_account_versions WHERE id=?').bind(p.accountVersionId).first<{id:string}>())!;
  hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([account.id,transaction.normalize('NFKC').trim().toUpperCase()])))),v=>v.toString(16).padStart(2,'0')).join('');
 }else if(input.outcome==='failed'){
  const failedConfirmed=input.failureBasis==='debit_returned'?input.returnedDebitConfirmed===true&&input.returnedAmountPaisa===p.amountPaisa:['not_sent','no_debit'].includes(input.failureBasis??'')&&input.noDebitConfirmed===true;
  if(!failedConfirmed)throw new PayoutTransferError('Confirm no debit or the actual full returned amount; partial/unknown outcomes remain reserved for reconciliation.');
 }
 const operations=input.outcome==='uncertain'?[]:await native(db,ctx,p,input.outcome==='paid'?'mark_paid':'mark_failed',transaction??undefined);
 const statements=[...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'company_account',id:p.accountVersionId}),...paymentGuard(db,`EXISTS(SELECT 1 FROM company_payment_account_versions v WHERE v.id=? AND NOT ${responseScopeContains(db,'v.conflicts_json','?')})`,[p.accountVersionId,ctx.actorId]),
  ...(hash?[db.prepare(`INSERT INTO company_outgoing_bank_identities(identity_hash,packet_kind,packet_id,account_version_id,transaction_identity,amount_paisa,bank_at,recorded_at) VALUES(?,'payout',?,?,?,?,?,${clock})`).bind(hash,p.id,p.accountVersionId,transaction,p.amountPaisa,bankAt)]:[]),
  db.prepare(`UPDATE payout_transfer_packets SET state=?,revision=revision+1,recorded_by=?,recorded_at=${clock},bank_at=?,transaction_identity=?,transaction_identity_hash=?,evidence_reference=?,failure_basis=? WHERE id=? AND revision=? AND state=?`).bind(input.outcome,ctx.actorId,bankAt,transaction,hash,input.evidenceReference,input.failureBasis??null,p.id,p.revision,p.state),...paymentGuard(db,'changes()=1'),...operations,await audit(db,ctx,p,'outcome',input)];
 if(input.outcome==='uncertain')statements.push(...await preparePaymentException(db,{sourceKey:'payout:'+p.model+':'+p.payoutId,orderId:null,receiptId:null,kind:'outgoing_uncertain',reason:'Urgent reconciliation of the original payout instruction. The amount remains reserved; no resend is permitted.',ownerId:ctx.actorId,now}));
 else statements.push(db.prepare(`UPDATE manual_payment_exceptions SET state='resolved',revision=revision+1,updated_at=${clock},last_event_id=? WHERE source_key=? AND state<>'resolved'`).bind(ctx.requestId,'payout:'+p.model+':'+p.payoutId));
 return cmd.commit(statements,{id:p.id,revision:p.revision+1,state:input.outcome});
}

