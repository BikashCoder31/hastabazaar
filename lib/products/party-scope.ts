/** Trusted SQL expressions only. The one native product link retains its original
 * intake party; unrelated historical owners, authors and reports are excluded. */
export function independentProductStaffSql(productSql:string,actorSql:string){return [
 `NOT EXISTS(SELECT 1 FROM products party_product JOIN seller_profiles party_seller ON party_seller.id=party_product.seller_id WHERE party_product.id=${productSql} AND party_seller.user_id=${actorSql})`,
 `NOT EXISTS(SELECT 1 FROM product_publication_links party_link JOIN product_intake_drafts party_draft ON party_draft.id=party_link.draft_id WHERE party_link.product_id=${productSql} AND party_draft.owner_id=${actorSql})`,
 ];}
/** Assistance may have no product/link yet; its exact case still retains both parties. */
export function independentProductIntakeStaffSql(caseSql:string,actorSql:string){return [
 `NOT EXISTS(SELECT 1 FROM product_intake_cases party_case JOIN product_intake_drafts party_draft ON party_draft.id=party_case.draft_id JOIN seller_profiles party_seller ON party_seller.id=party_draft.seller_id WHERE party_case.id=${caseSql} AND party_seller.user_id=${actorSql})`,
 `NOT EXISTS(SELECT 1 FROM product_intake_cases party_case JOIN product_intake_drafts party_draft ON party_draft.id=party_case.draft_id WHERE party_case.id=${caseSql} AND party_draft.owner_id=${actorSql})`,
 ];}
