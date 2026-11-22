import type {Permission} from '../marketplace/permissions';
import {livePayoutPartySql,liveSnapshotPartySql} from '../managed-commerce/live-financial-party-sql';
import {responseScopeContains} from '../orders/response-sql';
import {operationalNotificationRequestId} from './event-catalog';
import {fundingStatementBankReversalFreshSql} from '../payments/funding-bank-reversal-freshness';
import {liveInvoicePartySql} from '../managed-commerce/live-financial-party-sql';
import {currentRefundBankSubmissionSql,currentRefundDelaySql} from '../payments/refund-current-progress';
import {linkedOriginalRefundConflictSql} from '../payments/refund-party-scope';

export type FinancialNoticeKind='finance.refund'|'finance.payout'|'seller.live_clearance'|'company.live_financial_scope'|'finance.fee_refund_authorized'|'finance.invoice_adjustment'|'finance.funding_verified';
const financialKinds=['finance.refund','finance.payout','seller.live_clearance','company.live_financial_scope','finance.fee_refund_authorized','finance.invoice_adjustment','finance.funding_verified'];
export interface OperationalSourceDescriptor {
 guard:string;guardValues:unknown[];ownerSql:string|null;ownerValues:unknown[];
 audience:'staff'|'seller'|'customer';staffPermission:Permission|null;relatedType:string;subject:string;
 staffGuard?:string;staffGuardValues?:unknown[];
 alternativeStaffPermission?:Permission;
}
export interface SourceOperationalEvent{kind:string;sourceId:string;eventId:string;status?:string;actorId?:string;now?:number}
export interface CurrentOperationalNotice{template:string;relatedId:string|null;relatedType?:string|null;userId:string|null;audience:string;channel:string;requestId:string;requiredPermission?:string|null}

/** Shared with the NEW immutable native event/audit ID. No historical event is rewritten. */
export async function financialNoticeIdentity(actorId:string,requestId:string,action:string,kind:FinancialNoticeKind,sourceId:string){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([actorId,requestId,action,kind,sourceId])));
 return Array.from(new Uint8Array(bytes),byte=>byte.toString(16).padStart(2,'0')).join('');
}
const labels:Record<string,string>={opened:'Refund obligation recorded',destination_submitted:'Refund instructions received for verification',destination_verified:'Refund destination verified',packet_prepared:'Payment packet prepared',packet_approved:'Payment packet approved; transfer not yet recorded',packet_started:'Manual payment processing',packet_uncertain:'Payment outcome uncertain; reconciliation required',packet_paid:'Completed payment recorded',packet_failed:'Unsuccessful payment outcome confirmed',packet_voided:'Unsent payment packet retired',funding_blocked:'Approved payment awaits verified funding',native_prepared:'Actual maker payout prepared',native_cancelled:'Unsent actual maker payout retired',native_eligible:'Original actual maker earnings released',recorded:'Live financial evidence reviewed',revoked:'Live clearance revoked'};
export function financialNoticeSubject(status:string){return ({customer_refund_reversed:'Original refund returned by the bank',customer_reversal_retained:'Original refund remains due',customer_reversal_corrected:'Original refund responsibility corrected',packet_submitted:'The bank accepted the refund instruction',customer_delay:'Update on your refund'} as Record<string,string>)[status]??labels[status]??'Financial record updated';}
export function financialNoticeDetail(status:string){
 if(status==='customer_refund_reversed')return 'The bank returned funds from the original refund. Finance is reviewing the continuing customer remedy; customer receipt is not claimed from the original debit.';
 if(status==='customer_reversal_retained')return 'The original customer refund remains due. Its returned bank credit is reserved for a separately verified payment; another transfer is not automatic.';
 if(status==='customer_reversal_corrected')return 'Finance recorded the reviewed correction. Open the original case for the current refund status; this correction does not record a new bank transfer.';
 if(status==='packet_paid')return 'The completed original payment is recorded. Open the original statement for its current amount and status.';
 if(status==='packet_uncertain')return 'The original bank instruction has an uncertain outcome. Finance must reconcile it before another instruction; no completed payment is claimed.';
 if(status==='packet_approved')return 'The original packet is approved. Approval alone is not a completed bank payment.';
 if(status==='packet_started')return 'The original manual bank instruction is processing. Its completed outcome has not been recorded.';
 if(status==='packet_submitted')return 'The bank has acknowledged the refund instruction. Settlement is still pending.';
 if(status==='packet_failed')return 'The original attempt has a confirmed unsuccessful outcome. Finance will review the supported next step; another payment is not automatic.';
 if(status==='packet_voided'||status==='native_cancelled')return 'The original unsent instruction was retired. This does not record a bank payment or reverse an actual completed transfer.';
 if(status==='revoked')return 'The retained live clearance was revoked. New-order eligibility must be reviewed; original orders and financial obligations retain their own history.';
 if(status==='recorded')return 'The actual financial evidence and declared commercial scope were reviewed. Open the authorized workspace for current eligibility and retained history.';
 if(status==='funding_blocked')return 'The original obligation remains approved. Finance must verify available company funding and the next update; no bank payment is claimed.';
 return 'A change to the original financial record was saved. Open its authorized workspace for the exact current status and next action; preparation or verification is not completed payment.';
}

