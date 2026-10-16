/** Shared presentation copy. No field identifiers, values or business rules change here. */
export interface FormGuide { title: string; purpose: string; preparation: string }

const guides: Readonly<Record<string, readonly [string, string, string]>> = {
  'seller.application': ['Apply to sell', 'Tell us about your business and the products you make.', 'Have your contact details, business or identity documents, and product information ready. Choose the type of seller that applies to you.'],
  'seller.maker-profile': ['Update your Managed Maker application', 'Add the details customers will see about you and your craft.', 'Have your public name, city, craft experience, and any social links ready.'],
  'seller.managed-terms-acceptance': ['Review company-store selling terms', 'Accept the company identity and maker payment rate shown here.', 'Read the rate and Nepal-time start. Accepting future terms does not change today’s agreement.'],
  'seller.profile': ['Business details', 'Keep your shop information and contact details up to date.', 'Use the name customers know. Check your contact details before saving.'],
  'rider.application': ['Apply to become a delivery rider', 'Tell us who you are and where you can make deliveries.', 'Have your phone number and a clear photo of your identity document ready.'],
  'staff.seller-review-action': ['Review a seller application', 'Check the application and record your decision.', 'Read the application and documents first. Explain your decision so the seller knows what happens next.'],
  'staff.managed-maker-activation': ['Activate a Managed Maker account', 'Record the checks needed to activate this maker’s account.', 'Check the maker’s documents and agreement before recording your decision.'],
  'staff.managed-eligibility-release': ['Release matured maker earnings', 'Move completed, paid earnings past their delivery hold when no case blocks them.', 'Review returns, complaints and refund adjustments. Explain your review.'],
  'staff.managed-payout-preparation': ['Prepare a maker payment', 'Reserve the reviewed amount using the maker’s approved receiving reference.', 'Review the balance and processing time in Nepal time. Preparation does not record a payment.'],
  'staff.managed-payout-action': ['Review or record a maker payment', 'Approve, record a simulated payment, or cancel an unpaid reservation.', 'Check current cases, receiving details and the payment reference. Paid history cannot be cancelled.'],
  'seller.product-submission': ['Add or update a product', 'Describe your product so customers know what they are buying.', 'Have the price, stock quantity, product details, and clear photos ready. You can save a product draft and return to it.'],
  'seller.inventory': ['Update stock quantities', 'Record how many items are available to sell.', 'Enter the number of items ready to sell. Enter 0 if none are available.'],
  'staff.catalog': ['Manage product categories', 'Organize product categories and gift occasions.', 'Choose a clear name and check where the category or occasion is already used.'],
  'staff.product-classification': ['Choose product categories', 'Place a product in the right category and gift occasions.', 'Check the product details before choosing where customers should find it.'],
  'staff.product-review': ['Review a product', 'Check a product before it is published.', 'Review the description, price, photos, and required information. Explain any changes needed.'],
  'commerce.checkout': ['Place an order', 'Enter the contact and delivery details for your order.', 'Have your phone number and full delivery address ready. Check the items and total before placing the order.'],
  'commerce.return-request': ['Request a return', 'Tell us which items you want to return and why.', 'Choose the items and quantities. Have clear photos or other evidence ready if needed.'],
  'commerce.order-cancellation': ['Cancel an order', 'Tell us why you want to cancel this order.', 'Read the cancellation details and explain your reason before confirming.'],
  'commerce.complaint': ['Report an order problem', 'Tell us what went wrong and what help you need.', 'Describe the problem and have any supporting photos or documents ready.'],
  'public.contact': ['Contact us', 'Send a question to our support team.', 'Tell us what you need help with. Include your order number if your question is about an order.'],
  'public.feedback': ['Share feedback', 'Tell us what worked well or what we could improve.', 'Choose a topic, enter your email address, and describe your experience. Your phone number is optional.'],
  'public.footer-feedback': ['Send quick website feedback', 'Send a suggestion or tell us about a website problem.', 'Write a short message explaining what you would like us to improve.'],
  'account.review': ['Review a product you bought', 'Share your experience to help other customers.', 'Choose a rating and describe the product. Add photos only if you want to.'],
  'account.privacy-request': ['Request help with your personal information', 'Ask to view, correct, or delete your personal information.', 'Choose what you need and explain your request. Do not include passwords.'],
  'seller.review-reply': ['Reply to a customer review', 'Respond to the customer’s review of your product.', 'Read the review first. Keep your reply helpful and respectful.'],
  'seller.case-return-response': ['Respond to a return request', 'Share your response to the customer’s return request.', 'Read the request and evidence. Explain your recommendation and any next steps.'],
  'seller.case-complaint-response': ['Respond to an order problem', 'Share your response to the customer’s complaint.', 'Read the complaint and evidence. Explain what you can do to help.'],
  'staff.return-case-action': ['Review a return request', 'Record a decision or update for a return request.', 'Check the items, evidence, and previous responses before choosing the next action.'],
  'staff.complaint-case-action': ['Review an order problem', 'Record a decision or update for a complaint.', 'Read the complaint and responses. Explain your decision and next steps.'],
  'staff.cancellation-review': ['Review a cancellation request', 'Record your decision about cancelling an order.', 'Check the order status and reason before approving or declining the request.'],
  'staff.order-fulfillment': ['Update an order', 'Record the next step in preparing or delivering an order.', 'Check the current order status. Add a tracking number or note when needed.'],
  'staff.review-moderation': ['Check a customer review', 'Decide whether a customer review should be visible.', 'Read the review and explain the reason for your decision.'],
  'staff.privacy-action': ['Review a personal information request', 'Record the next step for a customer’s privacy request.', 'Read the request and check the person’s identity before taking action.'],
  'seller.shipping-request': ['Request a pickup or return delivery', 'Ask for help moving a parcel.', 'Have the pickup address, contact details, parcel size, and weight ready.'],
  'seller.shipping-action': ['Update a pickup or return request', 'Record a change to an existing pickup or return delivery request.', 'Check the request and add the details needed for the next step.'],
  'seller.managed-supply-proposal': ['Offer products through Managed Maker', 'Tell us which products you can supply through the Managed Maker program.', 'Have the product, quantity, price, and preparation details ready.'],
  'seller.managed-transition-request': ['Request a seller program change', 'Ask to change how you sell through the Managed Maker program.', 'Explain the change you want and why it suits your business.'],
  'rider.report': ['Record a delivery result', 'Tell us what happened during this delivery.', 'Have the delivery details, cash collected, and required delivery proof ready.'],
  'staff.delivery-assignment': ['Assign a delivery', 'Choose how an order will be delivered.', 'Check the delivery address and choose the rider or delivery method.'],
  'staff.managed-supply-decision': ['Review a product supply offer', 'Record a decision about products offered by a Managed Maker.', 'Check the product, quantity, price, and preparation details.'],
  'staff.managed-transition-decision': ['Review a seller program change', 'Record a decision about changing a maker’s selling program.', 'Read the request and check the requirements before deciding.'],
  'staff.parcel-control': ['Manage a parcel', 'Record parcel details and the next delivery step.', 'Check the order, parcel contents, and delivery information.'],
  'staff.rider-control-1': ['Review a rider application or report', 'Record your decision about a rider’s application or delivery report.', 'Read the details and evidence before choosing an action.'],
  'staff.rider-control-2': ['Set delivery rules for riders', 'Update the rules riders follow when making deliveries.', 'Check the current rules and explain why a change is needed.'],
  'shipping.console-request': ['Request a delivery', 'Create a pickup or delivery request.', 'Have the addresses, contact numbers, and parcel details ready.'],
  'shipping.console-action-seller': ['Update a carrier delivery request', 'Add information to your delivery request with a carrier.', 'Check the current request and explain the update.'],
  'shipping.console-action-staff': ['Manage a delivery request', 'Record the next step for a delivery request.', 'Check the request, carrier details, and any supporting evidence.'],
  'seller.payout-request': ['Request a payment', 'Ask us to pay your available seller earnings.', 'Add a note explaining your request. Sending the request does not transfer money.'],
  'rider.remittance': ['Record cash handed over', 'Record delivery cash you handed over to the business.', 'Have the amount and receipt or reference ready.'],
  'commerce.gift-card-issue': ['Create a gift card', 'Record a gift card for a customer.', 'Have the recipient details, amount, and any message ready.'],
  'staff.invoice-adjustment': ['Correct an invoice', 'Record a correction to an invoice.', 'Check the invoice and explain the amount and reason for the correction.'],
  'staff.managed-adjustment': ['Correct a Managed Maker balance', 'Record a correction to a maker’s balance.', 'Have the amount, reason, and supporting reference ready.'],
  'staff.managed-payment-preparation': ['Prepare a Managed Maker payment', 'Prepare a maker’s payment for review.', 'Check the amount due and payment details before sending it for approval.'],
  'staff.managed-payment-action': ['Review a Managed Maker payment', 'Record your decision about a maker’s payment.', 'Check the prepared payment and supporting details before deciding.'],
  'staff.payout-request-action': ['Review a seller payment request', 'Record your decision about a seller’s payment request.', 'Check the available earnings and request before deciding.'],
  'staff.payout-1': ['Prepare a seller payment', 'Prepare a seller’s payment for review.', 'Check the seller’s available earnings and payment details.'],
  'staff.payout-2': ['Process a seller payment', 'Record approval or completion of a seller’s payment.', 'Check the prepared payment and record any required payment reference.'],
  'staff.exception-work': ['Record a task that needs follow-up', 'Tell the team about work that needs extra attention.', 'Explain what happened, what you did, and what still needs to be done.'],
  'staff.seller-governance': ['Review a seller account', 'Record a decision about a seller’s account or selling access.', 'Check the evidence and explain the reason for the action.'],
  'staff.governance-rule-create': ['Add a business rule', 'Record a rule used to manage the marketplace.', 'Choose a clear title and explain when the rule applies.'],
  'staff.governance-promotion-create': ['Add a promotion', 'Record the details of a marketplace promotion.', 'Have the dates, offer details, and eligibility rules ready.'],
  'staff.governance-incident-create': ['Report a business problem', 'Record a problem that needs investigation.', 'Explain what happened, when it happened, and who or what was affected.'],
  'staff.governance-incident-update': ['Update a business problem report', 'Record progress on an existing problem.', 'Read the previous report and explain what changed or what happens next.'],
  'staff.governance-backup-verify': ['Record a backup check', 'Record evidence that a backup was checked.', 'Have the backup reference, check result, and supporting evidence ready.'],
  'account.profile': ['Your account details', 'Keep your name and contact information up to date.', 'Check your details before saving.'],
  'account.address': ['Your delivery address', 'Save an address for future deliveries.', 'Enter the full address and a nearby landmark to help the rider find you.'],
  'identity.register': ['Create an account', 'Create an account to shop and track your orders.', 'Use an email address you can access and choose a password.'],
  'identity.login-password': ['Sign in', 'Sign in to your account.', 'Use the email address and password for your account.'],
  'identity.email-code-request': ['Get a sign-in code', 'Request a code to sign in by email.', 'Use the email address for your account.'],
  'identity.email-code-verify': ['Enter your sign-in code', 'Confirm the code sent to your email.', 'Check your inbox for the latest code.'],
  'identity.password-reset-request': ['Reset your password', 'Request help signing in to your account.', 'Use the email address for your account.'],
  'identity.password-reset-complete': ['Choose a new password', 'Set a new password for your account.', 'Choose a password you have not used for this account before.'],
  'rider.code-verify': ['Confirm a delivery code', 'Check the customer’s code before completing the delivery.', 'Ask the customer for the current delivery code.'],
  'account.daily-reward': ['Claim your daily points', 'Collect the points available to your account today.', 'Check the amount available before claiming.'],
  'account.points-redemption': ['Use your points', 'Choose how many points to exchange for wallet credit.', 'Check your points balance and the amount you will receive.'],
  'commerce.gift-card-redeem': ['Use a gift card', 'Add the value of a gift card to your account.', 'Have the gift card code ready.'],
  'commerce.order-tracking': ['Track an order', 'Check the progress of your order.', 'Have the order number and the email address used at checkout ready.'],
  'staff.staff-invitation': ['Invite a staff member', 'Give a colleague access to the operations workspace.', 'Use their email address and choose only the access they need.'],
  'staff.staff-permission-1': ['Update staff access', 'Choose what a staff member can view and manage.', 'Check the person’s role and choose only the access they need.'],
  'staff.staff-permission-2': ['Update staff access', 'Change a staff member’s access to the workspace.', 'Check their current access and explain why it needs to change.'],
  'staff.business-settings-manager': ['Update business settings', 'Update the information and settings used by the marketplace.', 'Check each changed value before saving or publishing.'],
  'staff.delivery-rate': ['Set a delivery charge', 'Set the charge for delivering an order to an area.', 'Have the delivery area, charge, and reason for the change ready.'],
  'staff.promo-code': ['Create or update a promo code', 'Choose the discount and rules for a promo code.', 'Have the code, discount, dates, and usage limits ready.'],
  'staff.loyalty-settings': ['Set daily points rules', 'Choose how customers earn and use daily points.', 'Check the points amount, limits, and dates before saving.'],
  'staff.referral-settings': ['Set referral rewards', 'Choose the rewards for referring a new customer.', 'Check the reward amount and when a customer can receive it.'],
  'staff.homepage-hero-manager': ['Update the homepage banner', 'Choose the pictures and words shown in the homepage banner.', 'Have the image, heading, and link ready. Preview before publishing.'],
  'staff.homepage-occasion-manager': ['Update homepage gift occasions', 'Choose the gift occasions shown on the homepage.', 'Have the image, occasion name, and link ready. Preview before publishing.'],
  'staff.homepage-visibility': ['Change homepage product visibility', 'Choose whether a product can appear on the homepage.', 'Check the product and explain the reason for the change.'],
  'staff.first-cod-confirmation': ['Confirm a first cash-on-delivery order', 'Record that the first cash-on-delivery order has been checked.', 'Check the order and explain how it was confirmed.'],
  'commerce.promo-quote': ['Check a promo code', 'Check whether a promo code applies to your order.', 'Enter the code exactly as it was given to you.'],
  'commerce.add-to-cart': ['Add a product to your cart', 'Choose how many items you want to buy.', 'Check the product options and quantity before adding it to your cart.'],
  'staff.activity-filter': ['Find a recorded action', 'Find staff actions in the change history.', 'Choose dates or an action type to narrow the results.'],
  'staff.seller-registry-filter': ['Find a seller', 'Search sellers and their application status.', 'Search by name or choose a status.'],
  'staff.order-queue-filter': ['Find an order', 'Search orders and their progress.', 'Use the order number or choose a status.'],
  'staff.order-email-filter': ['Find an order email', 'Find emails waiting to be sent or already processed.', 'Choose the status and dates you want to check.'],
  'staff.homepage-filter': ['Find homepage products', 'Find products that can appear on the homepage.', 'Search by name or choose whether a product is visible.'],
  'staff.recorded-progress-filter': ['Find recorded work', 'Search the work recorded by staff.', 'Choose dates or an action to narrow the results.'],
  'seller.product-filter': ['Find your products', 'Search your products and their review status.', 'Search by name or choose a status.'],
  'catalog.filters': ['Find products', 'Narrow the products shown in the shop.', 'Choose a category, price range, or gift occasion.'],
  'catalog.header-search': ['Search the shop', 'Find a product or maker.', 'Enter a product name, craft, or maker name.'],
  'system.local-testing-role': ['Choose a sample account', 'Open a sample workspace for local testing.', 'These accounts and records are fictional and available only in local development.'],
  'identity.logout': ['Sign out', 'End your current account session.', 'Save any unfinished work before signing out.'],
};

