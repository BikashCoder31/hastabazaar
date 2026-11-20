import type {SellerRecoverySource} from './seller-recovery';
import type {CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard} from './manual-receipts';

/** Positive native settlement cancels only the existing linked debt. Never create another negative charge. */
export function recoveryNativeSettlementStatements(db:D1Database,source:SellerRecoverySource,ctx:CommandContext,input:{caseId:string;creditId:string;amountPaisa:number;kind:'settlement'|'absorption'|'correction'}){
 const clock=checkoutCommitClock(db),kind='recovery_'+input.kind;
 const result={registeredCreditId:null as string|null,managedCreditId:null as string|null,fixedCreditId:null as string|null,statements:[] as D1PreparedStatement[]};
 if(!input.amountPaisa)return result;
 if(source.model==='registered'){
  result.registeredCreditId=input.creditId;
  result.statements.push(db.prepare(`INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at) VALUES(?,?,?,?,?,${clock},?,${clock})`)
   .bind(input.creditId,source.sellerId,source.orderItemId,kind,input.amountPaisa,'Original recovery '+input.kind+' '+input.caseId));
 }else if(source.model==='managed'){
  result.managedCreditId=input.creditId;
  result.statements.push(db.prepare(`INSERT INTO managed_settlement_entries(id,entitlement_id,refund_id,type,amount_paisa,metadata_json,reason_code,request_id,created_by,created_at)
   SELECT ?,e.id,?,'dispute_adjustment',?,?,?,?,?,${clock} FROM managed_entitlements e JOIN managed_commercial_snapshots s ON s.id=e.snapshot_id
   WHERE e.seller_id=? AND s.order_item_id=? AND e.earned_at IS NOT NULL`)
   .bind(input.creditId,source.refundId,input.amountPaisa,JSON.stringify({caseId:input.caseId,sourceId:source.id,kind:input.kind}),kind,input.creditId,ctx.actorId,source.sellerId,source.orderItemId),...paymentGuard(db,'changes()=1'));
 }else if(input.kind!=='correction'){
  result.fixedCreditId=input.creditId;
  result.statements.push(db.prepare(`INSERT INTO managed_supplier_recovery_credits(id,case_id,obligation_id,kind,amount_paisa,actor_id,request_id,created_at)
   SELECT ?,?,a.obligation_id,?,?,?,?,${clock} FROM managed_supplier_adjustments a JOIN managed_supplier_obligations o ON o.id=a.obligation_id WHERE a.id=? AND o.seller_id=?`)
   .bind(input.creditId,input.caseId,input.kind,input.amountPaisa,ctx.actorId,input.creditId,source.id,source.sellerId),...paymentGuard(db,'changes()=1'));
 }
 return result;
}
