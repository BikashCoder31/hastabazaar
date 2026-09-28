import { INCENTIVE_FORM_CONTRACTS } from '../incentives/forms';
import type { BaseFieldCapability, FormAudience, FormCapabilities, FormDefinition, FormId, FormMode } from './types';
import { feedbackTopics } from '../feedback/customer-feedback';

export interface ImplementedFormAdapter {
  readonly formId: FormId;
  readonly route: string;
  readonly mode: FormMode;
}

// Integrations add an entry here only when their server adapter exists and is tested.
export const IMPLEMENTED_FORM_ADAPTERS: Readonly<Record<string, ImplementedFormAdapter>> = Object.freeze({
  'commerce.promo-quote': { formId: 'commerce.promo-quote', route: '/api/checkout/promo', mode: 'transaction' },
  'staff.promo-code': { formId: 'staff.promo-code', route: '/api/admin/promo-codes', mode: 'operation' },
  'commerce.order-cancellation': { formId: 'commerce.order-cancellation', route: '/orders/:number/cancel', mode: 'transaction' },
  'commerce.add-to-cart': { formId: 'commerce.add-to-cart', route: '/api/cart', mode: 'transaction' },
  'staff.return-case-action': { formId: 'staff.return-case-action', route: '/api/admin/returns/:id/review', mode: 'operation' },
  'staff.complaint-case-action': { formId: 'staff.complaint-case-action', route: '/api/admin/complaints/:id', mode: 'operation' },
  'staff.cancellation-review': { formId: 'staff.cancellation-review', route: '/api/admin/cancellations', mode: 'operation' },
  'staff.seller-review-action': { formId: 'staff.seller-review-action', route: '/api/admin/seller-applications/:id/review', mode: 'operation' },
  'staff.homepage-hero-manager': { formId: 'staff.homepage-hero-manager', route: '/api/admin/business-settings', mode: 'operation' },
  'staff.homepage-occasion-manager': { formId: 'staff.homepage-occasion-manager', route: '/api/admin/business-settings', mode: 'operation' },
  'staff.business-settings-manager': { formId: 'staff.business-settings-manager', route: '/api/admin/business-settings', mode: 'operation' },
  'staff.homepage-visibility': { formId: 'staff.homepage-visibility', route: '/api/admin/products/:id/homepage', mode: 'operation' },
  'staff.order-fulfillment': { formId: 'staff.order-fulfillment', route: '/api/admin/orders/:id/fulfillment', mode: 'operation' },
  'staff.review-moderation': { formId: 'staff.review-moderation', route: '/api/admin/reviews/:id', mode: 'operation' },
  'staff.seller-governance': { formId: 'staff.seller-governance', route: '/api/admin/sellers/:id/governance', mode: 'operation' },
  'staff.product-review': { formId: 'staff.product-review', route: '/api/admin/products/:id/review', mode: 'operation' },
  'catalog.header-search': { formId: 'catalog.header-search', route: '/shop', mode: 'query' },
  'catalog.filters': { formId: 'catalog.filters', route: '/shop', mode: 'query' },
  'commerce.order-tracking': { formId: 'commerce.order-tracking', route: '/api/orders/track', mode: 'query' },
  'seller.product-filter': { formId: 'seller.product-filter', route: '/seller/products', mode: 'query' },
  'staff.homepage-filter': { formId: 'staff.homepage-filter', route: '/admin/homepage', mode: 'query' },
  'staff.activity-filter': { formId: 'staff.activity-filter', route: '/admin/activity', mode: 'query' },
  'staff.recorded-progress-filter': { formId: 'staff.recorded-progress-filter', route: '/admin/progress', mode: 'query' },
  'system.local-testing-role': { formId: 'system.local-testing-role', route: '/api/local-testing/session', mode: 'system' },
  'identity.register': { formId: 'identity.register', route: '/api/auth/register', mode: 'identity' },
  'identity.login-password': { formId: 'identity.login-password', route: '/api/auth/login', mode: 'identity' },
  'identity.email-code-request': { formId: 'identity.email-code-request', route: '/api/auth/email-code/request', mode: 'identity' },
  'identity.email-code-verify': { formId: 'identity.email-code-verify', route: '/api/auth/email-code/verify', mode: 'identity' },
  'identity.password-reset-request': { formId: 'identity.password-reset-request', route: '/api/auth/password-reset/request', mode: 'identity' },
  'identity.password-reset-complete': { formId: 'identity.password-reset-complete', route: '/api/auth/password-reset/complete', mode: 'identity' },
  'commerce.checkout': { formId: 'commerce.checkout', route: '/api/checkout', mode: 'transaction' },
  'commerce.return-request': { formId: 'commerce.return-request', route: '/orders/:number/returns', mode: 'transaction' },
  'commerce.complaint': { formId: 'commerce.complaint', route: '/orders/:number/complaints', mode: 'transaction' },
  'commerce.gift-card-issue': { formId: 'commerce.gift-card-issue', route: '/api/admin/gift-cards', mode: 'transaction' },
  'commerce.gift-card-redeem': { formId: 'commerce.gift-card-redeem', route: '/api/account/gift-cards', mode: 'transaction' },
  'seller.case-return-response': { formId: 'seller.case-return-response', route: '/api/seller/returns/:id/response', mode: 'operation' },
  'seller.case-complaint-response': { formId: 'seller.case-complaint-response', route: '/api/seller/complaints/:id/response', mode: 'operation' },
  'account.profile': { formId: 'account.profile', route: '/api/account/profile', mode: 'collection' },
  'account.address': { formId: 'account.address', route: '/api/account/addresses', mode: 'collection' },
  'account.privacy-request': { formId: 'account.privacy-request', route: '/api/account/privacy', mode: 'collection' },
  'account.review': { formId: 'account.review', route: '/api/products/:id/reviews', mode: 'collection' },
  'public.contact': { formId: 'public.contact', route: '/api/feedback', mode: 'collection' },
  'public.feedback': { formId: 'public.feedback', route: '/api/feedback', mode: 'collection' },
  'public.footer-feedback': { formId: 'public.footer-feedback', route: '/api/feedback', mode: 'collection' },
  'seller.application': { formId: 'seller.application', route: '/api/seller-applications', mode: 'collection' },
  'seller.maker-profile': { formId: 'seller.maker-profile', route: '/api/seller-applications/profile', mode: 'collection' },
  'seller.profile': { formId: 'seller.profile', route: '/api/seller/profile', mode: 'collection' },
  'seller.product-submission': { formId: 'seller.product-submission', route: '/api/seller/products', mode: 'collection' },
  'seller.inventory': { formId: 'seller.inventory', route: '/api/seller/products/:id/inventory', mode: 'operation' },
  'seller.shipping-request': { formId: 'seller.shipping-request', route: '/api/seller/shipping', mode: 'operation' },
  'seller.shipping-action': { formId: 'seller.shipping-action', route: '/api/seller/shipping/:id', mode: 'operation' },
  'seller.managed-supply-proposal': { formId: 'seller.managed-supply-proposal', route: '/api/seller/managed-program', mode: 'operation' },
  'seller.managed-transition-request': { formId: 'seller.managed-transition-request', route: '/api/seller/managed-program', mode: 'operation' },
  'seller.payout-request': { formId: 'seller.payout-request', route: '/api/seller/payout-requests', mode: 'transaction' },
  'seller.review-reply': { formId: 'seller.review-reply', route: '/api/seller/reviews/:id/reply', mode: 'collection' },
  'rider.application': { formId: 'rider.application', route: '/api/rider/application', mode: 'collection' },
  'rider.report': { formId: 'rider.report', route: '/api/rider/reports', mode: 'operation' },
  'rider.remittance': { formId: 'rider.remittance', route: '/api/rider/remittances', mode: 'operation' },
  'rider.code-verify': { formId: 'rider.code-verify', route: '/api/rider/verify-code', mode: 'identity' },
  'staff.delivery-assignment': { formId: 'staff.delivery-assignment', route: '/api/admin/orders/:id/delivery', mode: 'operation' },
  'staff.catalog': { formId: 'staff.catalog', route: '/api/admin/catalog', mode: 'operation' },
  'staff.product-classification': { formId: 'staff.product-classification', route: '/api/admin/products/:id/classification', mode: 'operation' },
  'staff.exception-work': { formId: 'staff.exception-work', route: '/api/admin/exception-work', mode: 'operation' },
  'staff.invoice-adjustment': { formId: 'staff.invoice-adjustment', route: '/api/admin/invoices/:id/adjustments', mode: 'operation' },
  'staff.managed-maker-activation': { formId: 'staff.managed-maker-activation', route: '/api/admin/managed-makers/:id/activate', mode: 'operation' },
  'staff.managed-supply-decision': { formId: 'staff.managed-supply-decision', route: '/api/admin/managed-program/:id', mode: 'operation' },
  'staff.managed-adjustment': { formId: 'staff.managed-adjustment', route: '/api/admin/managed-program/:id', mode: 'operation' },
  'staff.managed-payment-preparation': { formId: 'staff.managed-payment-preparation', route: '/api/admin/managed-program/:id', mode: 'operation' },
  'staff.managed-payment-action': { formId: 'staff.managed-payment-action', route: '/api/admin/managed-program/:id', mode: 'operation' },
  'staff.managed-transition-decision': { formId: 'staff.managed-transition-decision', route: '/api/admin/managed-program/:id', mode: 'operation' },
  'staff.parcel-control': { formId: 'staff.parcel-control', route: '/api/admin/orders/:id/parcels', mode: 'operation' },
  'staff.payout-request-action': { formId: 'staff.payout-request-action', route: '/api/admin/payout-requests/:id', mode: 'operation' },
  'staff.privacy-action': { formId: 'staff.privacy-action', route: '/api/admin/privacy/:id', mode: 'operation' },
  'staff.rider-control-1': { formId: 'staff.rider-control-1', route: '/api/admin/riders', mode: 'operation' },
  'staff.rider-control-2': { formId: 'staff.rider-control-2', route: '/api/admin/riders', mode: 'operation' },
  'staff.governance-rule-create': { formId: 'staff.governance-rule-create', route: '/api/admin/governance', mode: 'operation' },
  'staff.governance-promotion-create': { formId: 'staff.governance-promotion-create', route: '/api/admin/governance', mode: 'operation' },
  'staff.governance-incident-create': { formId: 'staff.governance-incident-create', route: '/api/admin/governance', mode: 'operation' },
  'staff.governance-incident-update': { formId: 'staff.governance-incident-update', route: '/api/admin/governance', mode: 'operation' },
  'staff.governance-backup-verify': { formId: 'staff.governance-backup-verify', route: '/api/admin/governance', mode: 'operation' },
  'staff.delivery-rate': { formId: 'staff.delivery-rate', route: '/api/admin/delivery-rates', mode: 'operation' },
  'staff.payout-1': { formId: 'staff.payout-1', route: '/api/admin/payouts', mode: 'operation' },
  'staff.payout-2': { formId: 'staff.payout-2', route: '/api/admin/payouts/:id', mode: 'operation' },
  'staff.referral-settings': { formId: 'staff.referral-settings', route: '/api/admin/referrals', mode: 'operation' },
  'staff.staff-invitation': { formId: 'staff.staff-invitation', route: '/api/admin/staff-invitations', mode: 'identity' },
  'staff.staff-permission-1': { formId: 'staff.staff-permission-1', route: '/api/admin/staff-permissions', mode: 'operation' },
  'staff.staff-permission-2': { formId: 'staff.staff-permission-2', route: '/api/admin/staff-permissions', mode: 'operation' },
  'shipping.console-request': { formId: 'shipping.console-request', route: '/api/seller/shipping', mode: 'operation' },
  'shipping.console-action-seller': { formId: 'shipping.console-action-seller', route: '/api/seller/shipping/:id', mode: 'operation' },
  'shipping.console-action-staff': { formId: 'shipping.console-action-staff', route: '/api/admin/shipping/:id', mode: 'operation' },
});