export function readableFieldName(key: string): string {
  const words = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ').trim();
  return words ? words[0].toUpperCase() + words.slice(1) : 'Details';
}
export function formGuide(formId: string): FormGuide {
  const guide = Object.hasOwn(guides, formId) ? guides[formId] : undefined;
  return guide ? { title: guide[0], purpose: guide[1], preparation: guide[2] } : {
    title: readableFieldName(formId), purpose: 'Enter the details needed for this task.',
    preparation: 'Read each question and check your answers before continuing.',
  };
}

const labels: Readonly<Record<string, string>> = {
  tradingName: 'Shop or brand name', legalName: 'Full name or registered business name', representativeName: 'Person applying for the business',
  businessDescription: 'Tell us about your products', publicName: 'Name customers will see', publicCity: 'City customers will see',
  nameEn: 'Product name', descriptionEn: 'Product description', applicantType: 'Type of applicant', participationRoute: 'How you want to sell',
  taxMode: 'Tax registration type', taxRegistrationNumber: 'PAN or VAT number', registrationAuthority: 'Office that registered your business',
  registrationNumber: 'Business registration number', governmentIdType: 'Type of identity document', governmentIdDescription: 'Identity document details',
  personalPan: 'Your personal PAN number', supportPhone: 'Phone number for customer help', supportEmail: 'Email address for customer help',
  municipality: 'Municipality or rural municipality', ward: 'Ward number', locality: 'Street or neighbourhood', landmark: 'Nearby landmark',
  productCategories: 'Types of products you make', experienceCraft: 'Your craft', experienceBand: 'How long you have practised your craft',
  representativeIdentity: 'Identity document of the person applying', businessRegistration: 'Business registration document',
  bankVerification: 'Document confirming bank details', panCertificate: 'PAN certificate', vatCertificate: 'VAT certificate', personalPanCertificate: 'Personal PAN certificate',
  inventoryQuantity: 'Items available to sell', quantity: 'Number of items', price: 'Price (NPR)', compareAtPrice: 'Price before discount (NPR)',
  preparationDays: 'Days needed to prepare the product', madeToOrder: 'Made after an order is placed', originStory: 'How this product is made',
  careInstructions: 'How to care for the product', safetyInformation: 'Safety information', returnConditions: 'Conditions for returning the product',
  manufacturedAt: 'Date made', expiresAt: 'Expiry date', licenceReference: 'Licence number or reference', warrantyOffered: 'Does this product have a warranty?',
  warrantyYears: 'Warranty length in years', warrantyMonths: 'Extra warranty months', identityNumber: 'Identity document number', identityType: 'Type of identity document',
  identityPhoto: 'Photo of your identity document', amount: 'Amount (NPR)', cash: 'Cash collected (NPR)', reference: 'Receipt or reference',
  payoutAccountReference: 'Payment account reference', requestType: 'What do you need help with?', details: 'Tell us more', reason: 'Reason for this change',
  note: 'Notes', recommendation: 'What do you recommend?', evidenceReference: 'Supporting document or reference', trackingReference: 'Tracking number',
  return_to: 'Page to return to', requestId: 'Request reference', idempotencyKey: 'Request reference', formVersion: 'Form version',
  customAnswers: 'Additional answers', actorId: 'Staff member', sellerId: 'Seller account', productId: 'Product', orderId: 'Order', jobId: 'Delivery job',
  email: 'Email address', phone: 'Phone number', facebookUrl: 'Facebook link', instagramUrl: 'Instagram link', linkedinUrl: 'LinkedIn link',
  tiktokUrl: 'TikTok link', xUrl: 'X link', youtubeUrl: 'YouTube link', profileImage: 'Profile photo', makerVideo: 'Video about your craft',
  applicationAcknowledgement: 'Confirm your application details', managedAgreementAccepted: 'Agree to the Managed Maker terms',
  hasBusinessTaxRegistration: 'Do you have a business PAN or VAT registration?', taxStatus: 'Your tax registration status', acceptedTerms: 'Agree to the terms',
};
const help: Readonly<Record<string, string>> = {
  tradingName: 'Use the name customers will see for your shop or brand.',
  businessDescription: 'Describe what you make, the materials you use, and who makes your products.',
  nameEn: 'Use a short name that tells customers what the product is.',
  descriptionEn: 'Explain the materials, size, features, and what the customer will receive.',
  legalName: 'Use the name shown on your identity or business registration document.',
  representativeName: 'This person must have permission to apply on behalf of the business.',
  publicName: 'This name will be shown on your public maker profile.', publicCity: 'Enter your city or town. Do not enter your full private address.',
  locality: 'Include the street, area, or neighbourhood where the address is located.', landmark: 'For example, near a school, temple, or well-known shop.',
  registrationAuthority: 'For example, the Office of the Company Registrar or your local government office.',
  taxRegistrationNumber: 'Enter the number shown on your PAN or VAT certificate.', personalPan: 'Enter the number shown on your personal PAN certificate.',
  preparationDays: 'Count the days needed before the product is ready for pickup.', inventoryQuantity: 'Enter the number of items ready to sell.',
  identityPhoto: 'Upload a clear photo showing the whole document. Check the allowed file types and size.',
  reason: 'Explain what changed and why. Include enough detail for the next person to understand.',
  reference: 'Enter the receipt number or reference that helps us find this record.',
};

