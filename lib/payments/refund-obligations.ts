import {financialNoticeStatements} from '../operations/financial-notices';
import {financialNoticeIdentity} from '../operations/financial-notice-sources';
import {isFundingBankReversalFreshnessError,FUNDING_BANK_REVERSAL_REVERIFY_MESSAGE} from './funding-bank-reversal-freshness';
import {actualRecoveryAllocationSql} from './recovery-receipt-accounting';
import {actualManualReceiptUseSql} from './receipt-use-accounting';
import {bankSatisfiedReceiptReturnSql} from './receipt-return-bank-satisfaction';
import {prepareOriginalRefundDeadline} from './refund-deadlines';
export {recordEarlierRefundDeadline} from './refund-deadlines';
import {readOriginalBuyerLinePricing} from '../db/repositories/order-item-pricing-snapshots';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {CONTINUOUS_CALENDAR_VERSION,calculateServiceDueAt} from '../workflows/service-clock';
import {paymentGuard} from './manual-receipts';
import {linkedOriginalRefundConflictSql} from './refund-party-scope';
export {authorizeLawfulFeeRefund} from './refund-fees';
export {submitRefundDestination,verifyRefundDestination} from './refund-destinations';
export {recordRefundFundingStatement,getRefundFundingAvailability} from './refund-funding';
export {prepareRefundPacket,approveRefundPacket,startRefundPacket,recordRefundPacketOutcome,voidUnsentRefundPacket} from './refund-execution';

export class RefundObligationError extends Error{constructor(message:string,readonly status=409){super(message);}}
class RefundAuthorityError extends RefundObligationError{constructor(message:string){super(message,403);}}
export function refundText(value:unknown,label:string,min=8,max=1500){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\p{Cc}<>]/u.test(value))throw new RefundObligationError(`Record the actual ${label}.`,400);return value.trim();}
export function refundMoney(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw new RefundObligationError('Review the exact nonnegative original paisa amount.',400);return value;}

const savedVariantReturnPolicy = 'saved_variant_return_v1';
export interface SavedVariantRefundPricingEffect {
  policyVersion: typeof savedVariantReturnPolicy;
  orderItemId: string;
  grossItemPaisa: number;
  sellerPrincipalPaisa: number;
  unallocatedMerchandisePaisa: number;
  savedDeliverySharePaisa: number;
  retainedOutboundPaisa: number;
}

/** Use the versioned buyer component in addition to the native cost rows. */
export function returnRefundCostCoverage(effect?: SavedVariantRefundPricingEffect) {
  const costs = 'COALESCE((SELECT SUM(cost.amount_paisa) FROM refund_cost_allocations cost WHERE cost.refund_id=r.id),0)';
  if (effect === undefined) return { predicate: `${costs}=r.amount_paisa`, values: [] };
  if (!effect || effect.policyVersion !== savedVariantReturnPolicy ||
      typeof effect.orderItemId !== 'string' || !effect.orderItemId ||
      [effect.grossItemPaisa, effect.sellerPrincipalPaisa, effect.unallocatedMerchandisePaisa,
        effect.savedDeliverySharePaisa, effect.retainedOutboundPaisa].some(value => !Number.isSafeInteger(value) || value < 0) ||
      effect.unallocatedMerchandisePaisa > effect.grossItemPaisa || effect.sellerPrincipalPaisa > effect.grossItemPaisa ||
      effect.retainedOutboundPaisa > effect.savedDeliverySharePaisa) {
    throw new RefundObligationError('Reconcile the original saved variant refund allocations.');
  }
  return {
    predicate: `EXISTS(SELECT 1 FROM refund_variant_pricing_effects effect
      JOIN return_requests request ON request.order_item_id=effect.order_item_id
      WHERE request.id=r.return_request_id AND effect.refund_id=r.id AND effect.policy_version=? AND effect.order_item_id=?
        AND effect.gross_item_paisa=? AND effect.seller_principal_paisa=?
        AND effect.unallocated_merchandise_paisa=? AND effect.saved_delivery_share_paisa=? AND effect.retained_outbound_paisa=?
        AND effect.gross_item_paisa=r.item_amount_paisa AND effect.seller_principal_paisa=r.commission_base_refunded_paisa
        AND effect.saved_delivery_share_paisa-effect.retained_outbound_paisa=r.delivery_amount_paisa
        AND ${costs}+effect.unallocated_merchandise_paisa=r.amount_paisa)`,
    values: [effect.policyVersion, effect.orderItemId, effect.grossItemPaisa, effect.sellerPrincipalPaisa,
      effect.unallocatedMerchandisePaisa, effect.savedDeliverySharePaisa, effect.retainedOutboundPaisa],
  };
}