// Inventory rows follow the source policy inventory; live adapters are explicit below.
// A pending adapter is deliberately not a live configuration adapter.
const SOURCE_ROWS = `
staff.activity-filter|staff|query|/admin/activity|action
staff.homepage-filter|staff|query|/admin/homepage|query
identity.password-reset-request|public|identity|/api/auth/password-reset/request|email
identity.password-reset-complete|public|identity|/api/auth/password-reset/complete|token
system.local-testing-role|super_admin|system|/api/local-testing/session|role
identity.email-code-verify|public|identity|/api/auth/email-code/verify|code
identity.login-password|public|identity|/api/auth/login|password
identity.email-code-request|public|identity|/api/auth/email-code/request|email
identity.register|public|identity|/api/auth/register|password
seller.product-filter|seller|query|/seller/products|status
account.address|customer|collection|/api/account/addresses|addressLine1
account.privacy-request|customer|collection|/api/account/privacy|requestType
account.profile|customer|collection|/api/account/profile|name
account.review|customer|collection|/api/products/:id/reviews|rating
staff.catalog|staff|operation|/api/admin/catalog|action
staff.delivery-rate|staff|operation|/api/admin/delivery-rates|rate
staff.exception-work|staff|operation|/api/admin/exception-work|reason
staff.governance-rule-create|staff|operation|/api/admin/governance|code
staff.governance-promotion-create|staff|operation|/api/admin/governance|promotion
staff.governance-incident-create|staff|operation|/api/admin/governance|incident
staff.governance-incident-update|staff|operation|/api/admin/governance|incident
staff.governance-backup-verify|staff|operation|/api/admin/governance|verification
staff.invoice-adjustment|staff|operation|/api/admin/invoices/:id/adjustments|amount
staff.managed-maker-activation|staff|operation|/api/admin/managed-makers/:id/activate|reason
staff.managed-supply-decision|staff|operation|/api/admin/managed-program/:id|decision
staff.managed-adjustment|staff|operation|/api/admin/managed-program/:id|amountNpr
staff.managed-payment-preparation|staff|operation|/api/admin/managed-program/:id|destinationReference
staff.managed-payment-action|super_admin|operation|/api/admin/managed-program/:id|action
staff.managed-transition-decision|staff|operation|/api/admin/managed-program/:id|decision
staff.parcel-control|staff|operation|/api/admin/orders/:id/parcels|action
staff.payout-1|staff|operation|/api/admin/payouts|amount
staff.payout-2|staff|operation|/api/admin/payouts/:id|action
staff.payout-request-action|staff|operation|/api/admin/payout-requests/:id|decision
staff.privacy-action|staff|operation|/api/admin/privacy/:id|status
staff.product-classification|staff|operation|/api/admin/products/:id/classification|category
staff.recorded-progress-filter|staff|query|/admin/progress|action
staff.referral-settings|staff|operation|/api/admin/referrals|rate
staff.rider-control-1|staff|operation|/api/admin/riders|action
staff.rider-control-2|staff|operation|/api/admin/riders|action
staff.staff-invitation|super_admin|identity|/api/admin/staff-invitations|email
staff.staff-permission-1|super_admin|operation|/api/admin/staff-permissions|permissions
staff.staff-permission-2|super_admin|operation|/api/admin/staff-permissions|permissions
catalog.filters|public|query|/shop|category
commerce.checkout|customer|transaction|/api/checkout|deliveryAddress
commerce.return-request|customer|transaction|/orders/:number/returns|reason
commerce.complaint|customer|transaction|/orders/:number/complaints|reason
commerce.gift-card-redeem|customer|transaction|/api/account/gift-cards|code
commerce.order-tracking|public|query|/api/orders/track|orderNumber
staff.delivery-assignment|staff|operation|/api/admin/orders/:id/delivery|method
public.contact|public|collection|/api/feedback|message
public.footer-feedback|public|collection|/api/feedback|message
catalog.header-search|public|query|/shop|query
rider.code-verify|rider|identity|/api/rider/verify-code|code
rider.application|rider|collection|/api/rider/application|identity
rider.report|rider|operation|/api/rider/reports|evidence
rider.remittance|rider|operation|/api/rider/remittances|amount
seller.inventory|seller|operation|/api/seller/products/:id/inventory|quantity
seller.maker-profile|seller|collection|/api/seller-applications/profile|legalName
seller.managed-supply-proposal|seller|operation|/api/seller/managed-program|quantity
seller.managed-transition-request|seller|operation|/api/seller/managed-program|reason
seller.payout-request|seller|transaction|/api/seller/payout-requests|amount
seller.product-submission|seller|collection|/api/seller/products|title
seller.review-reply|seller|collection|/api/seller/reviews/:id/reply|reply
seller.application|seller|collection|/api/seller-applications|legalName
seller.profile|seller|collection|/api/seller/profile|displayName
seller.shipping-request|seller|operation|/api/seller/shipping|action
seller.shipping-action|seller|operation|/api/seller/shipping/:id|action
shipping.console-request|seller|operation|/api/seller/shipping|orderId
shipping.console-action-seller|seller|operation|/api/seller/shipping/:id|action
`.trim();

