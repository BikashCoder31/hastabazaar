import {managedPayoutExecutionSource} from '../managed-commerce/payout-operations';
import {liveManagedPayoutExecutionSource,getLiveManagedPayoutPartyAuthority} from '../managed-commerce/live-payout-operations';
import {verifiedIdentitySql,verifiedIdentityAtCommitSql,protectedPayoutGuards} from '../sellers/protected-change-policy';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard} from './manual-receipts';
import {PayoutTransferError,type PayoutSource} from './payout-transfer-types';
import type {CommandContext} from '../workflows/contracts';

export async function readManagedPayoutSource(db:D1Database,id:string,actorId:string,now:number):Promise<PayoutSource>{
 const original=await db.prepare('SELECT record_kind AS kind FROM managed_payouts WHERE id=?').bind(id).first<{kind:string}>();
 const source=original?.kind==='live'?await liveManagedPayoutExecutionSource(db,id,now):await managedPayoutExecutionSource(db,id,now),p=source.row;
 let partyGuards:D1PreparedStatement[]=[];
 if(original?.kind==='live'){try{partyGuards=(await getLiveManagedPayoutPartyAuthority(db,{sellerId:p.sellerId,actorId,payoutId:id},now)).guards;}catch(error){if(error instanceof Error&&'status' in error&&error.status===403)throw new PayoutTransferError(error.message,403);throw error;}}
 const b=await db.prepare(`SELECT b.id,s.user_id AS ownerId,v.identity_revision AS identityRevision,v.bank_revision AS bankRevision FROM seller_profiles s
  JOIN seller_protected_revisions v ON v.seller_id=s.id JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=substr(s.payout_account_reference,13)
  JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=s.id
  WHERE s.id=? AND s.payout_account_reference=? AND substr(s.payout_account_reference,1,12)='BENEFICIARY:' AND b.identity_revision=v.identity_revision
  AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>?) AND ${verifiedIdentitySql('s.id',now)}`)
  .bind(p.sellerId,p.destination,now).first<{id:string;ownerId:string;identityRevision:number;bankRevision:number}>();
 if(!b||b.ownerId===actorId)throw new PayoutTransferError('Independently review the current original maker beneficiary and identity before payment.');
 if(p.status==='failed'&&!await db.prepare("SELECT 1 FROM payout_transfer_packets WHERE managed_payout_id=? AND state='failed'").bind(id).first())throw new PayoutTransferError('Reconcile the original unknown managed instruction before retrying.');
 const snapshot=JSON.stringify({model:'managed',id,sellerId:p.sellerId,ownerId:b.ownerId,amountPaisa:p.amount,destination:p.destination,beneficiaryVersionId:b.id,identityRevision:b.identityRevision,bankRevision:b.bankRevision,scheduledFor:p.scheduledFor,positions:source.selected,balance:source.currentBalance});
 return {model:'managed',id,sellerId:p.sellerId,ownerId:b.ownerId,status:p.status,amountPaisa:p.amount,beneficiaryVersionId:b.id,identityRevision:b.identityRevision,bankRevision:b.bankRevision,snapshot,
  guards:[db.prepare('UPDATE managed_entitlements SET updated_at=updated_at WHERE seller_id=?').bind(p.sellerId),...source.guards,...partyGuards,...protectedPayoutGuards(db,p.sellerId,actorId,{id,model:'managed',...(original?.kind==='live'?{recordKind:'live' as const}:{})}),
   ...paymentGuard(db,`EXISTS(SELECT 1 FROM seller_profiles s JOIN seller_protected_revisions v ON v.seller_id=s.id JOIN seller_beneficiary_versions b ON b.id=? AND b.seller_id=s.id JOIN seller_documents d ON d.id=b.document_id WHERE s.id=? AND s.user_id=? AND s.payout_account_reference=? AND v.identity_revision=? AND v.bank_revision=? AND b.identity_revision=v.identity_revision AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>${checkoutCommitClock(db)}))`,[b.id,p.sellerId,b.ownerId,p.destination,b.identityRevision,b.bankRevision]),
   ...paymentGuard(db,verifiedIdentityAtCommitSql(db,'?'),[p.sellerId])]};
}

/** Retains native entitlement allocations. Actual sent outcomes do not rewrite their original source facts. */
export async function managedTransferOperation(db:D1Database,ctx:CommandContext,p:{id:string;payoutId:string;sellerId:string;amountPaisa:number;snapshot:string},action:'approve'|'start_processing'|'mark_paid'|'mark_failed',reference?:string){
 const current=await db.prepare('SELECT status,amount_paisa AS amount FROM managed_payouts WHERE id=? AND seller_id=?').bind(p.payoutId,p.sellerId).first<{status:string;amount:number}>();
 const next=action==='approve'?'approved':action==='start_processing'?'processing':action==='mark_paid'?'paid':'failed';
 if(!current||current.amount!==p.amountPaisa||!(action==='approve'?['prepared','failed'].includes(current.status):action==='start_processing'?current.status==='approved':current.status==='processing'))throw new PayoutTransferError('Reconcile the native original managed payment state before recording this outcome.');
 const snapshot=JSON.parse(p.snapshot) as {positions:{id:string;amount:number}[]};
 const reservations=snapshot.positions.flatMap(e=>paymentGuard(db,`COALESCE((SELECT a.amount_paisa FROM managed_payout_allocations a WHERE a.payout_id=? AND a.entitlement_id=? AND a.disposition='reserved'),(SELECT SUM(x.amount_paisa) FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id WHERE pe.payout_id=? AND x.entitlement_id=?))=?`,[p.payoutId,e.id,p.payoutId,e.id,e.amount]));
 return [...reservations,...paymentGuard(db,'EXISTS(SELECT 1 FROM payout_transfer_packets WHERE id=? AND managed_payout_id=? AND amount_paisa=? AND state=?)',[p.id,p.payoutId,p.amountPaisa,next]),
  db.prepare(`UPDATE managed_payouts SET status=?,approved_by=CASE WHEN ?='approved' THEN ? ELSE approved_by END,provider_reference=CASE WHEN ?='paid' THEN ? ELSE provider_reference END,paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END,updated_at=? WHERE id=? AND status=? AND amount_paisa=?`).bind(next,next,ctx.actorId,next,reference??null,next,ctx.now,ctx.now,p.payoutId,current.status,p.amountPaisa),...paymentGuard(db,'changes()=1'),
  ...(next==='paid'?[db.prepare("UPDATE managed_payout_allocations SET disposition='paid',terminal_at=? WHERE payout_id=? AND disposition='reserved'").bind(ctx.now,p.payoutId),...snapshot.positions.filter(e=>e.amount>0).map(e=>db.prepare("UPDATE managed_entitlements SET status=CASE WHEN status='reversed' THEN status ELSE 'paid' END,paid_at=?,version=version+1,updated_at=? WHERE id=? AND seller_id=?").bind(ctx.now,ctx.now,e.id,p.sellerId))]:[]),
  db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,previous_json,next_json,request_id,created_at) VALUES(?,?,?,'managed_payout',?,'Original evidenced manual execution',?,?,?,?)").bind(crypto.randomUUID(),ctx.actorId,'managed_payout.'+next,p.payoutId,JSON.stringify({status:current.status}),JSON.stringify({status:next,executionPacketId:p.id,providerReference:reference??null}),ctx.requestId,ctx.now)];
}