async function readSavedVariantRefundPricingEffect(db: D1Database, source: { id: string; orderId: string; caseId: string }) {
  try {
    const pricing = await readOriginalBuyerLinePricing(db, source.orderId);
    if (!pricing) return undefined;
    const item = await db.prepare(`SELECT i.id AS orderItemId FROM return_requests c JOIN order_items i ON i.id=c.order_item_id
      WHERE c.id=? AND i.order_id=?`).bind(source.caseId, source.orderId).first<{ orderItemId: string }>();
    if (item) {
      if (!pricing.has(item.orderItemId)) return undefined;
      const effect = await db.prepare(`SELECT policy_version AS policyVersion, order_item_id AS orderItemId,
        gross_item_paisa AS grossItemPaisa, seller_principal_paisa AS sellerPrincipalPaisa,
        unallocated_merchandise_paisa AS unallocatedMerchandisePaisa, saved_delivery_share_paisa AS savedDeliverySharePaisa,
        retained_outbound_paisa AS retainedOutboundPaisa FROM refund_variant_pricing_effects WHERE refund_id=? AND order_item_id=?`)
        .bind(source.id, item.orderItemId).first<SavedVariantRefundPricingEffect>();
      if (effect) return effect;
    }
  } catch {
    throw new RefundObligationError('Reconcile the original saved variant refund allocations.');
  }
  throw new RefundObligationError('Reconcile the original saved variant refund allocations.');
}

