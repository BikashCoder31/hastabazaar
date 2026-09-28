import { FormPrivacyError } from '../forms/privacy';

// Correlated only to the approved data-rights request's persisted owner. These
// immutable financial sources remain retained under the existing policy.
export const retainedIncentiveProofForRequestSql = `(EXISTS(SELECT 1 FROM promo_redemptions proof
    WHERE proof.customer_id=data_rights_requests.customer_id)
  OR EXISTS(SELECT 1 FROM loyalty_daily_claims proof
    WHERE proof.user_id=data_rights_requests.customer_id)
  OR EXISTS(SELECT 1 FROM loyalty_points_entries proof
    WHERE proof.user_id=data_rights_requests.customer_id)
  OR EXISTS(SELECT 1 FROM loyalty_redemptions proof
    WHERE proof.user_id=data_rights_requests.customer_id)
  OR EXISTS(SELECT 1 FROM wallet_entries proof JOIN loyalty_redemptions redemption
    ON redemption.id=proof.loyalty_redemption_id AND redemption.user_id=proof.user_id
    WHERE proof.user_id=data_rights_requests.customer_id))`;

/** The caller authorizes the approved access request; every projection binds its persisted owner. */
export async function collectIncentivePrivacyData(db: D1Database, userId: string) {
  if (typeof userId !== 'string' || !userId.trim() || userId.length > 191)
    throw new FormPrivacyError('User ID is invalid.');
  // Explicit projections exclude staff reasons/answers, global budgets, other
  // owners, authentication metadata, response blobs and referral identifiers.
  const [promos, claims, entries, redemptions, credits] = await Promise.all([
    db.prepare(`SELECT proof.id,proof.campaign_id AS campaignId,proof.revision,
      proof.order_id AS orderId,proof.request_id AS requestId,
      proof.discount_paisa AS discountPaisa,proof.subtotal_paisa AS subtotalPaisa,
      campaign.code,terms.label,terms.kind,terms.fixed_paisa AS fixedPaisa,
      terms.percent_bps AS percentBps,terms.max_discount_paisa AS maxDiscountPaisa,
      proof.created_at AS createdAt FROM promo_redemptions proof
      JOIN promo_campaigns campaign ON campaign.id=proof.campaign_id
      JOIN promo_revisions terms ON terms.campaign_id=proof.campaign_id AND terms.revision=proof.revision
      WHERE proof.customer_id=? ORDER BY proof.created_at,proof.id`).bind(userId).all<{
        id: string; campaignId: string; revision: number; orderId: string; requestId: string;
        discountPaisa: number; subtotalPaisa: number; code: string; label: string;
        kind: string; fixedPaisa: number | null; percentBps: number | null;
        maxDiscountPaisa: number | null; createdAt: number;
      }>(),
    db.prepare(`SELECT proof.id,proof.request_id AS requestId,proof.revision,
      proof.local_date AS localDate,proof.awarded_points AS awardedPoints,
      proof.form_version_id AS formVersionId,proof.created_at AS createdAt
      FROM loyalty_daily_claims proof WHERE proof.user_id=? ORDER BY proof.created_at,proof.id`)
      .bind(userId).all<{
        id: string; requestId: string; revision: number; localDate: string;
        awardedPoints: number; formVersionId: string; createdAt: number;
      }>(),
    db.prepare(`SELECT id,points,kind,claim_id AS claimId,redemption_id AS redemptionId,
      created_at AS createdAt FROM loyalty_points_entries WHERE user_id=? ORDER BY created_at,id`)
      .bind(userId).all<{
        id: string; points: number; kind: string; claimId: string | null;
        redemptionId: string | null; createdAt: number;
      }>(),
    db.prepare(`SELECT proof.id,proof.request_id AS requestId,proof.revision,proof.points,
      proof.credit_paisa AS creditPaisa,terms.points_per_block AS pointsPerBlock,
      terms.credit_paisa_per_block AS creditPaisaPerBlock,proof.form_version_id AS formVersionId,
      proof.created_at AS createdAt FROM loyalty_redemptions proof
      JOIN loyalty_revisions terms ON terms.revision=proof.revision
      WHERE proof.user_id=? ORDER BY proof.created_at,proof.id`).bind(userId).all<{
        id: string; requestId: string; revision: number; points: number; creditPaisa: number;
        pointsPerBlock: number; creditPaisaPerBlock: number; formVersionId: string; createdAt: number;
      }>(),
    db.prepare(`SELECT credit.id,credit.loyalty_redemption_id AS redemptionId,
      credit.amount_paisa AS amountPaisa,credit.kind,credit.created_at AS createdAt
      FROM wallet_entries credit JOIN loyalty_redemptions proof
        ON proof.id=credit.loyalty_redemption_id AND proof.user_id=credit.user_id
      WHERE credit.user_id=? AND credit.kind='loyalty_redemption' ORDER BY credit.created_at,credit.id`)
      .bind(userId).all<{
        id: string; redemptionId: string; amountPaisa: number; kind: string; createdAt: number;
      }>(),
  ]);
  return { promoRedemptions: promos.results, dailyClaims: claims.results,
    pointsEntries: entries.results, redemptions: redemptions.results, walletCredits: credits.results };
}