export function baseFieldCopy(formId: string, key: string): { label: string; helpText?: string } {
  const canonical = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const original = Object.keys(labels).find(item => item.toLowerCase() === canonical) ?? key;
  const label = Object.hasOwn(labels, original) ? labels[original] : readableFieldName(key);
  return { label, ...(Object.hasOwn(help, original) ? { helpText: help[original] } : {}),
    ...(key === 'nameNe' ? { label: 'Product name in Nepali (optional)' } : {}),
    ...(key === 'descriptionNe' ? { label: 'Product description in Nepali (optional)' } : {}),
    ...(formId === 'staff.catalog' && key === 'nameEn' ? { label: 'Category or gift occasion name', helpText: 'Use a short name that helps customers find the right products.' } : {}),
    ...(formId === 'staff.catalog' && key === 'nameNe' ? { label: 'Category or gift occasion name in Nepali' } : {}),
    ...(formId === 'staff.catalog' && key === 'descriptionEn' ? { label: 'Category or gift occasion description' } : {}),
    ...(formId === 'rider.application' && key === 'legalName' ? { label: 'Full name as shown on your document' } : {}),
    ...(key === 'orderItemId' ? { label: 'Item in your order' } : {}),
    ...(key === 'invoiceId' ? { label: 'Invoice to correct' } : {}),
    ...(key === 'categoryId' ? { label: 'Product category' } : {}),
    ...(key === 'occasionIds' ? { label: 'Gift occasions' } : {}),
    ...(formId === 'seller.payout-request' && key === 'note' ? { label: 'What is this payment request for?', helpText: 'Explain your request in 8 to 500 characters. For example, payment for your completed orders.' } : {}) };
}