export async function refundCommand(db:D1Database,ctx:CommandContext,action:string,subjectId:string,payload:unknown,superAdmin=false){
 const authority=await staffMutationGuard(db,ctx.actorId,'refund.approve.standard',RefundAuthorityError,superAdmin?'super_admin':undefined);
 const source={action:'refund.obligation.'+action,subjectType:'refund_obligation',subjectId},receipt=await commandReceipt(db,ctx,source,payload);
 return {authority,receipt,async commit<T>(statements:D1PreparedStatement[],result:T):Promise<T>{if(receipt.replayed)return receipt.result as T;const value=result as {id?:string;state?:string;blocked?:boolean};const nativeActions=['opened','destination_verified','packet_prepared','packet_approved','packet_started','packet_outcome','packet_voided'];const status=value.blocked?'funding_blocked':action==='packet_outcome'?'packet_'+value.state:action;const notices=nativeActions.includes(action)?await financialNoticeStatements(db,ctx,{kind:'finance.refund',sourceId:action==='opened'?value.id!:subjectId,status}):[];try{await db.batch([...authority.statements,...statements,...notices,...authority.statements,receipt.insert(result)]);return result;}catch(error){const retry=await commandReceipt(db,ctx,source,payload);if(retry.replayed)return retry.result as T;if(isFundingBankReversalFreshnessError(error))throw new RefundObligationError(FUNDING_BANK_REVERSAL_REVERIFY_MESSAGE);throw error;}}};
}
export async function refundIndependence(db:D1Database,actorId:string,customerId:string,orderId:string|null,receiptId:string|null){
 const party='(SELECT ? AS actor_id,? AS customer_id,? AS order_id,? AS receipt_id) party';
 const local=`party.actor_id<>party.customer_id
   AND NOT EXISTS(SELECT 1 FROM order_items item JOIN seller_profiles seller ON seller.id=item.seller_id
     WHERE item.order_id=party.order_id AND seller.user_id=party.actor_id)
   AND NOT EXISTS(SELECT 1 FROM company_receipt_conflicts conflict
     WHERE conflict.receipt_id=party.receipt_id AND conflict.user_id=party.actor_id)`;
 const original=receiptId===null?'1':`NOT ${linkedOriginalRefundConflictSql(db,'party.receipt_id','party.actor_id')}`;
 const values=[actorId,customerId,orderId,receiptId];
 const allowed=await db.prepare(`SELECT (${local}) AS local_allowed,(${original}) AS original_allowed FROM ${party}`)
   .bind(...values).first<{local_allowed:number;original_allowed:number}>();
 if(!allowed?.local_allowed)throw new RefundAuthorityError('An eligible operator without a personal customer, supplier or payer interest must handle this obligation.');
 if(!allowed.original_allowed)throw new RefundAuthorityError('An eligible operator without a retained original party or company account interest must handle this returned credit.');
 return paymentGuard(db,`EXISTS(SELECT 1 FROM ${party} WHERE (${local}) AND (${original}))`,values);
}
export async function refundEvent(db:D1Database,ctx:CommandContext,id:string,action:string,publicMessage:string,privateDetails:unknown){return db.prepare(`INSERT INTO refund_obligation_events(id,obligation_id,actor_id,action,public_message,private_details_json,request_id,created_at) VALUES(?,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(await financialNoticeIdentity(ctx.actorId,ctx.requestId,action,'finance.refund',id),id,ctx.actorId,action,publicMessage,JSON.stringify(privateDetails),ctx.requestId);}

/** Original order money only. COD customer collection is distinct from company funding. */
export function orderActualCashSql(order='o'){
 if(!/^[a-z_]+$/.test(order))throw new Error('Use an internal order alias.');
 return `CASE WHEN EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=${order}.id) THEN COALESCE((SELECT SUM(a.amount_paisa) FROM manual_payment_allocations a JOIN manual_receipt_uses u ON u.id=a.receipt_use_id JOIN company_money_receipts r ON r.id=a.receipt_id WHERE a.order_id=${order}.id AND u.state='allocated' AND r.status='verified' AND NOT EXISTS(SELECT 1 FROM company_receipt_reversals x WHERE x.receipt_id=r.id)),0) WHEN ${order}.payment_mode='cod' THEN COALESCE((SELECT SUM(p.collected_paisa) FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=${order}.id AND j.direction='outbound'),0) ELSE 0 END`;
}
export interface RefundObligation{ id:string;sourceKind:string;sourceId:string;orderId:string|null;receiptId:string|null;receiptUseId:string|null;customerId:string;cashPaisa:number;originalCashPaisa:number;bankSatisfiedPaisa:number;walletPaisa:number;state:string;revision:number;sourceSnapshotJson:string;ownerId:string;authorizedAt:number;firstFinanceDueAt:number;nextUpdateAt:number; }
/** Native merchandise reservations plus other obligations and historical fee payouts, counted once. */
export function originalRefundCashReservationsSql(alias='o'){
 if(!/^[a-z_]+$/.test(alias))throw new TypeError('Invalid order alias.');
 return `COALESCE((SELECT SUM(r.amount_paisa-r.wallet_credit_paisa-r.referral_discount_paisa-r.promo_discount_paisa) FROM refunds r WHERE r.order_id=${alias}.id AND r.status<>'rejected'),0)
 +COALESCE((SELECT SUM(x.cash_paisa) FROM refund_obligations x WHERE x.order_id=${alias}.id AND x.source_kind<>'return_refund'),0)
 +COALESCE((SELECT SUM(c.cash_paisa) FROM cancellation_refund_sources c WHERE c.order_id=${alias}.id AND c.state='authorized' AND NOT EXISTS(SELECT 1 FROM refund_obligations x WHERE x.source_kind='cancellation' AND x.source_id=c.id)),0)
 +COALESCE((SELECT SUM(f.amount_paisa) FROM lawful_fee_refund_authorizations f WHERE f.order_id=${alias}.id AND f.state='authorized' AND NOT EXISTS(SELECT 1 FROM refund_obligations x WHERE x.source_kind='service_fee' AND x.source_id=f.id)),0)
 +COALESCE((SELECT SUM(json_extract(a.next_json,'$.request.amountPaisa')) FROM audit_logs a WHERE a.subject_type='order' AND a.subject_id=${alias}.id AND a.action='platform_service_fee.refunded' AND json_extract(a.next_json,'$.executionPacketId') IS NULL),0)`;
}
export async function getRefundObligation(db:D1Database,id:string){const satisfied=`CASE WHEN source_kind='receipt_return' THEN ${bankSatisfiedReceiptReturnSql('refund_obligations')} ELSE 0 END`;return db.prepare(`SELECT id,source_kind AS sourceKind,source_id AS sourceId,order_id AS orderId,receipt_id AS receiptId,receipt_use_id AS receiptUseId,customer_id AS customerId,cash_paisa-(${satisfied}) AS cashPaisa,cash_paisa AS originalCashPaisa,(${satisfied}) AS bankSatisfiedPaisa,wallet_paisa AS walletPaisa,state,revision,source_snapshot_json AS sourceSnapshotJson,owner_id AS ownerId,authorized_at AS authorizedAt,first_finance_due_at AS firstFinanceDueAt,next_update_at AS nextUpdateAt FROM refund_obligations WHERE id=?`).bind(id).first<RefundObligation>();}

/** Opens the native entitlement, never another product refund or a transfer. */
export async function openRefundObligation(db:D1Database,ctx:CommandContext,input:{kind:'return_refund'|'receipt_return'|'service_fee'|'cancellation';sourceId:string;reason:string}){
 refundText(input.reason,'entitlement reason',10);refundText(input.sourceId,'original source identity',1,191);
 if(!['return_refund','receipt_return','service_fee','cancellation'].includes(input.kind)||ctx.expectedRevision!==null)throw new RefundObligationError('Open an original supported source with a fresh command.');
 const cmd=await refundCommand(db,ctx,'opened',input.kind+':'+input.sourceId,input,input.kind==='receipt_return');if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 const prior=await db.prepare('SELECT id,revision FROM refund_obligations WHERE source_kind=? AND source_id=?').bind(input.kind,input.sourceId).first<{id:string;revision:number}>();
 if(prior){const original=(await getRefundObligation(db,prior.id))!;return cmd.commit(await refundIndependence(db,ctx.actorId,original.customerId,original.orderId,original.receiptId),prior);}
 const clock=checkoutCommitClock(db),native=(await db.prepare(`SELECT ${clock} AS now`).first<{now:number}>())!,id=crypto.randomUUID();
 let orderId:string|null=null,receiptId:string|null=null,receiptUseId:string|null=null,customerId:string,cash:number,wallet=0,authorizedAt:number,snapshot:unknown;
 const statements:D1PreparedStatement[]=[];
 if(input.kind==='return_refund'){
  const source=await db.prepare(`SELECT r.id,r.order_id AS orderId,o.customer_id AS customerId,r.return_request_id AS caseId,r.amount_paisa AS amount,r.wallet_credit_paisa AS wallet,r.referral_discount_paisa AS referral,r.promo_discount_paisa AS promo,r.status,r.approved_at AS approvedAt,r.high_value_approved_by AS highValueApprovedBy,r.is_high_value AS highValue,r.liability FROM refunds r JOIN orders o ON o.id=r.order_id WHERE r.id=?`).bind(input.sourceId).first<{id:string;orderId:string;customerId:string|null;caseId:string|null;amount:number;wallet:number;referral:number;promo:number;status:string;approvedAt:number|null;highValueApprovedBy:string|null;highValue:number;liability:string}>();
  if(!source?.customerId||!source.caseId||!['approved','failed'].includes(source.status)||source.approvedAt===null||source.highValue&&!source.highValueApprovedBy)throw new RefundObligationError('Reconcile the original authorized refund, owner and required high-value approval first.');
  orderId=source.orderId;customerId=source.customerId;cash=refundMoney(source.amount-source.wallet-source.referral-source.promo);wallet=refundMoney(source.wallet);authorizedAt=source.approvedAt;
  const variantPricingEffect = await readSavedVariantRefundPricingEffect(db, { id: source.id, orderId, caseId: source.caseId });
  const coverage = variantPricingEffect ? returnRefundCostCoverage(variantPricingEffect) : undefined;
  const variantGuard = coverage ? ` AND r.return_request_id=? AND (${coverage.predicate})` : '';
  const predicate = `EXISTS(SELECT 1 FROM refunds r JOIN orders o ON o.id=r.order_id
    WHERE r.id=? AND r.order_id=? AND o.customer_id=? AND r.status=? AND r.amount_paisa=? AND r.wallet_credit_paisa=?
      AND r.referral_discount_paisa=? AND r.promo_discount_paisa=? AND r.approved_at=?
      AND (r.is_high_value=0 OR r.high_value_approved_by IS NOT NULL)${variantGuard})`;
  const values = [source.id,orderId,customerId,source.status,source.amount,source.wallet,source.referral,source.promo,authorizedAt,
    ...(coverage ? [source.caseId, ...coverage.values] : [])];
  if (coverage && !await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first()) {
    throw new RefundObligationError('Reconcile the original saved variant refund allocations.');
  }
  snapshot = variantPricingEffect ? { ...source, variantPricingEffect } : source;
  statements.push(db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId), ...paymentGuard(db, predicate, values));
 }else if(input.kind==='cancellation'){
  const source=await db.prepare("SELECT id,order_id AS orderId,customer_id AS customerId,cash_paisa AS cash,wallet_restored_paisa AS walletAlreadyRestoredPaisa,source_snapshot_json AS original,authorized_at AS authorizedAt FROM cancellation_refund_sources WHERE id=? AND state='authorized'").bind(input.sourceId).first<{id:string;orderId:string;customerId:string|null;cash:number;walletAlreadyRestoredPaisa:number;original:string;authorizedAt:number}>();
  if(!source?.customerId||source.cash<=0)throw new RefundObligationError('Review the original identified customer and positive cancellation cash entitlement.');
  orderId=source.orderId;customerId=source.customerId;cash=refundMoney(source.cash);authorizedAt=source.authorizedAt;snapshot=source;
  statements.push(db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId),...paymentGuard(db,"EXISTS(SELECT 1 FROM cancellation_refund_sources WHERE id=? AND order_id=? AND customer_id=? AND cash_paisa=? AND state='authorized')",[source.id,orderId,customerId,cash]));
 }else if(input.kind==='service_fee'){
  const source=await db.prepare("SELECT id,order_id AS orderId,customer_id AS customerId,amount_paisa AS amount,legal_basis AS legalBasis,case_reference AS caseReference,evidence_reference AS evidenceReference,authorized_at AS authorizedAt,source_snapshot_json AS original FROM lawful_fee_refund_authorizations WHERE id=? AND state='authorized'").bind(input.sourceId).first<{id:string;orderId:string;customerId:string;amount:number;legalBasis:string;caseReference:string;evidenceReference:string;authorizedAt:number;original:string}>();
  if(!source)throw new RefundObligationError('Review the original legally authorized fee refund.');
  orderId=source.orderId;customerId=source.customerId;cash=source.amount;authorizedAt=source.authorizedAt;snapshot=source;
  statements.push(db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(orderId),...paymentGuard(db,"EXISTS(SELECT 1 FROM lawful_fee_refund_authorizations WHERE id=? AND order_id=? AND customer_id=? AND amount_paisa=? AND state='authorized')",[source.id,orderId,customerId,cash]));
 }else{
  const source=await db.prepare(`SELECT r.id,r.payer_user_id AS customerId,r.amount_minor AS amount,r.currency,r.status,c.revision,r.amount_minor-COALESCE((SELECT SUM(x.amount_minor) FROM company_receipt_reversals x WHERE x.receipt_id=r.id),0)-(COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)+COALESCE((SELECT SUM(${actualRecoveryAllocationSql('recovery_use')}) FROM seller_recovery_allocations recovery_use WHERE recovery_use.receipt_id=r.id),0)) AS unused FROM company_money_receipts r JOIN company_receipt_controls c ON c.receipt_id=r.id WHERE r.id=?`).bind(input.sourceId).first<{id:string;customerId:string|null;amount:number;currency:string;status:string;revision:number;unused:number}>();
  if(!source?.customerId||source.currency!=='NPR'||source.status!=='verified'||source.unused<=0)throw new RefundObligationError('Verify the actual original payer and positive unused NPR receipt balance first.');
  receiptId=source.id;customerId=source.customerId;cash=refundMoney(source.unused);authorizedAt=native.now;snapshot=source;receiptUseId=crypto.randomUUID();
  statements.push(db.prepare('UPDATE company_receipt_controls SET revision=revision+1 WHERE receipt_id=? AND revision=?').bind(receiptId,source.revision),...paymentGuard(db,'changes()=1'),
   ...paymentGuard(db,`EXISTS(SELECT 1 FROM company_money_receipts r WHERE r.id=? AND r.payer_user_id=? AND r.status='verified' AND r.currency='NPR' AND r.amount_minor-COALESCE((SELECT SUM(x.amount_minor) FROM company_receipt_reversals x WHERE x.receipt_id=r.id),0)-(COALESCE((SELECT SUM(${actualManualReceiptUseSql('u')}) FROM manual_receipt_uses u WHERE u.receipt_id=r.id AND u.state<>'released'),0)+COALESCE((SELECT SUM(${actualRecoveryAllocationSql('recovery_use')}) FROM seller_recovery_allocations recovery_use WHERE recovery_use.receipt_id=r.id),0))=?)`,[receiptId,customerId,cash]),
   db.prepare(`INSERT INTO manual_receipt_uses(id,receipt_id,kind,target_id,amount_minor,state,created_by,created_at) VALUES(?,?,'return',?,?,'reserved',?,${clock})`).bind(receiptUseId,receiptId,id,cash,ctx.actorId));
 }
 const due=calculateServiceDueAt({startedAt:authorizedAt,amount:1,unit:'service_day',calendarVersion:CONTINUOUS_CALENDAR_VERSION});
 statements.push(...await refundIndependence(db,ctx.actorId,customerId,orderId,receiptId),db.prepare(`INSERT INTO refund_obligations(id,source_kind,source_id,order_id,receipt_id,receipt_use_id,customer_id,cash_paisa,wallet_paisa,currency,source_snapshot_json,owner_id,authorized_at,first_finance_due_at,first_finance_at,next_update_at,calendar_version,created_at) VALUES(?,?,?,?,?,?,?,?,?,'NPR',?,?,?,?,${clock},?, ?,${clock})`).bind(id,input.kind,input.sourceId,orderId,receiptId,receiptUseId,customerId,cash,wallet,JSON.stringify(snapshot),ctx.actorId,authorizedAt,due,native.now+86400000,CONTINUOUS_CALENDAR_VERSION),await refundEvent(db,ctx,id,'opened','The authorized refund is with Finance. Verified details, funding and actual transfer remain separate.',{reason:input.reason,sourceKind:input.kind,sourceId:input.sourceId}));
 statements.push(...await prepareOriginalRefundDeadline(db,{obligationId:id,kind:input.kind,sourceId:input.sourceId,orderId,authorizedAt}));
 return cmd.commit(statements,{id,revision:0});
}

