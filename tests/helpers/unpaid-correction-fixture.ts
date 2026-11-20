import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './seller-recovery-fixture';
import {unpaidManagedRefundFixture} from './managed-recovery-fixture';
import {fixedRecoveryFixture} from './fixed-recovery-fixture';
import * as recovery from '../../lib/payments/seller-recovery';
import {getFixedSupplyBalance} from '../../lib/managed-commerce/fixed-supply';

export async function unpaidCorrectionFixture(model:'registered'|'managed'|'fixed'){
 const f=await(model==='registered'?sellerRecoveryFixture(true,'seller',false,40000):model==='managed'?unpaidManagedRefundFixture('seller',false):fixedRecoveryFixture('prepared'));
 try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const source='adjustmentId'in f?{kind:'supplier_adjustment' as const,id:f.adjustmentId}:{kind:'refund' as const,id:f.refundId};
  const environment='environment'in f?f.environment:'context'in f?f.context.environment:undefined;
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('unpaid-correction-open'),{...source,reason:'Review the actual original adjustment before correcting responsibility for its unpaid earnings.'});
  let review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  const decision={caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-UNPAID-ORIGINAL-SOURCE',reason:'Confirm the original instruction and existing deduction independently before any responsibility correction.',publicMessage:'Finance reviewed the original unpaid earnings and their existing adjustment.',...(environment?{environment}:{})};
  if('recordId'in f){
   await recovery.retireSellerRecoveryPayoutSource(f.db,f.ctx('unpaid-correction-retire','0'),{...decision,payoutId:f.payoutId,noFundsRemainSentConfirmed:true});
   review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
   await recovery.refreshSellerRecoveryZeroSource(f.db,f.ctx('unpaid-correction-zero','1'),{...decision,reviewDigest:review.reviewDigest});
  }else await recovery.reviewUnpaidSellerRecoverySource(f.db,f.ctx('unpaid-correction-source','0'),decision);
  review=await recovery.getSellerRecoveryReview(f.db,'reviewer',opened.id);
  const balance=async()=>{
   if('recordId'in f){const b=await getFixedSupplyBalance(f.db,f.recordId);return b.balancePaisa-b.recoverablePaisa;}
   return Number(model==='registered'?f.sqlite.prepare('SELECT SUM(amount_paisa) n FROM seller_ledger_entries WHERE seller_id=?').get(review.source.sellerId)!.n:f.sqlite.prepare('SELECT SUM(x.amount_paisa) n FROM managed_settlement_entries x JOIN managed_entitlements e ON e.id=x.entitlement_id WHERE e.seller_id=?').get(review.source.sellerId)!.n);
  };
  return {...f,source,environment,caseId:opened.id,review,balance};
 }catch(error){f.dispose();throw error;}
}