// Input-bearing, click-driven server mutations found outside JSX <form>.
export const PROGRAMMATIC_FORM_SITES = Object.freeze([
  { path: 'components/commerce/customer-order-cancellation.tsx', formIds: ['commerce.order-cancellation'], explanation: 'Dialog collects a reason and submits by click.' },
  { path: 'components/commerce/add-to-cart.tsx', formIds: ['commerce.add-to-cart'], explanation: 'Quantity selector submits cart actions by click.' },
  { path: 'components/admin/return-case-actions.tsx', formIds: ['staff.return-case-action'], explanation: 'Staff case decision collects evidence without JSX form.' },
  { path: 'components/admin/complaint-case-actions.tsx', formIds: ['staff.complaint-case-action'], explanation: 'Staff case decision submits selected values by click.' },
  { path: 'components/admin/cancellation-review-control.tsx', formIds: ['staff.cancellation-review'], explanation: 'Cancellation reason and decision submit by click.' },
  { path: 'components/admin/seller-review-actions.tsx', formIds: ['staff.seller-review-action'], explanation: 'Seller review decision submits by click.' },
  { path: 'components/admin/homepage-hero-manager.tsx', formIds: ['staff.homepage-hero-manager'], explanation: 'Hero draft controls save through click-driven actions.' },
  { path: 'components/admin/homepage-occasion-manager.tsx', formIds: ['staff.homepage-occasion-manager'], explanation: 'Occasion draft controls save through click-driven actions.' },
  { path: 'components/admin/business-settings-manager.tsx', formIds: ['staff.business-settings-manager'], explanation: 'Settings editor saves and publishes versioned drafts through click actions.' },
  { path: 'components/admin/homepage-visibility-control.tsx', formIds: ['staff.homepage-visibility'], explanation: 'Visibility reason and decision submit by click.' },
  { path: 'components/admin/order-fulfillment-actions.tsx', formIds: ['staff.order-fulfillment'], explanation: 'Fulfillment note and tracking value submit from a dialog.' },
  { path: 'components/admin/review-moderation-actions.tsx', formIds: ['staff.review-moderation'], explanation: 'Review moderation reason submits by click.' },
  { path: 'components/admin/seller-governance-actions.tsx', formIds: ['staff.seller-governance'], explanation: 'Seller governance evidence and reason submit by click.' },
  { path: 'components/admin/product-review-actions.tsx', formIds: ['staff.product-review'], explanation: 'Product review note and decision submit from a dialog.' },
] as const);

const CONDITIONAL_SOURCE_ROWS = `
commerce.gift-card-issue|staff|transaction|/api/admin/gift-cards|amount
shipping.console-action-staff|staff|operation|/api/admin/shipping/:id|action
public.feedback|public|collection|/api/feedback|message
`.trim();

const PROGRAMMATIC_ROWS = `
seller.case-return-response|seller|operation|/api/seller/returns/:id/response|response
seller.case-complaint-response|seller|operation|/api/seller/complaints/:id/response|response
commerce.order-cancellation|customer|transaction|/orders/:number/cancel|reason
commerce.add-to-cart|customer|transaction|/api/cart|quantity
staff.return-case-action|staff|operation|/api/admin/returns/:id/review|decision
staff.complaint-case-action|staff|operation|/api/admin/complaints/:id|decision
staff.cancellation-review|staff|operation|/api/admin/cancellations|reason
staff.seller-review-action|staff|operation|/api/admin/seller-applications/:id/review|decision
staff.homepage-hero-manager|super_admin|operation|/api/admin/business-settings|slides
staff.homepage-occasion-manager|super_admin|operation|/api/admin/business-settings|occasions
staff.business-settings-manager|super_admin|operation|/api/admin/business-settings|setting
staff.homepage-visibility|staff|operation|/api/admin/products/:id/homepage|reason
staff.order-fulfillment|staff|operation|/api/admin/orders/:id/fulfillment|note
staff.review-moderation|staff|operation|/api/admin/reviews/:id|reason
staff.seller-governance|staff|operation|/api/admin/sellers/:id/governance|reason
staff.product-review|staff|operation|/api/admin/products/:id/review|reason
`.trim();

function definition(row: string): FormDefinition {
  const [id, audience, mode, route, key] = row.split('|') as [FormId, FormAudience, FormMode, string, string];
  const explanation = id === 'staff.return-case-action'
    ? 'The primary decision uses /api/admin/returns/:id/review; conditional high-value and operations actions use /api/admin/returns/:id/high-value and /api/admin/returns/:id/operations. Existing validation and authorization stay protected.'
    : mode === 'identity'
      ? 'Identity keys and access checks stay protected; custom answers require an explicit server adapter.'
      : mode === 'query'
        ? 'Existing filter presentation may change; a new criterion requires a server query adapter and creates no answer record.'
        : mode === 'system'
          ? 'This staging-only control cannot be made configurable in production.'
          : 'Existing server validation and authorization stay protected; custom answers require a record-linked server adapter.';
  return Object.freeze({
    id, audience, mode, route,
    baseFields: Object.freeze([{ key, type: 'existing', label: key, capability: (mode === 'query' ? 'display_editable' : 'protected') as BaseFieldCapability, explanation }]),
    capabilities: Object.freeze({ explanation, customFieldTypes: Object.freeze([]), answerBehavior: mode === 'query' ? 'query' : mode === 'system' ? 'none' : 'record' } satisfies FormCapabilities),
    adapterId: `pending:${id}`,
  });
}

