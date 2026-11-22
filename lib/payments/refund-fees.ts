import {financialNoticeStatements} from '../operations/financial-notices';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import type {CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {lawfulServiceFeeRefundTotalSql} from '../db/repositories/platform-service-fee-refunds';
import {paymentGuard} from './manual-receipts';
import {refundCommand,refundIndependence,refundMoney,refundText,RefundObligationError,orderActualCashSql,originalRefundCashReservationsSql} from './refund-obligations';

export function pendingFeeAuthorizationsSql(alias='o'){
 if(!/^[a-z_]+$/.test(alias))throw new TypeError('Invalid order alias.');
 return `COALESCE((SELECT SUM(f.amount_paisa) FROM lawful_fee_refund_authorizations f WHERE f.order_id=${alias}.id AND f.state='authorized'),0)`;
}
export async function authorizeLawfulFeeRefund(db:D1Database,ctx:CommandContext,input:{orderId:string;amountPaisa:number;legalBasis:string;caseReference:string;evidenceReference:string}){
 const amount=refundMoney(input.amountPaisa);if(!amount)throw new RefundObligationError('Authorize a positive remaining original fee.');
 const basis=refundText(input.legalBasis,'documented legal basis',20,2000),reference=refundText(input.caseReference,'original case reference',3,120),evidence=refundText(input.evidenceReference,'retained legal decision evidence');
 const cmd=await refundCommand(db,ctx,'fee_authorized',input.orderId,input,true);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;status:'authorized'};
 const order=await db.prepare('SELECT id,customer_id AS customerId,buyer_platform_fee_paisa AS fee,return_policy_snapshot_json AS terms FROM orders WHERE id=?').bind(input.orderId).first<{id:string;customerId:string|null;fee:number;terms:string}>();
 if(!order?.customerId||!order.fee)throw new RefundObligationError('This original order has no refundable saved fee or authenticated owner.');
 const predicate=`EXISTS(SELECT 1 FROM orders o WHERE o.id=? AND o.customer_id=? AND o.buyer_platform_fee_paisa=? AND o.return_policy_snapshot_json=?
 AND ${pendingFeeAuthorizationsSql()}+${lawfulServiceFeeRefundTotalSql('o')}+?<=o.buyer_platform_fee_paisa
 AND ${originalRefundCashReservationsSql()}+?<=(${orderActualCashSql()}))`;
 const values=[order.id,order.customerId,order.fee,order.terms,amount,amount];
 if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new RefundObligationError('The remaining actual collected fee or original cash capacity is insufficient.');
 const id=crypto.randomUUID();
 return cmd.commit([...await financeEvidenceReferenceGuards(db,evidence,{kind:'order',id:order.id}),...await refundIndependence(db,ctx.actorId,order.customerId,order.id,null),db.prepare('UPDATE orders SET updated_at=updated_at WHERE id=?').bind(order.id),...paymentGuard(db,predicate,values),db.prepare(`INSERT INTO lawful_fee_refund_authorizations(id,order_id,customer_id,amount_paisa,legal_basis,case_reference,evidence_reference,source_snapshot_json,authorized_by,authorized_at) VALUES(?,?,?,?,?,?,?,?,?,${checkoutCommitClock(db)})`).bind(id,order.id,order.customerId,amount,basis,reference,evidence,JSON.stringify(order),ctx.actorId),...await financialNoticeStatements(db,ctx,{kind:'finance.fee_refund_authorized',sourceId:id,status:'authorized',nativeEventId:id})],{id,status:'authorized' as const});
}