/** SQL is evaluated after its native event, current-marker CAS and source transition in the SAME batch. */
export function financialOperationalSource(db:D1Database,e:SourceOperationalEvent):OperationalSourceDescriptor|null{
 if(!financialKinds.includes(e.kind))return null;
 const status=e.status??'',marker='EXISTS(SELECT 1 FROM operational_notice_states notice_state WHERE notice_state.family=? AND notice_state.source_id=? AND notice_state.current_event_id=? AND notice_state.current_status=?)';
 const base={guard:marker,guardValues:[e.kind,e.sourceId,e.eventId,status] as unknown[],ownerSql:null as string|null,ownerValues:[] as unknown[],audience:'staff' as 'staff'|'seller'|'customer',staffPermission:null as Permission|null,relatedType:'',subject:financialNoticeSubject(status),staffGuard:'1=1',staffGuardValues:[] as unknown[]};
 if(e.kind==='finance.refund'){
  base.relatedType='refund_obligation';base.audience='customer';base.staffPermission='refund.approve.standard';
  base.ownerSql='SELECT customer_id FROM refund_obligations WHERE id=?';base.ownerValues=[e.sourceId];
  const scalar=(path:string)=>`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(native_event.private_details_json,'$.${path}')`;
  const packetState:Record<string,string>={packet_prepared:'prepared',packet_approved:'approved',packet_started:'processing',packet_uncertain:'uncertain',packet_paid:'paid',packet_failed:'failed',packet_voided:'void'};
  const proof=packetState[status]?` AND EXISTS(SELECT 1 FROM outgoing_payment_packets packet WHERE packet.id=${scalar('packetId')} AND packet.obligation_id=original.id AND packet.state=?)`:status==='funding_blocked'?" AND original.state='blocked'":status==='packet_submitted'?` AND ${currentRefundBankSubmissionSql(db)}`:status==='customer_delay'?` AND ${currentRefundDelaySql(db)}`:'';
  base.guard+=' AND EXISTS(SELECT 1 FROM refund_obligation_events native_event JOIN refund_obligations original ON original.id=native_event.obligation_id WHERE native_event.id=? AND original.id=? AND native_event.action=?'+proof+')';
  base.guardValues.push(e.eventId,e.sourceId,status,...(packetState[status]?[packetState[status]]:[]));
  base.staffGuard=`NOT EXISTS(SELECT 1 FROM refund_obligations original WHERE original.id=? AND (original.customer_id=u.id OR EXISTS(SELECT 1 FROM orders current_order WHERE current_order.id=original.order_id AND current_order.customer_id=u.id) OR EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles maker ON maker.id=item.seller_id WHERE item.order_id=original.order_id AND maker.user_id=u.id) OR EXISTS(SELECT 1 FROM order_items item JOIN managed_commercial_snapshots original_party ON original_party.order_item_id=item.id WHERE item.order_id=original.order_id AND ${liveSnapshotPartySql('original_party','u.id')}) OR EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=original.receipt_id AND conflict.user_id=u.id) OR ${linkedOriginalRefundConflictSql(db,'original.receipt_id','u.id')}))`;
  base.staffGuardValues=[e.sourceId];
  if(['customer_refund_reversed','customer_reversal_retained','customer_reversal_corrected'].includes(status)){
   const party=(name:string)=>`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(recovery.original_source_json,'$.${name}')`;
   base.staffGuard+=` AND NOT EXISTS(SELECT 1 FROM customer_refund_reversals reversal JOIN company_money_receipts returned_receipt ON returned_receipt.id=reversal.receipt_id JOIN company_payment_account_versions retained_account ON retained_account.id=returned_receipt.account_version_id JOIN company_payment_accounts logical_account ON logical_account.id=retained_account.account_id JOIN company_payment_account_versions latest_account ON latest_account.id=logical_account.latest_version_id WHERE reversal.obligation_id=? AND (EXISTS(SELECT 1 FROM company_receipt_conflicts conflict WHERE conflict.receipt_id=returned_receipt.id AND conflict.user_id=u.id) OR ${responseScopeContains(db,'retained_account.conflicts_json','u.id')} OR ${responseScopeContains(db,'latest_account.conflicts_json','u.id')})) AND NOT EXISTS(SELECT 1 FROM refund_obligations original JOIN seller_recovery_cases recovery ON recovery.refund_id=original.source_id WHERE original.id=? AND original.source_kind='return_refund' AND (${party('ownerId')}=u.id OR ${party('customerId')}=u.id OR ${party('originalCustomerId')}=u.id))`;
   base.staffGuardValues.push(e.sourceId,e.sourceId);
  }
 }else if(e.kind==='finance.payout'){
  base.audience='seller';base.staffPermission='payout.prepare';
  if(status==='native_eligible'){
   base.relatedType='managed_live_eligibility';base.ownerSql='SELECT user_id FROM seller_profiles WHERE id=?';base.ownerValues=[e.sourceId];
   const ids=`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_EXTRACT':'json_extract'}(native_event.next_json,'$.originalEntitlementIds')`;
   base.guard+=` AND EXISTS(SELECT 1 FROM audit_logs native_event WHERE native_event.id=? AND native_event.subject_id=? AND native_event.action='managed.live.eligibility.released' AND EXISTS(SELECT 1 FROM managed_entitlements earning JOIN managed_commercial_snapshots original ON original.id=earning.snapshot_id WHERE earning.seller_id=native_event.subject_id AND earning.status='eligible' AND original.record_kind='live' AND ${responseScopeContains(db,ids,'earning.id')}))`;base.guardValues.push(e.eventId,e.sourceId);
   base.staffGuard=`NOT EXISTS(SELECT 1 FROM seller_profiles seller WHERE seller.id=? AND seller.user_id=u.id) AND NOT EXISTS(SELECT 1 FROM audit_logs native_event JOIN managed_entitlements earning ON earning.seller_id=native_event.subject_id JOIN managed_commercial_snapshots original_party ON original_party.id=earning.snapshot_id WHERE native_event.id=? AND ${responseScopeContains(db,ids,'earning.id')} AND ${liveSnapshotPartySql('original_party','u.id')})`;base.staffGuardValues=[e.sourceId,e.eventId];
  }else if(status.startsWith('native_')){
   base.relatedType='managed_live_payout';base.ownerSql='SELECT seller.user_id FROM managed_payouts payout JOIN seller_profiles seller ON seller.id=payout.seller_id WHERE payout.id=?';base.ownerValues=[e.sourceId];
   const nativeStatus=status==='native_cancelled'?'rejected':'approved';
   base.guard+=" AND EXISTS(SELECT 1 FROM managed_payouts payout JOIN audit_logs native_event ON native_event.subject_id=payout.id WHERE payout.id=? AND payout.record_kind='live' AND payout.status=? AND native_event.id=? AND NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet WHERE packet.managed_payout_id=payout.id AND packet.state<>'void'))";
   base.guardValues.push(e.sourceId,nativeStatus,e.eventId);
   base.staffGuard=`NOT EXISTS(SELECT 1 FROM managed_payouts payout JOIN seller_profiles seller ON seller.id=payout.seller_id WHERE payout.id=? AND seller.user_id=u.id) AND NOT ${livePayoutPartySql('?','u.id')}`;base.staffGuardValues=[e.sourceId,e.sourceId];
  }else{
   base.relatedType='payout_transfer';base.ownerSql='SELECT seller.user_id FROM payout_transfer_packets packet JOIN seller_profiles seller ON seller.id=packet.seller_id WHERE packet.id=?';base.ownerValues=[e.sourceId];
   const states:Record<string,string>={packet_prepared:'prepared',packet_approved:'approved',packet_started:'processing',packet_uncertain:'uncertain',packet_paid:'paid',packet_failed:'failed',packet_voided:'void',funding_blocked:'prepared'};
   const maria=(db as D1Database&{dialect?:string}).dialect==='mariadb',saved=(field:string)=>`${maria?'JSON_VALUE':'json_extract'}(packet.source_snapshot_json,'$.${field}')`,ownerType=maria?"JSON_TYPE(JSON_EXTRACT(packet.source_snapshot_json,'$.ownerId'))='STRING'":"json_type(packet.source_snapshot_json,'$.ownerId')='text'";
   const retained=`CASE WHEN json_valid(packet.source_snapshot_json) THEN (${saved('model')}=packet.payout_model AND ${saved('id')}=COALESCE(packet.registered_payout_id,packet.managed_payout_id,packet.supplier_payment_id) AND ${saved('sellerId')}=packet.seller_id AND ${ownerType} AND LENGTH(TRIM(${saved('ownerId')}))>0) ELSE 0 END`;
   base.guard+=` AND EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN audit_logs native_event ON native_event.subject_id=packet.id WHERE packet.id=? AND packet.state=? AND native_event.id=? AND native_event.action='payout.transfer.event' AND ${retained})`;base.guardValues.push(e.sourceId,states[status]??'unsupported',e.eventId);
   base.staffGuard=`NOT EXISTS(SELECT 1 FROM payout_transfer_packets packet JOIN seller_profiles seller ON seller.id=packet.seller_id WHERE packet.id=? AND (seller.user_id=u.id OR CASE WHEN json_valid(packet.source_snapshot_json) THEN ${saved('ownerId')}=u.id ELSE 1 END OR ${livePayoutPartySql('packet.managed_payout_id','u.id')} OR EXISTS(SELECT 1 FROM company_payment_account_versions account WHERE account.id=packet.account_version_id AND ${responseScopeContains(db,'account.conflicts_json','u.id')})))`;base.staffGuardValues=[e.sourceId];
  }
 }else if(e.kind==='seller.live_clearance'){
  base.relatedType='managed_live_clearance';base.audience='seller';base.staffPermission='business_settings.approve';base.ownerSql='SELECT seller.user_id FROM managed_live_clearances clearance JOIN seller_profiles seller ON seller.id=clearance.seller_id WHERE clearance.id=?';base.ownerValues=[e.sourceId];
  const clearanceId=`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(native_event.next_json,'$.clearanceId')`;
  base.guard+=` AND EXISTS(SELECT 1 FROM managed_live_clearances clearance JOIN audit_logs native_event ON ${clearanceId}=clearance.id WHERE clearance.id=? AND clearance.state=? AND native_event.id=?)`;base.guardValues.push(e.sourceId,status==='revoked'?'revoked':'active',e.eventId);
  base.staffGuard='NOT EXISTS(SELECT 1 FROM managed_live_clearances clearance JOIN seller_profiles seller ON seller.id=clearance.seller_id WHERE clearance.id=? AND (seller.user_id=u.id OR clearance.owner_id=u.id))';base.staffGuardValues=[e.sourceId];
 }else if(e.kind==='finance.fee_refund_authorized'){
  base.relatedType='lawful_fee_refund_authorization';base.audience='customer';base.staffPermission='refund.approve.standard';base.subject='Lawful fee refund authorized; payment not recorded';base.ownerSql='SELECT customer_id FROM lawful_fee_refund_authorizations WHERE id=?';base.ownerValues=[e.sourceId];
  base.guard+=" AND EXISTS(SELECT 1 FROM lawful_fee_refund_authorizations original WHERE original.id=? AND original.id=? AND original.state='authorized' AND NOT EXISTS(SELECT 1 FROM refund_obligations obligation WHERE obligation.source_kind='service_fee' AND obligation.source_id=original.id))";base.guardValues.push(e.sourceId,e.eventId);
  base.staffGuard=`NOT EXISTS(SELECT 1 FROM lawful_fee_refund_authorizations original JOIN orders original_order ON original_order.id=original.order_id WHERE original.id=? AND (original.customer_id=u.id OR original_order.customer_id=u.id OR EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles maker ON maker.id=item.seller_id WHERE item.order_id=original.order_id AND maker.user_id=u.id) OR EXISTS(SELECT 1 FROM order_items item JOIN managed_commercial_snapshots original_party ON original_party.order_item_id=item.id WHERE item.order_id=original.order_id AND ${liveSnapshotPartySql('original_party','u.id')})))`;base.staffGuardValues=[e.sourceId];
 }else if(e.kind==='finance.invoice_adjustment'){
  base.relatedType='managed_live_invoice_adjustment';base.audience='customer';base.staffPermission='refund.approve.standard';base.subject='Original commercial invoice credit recorded';
  base.ownerSql='SELECT original_order.customer_id FROM managed_invoice_adjustments credit JOIN managed_invoice_groups invoice ON invoice.id=credit.invoice_group_id JOIN orders original_order ON original_order.id=invoice.order_id WHERE credit.id=?';base.ownerValues=[e.sourceId];
  base.guard+=" AND EXISTS(SELECT 1 FROM managed_invoice_adjustments credit JOIN managed_invoice_groups invoice ON invoice.id=credit.invoice_group_id JOIN managed_live_invoice_adjustment_sources source ON source.adjustment_id=credit.id WHERE credit.id=? AND credit.id=? AND credit.record_kind='live' AND invoice.record_kind='live')";base.guardValues.push(e.sourceId,e.eventId);
  const scope=`${(db as D1Database&{dialect?:string}).dialect==='mariadb'?'JSON_VALUE':'json_extract'}(original_invoice.snapshot_json,'$.financialScopeId')`;
  base.staffGuard=`NOT EXISTS(SELECT 1 FROM managed_invoice_adjustments credit JOIN managed_invoice_groups original_invoice ON original_invoice.id=credit.invoice_group_id JOIN managed_live_financial_scopes financial_source ON financial_source.id=${scope} WHERE credit.id=? AND ${liveInvoicePartySql('original_invoice','u.id','financial_source.id')})`;base.staffGuardValues=[e.sourceId];
 }else if(e.kind==='finance.funding_verified'){
  base.relatedType='company_funding_statement';base.staffPermission='business_settings.approve';base.subject='Internal company funding statement verified';
  base.guard+=` AND EXISTS(SELECT 1 FROM company_funding_statements statement JOIN company_funding_accounts current_funding ON current_funding.statement_id=statement.id JOIN company_payment_account_versions account ON account.id=statement.account_version_id JOIN company_payment_accounts logical_account ON logical_account.id=account.account_id AND logical_account.latest_version_id=account.id WHERE statement.id=? AND statement.id=? AND account.status='verified' AND ${fundingStatementBankReversalFreshSql('statement')})`;base.guardValues.push(e.sourceId,e.eventId);
  base.staffGuard=`NOT EXISTS(SELECT 1 FROM company_funding_statements statement JOIN company_payment_account_versions account ON account.id=statement.account_version_id WHERE statement.id=? AND ${responseScopeContains(db,'account.conflicts_json','u.id')})`;base.staffGuardValues=[e.sourceId];
 }else{
  base.relatedType='managed_live_financial_scope';base.staffPermission='business_settings.approve';base.guard+=' AND EXISTS(SELECT 1 FROM managed_live_financial_scopes scope JOIN audit_logs native_event ON native_event.subject_id=scope.id WHERE scope.id=? AND native_event.id=? AND NOT EXISTS(SELECT 1 FROM managed_live_financial_scopes newer WHERE newer.company_entity_reference=scope.company_entity_reference AND newer.company_scope_digest=scope.company_scope_digest AND (newer.reviewed_at>scope.reviewed_at OR newer.reviewed_at=scope.reviewed_at AND newer.id>scope.id)))';base.guardValues.push(e.sourceId,e.eventId);
 }
 return base;
}