const ACCOUNT_CUSTOM_TYPES = Object.freeze(['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'] as const);
const PROGRAMMATIC_KEYS = {
  'commerce.order-cancellation': ['action', 'sellerIds', 'fingerprint', 'reason', 'orderNumber', 'orderId', 'customerId', 'receiptTokenHash', 'receiptToken'],
  'commerce.add-to-cart': ['productId', 'quantity', 'returnTo', 'redirect'],
  'staff.return-case-action': ['action', 'decision', 'outcome', 'responsibility', 'itemRefundPaisa', 'deliveryRefundPaisa', 'reference', 'restockQuantity', 'note', 'publicMessageEn', 'publicMessageNe', 'returnRequestId', 'refundId', 'amountPaisa'],
  'staff.complaint-case-action': ['action', 'note', 'publicMessageEn', 'publicMessageNe', 'resolutionEn', 'resolutionNe', 'complaintId'],
  'staff.cancellation-review': ['action', 'sellerIds', 'fingerprint', 'reviewId', 'note', 'clientAttemptId', 'orderId', 'orderNumber'],
  'staff.seller-review-action': ['action', 'decision', 'reason', 'sellerId', 'payoutAccountReference', 'settlementTermsReference'],
  'staff.homepage-hero-manager': ['key', 'value', 'slides', 'reason', 'action', 'revision', 'expectedRevision', 'effectiveFrom', 'supersedesId', 'sourceVersionId', 'position', 'eyebrow', 'headingLead', 'highlightedPhrase', 'headingTail', 'body', 'primaryActionLabel', 'primaryActionHref', 'secondaryActionLabel', 'secondaryActionHref', 'mediaType', 'mediaId', 'imageAlt', 'posterMediaId', 'videoDescription', 'imageNote', 'file', 'desktopMediaId', 'mobileMediaId', 'imageUrl', 'videoUrl', 'altTextEn', 'altTextNe', 'titleEn', 'titleNe', 'subtitleEn', 'subtitleNe', 'href', 'enabled', 'sortOrder'],
  'staff.homepage-occasion-manager': ['key', 'value', 'occasions', 'reason', 'action', 'revision', 'expectedRevision', 'effectiveFrom', 'supersedesId', 'sourceVersionId', 'position', 'eyebrow', 'headingLead', 'highlightedPhrase', 'headingTail', 'body', 'supportingNote', 'cards', 'kicker', 'title', 'destination', 'icon', 'theme', 'occasionId', 'slug', 'titleEn', 'titleNe', 'imageUrl', 'altTextEn', 'altTextNe', 'href', 'enabled', 'sortOrder'],
  'staff.business-settings-manager': ['key', 'value', 'setting', 'reason', 'action', 'revision', 'expectedRevision', 'effectiveFrom', 'supersedesId', 'sourceVersionId'],
  'staff.homepage-visibility': ['action', 'reason', 'hidden', 'expectedVersion', 'productId'],
  'staff.order-fulfillment': ['action', 'note', 'trackingCode', 'orderId', 'orderNumber', 'sellerIds', 'fingerprint'],
  'staff.review-moderation': ['action', 'note', 'version', 'reviewId', 'replyId', 'productId'],
  'staff.seller-governance': ['action', 'mode', 'suspendedUntil', 'obligationMode', 'reasonCode', 'reason', 'expectedVersion', 'sellerId'],
  'staff.product-review': ['action', 'reason', 'productId'],
} as const;
type ProgrammaticFormId = keyof typeof PROGRAMMATIC_KEYS;
function programmaticDefinition(id: ProgrammaticFormId): FormDefinition {
  const source = PROGRAMMATIC_ROWS.split('\n').find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing programmatic definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const keys = new Set<string>([...PROGRAMMATIC_KEYS[id], 'id', 'status', 'version', 'requestId', 'idempotencyKey',
    'formVersion', 'customAnswers', 'sourceFormId', 'actorId', 'actorRole', 'userId']);
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze([...keys].map((key) => ({ key, type: 'existing', label: key, capability: 'protected' as const,
      explanation: 'Existing built-in controls, aliases, state, identity, money, evidence and current authorization remain server enforced; their rendered order is fixed.' }))),
    capabilities: Object.freeze({ explanation: id === 'commerce.add-to-cart'
      ? 'Cart accepts only its existing product and quantity contract; custom form envelopes and answer recording are unavailable.'
      : id === 'staff.return-case-action'
        ? 'Custom context is recorded with the successful case decision. /api/admin/returns/:id/review, /api/admin/returns/:id/high-value and /api/admin/returns/:id/operations keep their current distinct grants, independent approval and atomic state/financial rules.'
        : 'Safe custom context is linked atomically to the committed record and immutable request provenance. Built-in controls and their order, current grants, conditional actions, money, evidence, parent identity and exact replay stay protected.',
      customFieldTypes: id === 'commerce.add-to-cart' ? Object.freeze([]) : ACCOUNT_CUSTOM_TYPES,
      answerBehavior: id === 'commerce.add-to-cart' ? 'none' : 'record' }),
  } satisfies FormDefinition);
}
const QUERY_FIELDS = {
  'catalog.header-search': [['q', 'short_text']],
  'catalog.filters': [['q', 'short_text'], ['sort', 'single_choice'], ['category', 'short_text'], ['occasion', 'short_text']],
  'commerce.order-tracking': [['orderNumber', 'short_text'], ['email', 'email']],
  'seller.product-filter': [['q', 'short_text']],
  'staff.homepage-filter': [['q', 'short_text'], ['visibility', 'single_choice']],
  'staff.activity-filter': [['action', 'short_text'], ['actor', 'short_text'], ['type', 'short_text'], ['from', 'date'], ['to', 'date']],
  'staff.recorded-progress-filter': [['from', 'date'], ['to', 'date'], ['action', 'short_text']],
} as const;
type QueryFormId = keyof typeof QUERY_FIELDS;
function queryDefinition(id: QueryFormId | 'system.local-testing-role'): FormDefinition {
  const source = SOURCE_ROWS.split('\n').find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing query definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const protect = (key: string) => ({ key, type: 'existing', label: key, capability: 'protected' as const,
    explanation: 'Current authorization, identity, staging eligibility and receiving query keys remain server controlled.' });
  if (id === 'system.local-testing-role') return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze(['role', 'requestId'].map(protect)), capabilities: Object.freeze({
      explanation: 'The local role control is staging-only and unavailable in production; its fixed role enumeration and origin checks cannot be customized.',
      customFieldTypes: Object.freeze([]), answerBehavior: 'none' }),
  } satisfies FormDefinition);
  const fields = QUERY_FIELDS[id].map(([key, type]) => ({ key, type, label: key,
    capability: 'display_editable' as const, required: id === 'commerce.order-tracking', status: 'active' as const,
    explanation: 'Only labels, help text and placeholders may change; existing keys, types, requiredness, choices and rendered order are fixed.',
    ...(key === 'sort' ? { choices: [{ value: 'newest', label: 'Newest' }, { value: 'price-low', label: 'Price: low to high' },
      { value: 'price-high', label: 'Price: high to low' }, { value: 'name', label: 'Name' }] } : key === 'visibility'
      ? { choices: [{ value: 'all', label: 'All products' }, { value: 'visible', label: 'Homepage eligible' }, { value: 'hidden', label: 'Hidden from homepage' }] } : {}),
  }));
  const protectedKeys = ['query', 'status', 'actorId', 'customerId', 'sellerId', 'orderId', 'order_number',
    'formVersion', 'customAnswers', 'requestId', ...(id === 'staff.recorded-progress-filter' ? ['actor', 'type'] : [])];
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze([...fields, ...protectedKeys.map(protect)]),
    capabilities: Object.freeze({ explanation: id === 'catalog.filters'
      ? 'Safe built-in presentation and the named minimum_price_npr numeric query criterion are supported. The same paisa threshold filters results and counts, and no answer is stored.'
      : 'Safe built-in presentation is supported. Existing query semantics, lookup privacy and current access checks stay fixed; additional criteria and answer storage are unavailable.',
      customFieldTypes: Object.freeze([...new Set(fields.map((field) => field.type)),
        ...(id === 'catalog.filters' ? ['number' as const] : [])]), answerBehavior: 'query' }),
  } satisfies FormDefinition);
}
const GOVERNANCE_KEYS = Object.freeze(['action', 'requestId', 'formVersion', 'customAnswers',
  'id', 'code', 'titleEn', 'titleNe', 'descriptionEn', 'descriptionNe', 'severity',
  'isActive', 'nameEn', 'nameNe', 'placement', 'startsAt', 'endsAt', 'note',
  'productIds', 'title', 'detail', 'status', 'resolution', 'scope', 'evidenceReference']);

