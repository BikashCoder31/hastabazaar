import {currentManagedSaleEvidence} from './managed-sale-evidence';

/** Public browsing is separate from permission to add an item to a cart or buy it. */
export function publicProductVisibility(alias = 'products', now = Date.now()): string {
 if (!/^[a-z_]+$/.test(alias) || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid visibility lookup.');
 return `(${publicProductEligibility(alias, now)} OR (${alias}.status='published' AND EXISTS (
   SELECT 1 FROM seller_profiles visible_seller
   JOIN users visible_owner ON visible_owner.id=visible_seller.user_id
   JOIN seller_participation_profiles visible_participation ON visible_participation.seller_id=visible_seller.id
   WHERE visible_seller.id=${alias}.seller_id AND visible_owner.status='active'
     AND visible_seller.status IN ('under_review','approved')
     AND visible_participation.participation_route='managed_maker'
     AND visible_participation.application_stage='approved_for_activation'
  ) AND NOT EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=${alias}.seller_id
    AND (r.mode='disabled' OR (r.mode='suspended' AND r.suspended_until>${now})))
  AND NOT EXISTS(SELECT 1 FROM product_deletions d WHERE d.product_id=${alias}.id)))`;
}
// Internal SQL fragments only: aliases must be code-owned, never request data.
export function publicProductEligibility(alias = 'products', now = Date.now()): string {
 if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid SQL alias');
 if (!Number.isSafeInteger(now) || now < 0) throw new Error('Invalid eligibility time');
 return `${alias}.status='published' AND EXISTS (
  SELECT 1 FROM seller_profiles eligible_seller
  JOIN users eligible_owner ON eligible_owner.id=eligible_seller.user_id
  LEFT JOIN seller_participation_profiles eligible_participation ON eligible_participation.seller_id=eligible_seller.id
  WHERE eligible_seller.id=${alias}.seller_id AND eligible_owner.status='active' AND (
    (eligible_seller.status='approved' AND (eligible_participation.participation_route IS NULL OR eligible_participation.participation_route='registered_seller'))
    OR (eligible_participation.participation_route='managed_maker'
      AND eligible_participation.application_stage='active'
      AND eligible_participation.commercial_model IS NOT NULL
      AND eligible_participation.legal_seller_reference IS NOT NULL
      AND eligible_participation.invoice_issuer_reference IS NOT NULL
      AND eligible_participation.payout_beneficiary_reference IS NOT NULL
      AND eligible_participation.managed_agreement_version IS NOT NULL
      AND eligible_participation.managed_agreement_accepted_at IS NOT NULL
      AND (eligible_participation.commercial_model<>'managed_sale_linked_percentage_v1'
        OR EXISTS(SELECT 1 ${currentManagedSaleEvidence('eligible_seller.id','eligible_seller.user_id',now)})))
  )
 ) AND NOT EXISTS(SELECT 1 FROM seller_restrictions active_restriction
    WHERE active_restriction.seller_id=${alias}.seller_id AND (
      active_restriction.mode='disabled' OR
      (active_restriction.mode='suspended' AND active_restriction.suspended_until>${now})
    ))
 AND NOT EXISTS(SELECT 1 FROM product_deletions deleted_product WHERE deleted_product.product_id=${alias}.id)`;
}
