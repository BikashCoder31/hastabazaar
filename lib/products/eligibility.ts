// Internal SQL fragments only: aliases must be code-owned, never request data.
export function publicProductEligibility(alias = 'products'): string {
 if (!/^[a-z_]+$/.test(alias)) throw new Error('Invalid SQL alias');
 return `${alias}.status='published' AND EXISTS (
  SELECT 1 FROM seller_profiles eligible_seller JOIN users eligible_owner ON eligible_owner.id=eligible_seller.user_id
  WHERE eligible_seller.id=${alias}.seller_id AND eligible_seller.status='approved' AND eligible_owner.status='active'
 ) AND NOT EXISTS(SELECT 1 FROM product_deletions deleted_product WHERE deleted_product.product_id=${alias}.id)`;
}