export async function isCurrentFinancialNotice(db:D1Database,notice:CurrentOperationalNotice,now=Date.now()){
 const kind=notice.template.replace(/^business\./,'');if(!financialKinds.includes(kind))return true;
 if(!notice.relatedId||!notice.userId)return false;
 const state=await db.prepare('SELECT current_event_id eventId,current_status status FROM operational_notice_states WHERE family=? AND source_id=?').bind(kind,notice.relatedId).first<{eventId:string;status:string}>();if(!state)return false;
 if(kind==='seller.live_clearance'){
  const source=await db.prepare('SELECT seller_id sellerId FROM managed_live_clearances WHERE id=?').bind(notice.relatedId).first<{sellerId:string}>();if(!source)return false;
  const current=await(await import('../managed-commerce/live-readiness')).readManagedLiveEligibility(db,source.sellerId,now);
  if(state.status==='recorded'&&(current.clearance?.id!==notice.relatedId||!current.readyForActivation))return false;
  if(state.status==='revoked'&&current.clearance&&current.clearance.id!==notice.relatedId&&current.readyForActivation)return false;
 }
 const descriptor=financialOperationalSource(db,{kind,sourceId:notice.relatedId,eventId:state.eventId,status:state.status})!;
 if(notice.relatedType&&notice.relatedType!==descriptor.relatedType)return false;
 if(!await db.prepare('SELECT 1 WHERE '+descriptor.guard).bind(...descriptor.guardValues).first())return false;
 if(notice.audience==='staff'){
  if(!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND '+descriptor.staffGuard).bind(notice.userId,...descriptor.staffGuardValues??[]).first())return false;
 }else if(notice.audience!==descriptor.audience||!descriptor.ownerSql||!await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND u.id IN('+descriptor.ownerSql+')').bind(notice.userId,...descriptor.ownerValues).first())return false;
 const owner=descriptor.ownerSql&&await db.prepare('SELECT 1 FROM users u WHERE u.id=? AND u.id IN('+descriptor.ownerSql+')').bind(notice.userId,...descriptor.ownerValues).first();
 const keys=owner?['owner',notice.userId]:[notice.userId];
 for(const key of keys)if(notice.requestId===await operationalNotificationRequestId(notice.template,state.eventId,key,notice.channel))return true;
 return false;
}


