import type { BaseFieldCapability, FormAudience, FormCapabilities, FormDefinition, FormId, FormMode } from './types';

export interface ImplementedFormAdapter {
  readonly formId: FormId;
  readonly route: string;
  readonly mode: FormMode;
}

// Integrations add an entry here only when their server adapter exists and is tested.
export const IMPLEMENTED_FORM_ADAPTERS: Readonly<Record<string, ImplementedFormAdapter>> = Object.freeze({
  'account.profile': { formId: 'account.profile', route: '/api/account/profile', mode: 'collection' },
});

// Inventory rows are ordered to match the 69 JSX sites in the frozen policy baseline.
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
  { path: 'components/seller/case-response-form.tsx', formIds: ['seller.case-return-response', 'seller.case-complaint-response'], explanation: 'One component submits responses to distinct return and complaint endpoints.' },
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

export const FORM_REGISTRY: Readonly<Record<FormId, FormDefinition>> = Object.freeze(
  Object.fromEntries([SOURCE_ROWS, CONDITIONAL_SOURCE_ROWS, PROGRAMMATIC_ROWS].flatMap((rows) => rows.split('\n')).map((row) => {
    const item = row.startsWith('account.profile|') ? Object.freeze({
      id: 'account.profile', audience: 'customer', mode: 'collection', route: '/api/account/profile',
      baseFields: Object.freeze([
        { key: 'displayName', type: 'short_text', label: 'Your name', capability: 'display_editable',
          explanation: 'Only its display text and position can change; a name of 2–100 characters remains required.', required: true, status: 'active' },
        { key: 'phone', type: 'phone', label: 'Nepal mobile number', capability: 'display_editable',
          explanation: 'Only its display text and position can change; the Nepal mobile check remains server enforced.', required: false, status: 'active' },
        { key: 'locale', type: 'existing', label: 'Language', capability: 'protected',
          explanation: 'The supported language choices are enforced by the profile endpoint.' },
        { key: 'idempotencyKey', type: 'existing', label: 'Request ID', capability: 'protected',
          explanation: 'Request deduplication is required for profile changes.' },
      ] as const),
      capabilities: Object.freeze({ explanation: 'Profile display text and order may change; custom answers are linked to the customer account. Name, Nepal phone, language, and request deduplication rules remain enforced.',
        customFieldTypes: Object.freeze(['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'] as const), answerBehavior: 'record' }),
      adapterId: 'account.profile',
    } satisfies FormDefinition) : definition(row);
    return [item.id, item];
  })),
);