const STAFF_OPERATION_KEYS = Object.freeze({
  'staff.catalog': ['kind', 'id', 'slug', 'nameEn', 'nameNe', 'sortOrder', 'isActive', 'idempotencyKey', 'requestId', 'formVersion', 'customAnswers'],
  'staff.product-classification': ['productId', 'categoryId', 'occasionIds', 'idempotencyKey', 'requestId', 'formVersion', 'customAnswers'],
  'staff.exception-work': ['action', 'id', 'version', 'job', 'jobId', 'kind', 'cash', 'cashRecordId', 'owner', 'ownerId', 'next', 'nextAction', 'note', 'resolve', 'evidence', 'sourceReviewed', 'obligationsReviewed', 'followupComplete', 'requestId', 'formVersion', 'customAnswers'],
  'staff.invoice-adjustment': ['invoiceId', 'kind', 'amount', 'amountPaisa', 'reasonCode', 'note', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-maker-activation': ['sellerId', 'model', 'legalSellerReference', 'invoiceIssuerReference', 'payoutBeneficiaryReference', 'agreementVersion', 'agreementLanguage', 'agreementAcceptedAt', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-supply-decision': ['action', 'recordId', 'decision', 'quantityAccepted', 'possessionStatus', 'qualityStatus', 'ownershipRecordStatus', 'riskRecordStatus', 'evidenceReference', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-adjustment': ['action', 'recordId', 'kind', 'amountNpr', 'amountPaisa', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-payment-preparation': ['action', 'recordId', 'destinationReference', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-payment-action': ['action', 'paymentId', 'requestId', 'formVersion', 'customAnswers'],
  'staff.managed-transition-decision': ['action', 'applicationId', 'decision', 'effectiveLocal', 'effectiveAt', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.parcel-control': ['orderId', 'jobId', 'version', 'action', 'note', 'method', 'riderEmail', 'courierName', 'trackingCode', 'trackingUrl', 'reference', 'amount', 'amountPaisa', 'cashRecordId', 'riderReportId', 'requestId', 'formVersion', 'customAnswers'],
  'staff.payout-request-action': ['payoutRequestId', 'action', 'note', 'requestId', 'formVersion', 'customAnswers'],
  'staff.privacy-action': ['privacyRequestId', 'action', 'status', 'note', 'requestId', 'formVersion', 'customAnswers'],
  'staff.rider-control-1': ['action', 'status', 'note', 'userId', 'reportId', 'version', 'eligible', 'requestId', 'formVersion', 'customAnswers'],
  'staff.rider-control-2': ['action', 'version', 'otpScope', 'openBox', 'requestId', 'formVersion', 'customAnswers'],
  'staff.governance-rule-create': GOVERNANCE_KEYS,
  'staff.governance-promotion-create': GOVERNANCE_KEYS,
  'staff.governance-incident-create': GOVERNANCE_KEYS,
  'staff.governance-incident-update': GOVERNANCE_KEYS,
  'staff.governance-backup-verify': GOVERNANCE_KEYS,
  'staff.delivery-rate': ['rates', 'valley', 'terai', 'nationwide', 'districts', 'expectedVersion', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.payout-1': ['sellerId', 'note', 'amount', 'amountPaisa', 'destinationReference', 'idempotencyKey', 'requestId', 'formVersion', 'customAnswers'],
  'staff.payout-2': ['payoutId', 'action', 'note', 'providerReference', 'amount', 'amountPaisa', 'idempotencyKey', 'requestId', 'formVersion', 'customAnswers'],
  'staff.referral-settings': ['enabled', 'discount', 'reward', 'minimum', 'days', 'friendDiscountPaisa', 'rewardPaisa', 'minimumSubtotalPaisa', 'returnWindowDays', 'reason', 'requestId', 'formVersion', 'customAnswers'],
  'staff.staff-invitation': ['email', 'role', 'requestId', 'formVersion', 'customAnswers'],
  'staff.staff-permission-1': ['action', 'userId', 'permissions', 'version', 'reason', 'presetName', 'requestId', 'formVersion', 'customAnswers'],
  'staff.staff-permission-2': ['action', 'requestId', 'formRequestId', 'reason', 'formVersion', 'customAnswers'],
} as const);
type StaffOperationFormId = keyof typeof STAFF_OPERATION_KEYS;
const staffOperationIds = new Set<string>(Object.keys(STAFF_OPERATION_KEYS));

function staffOperationDefinition(id: StaffOperationFormId): FormDefinition {
  const source = SOURCE_ROWS.split('\n').find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing staff operation definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze(STAFF_OPERATION_KEYS[id].map((key) => ({ key, type: 'existing' as const,
      label: key, capability: 'protected' as const,
      explanation: 'Action, subject, amount, evidence, staff authority and replay remain server enforced.' }))),
    capabilities: Object.freeze({ explanation: 'Safe custom staff context is recorded only with the committed action. All operational decisions and request identity remain protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

type IdentityFormId = 'identity.register' | 'identity.login-password' |
  'identity.email-code-request' | 'identity.email-code-verify' |
  'identity.password-reset-request' | 'identity.password-reset-complete';

function identityDefinition(id: IdentityFormId): FormDefinition {
  const source = SOURCE_ROWS.split('\n').find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing identity definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const keys: Record<IdentityFormId, readonly string[]> = {
    'identity.register': ['display_name', 'email', 'password', 'confirm_password', 'return_to', 'requestId', 'formVersion', 'customAnswers'],
    'identity.login-password': ['email', 'password', 'return_to', 'requestId', 'formVersion', 'customAnswers'],
    'identity.email-code-request': ['email', 'return_to', 'requestId', 'formVersion', 'customAnswers'],
    'identity.email-code-verify': ['code', 'return_to', 'requestId', 'formVersion', 'customAnswers'],
    'identity.password-reset-request': ['email', 'return_to', 'requestId', 'formVersion', 'customAnswers'],
    'identity.password-reset-complete': ['code', 'password', 'confirm_password', 'return_to', 'requestId', 'formVersion', 'customAnswers'],
  };
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze(keys[id].map((key) => ({ key, type: 'existing' as const,
      label: key, capability: 'protected' as const,
      explanation: 'Credentials, code, identity, request identity, rate limits and access decisions remain server enforced.' }))),
    capabilities: Object.freeze({ explanation: 'Safe custom context is stored only after an accepted identity action. Credentials, codes, session tokens, request identity and access decisions stay protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function accountDefinition(id: 'account.address' | 'account.privacy-request' | 'account.review'): FormDefinition {
  const protectedField = (key: string, explanation: string) => ({ key, type: 'existing', label: key, capability: 'protected' as const, explanation });
  if (id === 'account.address') return Object.freeze({
    id, audience: 'customer', mode: 'collection', route: '/api/account/addresses', adapterId: id,
    baseFields: Object.freeze([
      { key: 'landmark', type: 'short_text', label: 'Landmark', capability: 'configurable', required: false, status: 'active', explanation: 'Landmark may be required or optional; its server validation follows the published version.' },
      ...['label', 'recipientName', 'phone', 'province', 'district', 'municipality', 'ward', 'locality', 'postalCode', 'isDefault'].map((key) => protectedField(key, 'Address format and delivery rules stay server enforced.')),
      protectedField('location', 'The map pin keeps its existing coordinate validation.'),
      protectedField('userId', 'Address ownership always comes from the authenticated customer.'),
      protectedField('idempotencyKey', 'Request deduplication cannot be disabled.'),
    ]),
    capabilities: Object.freeze({ explanation: 'Landmark requiredness, safe presentation and custom answers are configurable; ownership, delivery address checks and request deduplication remain protected.', customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
  if (id === 'account.privacy-request') return Object.freeze({
    id, audience: 'customer', mode: 'collection', route: '/api/account/privacy', adapterId: id,
    baseFields: Object.freeze([
      protectedField('requestType', 'The four data-rights request types are server enforced.'),
      protectedField('detail', 'The minimum detail length and privacy workflow are server enforced.'),
      protectedField('requestId', 'Request deduplication cannot be disabled.'),
      protectedField('customerId', 'The request owner comes from the authenticated customer.'),
    ]),
    capabilities: Object.freeze({ explanation: 'Custom context is linked to the data-rights request; request type, detail validation, owner and workflow remain protected.', customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
  return Object.freeze({
    id, audience: 'customer', mode: 'collection', route: '/api/products/:id/reviews', adapterId: id,
    baseFields: Object.freeze([
      ...['rating', 'title', 'body', 'orderItemId', 'idempotencyKey', 'photos'].map((key) => protectedField(key, 'Verified purchase, review text, request deduplication and private photo checks stay server enforced.')),
      protectedField('customerId', 'The review owner comes from the authenticated customer.'),
    ]),
    capabilities: Object.freeze({ explanation: 'Custom context is linked to a verified-purchase review; rating, review text, ownership, moderation and private photo safeguards remain protected.', customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function feedbackDefinition(id: 'public.contact' | 'public.feedback' | 'public.footer-feedback'): FormDefinition {
  const protectedField = (key: string, explanation: string) => ({ key, type: 'existing', label: key, capability: 'protected' as const, explanation });
  const displayField = (key: string, type: 'short_text' | 'long_text' | 'email' | 'phone' | 'single_choice', required: boolean) => ({
    key, type, label: key, capability: 'display_editable' as const, required, status: 'active' as const,
    ...(key === 'topic' ? { choices: feedbackTopics.map((topic) => ({ value: topic, label: topic })) } : {}),
    explanation: 'Labels, help text and placeholders may change; the current parser keeps type, requiredness, choices and rendered built-in order fixed.',
  });
  const shared = [displayField('name', 'short_text', true), displayField('email', 'email', true),
    displayField('topic', 'single_choice', true), displayField('message', 'long_text', true),
    protectedField('privacyAcknowledgement', 'Privacy consent remains required and server enforced.')];
  const variant = id === 'public.feedback' ? ['subject', 'rating']
    : id === 'public.contact' ? ['subject', 'orderReference'] : ['orderReference'];
  return Object.freeze({
    id, audience: 'public', mode: 'collection', route: '/api/feedback', adapterId: id,
    baseFields: Object.freeze([...shared, ...(id === 'public.footer-feedback' ? [] : [displayField('phone', 'phone', false)]),
      ...variant.map((key) => protectedField(key, 'The source-specific contact contract remains server enforced.')),
      ...['kind', 'pagePath', 'website', 'requestId', 'formVersion'].map((key) =>
        protectedField(key, 'Source, anti-abuse, version and request identity cannot be configured.'))]),
    capabilities: Object.freeze({ explanation: 'Safe custom context is retained with the feedback delivery record for restricted support review. Delivery/retry routing, consent, anti-abuse and request identity stay protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function sellerDefinition(id: 'seller.application' | 'seller.maker-profile' | 'seller.profile' | 'seller.product-submission' | 'seller.inventory'): FormDefinition {
  const protectedField = (key: string, explanation: string) => ({ key, type: 'existing', label: key, capability: 'protected' as const, explanation });
  const displayField = (key: string, type: 'short_text' | 'long_text' | 'email' | 'phone', required: boolean) => ({
    key, type, label: key, required, status: 'active' as const, capability: 'display_editable' as const,
    explanation: 'Safe presentation may change; the existing server parser still controls type, length, and requiredness.',
  });
  const common = [protectedField('requestId', 'A request key is required for exact replay.'),
    protectedField('formVersion', 'The submitted publication version is server checked.'),
    protectedField('customAnswers', 'Custom context is validated separately and cannot override domain fields.')];
  let fields;
  let route;
  let mode: FormMode = 'collection';
  if (id === 'seller.application') {
    route = '/api/seller-applications';
    fields = [displayField('tradingName', 'short_text', true), displayField('businessDescription', 'long_text', true),
      ...['legalName', 'representativeName', 'email', 'phone', 'applicantType', 'taxMode', 'taxRegistrationNumber',
        'registrationNumber', 'registrationAuthority', 'document', 'profileImage', 'makerVideo', 'applicationAcknowledgement',
        'participationRoute', 'website', 'hasBusinessTaxRegistration', 'taxStatus', 'acceptedTerms',
        'province', 'district', 'municipality', 'ward', 'locality', 'publicCity', 'productCategories',
        'experienceCraft', 'experienceBand', 'facebookUrl', 'instagramUrl', 'linkedinUrl', 'tiktokUrl',
        'xUrl', 'youtubeUrl', 'representativeIdentity', 'bankVerification', 'businessRegistration',
        'panCertificate', 'vatCertificate'].map((key) => protectedField(key,
          'Legal identity, consent, anti-abuse and private upload rules are not configurable.')),
      ...common];
  } else if (id === 'seller.maker-profile') {
    route = '/api/seller-applications/profile';
    fields = [displayField('publicName', 'short_text', true), displayField('publicCity', 'short_text', true),
      ...['sellerId', 'expectedVersion', 'experienceCraft', 'experienceBand', 'facebookUrl', 'instagramUrl',
        'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl', 'legalName'].map((key) =>
        protectedField(key, 'Ownership, version, legal identity, social-link and craft validation stay server enforced.')),
      ...common];
  } else if (id === 'seller.profile') {
    route = '/api/seller/profile';
    fields = [displayField('tradingName', 'short_text', true), displayField('businessDescription', 'long_text', false),
      ...['sellerId', 'idempotencyKey', 'legalName', 'payoutAccountReference', 'supportPhone', 'supportEmail',
        'province', 'district', 'municipality', 'ward', 'locality', 'productCategories'].map((key) =>
        protectedField(key, 'Approved-seller ownership, legal/financial identity and contact validation stay server enforced.')),
      ...common];
  } else if (id === 'seller.product-submission') {
    route = '/api/seller/products';
    fields = [displayField('nameEn', 'short_text', true), displayField('descriptionEn', 'long_text', true),
      ...['sku', 'price', 'pricePaisa', 'inventoryQuantity', 'image', 'video', 'reviewRequestId', 'categoryId',
        'occasionIds', 'sellerId', 'producer', 'materials', 'nameNe', 'descriptionNe', 'compareAtPrice',
        'discountPercentage', 'returnEligible', 'madeToOrder', 'preparationDays', 'originStory',
        'dimensions', 'size', 'colour', 'variations', 'specifications', 'careInstructions',
        'safetyInformation', 'returnConditions', 'warrantyOffered', 'warranty', 'warrantyYears',
        'warrantyMonths', 'manufacturedAt', 'expiresAt', 'licenceReference', 'image1', 'image2',
        'image3', 'image4', 'image5', 'images', 'replacementVideo', 'removeMediaId',
        'replaceImage'].map((key) => protectedField(key,
        'SKU, price, inventory, taxonomy, ownership, draft/review state and private media checks stay server enforced.')),
      ...common];
  } else {
    route = '/api/seller/products/:id/inventory'; mode = 'operation';
    fields = [...['quantity', 'reason', 'productId', 'sellerId'].map((key) => protectedField(key,
      'Stock quantity, audit reason and seller/product ownership stay server enforced.')), ...common];
  }
  return Object.freeze({ id, audience: 'seller', mode, route, adapterId: id,
    baseFields: Object.freeze(fields),
    capabilities: Object.freeze({ explanation: 'Safe custom context is recorded with the successful seller or product action; legal identity, money, stock, authorization, draft/review and private-media rules remain protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function sellerOperationDefinition(id: 'seller.shipping-request' | 'seller.shipping-action' |
  'seller.managed-supply-proposal' | 'seller.managed-transition-request' |
  'seller.payout-request' | 'seller.review-reply'): FormDefinition {
  const source = SOURCE_ROWS.split('\n').find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing source definition: ${id}`);
  const [, , mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const domainKeys: Record<typeof id, readonly string[]> = {
    'seller.shipping-request': ['orderId', 'direction', 'note', 'requestId', 'sellerId', 'formVersion', 'customAnswers'],
    'seller.shipping-action': ['action', 'jobId', 'note', 'requestId', 'sellerId', 'formVersion', 'customAnswers'],
    'seller.managed-supply-proposal': ['action', 'productId', 'quantity', 'agreedUnitNpr', 'agreedUnitPaisa', 'agreementVersion', 'agreementLanguage', 'payoutBeneficiaryReference', 'requestId', 'sellerId', 'formVersion', 'customAnswers'],
    'seller.managed-transition-request': ['action', 'legalName', 'registrationAuthority', 'registrationNumber', 'taxMode', 'taxRegistrationNumber', 'evidenceReferences', 'agreementVersion', 'agreementLanguage', 'requestId', 'sellerId', 'formVersion', 'customAnswers'],
    'seller.payout-request': ['amount', 'availablePaisa', 'note', 'requestId', 'sellerId', 'formVersion', 'customAnswers'],
    'seller.review-reply': ['reviewId', 'body', 'version', 'idempotencyKey', 'sellerId', 'formVersion', 'customAnswers'],
  };
  return Object.freeze({ id, audience: 'seller', mode, route, adapterId: id,
    baseFields: Object.freeze(domainKeys[id].map((key) => ({ key, type: 'existing' as const, label: key,
      capability: 'protected' as const,
      explanation: 'The action, amount, evidence, ownership, state, and request identity remain under server control.' }))),
    capabilities: Object.freeze({ explanation: 'Custom context is linked to the resulting seller action. Operational state, money, evidence, ownership and replay rules remain server enforced.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function riderDeliveryDefinition(id: 'rider.application' | 'rider.report' | 'rider.remittance' |
  'rider.code-verify' | 'staff.delivery-assignment' | 'shipping.console-request' |
  'shipping.console-action-seller' | 'shipping.console-action-staff'): FormDefinition {
  const source = [SOURCE_ROWS, CONDITIONAL_SOURCE_ROWS].flatMap((rows) => rows.split('\n'))
    .find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing source definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const keys: Record<typeof id, readonly string[]> = {
    'rider.application': ['legalName', 'phone', 'district', 'identityType', 'identityNumber', 'identityPhoto', 'requestId', 'formVersion'],
    'rider.report': ['jobId', 'version', 'kind', 'note', 'cash', 'cashPaisa', 'photo', 'video', 'openBoxOutcome', 'requestId', 'formVersion'],
    'rider.remittance': ['jobId', 'amount', 'amountPaisa', 'reference', 'requestId', 'formVersion', 'customAnswers'],
    'rider.code-verify': ['jobId', 'version', 'code', 'requestId', 'formVersion', 'customAnswers'],
    'staff.delivery-assignment': ['orderId', 'method', 'riderEmail', 'courierName', 'trackingUrl', 'trackingReference', 'requestId', 'formVersion', 'customAnswers'],
    'shipping.console-request': ['orderId', 'direction', 'note', 'sellerId', 'requestId', 'formVersion', 'customAnswers', 'sourceFormId'],
    'shipping.console-action-seller': ['jobId', 'action', 'note', 'sellerId', 'requestId', 'formVersion', 'customAnswers', 'sourceFormId'],
    'shipping.console-action-staff': ['jobId', 'action', 'note', 'labelReference', 'trackingCode', 'claimReference', 'reconciliationStatus', 'requestId', 'formVersion', 'customAnswers'],
  };
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze(keys[id].map((key) => ({ key, type: 'existing' as const,
      label: key, capability: 'protected' as const,
      explanation: 'Identity, evidence, money, operational state, ownership and request identity remain server enforced.' }))),
    capabilities: Object.freeze({ explanation: id === 'rider.code-verify'
      ? 'Only a successful verification records custom context; the code and challenge never enter answer history.'
      : 'Custom context is linked to the committed record; identity, evidence, money, authority and transitions remain protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function commerceDefinition(id: 'commerce.checkout' | 'commerce.return-request' |
  'commerce.complaint' | 'commerce.gift-card-issue' | 'commerce.gift-card-redeem'): FormDefinition {
  const source = [SOURCE_ROWS, CONDITIONAL_SOURCE_ROWS].flatMap((rows) => rows.split('\n'))
    .find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing commerce definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const keys: Record<typeof id, readonly string[]> = {
    'commerce.checkout': ['customerEmail', 'customerPhone', 'deliveryFor', 'recipientEmail',
      'selectedAddressId', 'saveAddressForFuture', 'saveAddressLabel', 'address', 'recipientName',
      'recipientPhone', 'province', 'district', 'municipality', 'ward', 'locality', 'landmark',
      'postalCode', 'location', 'latitude', 'longitude', 'termsAccepted', 'idempotencyKey',
      'deliveryRateVersion', 'useWallet', 'referralCode', 'promoCode', 'promoRevision', 'promoQuoteIntent', 'customerAuthSubject', 'cart', 'price', 'discount',
      'formVersion', 'customAnswers'],
    'commerce.return-request': ['orderNumber', 'orderItemId', 'quantity', 'reason',
      'requestedResolution', 'detail', 'originalSealIntact', 'locale', 'evidence',
      'idempotencyKey', 'receiptTokenHash', 'customerId', 'returnWindow', 'formVersion',
      'customAnswers'],
    'commerce.complaint': ['orderNumber', 'orderItemId', 'category', 'subject', 'detail',
      'locale', 'idempotencyKey', 'receiptTokenHash', 'customerId', 'formVersion',
      'customAnswers'],
    'commerce.gift-card-issue': ['amount', 'amountPaisa', 'requestId', 'actorId',
      'formVersion', 'customAnswers'],
    'commerce.gift-card-redeem': ['code', 'requestId', 'userId', 'formVersion',
      'customAnswers'],
  };
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze(keys[id].map((key) => ({ key, type: 'existing' as const,
      label: key, capability: 'protected' as const,
      explanation: 'Money, cart, contact, consent, eligibility, evidence, ownership and request identity remain server enforced.' }))),
    capabilities: Object.freeze({ explanation: 'Safe custom context is stored with the committed commerce record. Financial calculations, eligibility, ownership, consent, media and exact replay remain protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

function sellerCaseDefinition(id: 'seller.case-return-response' |
  'seller.case-complaint-response'): FormDefinition {
  const source = PROGRAMMATIC_ROWS.split('\n').find((row) => row.startsWith(`${id}|`));
  if (!source) throw new Error(`Missing seller case definition: ${id}`);
  const [, audience, mode, route] = source.split('|') as [string, FormAudience, FormMode, string];
  const keys = id === 'seller.case-return-response'
    ? ['returnRequestId', 'recommendation', 'response', 'locale', 'idempotencyKey',
      'sellerId', 'actorId', 'formVersion', 'customAnswers']
    : ['complaintId', 'response', 'idempotencyKey', 'sellerId', 'actorId',
      'formVersion', 'customAnswers'];
  return Object.freeze({ id, audience, mode, route, adapterId: id,
    baseFields: Object.freeze(keys.map((key) => ({ key, type: 'existing' as const,
      label: key, capability: 'protected' as const,
      explanation: 'Case ownership, state, recommendation, response validation and exact replay stay server enforced.' }))),
    capabilities: Object.freeze({ explanation: 'Safe custom seller context is linked to the committed case response; eligibility, decision, ownership and replay remain protected.',
      customFieldTypes: ACCOUNT_CUSTOM_TYPES, answerBehavior: 'record' }),
  } satisfies FormDefinition);
}

export const FORM_REGISTRY: Readonly<Record<FormId, FormDefinition>> = Object.freeze(
  Object.assign({ 'commerce.promo-quote': Object.freeze({ ...INCENTIVE_FORM_CONTRACTS['commerce.promo-quote'], adapterId: 'commerce.promo-quote' }), 'staff.promo-code': Object.freeze({ ...INCENTIVE_FORM_CONTRACTS['staff.promo-code'], adapterId: 'staff.promo-code' }) }, Object.fromEntries([SOURCE_ROWS, CONDITIONAL_SOURCE_ROWS, PROGRAMMATIC_ROWS].flatMap((rows) => rows.split('\n')).map((row) => {
    const item = Object.hasOwn(PROGRAMMATIC_KEYS, row.split('|')[0])
      ? programmaticDefinition(row.split('|')[0] as ProgrammaticFormId)
      : Object.hasOwn(QUERY_FIELDS, row.split('|')[0]) || row.startsWith('system.local-testing-role|')
      ? queryDefinition(row.split('|')[0] as QueryFormId | 'system.local-testing-role')
      : row.startsWith('identity.') ? identityDefinition(row.split('|')[0] as IdentityFormId)
      : staffOperationIds.has(row.split('|')[0]) ? staffOperationDefinition(row.split('|')[0] as StaffOperationFormId)
      : row.startsWith('public.contact|') ? feedbackDefinition('public.contact')
      : row.startsWith('seller.case-return-response|') ? sellerCaseDefinition('seller.case-return-response')
      : row.startsWith('seller.case-complaint-response|') ? sellerCaseDefinition('seller.case-complaint-response')
      : row.startsWith('commerce.checkout|') ? commerceDefinition('commerce.checkout')
      : row.startsWith('commerce.return-request|') ? commerceDefinition('commerce.return-request')
      : row.startsWith('commerce.complaint|') ? commerceDefinition('commerce.complaint')
      : row.startsWith('commerce.gift-card-issue|') ? commerceDefinition('commerce.gift-card-issue')
      : row.startsWith('commerce.gift-card-redeem|') ? commerceDefinition('commerce.gift-card-redeem')
      : row.startsWith('public.feedback|') ? feedbackDefinition('public.feedback')
      : row.startsWith('public.footer-feedback|') ? feedbackDefinition('public.footer-feedback')
      : row.startsWith('account.address|') ? accountDefinition('account.address')
      : row.startsWith('account.privacy-request|') ? accountDefinition('account.privacy-request')
      : row.startsWith('account.review|') ? accountDefinition('account.review')
      : row.startsWith('seller.application|') ? sellerDefinition('seller.application')
      : row.startsWith('seller.maker-profile|') ? sellerDefinition('seller.maker-profile')
      : row.startsWith('seller.profile|') ? sellerDefinition('seller.profile')
      : row.startsWith('seller.product-submission|') ? sellerDefinition('seller.product-submission')
      : row.startsWith('seller.inventory|') ? sellerDefinition('seller.inventory')
      : row.startsWith('seller.shipping-request|') ? sellerOperationDefinition('seller.shipping-request')
      : row.startsWith('seller.shipping-action|') ? sellerOperationDefinition('seller.shipping-action')
      : row.startsWith('seller.managed-supply-proposal|') ? sellerOperationDefinition('seller.managed-supply-proposal')
      : row.startsWith('seller.managed-transition-request|') ? sellerOperationDefinition('seller.managed-transition-request')
      : row.startsWith('seller.payout-request|') ? sellerOperationDefinition('seller.payout-request')
      : row.startsWith('seller.review-reply|') ? sellerOperationDefinition('seller.review-reply')
      : row.startsWith('rider.application|') ? riderDeliveryDefinition('rider.application')
      : row.startsWith('rider.report|') ? riderDeliveryDefinition('rider.report')
      : row.startsWith('rider.remittance|') ? riderDeliveryDefinition('rider.remittance')
      : row.startsWith('rider.code-verify|') ? riderDeliveryDefinition('rider.code-verify')
      : row.startsWith('staff.delivery-assignment|') ? riderDeliveryDefinition('staff.delivery-assignment')
      : row.startsWith('shipping.console-request|') ? riderDeliveryDefinition('shipping.console-request')
      : row.startsWith('shipping.console-action-seller|') ? riderDeliveryDefinition('shipping.console-action-seller')
      : row.startsWith('shipping.console-action-staff|') ? riderDeliveryDefinition('shipping.console-action-staff')
      : row.startsWith('account.profile|') ? Object.freeze({
      id: 'account.profile', audience: 'customer', mode: 'collection', route: '/api/account/profile',
      baseFields: Object.freeze([
        { key: 'displayName', type: 'short_text', label: 'Your name', capability: 'display_editable',
          explanation: 'Only its label, help text and placeholder can change; its rendered position and required 2–100 character name remain fixed.', required: true, status: 'active' },
        { key: 'phone', type: 'phone', label: 'Nepal mobile number', capability: 'display_editable',
          explanation: 'Only its label, help text and placeholder can change; its rendered position and Nepal mobile check remain fixed.', required: false, status: 'active' },
        { key: 'locale', type: 'existing', label: 'Language', capability: 'protected',
          explanation: 'The supported language choices are enforced by the profile endpoint.' },
        { key: 'idempotencyKey', type: 'existing', label: 'Request ID', capability: 'protected',
          explanation: 'Request deduplication is required for profile changes.' },
      ] as const),
      capabilities: Object.freeze({ explanation: 'Profile labels, help text and placeholders may change; built-in order remains fixed and custom answers are linked to the account. Name, Nepal phone, language and request deduplication rules remain enforced.',
        customFieldTypes: Object.freeze(['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'] as const), answerBehavior: 'record' }),
      adapterId: 'account.profile',
    } satisfies FormDefinition) : definition(row);
    return [item.id, item];
  }))),
);
