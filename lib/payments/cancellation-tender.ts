import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard} from './manual-receipts';
import {orderActualCashSql} from './refund-obligations';
import {preparePaidManualRelease} from './manual-payment-lifecycle';
import {prepareInitialResponseNotices} from '../orders/response-notifications';
import {preparePaymentException} from './payment-exceptions';

/** Compose in the original cancellation transaction. Allocated credits and issued instructions remain immutable. */
export async function prepareCancellationTender(db:D1Database,input:{eventId:string;orderId:string;customerId:string|null;actorId:string|null;payablePaisa:number;walletRestoredPaisa:number;selectedSellerIds:readonly string[];retainedParcels:readonly {sellerId:string;amount:number}[];now:number}){
 const source=await db.prepare(`SELECT ${orderActualCashSql()} AS actualCash,(SELECT SUM(cash_paisa) FROM cancellation_refund_sources WHERE order_id=o.id) AS earlierRefunds FROM orders o WHERE o.id=?`).bind(input.orderId).first<{actualCash:number;earlierRefunds:number|null}>();
 if(!source)throw new Error('Retain the original cancellation order.');
 const window=await db.prepare('SELECT issued_at AS issuedAt,deadline_at AS deadlineAt,amount_paisa AS originalAmount,paid_at AS paidAt FROM manual_payment_windows WHERE order_id=?').bind(input.orderId).first<{issuedAt:number;deadlineAt:number;originalAmount:number;paidAt:number|null}>();
 const allocations=(await db.prepare('SELECT a.id,a.receipt_id AS receiptId,a.amount_paisa AS amount,r.status,c.revision AS receiptRevision FROM manual_payment_allocations a JOIN company_money_receipts r ON r.id=a.receipt_id JOIN company_receipt_controls c ON c.receipt_id=r.id WHERE a.order_id=? ORDER BY a.id').bind(input.orderId).all()).results;
 const parcels=(await db.prepare("SELECT j.seller_id AS sellerId,j.id,p.collected_paisa AS collected FROM shipping_parcels p JOIN shipping_jobs j ON j.id=p.shipping_job_id WHERE j.order_id=? AND j.direction='outbound'").bind(input.orderId).all<{sellerId:string;id:string;collected:number}>()).results;
 const cash=window?Math.max(0,source.actualCash-input.payablePaisa-Number(source.earlierRefunds??0)):parcels.reduce((sum,p)=>sum+(input.selectedSellerIds.includes(p.sellerId)?p.collected:Math.max(0,p.collected-(input.retainedParcels.find(r=>r.sellerId===p.sellerId)?.amount??p.collected))),0);
 if(!Number.isSafeInteger(cash)||cash<0||cash>source.actualCash)throw new Error('Reconcile the original actual cancellation cash before proceeding.');
 const clock=checkoutCommitClock(db),statements=[...paymentGuard(db,`EXISTS(SELECT 1 FROM orders o WHERE o.id=? AND (${orderActualCashSql()})=?) AND COALESCE((SELECT SUM(cash_paisa) FROM cancellation_refund_sources WHERE order_id=?),0)=?`,[input.orderId,source.actualCash,input.orderId,source.earlierRefunds??0]),
 db.prepare('INSERT INTO cancellation_refund_sources(id,order_id,customer_id,cash_paisa,wallet_restored_paisa,revised_payable_paisa,actual_collected_paisa,source_snapshot_json,authorized_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(input.eventId,input.orderId,input.customerId,cash,input.walletRestoredPaisa,input.payablePaisa,source.actualCash,JSON.stringify({window,allocations,parcels,selectedSellerIds:input.selectedSellerIds,retainedParcels:input.retainedParcels,walletAlreadyRestoredPaisa:input.walletRestoredPaisa}),input.now)];
 if(window){
  statements.push(db.prepare(`UPDATE manual_payment_windows SET revision=revision+1,last_event_id=?,paid_at=CASE WHEN paid_at IS NULL AND closed_at IS NULL AND EXISTS(SELECT 1 FROM orders o JOIN manual_payment_balances b ON b.order_id=o.id JOIN manual_payment_cutoffs c ON c.order_id=o.id WHERE o.id=? AND o.status<>'cancelled' AND b.payable_paisa<=? AND b.received_paisa>=b.payable_paisa AND c.cutoff_at>${clock}) THEN ${clock} ELSE paid_at END WHERE order_id=?`).bind(input.eventId,input.orderId,source.actualCash,input.orderId));
  if(window.paidAt===null)statements.push(db.prepare(`UPDATE orders SET status='placed',updated_at=${clock} WHERE id=? AND status='confirmed'`).bind(input.orderId));
  statements.push(db.prepare(`UPDATE orders SET payment_status='paid',updated_at=${clock} WHERE id=? AND payment_status NOT IN('paid','part_refunded','refunded') AND status<>'cancelled' AND EXISTS(SELECT 1 FROM manual_payment_windows w WHERE w.order_id=orders.id AND w.paid_at IS NOT NULL AND w.closed_at IS NULL)`).bind(input.orderId),
   db.prepare(`UPDATE payments SET status=CASE WHEN ?>0 THEN 'captured' ELSE 'cancelled' END,updated_at=${clock} WHERE order_id=? AND provider='manual_bank' AND status='pending' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=payments.order_id AND o.status<>'cancelled' AND o.payment_status='paid')`).bind(source.actualCash,input.orderId),...preparePaidManualRelease(db,input.orderId),...await prepareInitialResponseNotices(db,input.orderId));
 }
 if(cash>0)statements.push(...await preparePaymentException(db,{sourceKey:'cancellation-refund:'+input.eventId,orderId:input.orderId,receiptId:null,kind:'cancelled_money',reason:'Return the recorded original cancellation cash through one funded refund obligation. Existing allocations and retained-order payment remain intact.',ownerId:input.actorId,now:input.now}));
 return statements;
}
