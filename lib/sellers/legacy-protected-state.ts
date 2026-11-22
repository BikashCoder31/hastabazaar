/** Read-only safety projection. A schema upgrade is not a historical review/consent. */
export function legacyProtectedRequestGapSql(sellerExpression:string,identityOnly=false){
 if(!/^(?:\?|[a-z_]+\.[a-z_]+)$/.test(sellerExpression))throw new Error('Invalid legacy protected source.');
 return `EXISTS(SELECT 1 FROM seller_document_change_requests legacy_request JOIN seller_documents legacy_document ON legacy_document.id=legacy_request.document_id AND legacy_document.seller_id=legacy_request.seller_id
 WHERE legacy_request.seller_id=${sellerExpression} AND hex(legacy_request.status) NOT IN(hex('completed'),hex('rejected')) ${identityOnly?"AND hex(legacy_document.kind)<>hex('bank_verification')":''}
 AND NOT EXISTS(SELECT 1 FROM seller_protected_change_cases linked_case WHERE hex(linked_case.id)=hex(legacy_request.id) AND hex(linked_case.source_request_id)=hex(legacy_request.id) AND hex(linked_case.seller_id)=hex(legacy_request.seller_id) AND hex(linked_case.source_document_id)=hex(legacy_document.id)))`;
}
