import {isPendingPayoutReference} from './onboarding';
export type BankReadinessStatus='missing'|'pending'|'verified'|'needs_recheck'|'legacy_review_required';
/** Safe metadata shared by the bank form and capability projection; never returns bank account details. */
export async function currentBankReadiness(db:D1Database,sellerId:string,reference:string|null,identityRevision:number,ownerId:string,now:number){
 const bank=await db.prepare(`SELECT b.id,b.identity_revision AS identityRevision,b.verified_at AS reviewedAt,b.verified_by AS reviewedBy,d.status,d.valid_until AS validUntil
 FROM seller_beneficiary_versions b JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=b.seller_id WHERE b.seller_id=? AND b.id=?`)
 .bind(sellerId,reference?.startsWith('BENEFICIARY:')?reference.slice(12):'').first<{id:string;identityRevision:number;reviewedAt:number;reviewedBy:string|null;status:string;validUntil:number|null}>();
 const status:BankReadinessStatus=bank?bank.status==='verified'&&bank.reviewedBy!==null&&bank.reviewedBy!==ownerId&&bank.identityRevision===identityRevision&&(bank.validUntil===null||bank.validUntil>now)?'verified':'needs_recheck':!reference?'missing':isPendingPayoutReference(reference)?'pending':'legacy_review_required';
 return {status,bank};
}
