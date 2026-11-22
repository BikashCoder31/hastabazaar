const voluntaryDeliveryVersion = 'disclosed_voluntary_delivery_v1';

/** Preserve the original delivery promise unless the purchase retained approved, disclosed terms. */
export function originalVoluntaryDeliveryTerms(snapshot: string) {
  let parsed: { voluntaryDelivery?: {
    version?: unknown;
    legalAuthorityReference?: unknown;
    disclosureVersion?: unknown;
    disclosedAtCheckout?: unknown;
    outboundRefundPromised?: unknown;
    reversePaidByBuyer?: unknown;
  } } | null;
  try { parsed = JSON.parse(snapshot) as typeof parsed; } catch { return null; }
  const saved = parsed?.voluntaryDelivery;
  if (!saved || saved.version !== voluntaryDeliveryVersion ||
      typeof saved.legalAuthorityReference !== 'string' || !saved.legalAuthorityReference.trim() ||
      typeof saved.disclosureVersion !== 'string' || !saved.disclosureVersion.trim() ||
      saved.disclosedAtCheckout !== true || saved.outboundRefundPromised !== false ||
      saved.reversePaidByBuyer !== true) return null;
  return { version: voluntaryDeliveryVersion, disclosureVersion: saved.disclosureVersion };
}

export function returnMethodFunding(version:string|null,refundStatus:string|null) {
  return version===voluntaryDeliveryVersion && refundStatus==='approved' ? 'buyer' : 'company';
}

export async function originalReverseReturnFunding(db:D1Database,caseId:string) {
  const original=await db.prepare(`SELECT r.id AS refundId,r.status,c.policy_snapshot_json AS casePolicy,
    o.return_policy_snapshot_json AS purchasePolicy FROM return_requests c JOIN refunds r ON r.return_request_id=c.id
    JOIN orders o ON o.id=r.order_id WHERE c.id=? AND c.reason='change_of_mind' AND r.liability='buyer'`)
    .bind(caseId).first<{refundId:string;status:string;casePolicy:string;purchasePolicy:string}>();
  if (!original||original.casePolicy!==original.purchasePolicy||!originalVoluntaryDeliveryTerms(original.purchasePolicy)) return 'company';
  const effect=await db.prepare('SELECT voluntary_policy_version AS version FROM refund_variant_pricing_effects WHERE refund_id=?')
    .bind(original.refundId).first<{version:string|null}>();
  return returnMethodFunding(effect?.version??null,original.status);
}