/** These values are filled by the application, rather than questions for a person. */
export const AUTOMATIC_FORM_KEYS: ReadonlySet<string> = new Set([
  'requestid', 'idempotencykey', 'formversion', 'customanswers', 'actorid', 'sellerid', 'productid', 'orderid', 'jobid',
  'expectedversion', 'version', 'reviewrequestid', 'managedagreementversion', 'managedagreementcontext',
  'selleragreementcontext', 'returnto', 'token', 'passwordconfirmationtoken', 'availablepaisa', 'pricepaisa',
  'amountpaisa', 'cashpaisa', 'authsubject', 'customerauthsubject', 'actor', 'actorrole', 'now', 'id', 'formid',
  'draftrevision', 'publishedrevision', 'revision',
]);
const selectedRecordQuestions: Readonly<Record<string, readonly string[]>> = {
  'seller.managed-supply-proposal': ['productId'],
  'seller.shipping-request': ['orderId'],
  'shipping.console-request': ['orderId'],
  'staff.invoice-adjustment': ['invoiceId'],
  'commerce.return-request': ['orderItemId'],
  'commerce.complaint': ['orderItemId'],
  'seller.product-submission': ['categoryId', 'occasionIds', 'removeMediaId'],
  'staff.product-classification': ['categoryId', 'occasionIds'],
  'commerce.checkout': ['selectedAddressId'],
};
export function isAutomaticFormField(key: string, formId?: string): boolean {
  if (formId && Object.hasOwn(selectedRecordQuestions, formId) && selectedRecordQuestions[formId].includes(key)) return false;
  return AUTOMATIC_FORM_KEYS.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase()) || /(?:Id|Ids|_id|_ids)$/.test(key) || /^expected[A-Z]/.test(key) || key.endsWith('Paisa');
}

const displayDefaults: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
  'seller.application': { tradingName: true, businessDescription: true },
  'seller.maker-profile': { publicName: true, publicCity: true },
  'seller.profile': { tradingName: true, businessDescription: false },
  'seller.product-submission': { nameEn: true, descriptionEn: true },
};
export function builtInDisplayDefault(formId: string, baseKey: string): { label: string; helpText?: string; required: boolean; placeholder?: string } | null {
  const defaults = Object.hasOwn(displayDefaults, formId) ? displayDefaults[formId] : undefined;
  const key = defaults && Object.keys(defaults).find(item => item.replace(/[^a-z0-9]/gi, '').toLowerCase() === baseKey.replace(/[^a-z0-9]/gi, '').toLowerCase());
  return key ? { ...baseFieldCopy(formId, key), required: defaults![key] } : null;
}
