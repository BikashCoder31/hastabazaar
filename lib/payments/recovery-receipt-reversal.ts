import {RECOVERY_RECEIPT_REVERSAL_BLOCKER} from './recovery-receipt-accounting';
import type {CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard,ManualPaymentError} from './manual-receipts';
import {recoveryNoticeStatements} from './recovery-notices';

/** Keep actual bank corrections truthful; uncertain allocation attribution is owned work. */
export async function recoveryReceiptReversalStatements(db:D1Database,ctx:CommandContext,receiptId:string,reversalId:string,reason:string){
 const conflict=`NOT EXISTS(SELECT 1 FROM seller_recovery_allocations a JOIN seller_recovery_cases c ON c.id=a.case_id
  JOIN seller_profiles s ON s.id=c.seller_id LEFT JOIN refunds r ON r.id=c.refund_id LEFT JOIN orders o ON o.id=r.order_id
  WHERE a.receipt_id=? AND (s.user_id=? OR o.customer_id=? OR json_extract(c.original_source_json,'$.ownerId')=? OR json_extract(c.original_source_json,'$.customerId')=?))`;
 const conflictValues=[receiptId,ctx.actorId,ctx.actorId,ctx.actorId,ctx.actorId];
 if(!await db.prepare('SELECT 1 WHERE '+conflict).bind(...conflictValues).first())throw new ManualPaymentError('An eligible Super Admin without an interest in the original recovery must review this receipt reversal.',403);
 const cases=await db.prepare('SELECT DISTINCT c.id,c.revision,c.state,c.blocker FROM seller_recovery_cases c JOIN seller_recovery_allocations a ON a.case_id=c.id WHERE a.receipt_id=? ORDER BY c.id').bind(receiptId).all<{id:string;revision:number;state:string;blocker:string|null}>();
 const clock=checkoutCommitClock(db),statements=paymentGuard(db,conflict,conflictValues);
 for(const row of cases.results){
  const prior=row.blocker===RECOVERY_RECEIPT_REVERSAL_BLOCKER?await db.prepare("SELECT details_json details FROM seller_recovery_events WHERE case_id=? AND action='receipt_reversal_review' ORDER BY revision DESC LIMIT 1").bind(row.id).first<{details:string}>():null;
  const retained=prior?JSON.parse(prior.details) as {previousState?:string;previousBlocker?:string|null}:null;
  const previousState=retained?.previousState??row.state,previousBlocker=retained&&Object.hasOwn(retained,'previousBlocker')?retained.previousBlocker:row.blocker===RECOVERY_RECEIPT_REVERSAL_BLOCKER?null:row.blocker;
  statements.push(db.prepare(`UPDATE seller_recovery_cases SET state='reconciliation',blocker=?,revision=revision+1,next_action_at=${clock}+86400000,updated_at=${clock} WHERE id=? AND revision=?`)
   .bind(RECOVERY_RECEIPT_REVERSAL_BLOCKER,row.id,row.revision),...paymentGuard(db,'changes()=1'),
   db.prepare(`INSERT INTO seller_recovery_events(id,case_id,revision,action,actor_id,reason,details_json,request_id,created_at) VALUES(?,?,?,'receipt_reversal_review',?,?,?,?,${clock})`)
    .bind(crypto.randomUUID(),row.id,row.revision+1,ctx.actorId,reason,JSON.stringify({receiptId,reversalId,previousState,previousBlocker}),ctx.requestId+':'+row.id),
   ...await recoveryNoticeStatements(db,{...ctx,requestId:ctx.requestId+':'+row.id},row.id,'receipt_reversal_review','An actual repayment receipt was reversed. Finance is reconciling its allocation and native settlement. Collection is paused while this review is open.'));
 }
 return statements;
}
