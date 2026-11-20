import {noProtectedHoldSql,verifiedIdentitySql} from '../sellers/protected-change-policy';
import {recoveryPayoutReadySql} from './recovery-payout-policy';
import {payoutRegistrationBlocker} from './payout-registration-readiness';

export function payoutRequestReadySql(now:number){return `EXISTS(
 SELECT 1 FROM seller_profiles s JOIN seller_protected_revisions r ON r.seller_id=s.id
 JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=substr(s.payout_account_reference,13)
 JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=s.id
 WHERE s.id=? AND s.status='approved' AND substr(s.payout_account_reference,1,12)='BENEFICIARY:'
 AND b.identity_revision=r.identity_revision AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id
 AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>${now})
 AND ${verifiedIdentitySql('s.id',now)} AND ${noProtectedHoldSql('s.id','payouts')} AND ${recoveryPayoutReadySql('s.id','registered')})`;}

export async function sellerPayoutRequestReadiness(db:D1Database,sellerId:string,now=Date.now()){
 const blocker=await payoutRegistrationBlocker(db,sellerId,'registered',now);
 if(blocker)return {ready:false,beneficiaryVersionId:null,maskedBeneficiary:null,blocker};
 const ready=!!await db.prepare('SELECT 1 WHERE '+payoutRequestReadySql(now)).bind(sellerId).first();
 const bank=ready?await db.prepare(`SELECT b.id,b.details_json AS details FROM seller_profiles s JOIN seller_beneficiary_versions b
  ON b.seller_id=s.id AND b.id=substr(s.payout_account_reference,13) WHERE s.id=?`).bind(sellerId).first<{id:string;details:string}>():null;
 const details=bank?JSON.parse(bank.details):null;
 return {ready,beneficiaryVersionId:bank?.id??null,maskedBeneficiary:details?`${details.bankName} · •••• ${String(details.bankAccountNumber).slice(-4)}`:null,
  blocker:ready?null:'Review your verified beneficiary and current identity, and resolve any payout or recovery reconciliation hold before requesting available earnings.'};
}
