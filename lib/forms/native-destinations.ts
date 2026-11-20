type Destination = { href: string; label: string };
const destinations = new Map<string, Destination>();
function group(ids: readonly string[], href: string, label: string) {
  for (const id of ids) destinations.set(id, { href, label });
}
group(['staff.catalog', 'staff.product-classification', 'staff.product-review', 'seller.inventory'], '/admin/products', 'Product management and stock');
group(['staff.seller-review-action', 'staff.managed-maker-activation', 'staff.seller-governance', 'seller.managed-terms-acceptance'], '/admin/sellers', 'Seller review, terms and restrictions');
group(['commerce.checkout', 'commerce.return-request', 'commerce.complaint', 'commerce.order-cancellation', 'seller.case-return-response', 'seller.case-complaint-response', 'staff.return-case-action', 'staff.complaint-case-action', 'staff.cancellation-review', 'staff.order-fulfillment', 'staff.first-cod-confirmation'], '/admin/orders', 'Orders and customer care');
group(['account.privacy-request', 'staff.privacy-action'], '/admin/privacy', 'Privacy requests');
group(['account.review', 'seller.review-reply', 'staff.review-moderation'], '/admin/reviews', 'Verified purchase reviews');
group(['seller.shipping-request', 'seller.shipping-action', 'shipping.console-request', 'shipping.console-action-seller', 'shipping.console-action-staff', 'staff.parcel-control', 'staff.delivery-assignment'], '/admin/shipping', 'Shipping operations');
group(['staff.rider-control-1', 'staff.rider-control-2', 'rider.report', 'rider.remittance'], '/admin/riders', 'Existing rider operations');
group(['seller.managed-supply-proposal', 'seller.managed-transition-request', 'staff.managed-supply-decision', 'staff.managed-transition-decision'], '/admin/sellers', 'Managed supply and route transitions');
group(['seller.payout-request', 'staff.payout-1', 'staff.payout-2', 'staff.payout-request-action'], '/admin/payouts', 'Payout requests and preparation');
group(['commerce.gift-card-issue'], '/admin/gift-cards', 'Gift-card issuance');
group(['staff.invoice-adjustment'], '/admin/accounting', 'Invoices and accounting');
group(['staff.managed-adjustment', 'staff.managed-payment-preparation', 'staff.managed-payment-action', 'staff.managed-eligibility-release', 'staff.managed-payout-preparation', 'staff.managed-payout-action'], '/admin/payments/payouts', 'Company-funded payment and settlement');
group(['staff.exception-work'], '/admin/exceptions', 'Exception review');
group(['staff.governance-rule-create', 'staff.governance-promotion-create', 'staff.governance-incident-create', 'staff.governance-incident-update', 'staff.governance-backup-verify'], '/admin/governance', 'Existing governance records');

/** Feature landing only: a link never grants authority or executes a task. */
export function nativeFormDestination(formId: string): Destination | null { return destinations.get(formId) ?? null; }
