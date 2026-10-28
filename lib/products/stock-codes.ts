/** The platform code remains products.sku. Seller codes belong to the seller's submission. */
export function normalizeSellerSku(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new RangeError('Seller SKU must be text.');
  const normalized = value.trim();
  if (normalized.length > 80 || /[<>\p{Cc}]/u.test(normalized))
    throw new RangeError('Seller SKU must be 80 characters or fewer without markup or control characters.');
  return normalized || null;
}

/** Extract only an allowlisted value, never the seller's private/custom answers.
 * The latest submission is selected even when it clears or omits the stock code.
 */
export function sellerSkuSql(productAlias = 'products'): string {
  if (!/^[a-z_][a-z0-9_]*$/i.test(productAlias)) throw new RangeError('Invalid product alias.');
  return `(SELECT CASE WHEN json_valid(stock_answer.answers_json) THEN
    CASE WHEN json_type(stock_answer.answers_json,'$.productIdentity.sellerSku')='text'
      THEN json_extract(stock_answer.answers_json,'$.productIdentity.sellerSku') ELSE NULL END ELSE NULL END
    FROM form_answer_sets stock_answer JOIN seller_profiles stock_owner
      ON stock_owner.id=${productAlias}.seller_id AND stock_owner.user_id=stock_answer.actor_id
    WHERE stock_answer.form_id='seller.product-submission' AND stock_answer.subject_type='product'
      AND stock_answer.subject_id=${productAlias}.id
    ORDER BY CASE WHEN json_valid(stock_answer.answers_json) THEN
      CAST(COALESCE(json_extract(stock_answer.answers_json,'$.productIdentity.revision'),0) AS INTEGER) ELSE 0 END DESC,
      stock_answer.created_at DESC,stock_answer.id DESC LIMIT 1)`;
}
