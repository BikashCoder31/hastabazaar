import {noProtectedHoldSql,verifiedIdentitySql} from '../sellers/protected-change-policy';
import {recoveryPayoutReadySql} from './recovery-payout-policy';
import {payoutRegistrationBlocker} from './payout-registration-readiness';

function payoutRequestBeneficiarySource(now: number) {
  return `FROM seller_profiles s JOIN seller_protected_revisions r ON r.seller_id=s.id
    JOIN seller_beneficiary_versions b ON b.seller_id=s.id AND b.id=substr(s.payout_account_reference,13)
    JOIN seller_documents d ON d.id=b.document_id AND d.seller_id=s.id
    WHERE s.id=? AND s.status='approved' AND substr(s.payout_account_reference,1,12)='BENEFICIARY:'
    AND b.identity_revision=r.identity_revision AND b.verified_by IS NOT NULL AND b.verified_by<>s.user_id
    AND d.status='verified' AND (d.valid_until IS NULL OR d.valid_until>${now})`;
}

export function payoutRequestReadySql(now: number) {
  return `EXISTS(SELECT 1 ${payoutRequestBeneficiarySource(now)}
    AND ${verifiedIdentitySql('s.id', now)}
    AND ${noProtectedHoldSql('s.id', 'payouts')}
    AND ${recoveryPayoutReadySql('s.id', 'registered')})`;
}

export async function sellerPayoutRequestReadiness(db: D1Database, sellerId: string, now = Date.now()) {
  const blocker = await payoutRegistrationBlocker(db, sellerId, 'registered', now);
  if (blocker) return { ready: false, beneficiaryVersionId: null, maskedBeneficiary: null, blocker };

  // Project the same checks from one row so D1 does not stack the expanded
  // recovery conditions inside the other predicates for a read.
  const bank = await db.prepare(`SELECT b.id, b.details_json AS details,
    ${verifiedIdentitySql('s.id', now)} AS identityReady,
    ${noProtectedHoldSql('s.id', 'payouts')} AS noHold,
    ${recoveryPayoutReadySql('s.id', 'registered')} AS recoveryReady
    ${payoutRequestBeneficiarySource(now)}`).bind(sellerId)
    .first<{ id: string; details: string; identityReady: number; noHold: number; recoveryReady: number }>();
  if (!bank || !bank.identityReady || !bank.noHold || !bank.recoveryReady) {
    return {
      ready: false, beneficiaryVersionId: null, maskedBeneficiary: null,
      blocker: 'Review your verified beneficiary and current identity, and resolve any payout or recovery reconciliation hold before requesting available earnings.',
    };
  }
  const details = JSON.parse(bank.details);
  return {
    ready: true,
    beneficiaryVersionId: bank.id,
    maskedBeneficiary: details ? `${details.bankName} · •••• ${String(details.bankAccountNumber).slice(-4)}` : null,
    blocker: null,
  };
}
