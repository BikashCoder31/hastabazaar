import type { BaseFieldCapability, FormAudience, FormCapabilities, FormDefinition, FormId, FormMode } from './types';
import { feedbackTopics } from '../feedback/customer-feedback';

export interface ImplementedFormAdapter {
  readonly formId: FormId;
  readonly route: string;
  readonly mode: FormMode;
}

// Integrations add an entry here only when their server adapter exists and is tested.
export const IMPLEMENTED_FORM_ADAPTERS: Readonly<Record<string, ImplementedFormAdapter>> = Object.freeze({
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
  'shipping.console-request': { formId: 'shipping.console-request', route: '/api/seller/shipping', mode: 'operation' },
  'shipping.console-action-seller': { formId: 'shipping.console-action-seller', route: '/api/seller/shipping/:id', mode: 'operation' },
  'shipping.console-action-staff': { formId: 'shipping.console-action-staff', route: '/api/admin/shipping/:id', mode: 'operation' },
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
    explanation: 'Label, help text, placeholder and position may change; the current server parser keeps type, requiredness and choices fixed.',
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
    capabilities: Object.freeze({ explanation: 'Safe custom context is delivered with the query and retained for restricted support review. Routing, consent, anti-abuse and request identity stay protected.',
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

export const FORM_REGISTRY: Readonly<Record<FormId, FormDefinition>> = Object.freeze(
  Object.fromEntries([SOURCE_ROWS, CONDITIONAL_SOURCE_ROWS, PROGRAMMATIC_ROWS].flatMap((rows) => rows.split('\n')).map((row) => {
    const item = row.startsWith('public.contact|') ? feedbackDefinition('public.contact')
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
