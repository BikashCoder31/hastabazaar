import {financialNoticeStatements} from '../operations/financial-notices';
import {financialNoticeIdentity} from '../operations/financial-notice-sources';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/submission';
import {paymentGuard} from '../payments/manual-receipts';
import {protectedPayoutGuards,verifiedIdentitySql,verifiedIdentityAtCommitSql,noProtectedHoldSql} from '../sellers/protected-change-policy';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {managedSettlementReadySql} from './settlement-readiness';
import {managedRefundFactsColumns,managedRefundReconciled,managedRefundFactsGuard,type ManagedRefundFacts} from './refund-readiness';
import {ManagedLiveFinancialError} from './live-billing';
import {recoveryPayoutReadySql} from '../payments/recovery-payout-policy';
import {payoutRegistrationBlocker,payoutRegistrationGuards} from '../payments/payout-registration-readiness';
import type {ManagedFinanceSummary} from './payout-operations';
import {liveManagedEntitlementPartyAuthority} from './live-financial-parties';

export function liveManagedEntitlementSql(alias='e'){
 if(!/^[a-z_]+$/.test(alias))throw new Error('Invalid live entitlement source.');
 return `EXISTS(SELECT 1 FROM managed_commercial_snapshots live_original WHERE live_original.id=${alias}.snapshot_id AND live_original.record_kind='live' AND live_original.simulation_label IS NULL AND live_original.commercial_model='managed_sale_linked_percentage_v1' AND live_original.live_activation_decision_id IS NOT NULL AND live_original.live_clearance_id IS NOT NULL AND live_original.live_financial_scope_id IS NOT NULL AND live_original.live_customer_id IS NOT NULL)`;
}
function net(alias='e'){return `COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x WHERE x.entitlement_id=${alias}.id),0)-COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id WHERE a.entitlement_id=${alias}.id AND a.disposition='paid' AND p.record_kind='live'),0)`;}
const balanceSql=`COALESCE((SELECT SUM(x.amount_paisa) FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=? AND ${liveManagedEntitlementSql()}),0)-COALESCE((SELECT SUM(amount_paisa) FROM managed_payouts WHERE seller_id=? AND record_kind='live' AND status='paid'),0)`;
const active="('prepared','approved','processing','failed')";
type Position=ManagedRefundFacts&{id:string;amount:number;version:number;ready:number};
async function positions(db:D1Database,sellerId:string,now:number){
 const rows=await db.prepare(`SELECT e.id,e.version,${net()} AS amount,${managedRefundFactsColumns()},CASE WHEN ${managedSettlementReadySql('e',now)} AND e.status IN('eligible','part_paid','paid') AND e.eligible_at<=? THEN 1 ELSE 0 END AS ready FROM managed_entitlements e WHERE e.seller_id=? AND ${liveManagedEntitlementSql()} ORDER BY e.id`).bind(now,sellerId).all<Position>();
 return rows.results.map(row=>{if(!Number.isSafeInteger(row.amount))throw new ManagedLiveFinancialError('An original actual earning needs reconciliation.');return {...row,ready:row.ready&&managedRefundReconciled(row)?1:0};});
}
async function receiver(db:D1Database,sellerId:string,now:number){
 return db.prepare(`SELECT s.payout_account_reference AS reference,s.user_id AS ownerId,b.id AS beneficiaryVersionId,v.identity_revision AS identityRevision,v.bank_revision AS bankRevision FROM seller_profiles s JOIN seller_protected_revisions v ON v.seller_id=s.id JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=substr(s.payout_account_reference,13) JOIN seller_documents d ON d.id=b.document_id WHERE s.id=? AND substr(s.payout_account_reference,1,12)='BENEFICIARY:' AND b.identity_revision=v.identity_revision AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>?) AND ${verifiedIdentitySql('s.id',now)}`).bind(sellerId,now).first<{reference:string;ownerId:string;beneficiaryVersionId:string;identityRevision:number;bankRevision:number}>();
}
async function balance(db:D1Database,sellerId:string){return Number((await db.prepare(`SELECT ${balanceSql} AS amount`).bind(sellerId,sellerId).first<{amount:number}>())!.amount);}
function receiverGuards(db:D1Database,sellerId:string,b:NonNullable<Awaited<ReturnType<typeof receiver>>>){return [
 ...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_profiles s JOIN seller_protected_revisions v ON v.seller_id=s.id JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=? JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=s.id WHERE s.id=? AND s.user_id=? AND s.payout_account_reference=? AND v.identity_revision=? AND v.bank_revision=? AND b.identity_revision=v.identity_revision AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>${checkoutCommitClock(db)}))`,[b.beneficiaryVersionId,sellerId,b.ownerId,b.reference,b.identityRevision,b.bankRevision]),
 ...paymentGuard(db,verifiedIdentityAtCommitSql(db,'?'),[sellerId])];}
function positionGuards(db:D1Database,sellerId:string,rows:Position[],now:number){return rows.flatMap(row=>[
 ...paymentGuard(db,`EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND e.seller_id=? AND e.version=? AND ${liveManagedEntitlementSql()} AND (${net()})=?)`,[row.id,sellerId,row.version,row.amount]),
 ...paymentGuard(db,`EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND ${managedSettlementReadySql('e',now)} AND e.status IN('eligible','part_paid','paid') AND e.eligible_at<=?)`,[row.id,now]),
 ...paymentGuard(db,`EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND ${managedRefundFactsGuard(row)})`,[row.id])]);}
export async function getLiveManagedPayoutPreview(db:D1Database,sellerId:string,now=Date.now()){
 const [all,currentBalance,beneficiary,pending,ready]=await Promise.all([positions(db,sellerId,now),balance(db,sellerId),receiver(db,sellerId,now),db.prepare(`SELECT 1 FROM managed_payouts WHERE seller_id=? AND record_kind='live' AND status IN ${active}`).bind(sellerId).first(),livePayoutReady(db,sellerId,now)]);
 const needsReview=!Number.isSafeInteger(currentBalance)||all.reduce((n,e)=>n+e.amount,0)!==currentBalance||all.some(e=>e.amount<0&&!e.ready);
 const amountPaisa=pending||needsReview||!beneficiary||!ready?0:Math.max(0,all.filter(e=>e.ready).reduce((n,e)=>n+e.amount,0));
 return {amountPaisa,balancePaisa:currentBalance,receivingReference:beneficiary?.reference??null,beneficiaryVersionId:beneficiary?.beneficiaryVersionId??null,needsReview,hasUnpaidReservation:Boolean(pending),snapshotDigest:await digestFormRequest({sellerId,all,currentBalance,beneficiary}),recordKind:'live' as const};
}
async function livePayoutReady(db:D1Database,sellerId:string,now:number){
 const financial=recoveryPayoutReadySql('?','managed','live');
 const [hold,source,blocker]=await Promise.all([db.prepare('SELECT 1 WHERE '+noProtectedHoldSql('?','payouts')).bind(sellerId).first(),db.prepare('SELECT 1 WHERE '+financial).bind(...Array.from({length:(financial.match(/\?/g)??[]).length},()=>sellerId)).first(),payoutRegistrationBlocker(db,sellerId,'managed',now)]);
 return Boolean(hold&&source&&!blocker);
}
/** Actual original sale-linked money only. Retained simulation history has its own existing reader. */
export async function getLiveManagedFinanceSummary(db:D1Database,sellerId:string,now=Date.now()):Promise<ManagedFinanceSummary>{
 const [all,currentBalance,beneficiary,ready,totals]=await Promise.all([positions(db,sellerId,now),balance(db,sellerId),receiver(db,sellerId,now),livePayoutReady(db,sellerId,now),
  db.prepare(`SELECT COALESCE(SUM(e.calculated_paisa),0) AS calculated,COALESCE(SUM(CASE WHEN e.earned_at IS NOT NULL THEN e.calculated_paisa ELSE 0 END),0) AS earned,
   COALESCE(SUM(CASE WHEN e.status='held' THEN (${net()}) ELSE 0 END),0) AS held,
   COALESCE((SELECT SUM(p.amount_paisa) FROM managed_payouts p WHERE p.seller_id=? AND p.record_kind='live' AND p.status='paid'),0) AS paid,
   COALESCE((SELECT SUM(p.amount_paisa) FROM managed_payouts p WHERE p.seller_id=? AND p.record_kind='live' AND p.status IN ${active}),0) AS reserved
   FROM managed_entitlements e WHERE e.seller_id=? AND ${liveManagedEntitlementSql()}`).bind(sellerId,sellerId,sellerId).first<{calculated:number;earned:number;held:number;paid:number;reserved:number}>()]);
 const needsReconciliation=all.reduce((n,e)=>n+e.amount,0)!==currentBalance;
 const blocked=!beneficiary||!ready||needsReconciliation;
 const payablePaisa=blocked||totals!.reserved>0||all.some(e=>e.amount<0&&!e.ready)?0:Math.max(0,all.filter(e=>e.ready).reduce((n,e)=>n+e.amount,0));
 const result={calculatedPaisa:totals!.calculated,earnedPaisa:totals!.earned,heldPaisa:totals!.held,paidPaisa:totals!.paid,reservedPaisa:totals!.reserved,balancePaisa:currentBalance,payablePaisa,eligiblePaisa:payablePaisa,blockedPaisa:all.filter(e=>e.amount>0&&(blocked||!e.ready)).reduce((n,e)=>n+e.amount,0),refundOffsetPaisa:Math.max(0,-all.filter(e=>e.amount<0).reduce((n,e)=>n+e.amount,0)),needsReconciliation};
 for(const [key,value] of Object.entries(result))if(key!=='needsReconciliation'&&!Number.isSafeInteger(value))throw new ManagedLiveFinancialError('The exact actual finance totals need reconciliation.');
 return result;
}
/** Server-derived exact action scope; unrelated historical customers are not a blacklist. */
export async function getLiveManagedPayoutPartyAuthority(db:D1Database,input:{sellerId:string;actorId:string;payoutId?:string;operation?:'prepare'|'release'},now=Date.now()){
 let ids:string[];
 if(input.payoutId){
  if(!await db.prepare("SELECT 1 FROM managed_payouts WHERE id=? AND seller_id=? AND record_kind='live'").bind(input.payoutId,input.sellerId).first())throw new ManagedLiveFinancialError('Open the exact original actual payout.');
  ids=(await db.prepare('SELECT entitlement_id AS id FROM managed_payout_allocations WHERE payout_id=? ORDER BY entitlement_id').bind(input.payoutId).all<{id:string}>()).results.map(r=>r.id);
 }else if(input.operation==='release'){
  const rows=(await db.prepare(`SELECT e.id,${managedRefundFactsColumns()} FROM managed_entitlements e WHERE e.seller_id=? AND e.status='held' AND ${liveManagedEntitlementSql()} AND ${managedSettlementReadySql('e',now)}`).bind(input.sellerId).all<ManagedRefundFacts&{id:string}>()).results;
  ids=rows.filter(managedRefundReconciled).map(r=>r.id);
 }else ids=(await positions(db,input.sellerId,now)).filter(r=>r.ready&&r.amount!==0).map(r=>r.id);
 return liveManagedEntitlementPartyAuthority(db,{sellerId:input.sellerId,actorId:input.actorId,entitlementIds:ids});
}
export async function prepareLiveManagedPayout(db:D1Database,ctx:CommandContext,input:{sellerId:string;scheduledFor:number;expectedAmountPaisa:number;expectedSnapshot:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.prepare',ManagedLiveFinancialError,'super_admin');
 const receipt=await commandReceipt(db,ctx,{action:'managed.live.payout.prepared',subjectType:'seller',subjectId:input.sellerId},input);
 if(receipt.replayed){const saved=receipt.result as {id:string;recordKind:'live'};await getLiveManagedPayoutPartyAuthority(db,{sellerId:input.sellerId,actorId:ctx.actorId,payoutId:saved.id},ctx.now);return saved;}
 const blocker=await payoutRegistrationBlocker(db,input.sellerId,'managed',ctx.now);
 if(blocker)throw new ManagedLiveFinancialError(blocker);
 const beneficiary=await receiver(db,input.sellerId,ctx.now);
 if(!beneficiary)throw new ManagedLiveFinancialError('Review the original maker identity and current independently verified beneficiary.');
 if(beneficiary.ownerId===ctx.actorId)throw new ManagedLiveFinancialError('An independent operator must review the original maker identity and current verified beneficiary.',403);
 if(ctx.expectedRevision!==null||!Number.isSafeInteger(input.scheduledFor)||input.scheduledFor<0||input.reason.trim().length<10||input.reason.length>1000)throw new ManagedLiveFinancialError('Review the actual payout reason, schedule and fresh request.');
 const preview=await getLiveManagedPayoutPreview(db,input.sellerId,ctx.now),all=await positions(db,input.sellerId,ctx.now);
 if(preview.amountPaisa<=0||preview.amountPaisa!==input.expectedAmountPaisa||preview.snapshotDigest!==input.expectedSnapshot)throw new ManagedLiveFinancialError('A positive exact current eligible live balance is required. Reload its original-source preview.');
 const selected=all.filter(e=>e.ready&&e.amount!==0),id=crypto.randomUUID(),result={id,recordKind:'live' as const};
 const parties=await liveManagedEntitlementPartyAuthority(db,{sellerId:input.sellerId,actorId:ctx.actorId,entitlementIds:selected.map(r=>r.id)});
 const statements=[...payoutRegistrationGuards(db,input.sellerId,'managed',beneficiary.reference),db.prepare('UPDATE managed_entitlements SET updated_at=updated_at WHERE seller_id=?').bind(input.sellerId),...authority.statements,...protectedPayoutGuards(db,input.sellerId,ctx.actorId,{model:'managed',recordKind:'live'}),
  ...paymentGuard(db,`(${balanceSql})=? AND NOT EXISTS(SELECT 1 FROM managed_payouts WHERE seller_id=? AND record_kind='live' AND status IN ${active})`,[input.sellerId,input.sellerId,preview.balancePaisa,input.sellerId]),
  ...receiverGuards(db,input.sellerId,beneficiary),...parties.guards,
  ...paymentGuard(db,`COALESCE((SELECT SUM(${net()}) FROM managed_entitlements e WHERE e.seller_id=? AND ${liveManagedEntitlementSql()}),0)=?`,[input.sellerId,preview.balancePaisa]),...positionGuards(db,input.sellerId,selected,ctx.now),
  ...paymentGuard(db,`NOT EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.seller_id=? AND ${liveManagedEntitlementSql()} AND (${net()})<0 AND e.id NOT IN(${selected.map(()=>'?').join(',')}))`,[input.sellerId,...selected.map(e=>e.id)]),
  db.prepare("INSERT INTO managed_payouts(id,seller_id,payout_number,amount_paisa,status,destination_reference,simulation_label,prepared_by,approved_by,scheduled_for,request_id,created_at,updated_at,record_kind) VALUES(?,?,?,?,'approved',?,NULL,?,?,?,?,?,?,'live')").bind(id,input.sellerId,'MP-'+ctx.now+'-'+id.slice(0,8),preview.amountPaisa,beneficiary.reference,ctx.actorId,ctx.actorId,input.scheduledFor,ctx.requestId,ctx.now,ctx.now),
  ...selected.map(e=>db.prepare("INSERT INTO managed_payout_allocations(payout_id,entitlement_id,amount_paisa,disposition,created_at,request_id,actor_id) VALUES(?,?,?,'reserved',?,?,?)").bind(id,e.id,e.amount,ctx.now,ctx.requestId,ctx.actorId)),
  db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'managed.live.payout.prepared','managed_payout',?,?,?,?,?)").bind(await financialNoticeIdentity(ctx.actorId,ctx.requestId,'native_prepared','finance.payout',id),ctx.actorId,id,input.reason,JSON.stringify({recordKind:'live',amountPaisa:preview.amountPaisa,positions:selected.map(e=>({id:e.id,amount:e.amount}))}),ctx.requestId,ctx.now),...await financialNoticeStatements(db,ctx,{kind:'finance.payout',sourceId:id,status:'native_prepared'}),receipt.insert(result)];
 try{await db.batch(statements);return result;}catch(error){const recovered=await commandReceipt(db,ctx,{action:'managed.live.payout.prepared',subjectType:'seller',subjectId:input.sellerId},input);if(recovered.replayed)return recovered.result as typeof result;throw error;}
}
export async function liveManagedPayoutExecutionSource(db:D1Database,payoutId:string,now:number){
 const row=await db.prepare("SELECT id,seller_id AS sellerId,status,amount_paisa AS amount,updated_at AS updatedAt,scheduled_for AS scheduledFor,destination_reference AS destination FROM managed_payouts WHERE id=? AND record_kind='live' AND simulation_label IS NULL").bind(payoutId).first<{id:string;sellerId:string;status:string;amount:number;updatedAt:number;scheduledFor:number;destination:string}>();
 if(!row||!['prepared','approved','failed'].includes(row.status)||row.scheduledFor>now)throw new ManagedLiveFinancialError('Review the exact eligible original actual payout and processing date.');
 const all=await positions(db,row.sellerId,now),allocated=await db.prepare("SELECT entitlement_id AS id,amount_paisa AS amount FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved' ORDER BY entitlement_id").bind(row.id).all<{id:string;amount:number}>();
 const selected=allocated.results.map(a=>{const original=all.find(e=>e.id===a.id);if(!original||!original.ready||original.amount!==a.amount)throw new ManagedLiveFinancialError('The original live reservation needs reconciliation or a fresh unsent preparation.');return original;});
 const currentBalance=await balance(db,row.sellerId);
 if(!Number.isSafeInteger(currentBalance)||!selected.length||selected.reduce((n,e)=>n+e.amount,0)!==row.amount||all.reduce((n,e)=>n+e.amount,0)!==currentBalance||currentBalance<row.amount||all.some(e=>e.amount<0&&!selected.some(a=>a.id===e.id)))throw new ManagedLiveFinancialError('Original actual refund offsets and reservations must reconcile before execution.');
 return {row,selected,currentBalance,guards:[
  ...paymentGuard(db,"EXISTS(SELECT 1 FROM managed_payouts WHERE id=? AND record_kind='live' AND status=? AND updated_at=? AND amount_paisa=? AND destination_reference=?)",[row.id,row.status,row.updatedAt,row.amount,row.destination]),
  ...paymentGuard(db,`(${balanceSql})=?`,[row.sellerId,row.sellerId,currentBalance]),
  ...paymentGuard(db,"(SELECT COALESCE(SUM(amount_paisa),0) FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved')=? AND (SELECT COUNT(*) FROM managed_payout_allocations WHERE payout_id=? AND disposition='reserved')=?",[row.id,row.amount,row.id,selected.length]),
  ...paymentGuard(db,`NOT EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.seller_id=? AND ${liveManagedEntitlementSql()} AND (${net()})<0 AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=? AND a.entitlement_id=e.id AND a.disposition='reserved'))`,[row.sellerId,row.id]),
  ...paymentGuard(db,`COALESCE((SELECT SUM(${net()}) FROM managed_entitlements e WHERE e.seller_id=? AND ${liveManagedEntitlementSql()}),0)=?`,[row.sellerId,currentBalance]),...positionGuards(db,row.sellerId,selected,now)]};
}

export async function releaseLiveManagedEligibility(db:D1Database,ctx:CommandContext,input:{sellerId:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.prepare',ManagedLiveFinancialError,'super_admin');
 if(!await db.prepare('SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?').bind(input.sellerId,ctx.actorId).first())throw new ManagedLiveFinancialError('An independent operator must review the original maker history.',403);
 const receipt=await commandReceipt(db,ctx,{action:'managed.live.eligibility.released',subjectType:'seller',subjectId:input.sellerId},input);
 if(receipt.replayed){const saved=receipt.result as {released:number;originalEntitlementIds?:string[]};if(saved.released>0&&!saved.originalEntitlementIds)throw new ManagedLiveFinancialError('The original eligibility source receipt needs review.');await liveManagedEntitlementPartyAuthority(db,{sellerId:input.sellerId,actorId:ctx.actorId,entitlementIds:saved.originalEntitlementIds??[]});return {released:saved.released};}
 if(ctx.expectedRevision!==null||input.reason.trim().length<10||input.reason.length>1000)throw new ManagedLiveFinancialError('Review the original actual eligibility reason and fresh request.');
 const candidates=await db.prepare(`SELECT e.id,e.version,${managedRefundFactsColumns()} FROM managed_entitlements e WHERE e.seller_id=? AND e.status='held' AND ${liveManagedEntitlementSql()} AND ${managedSettlementReadySql('e',ctx.now)}`).bind(input.sellerId).all<ManagedRefundFacts&{id:string;version:number}>();
 const rows=candidates.results.filter(managedRefundReconciled),result={released:rows.length};
 const saved={...result,originalEntitlementIds:rows.map(r=>r.id)};
 const parties=await liveManagedEntitlementPartyAuthority(db,{sellerId:input.sellerId,actorId:ctx.actorId,entitlementIds:rows.map(r=>r.id)});
 await db.batch([...authority.statements,...parties.guards,
  ...rows.flatMap(e=>[...paymentGuard(db,`EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND e.version=? AND e.status='held' AND ${liveManagedEntitlementSql()} AND ${managedSettlementReadySql('e',ctx.now)})`,[e.id,e.version]),...paymentGuard(db,`EXISTS(SELECT 1 FROM managed_entitlements e WHERE e.id=? AND ${managedRefundFactsGuard(e)})`,[e.id])]),
  ...rows.map(e=>db.prepare("UPDATE managed_entitlements SET status='eligible',eligible_at=hold_until,version=version+1,updated_at=? WHERE id=?").bind(ctx.now,e.id)),
  db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'managed.live.eligibility.released','seller',?,?,?,?,?)").bind(await financialNoticeIdentity(ctx.actorId,ctx.requestId,'native_eligible','finance.payout',input.sellerId),ctx.actorId,input.sellerId,input.reason,JSON.stringify(saved),ctx.requestId,ctx.now),...(rows.length?await financialNoticeStatements(db,ctx,{kind:'finance.payout',sourceId:input.sellerId,status:'native_eligible'}):[]),receipt.insert(saved)]);
 return result;
}
export async function cancelLiveManagedPayout(db:D1Database,ctx:CommandContext,input:{payoutId:string;reason:string}){
 const authority=await staffMutationGuard(db,ctx.actorId,'payout.approve',ManagedLiveFinancialError,'super_admin');
 const row=await db.prepare("SELECT p.id,p.seller_id AS sellerId,p.status,p.updated_at AS updatedAt,s.user_id AS ownerId FROM managed_payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND p.record_kind='live'").bind(input.payoutId).first<{id:string;sellerId:string;status:string;updatedAt:number;ownerId:string}>();
 if(!row||row.ownerId===ctx.actorId)throw new ManagedLiveFinancialError('An independent operator must open the original actual payout.',403);
 const receipt=await commandReceipt(db,ctx,{action:'managed.live.payout.cancelled',subjectType:'managed_payout',subjectId:row.id},input);
 const parties=await getLiveManagedPayoutPartyAuthority(db,{sellerId:row.sellerId,actorId:ctx.actorId,payoutId:row.id},ctx.now);
 if(receipt.replayed)return receipt.result as {id:string;status:'rejected'};
 if(ctx.expectedRevision!==String(row.updatedAt)||!['prepared','approved'].includes(row.status)||input.reason.trim().length<10)throw new ManagedLiveFinancialError('Only the exact unchanged unsent reservation can be retired. Preserve processing and uncertain outcomes.');
 const result={id:row.id,status:'rejected' as const};
 await db.batch([...authority.statements,...parties.guards,...paymentGuard(db,"EXISTS(SELECT 1 FROM managed_payouts p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.id=? AND p.record_kind='live' AND p.status=? AND p.updated_at=? AND p.paid_at IS NULL AND p.provider_reference IS NULL AND s.user_id<>?)",[row.id,row.status,row.updatedAt,ctx.actorId]),
  ...paymentGuard(db,"NOT EXISTS(SELECT 1 FROM payout_transfer_packets WHERE managed_payout_id=? AND state NOT IN('void','failed')) AND NOT EXISTS(SELECT 1 FROM seller_payout_review_blocks WHERE payout_model='managed' AND payout_id=?)",[row.id,row.id]),
  db.prepare("UPDATE managed_payouts SET status='rejected',updated_at=? WHERE id=?").bind(ctx.now,row.id),db.prepare("UPDATE managed_payout_allocations SET disposition='released',terminal_at=? WHERE payout_id=? AND disposition='reserved'").bind(ctx.now,row.id),
  db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'managed.live.payout.cancelled','managed_payout',?,?,?,?,?)").bind(await financialNoticeIdentity(ctx.actorId,ctx.requestId,'native_cancelled','finance.payout',row.id),ctx.actorId,row.id,input.reason,JSON.stringify(result),ctx.requestId,ctx.now),...await financialNoticeStatements(db,ctx,{kind:'finance.payout',sourceId:row.id,status:'native_cancelled'}),receipt.insert(result)]);
 return result;
}


