import { orderQueueWhere, type AdminQueueFilters } from '../../admin/queue-filters';
import { publicTrackingReferenceSql } from '../../riders/public-tracking';
import { quotePromo, preparePromoConsumption } from './promo-codes';
import { requireCheckoutContactProof, checkoutContactGuards, type CheckoutContactPolicy } from '@/lib/auth/contact-verification';
import {prepareFirstCodReview} from '@/lib/orders/first-cod-review';
import { promoQuoteIntent } from '@/lib/incentives/quote-intent';
import { allocatePromoDiscount } from '@/lib/incentives/promo-policy';
import { getDeliveryRates, rateVersionGuard } from './delivery-rates';
import { getSellerCommissionTerms, commissionCheckoutGuards } from './commission-rates';
import { quoteCustomerServiceFee, customerFeeCheckoutGuards, customerFeeEvidenceInsert, readOrderCustomerServiceFees, type OrderCustomerFeeView } from './customer-service-fees';
import { calculateMarketplaceFee, type FeeBreakdown } from '../../marketplace/fee-waivers';
import { buildFormAnswerInsert } from './form-answers';
import { assertCommerceFormReplay, type CommerceForm } from './commerce-form-replay';
import { getCommissionSetting, sellerAcceptedCommissionVersion } from './marketplace-settings';
import { publicProductEligibility } from '@/lib/products/eligibility';
import { publicProductName } from '@/lib/products/truthful-presentation';
import {
  getDeliveryEstimate,
  type CheckoutInput,
} from '@/lib/checkout/validation';
import {
  phaseOneMarketplacePolicy,
  allocatePlatformDiscountPaisa,
  calculateCommissionBasePaisa,
} from '@/lib/marketplace/policy';
import {
  CUSTOMER_POLICY_VERSION,
  SELLER_AGREEMENT_VERSION,
  publicLegalPolicies,
} from '@/lib/content/legal-policies';

import { getCart, getCartId } from './cart';
import { listCustomerAddresses } from './customers';
import { matchesSavedDeliveryAddress } from '../../checkout/saved-address';
import { quoteOrderCredit } from './wallet';
import { getEffectiveBusinessSetting } from './business-settings';
import { getCheckoutPolicyContext } from '../../checkout/policy-context';
import { currentPlatformServiceFeeSql, payableOrderTotalSql } from './platform-service-fee';
import { lawfulServiceFeeRefundTotalSql } from './platform-service-fee-refunds';
import { assertReviewedCheckoutQuote, ReviewedCheckoutChangedError } from '../../checkout/reviewed-quote';
import { getRegisteredSettlementTerms } from '../../settlements/registered-terms';
import { buildManagedCommercialSnapshot } from '@/lib/managed-commerce/snapshots';
import { acceptedManagedTermsGuards, getAcceptedManagedTerms, type AcceptedManagedTerms } from '@/lib/managed-commerce/accepted-terms';
import type { PublicSellingIdentity } from '../../products/selling-identity';
import type { BillingContext, BillingLineIdentity } from '../../documents/billing';
import { APPROVED_BILLING_VERSION } from '../../documents/billing';
import { sellerSkuSql } from '../../products/stock-codes';
import { companyDetails } from '../../content/company-details';
import { allocateCancellationItems } from '../../cancellation/accounting';
import type { ManagedMakerCommercialModel } from '@/lib/configuration/types';
import {
  readDeliveryPricingSnapshot,
  type DeliveryPricingSnapshot,
} from '@/lib/checkout/delivery-rates';

export class CheckoutConflictError extends Error {}

export interface CheckoutResult {
  orderNumber: string;
  grandTotalPaisa: number;
  estimatedMinDays: number;
  estimatedMaxDays: number;
}

function orderNumber(now: number): string {
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: phaseOneMarketplacePolicy.value.identity.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date(now))
    .replaceAll('-', '');
  const suffix = crypto
    .randomUUID()
    .replaceAll('-', '')
    .slice(0, 10)
    .toUpperCase();
  return `HK-${date}-${suffix}`;
}

interface CheckoutCartItem {
  publicMakerName: string;
  legalBusinessName: string;
  id: string;
  productId: string;
  sellerId: string;
  tradingName: string;
  nameEn: string;
  sku: string;
  sellerSku: string | null;
  compareAtPricePaisa: number | null;
  size: string | null;
  colour: string | null;
  sellerPan: string;
  sellerTaxMode: 'PAN' | 'VAT' | 'BOTH' | 'NONE';
  sellerAddress: string;
  pricePaisa: number;
  quantity: number;
  inventoryQuantity: number;
  status: string;
  returnEligible: number;
  madeToOrder: number;
  preparationDays: number;
  sellerAgreementVersion: string | null;
  participationRoute: 'registered_seller' | 'managed_maker' | null;
  applicationStage: string | null;
  commercialModel: ManagedMakerCommercialModel | null;
  legalSellerReference: string | null;
  invoiceIssuerReference: string | null;
  payoutBeneficiaryReference: string | null;
  managedAgreementVersion: string | null;
  managedAgreementLanguage: 'en' | 'ne' | null;
  managedAgreementAcceptedAt: number | null;
}

export interface OrderDocumentSnapshot {
  /** Original accepted fee evidence; absent on historical saved documents. */
  customerServiceFee?: OrderCustomerFeeView;
  billing?: BillingContext;
  walletCreditPaisa?: number;
  referralDiscountPaisa?: number;
  promoDiscountPaisa?: number;
  originalPromoDiscountPaisa?: number;
  currentPromoDiscountPaisa?: number;
  refundedPromoDiscountPaisa?: number;
  promo?: {campaignId:string;revision:number;code:string;label:string};
  documentTitle: string;
  taxDocument: false;
  orderNumber: string;
  issuedAt: number;
  currency: 'NPR';
  paymentMethod: 'Cash on delivery';
  paymentStatus: 'pending' | 'paid';
  items: readonly (BillingLineIdentity & {
    productName: string;
    sellerName: string;
    makerName?: string | null;
    legalSellerName?: string | null;
    sku: string;
    unitPricePaisa: number;
    quantity: number;
    lineTotalPaisa: number;
  })[];
  itemSubtotalPaisa: number;
  deliveryChargePaisa: number;
  buyerPlatformFeePaisa: number;
  taxTotalPaisa: number;
  grandTotalPaisa: number;
}

function checkoutTermsSnapshot(sellerCommissionBps: number): Record<string, unknown> {
  const policy = phaseOneMarketplacePolicy;
  return {
    policyVersion: CUSTOMER_POLICY_VERSION,
    marketplacePolicyVersion: policy.version,
    documents: {
      terms: publicLegalPolicies.terms.sha256,
      returns: publicLegalPolicies.returns.sha256,
      shipping: publicLegalPolicies.shipping.sha256,
      privacy: publicLegalPolicies.privacy.sha256,
      'rewards-terms': publicLegalPolicies['rewards-terms'].sha256,
      'promo-code-terms': publicLegalPolicies['promo-code-terms'].sha256,
      'gift-card-terms': publicLegalPolicies['gift-card-terms'].sha256,
    },
    language: 'English',
    sellerCommissionBps,
    payment: 'Cash on delivery; no online payment is collected.',
    cancellation: {
      rulesVersion: 'parcel-cancellation-store-delivery-2026-09-13',
      cutoff: 'seller_parcel_ready_for_pickup',
      customProductionStartedRequiresStaffReview: true,
      deliveryCharge: 'base_plus_half_per_additional_remaining_store',
      creditAllocation:
        'proportional_cancelled_item_wallet_restoration_and_discount_removal',
      afterDispatchHandledAsReturn:
        policy.value.cancellations.afterDispatchHandledAsReturn,
    },
    returns: policy.value.returns,
    privacy:
      'Order and contact data is used to fulfil the order, provide support, prevent abuse, and meet approved retention duties.',
    grievancePath:
      'Use the secure order page or Help page to contact HastaBazaar.',
  };
}

function checkedCheckoutGuard(db:D1Database,predicate:string,values:readonly (string|number|null)[]) {
 const id=crypto.randomUUID();return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
function promoCustomerGuards(db:D1Database,userId:string,authSubject:string) {
 return [db.prepare('UPDATE users SET updated_at=updated_at WHERE id=?').bind(userId),db.prepare("UPDATE user_roles SET assigned_at=assigned_at WHERE user_id=? AND role='customer'").bind(userId),...checkedCheckoutGuard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='customer')",[userId,authSubject])];
}

export async function createCodOrder(
  database: D1Database,
  tokenHash: string,
  receiptTokenHash: string,
  input: CheckoutInput,
  now: number,
  customerId: string | null = null,
  form?: CommerceForm,
  contactPolicy: CheckoutContactPolicy = 'email_and_phone',
): Promise<CheckoutResult> {
  if (input.promoCode) {
    if (!customerId || typeof input.customerAuthSubject !== 'string' || !input.customerAuthSubject || input.referralCode || !Number.isSafeInteger(input.promoRevision) || !/^[a-f0-9]{64}$/.test(input.promoQuoteIntent ?? ''))
      throw new CheckoutConflictError('Sign in and apply a single promo again to review the quote.');
    const currentCustomer=await database.prepare("SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.auth_subject=? AND u.status='active' AND r.role='customer'").bind(customerId,input.customerAuthSubject).first();
    if(!currentCustomer)throw new CheckoutConflictError('An active customer account is required.');
  } else if(input.promoRevision !== undefined || input.promoQuoteIntent !== undefined)
    throw new CheckoutConflictError('Apply the promo again to review the quote.');
  const cartReference = `${tokenHash}:${input.idempotencyKey}`;
  const { formVersion: _formVersion, customAnswers: _customAnswers, ...coreInput } = input;
  // Non-promo historical checkout digests predate the server-only subject. Keep
  // the same replay identity while guarding the live subject on new writes.
  if(!input.promoCode)delete coreInput.customerAuthSubject;
  const intentBytes = new TextEncoder().encode(JSON.stringify({ customerId, ...coreInput }));
  const intentDigest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', intentBytes)),
    (byte) => byte.toString(16).padStart(2, '0')).join('');
  const digestExpression = (database as D1Database & { dialect?: string }).dialect === 'mariadb'
    ? "JSON_VALUE(a.next_json,'$.checkoutIntentDigest')"
    : "json_extract(a.next_json,'$.checkoutIntentDigest')";
  const previous = await database
    .prepare(
      `SELECT orders.id, orders.order_number AS orderNumber, ${payableOrderTotalSql()} AS grandTotalPaisa,
        shipments.estimated_min_days AS estimatedMinDays,
        shipments.estimated_max_days AS estimatedMaxDays,
        (SELECT ${digestExpression} FROM audit_logs a
          WHERE a.action='order.placed' AND a.subject_type='order' AND a.subject_id=orders.id
            AND a.request_id=? LIMIT 1) AS checkoutIntentDigest,
        (SELECT json_extract(a.next_json,'$.checkoutResult') FROM audit_logs a
          WHERE a.action='order.placed' AND a.subject_id=orders.id AND a.request_id=? LIMIT 1) AS originalResult
       FROM payments INNER JOIN orders ON orders.id = payments.order_id
       INNER JOIN shipments ON shipments.order_id = orders.id
       WHERE payments.idempotency_key = ? AND payments.provider_reference = ? LIMIT 1`,
    )
    .bind(input.idempotencyKey, input.idempotencyKey, input.idempotencyKey, cartReference)
    .first<CheckoutResult & { id: string; checkoutIntentDigest: string | null; originalResult: string | null }>();
  if (previous) {
    if (previous.checkoutIntentDigest !== intentDigest)
      throw new CheckoutConflictError('This checkout request was already used for different order details.');
    const changedCart = await database.prepare(
      `SELECT 1 AS present FROM cart_items
       INNER JOIN carts ON carts.id = cart_items.cart_id
       WHERE carts.anonymous_token_hash = ? LIMIT 1`,
    ).bind(tokenHash).first<{ present: number }>();
    if (changedCart)
      throw new CheckoutConflictError('This checkout request was already used for a different cart.');
    await assertCommerceFormReplay(database, { formId: 'commerce.checkout',
      requestId: input.idempotencyKey, subjectType: 'order', subjectId: previous.id,
      actorId: customerId, form, conflictError: CheckoutConflictError });
    if(input.promoCode && customerId) {
      try {await database.batch(promoCustomerGuards(database,customerId,input.customerAuthSubject!));} catch {throw new CheckoutConflictError('An active customer account is required.');}
      if(!previous.originalResult)throw new CheckoutConflictError('The original order result is unavailable.');
      return JSON.parse(previous.originalResult) as CheckoutResult;
    }
    const { id: _id, checkoutIntentDigest: _digest, originalResult: _original, ...result } = previous;
    return result;
  }

  if (form && !input.reviewedQuote) throw new ReviewedCheckoutChangedError();
  const contactProof = await requireCheckoutContactProof(database,
    customerId && input.customerAuthSubject ? {userId:customerId,authSubject:input.customerAuthSubject} : null,
    input.customerEmail,input.customerPhone,contactPolicy);
  const cartId = await getCartId(database, tokenHash);
  if (!cartId) throw new CheckoutConflictError('Your cart is empty.');
  const cart = await getCart(database, tokenHash);
  if (cart.items.length === 0)
    throw new CheckoutConflictError('Your cart is empty.');
  if (cart.hasUnavailableItems)
    throw new CheckoutConflictError(
      'One or more cart items changed availability. Review your cart and try again.',
    );

  const itemResult = await database
    .prepare(
      `SELECT cart_items.id, products.id AS productId, products.seller_id AS sellerId,
        seller_profiles.trading_name AS tradingName,
        COALESCE(participation.public_name,seller_profiles.trading_name) AS publicMakerName,
        seller_profiles.legal_name AS legalBusinessName,
        seller_profiles.seller_agreement_version AS sellerAgreementVersion,
        participation.participation_route AS participationRoute,
        participation.application_stage AS applicationStage,
        participation.commercial_model AS commercialModel,
        participation.legal_seller_reference AS legalSellerReference,
        participation.invoice_issuer_reference AS invoiceIssuerReference,
        participation.payout_beneficiary_reference AS payoutBeneficiaryReference,
        participation.managed_agreement_version AS managedAgreementVersion,
        participation.managed_agreement_language AS managedAgreementLanguage,
        participation.managed_agreement_accepted_at AS managedAgreementAcceptedAt,
        products.name_en AS nameEn,
        products.sku, ${sellerSkuSql()} AS sellerSku, products.compare_at_price_paisa AS compareAtPricePaisa,
        products.size, products.colour,
        seller_profiles.tax_registration_number AS sellerPan, seller_profiles.tax_mode AS sellerTaxMode,
        (seller_profiles.locality || ', ' || seller_profiles.municipality || ', ' || seller_profiles.district || ', ' || seller_profiles.province || ', Nepal') AS sellerAddress,
        products.price_paisa AS pricePaisa, cart_items.quantity,
        products.inventory_quantity AS inventoryQuantity, CASE WHEN ${publicProductEligibility()} THEN 'published' ELSE 'archived' END AS status,
        products.return_eligible AS returnEligible, products.made_to_order AS madeToOrder,
        products.preparation_days AS preparationDays
       FROM cart_items
       INNER JOIN products ON products.id = cart_items.product_id
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
       WHERE cart_items.cart_id = ? ORDER BY cart_items.created_at ASC`,
    )
    .bind(cartId)
    .all<CheckoutCartItem>();
  const items = itemResult.results;
  if (items.length === 0)
    throw new CheckoutConflictError('Your cart is empty.');
  if ((input.selectedAddressId || input.saveAddressForFuture) && !customerId)
    throw new CheckoutConflictError('Sign in to use or save a delivery address.');
  const ownedAddresses = customerId ? await listCustomerAddresses(database, customerId) : [];
  if (input.selectedAddressId) {
    if (!ownedAddresses.some(address => address.id === input.selectedAddressId))
      throw new CheckoutConflictError(
        'The selected saved address is not available to this account.',
      );
  }
  if (
    input.saveAddressForFuture &&
    !/^(?:\+?977)?9[678]\d{8}$/.test(input.address.phone)
  )
    throw new CheckoutConflictError(
      'Use a valid Nepal mobile number to save this address.',
    );
  if (
    input.saveAddressForFuture &&
    (!input.saveAddressLabel || input.saveAddressLabel.length > 80)
  )
    throw new CheckoutConflictError('Add a short label before saving this address.');
  // Derive the new saving policy after successful historical request replay.
  // The original input and its digest must retain their recorded semantics.
  const reusableAddress = !input.saveAddressForFuture
    ? ownedAddresses.find(address => matchesSavedDeliveryAddress(input.address, address))
    : undefined;
  const shouldInsertAddress = !reusableAddress;
  const effectiveAddressLabel = input.saveAddressForFuture ? input.saveAddressLabel! : 'Delivery address';
  const recipientEmail =
    input.deliveryFor === 'other' ? input.recipientEmail ?? null : null;
  if (
    items.some(
      (item) =>
        item.status !== 'published' || item.quantity > item.inventoryQuantity,
    )
  ) {
    throw new CheckoutConflictError(
      'One or more cart items changed availability. Review your cart and try again.',
    );
  }
  if (items.some((item) =>
    item.participationRoute !== 'managed_maker' &&
    item.sellerAgreementVersion !== SELLER_AGREEMENT_VERSION
  )) {
    throw new CheckoutConflictError(
      'A seller must accept the current marketplace agreement before receiving a new order.',
    );
  }

  const rates = await getDeliveryRates(database);
  const commissionSetting = await getCommissionSetting(database, now);
  const sellerCommissionBps = commissionSetting.basisPoints;
  const sellerCommissionTerms = Object.fromEntries(await Promise.all([...new Set(items.filter(item => item.participationRoute !== 'managed_maker').map(item => item.sellerId))].map(async sellerId => [sellerId, await getSellerCommissionTerms(database, sellerId, now)] as const)));
  if (commissionSetting.versionId) {
    for (const sellerId of new Set(items.filter((item)=>item.participationRoute!=='managed_maker').map((item)=>item.sellerId))) {
      if (!await sellerAcceptedCommissionVersion(database,sellerId,commissionSetting.versionId)) {
        throw new CheckoutConflictError('A seller must accept the current commission and agreement version before receiving a new order.');
      }
    }
  }
  const hasManagedItems = items.some((item) => item.participationRoute === 'managed_maker');
  const [managedProgram, managedModel, managedRetention, managedHold] = hasManagedItems
    ? await Promise.all([
        getEffectiveBusinessSetting(database, 'managed_maker_program_mode', now),
        getEffectiveBusinessSetting(database, 'managed_maker_active_model', now),
        getEffectiveBusinessSetting(database, 'managed_sale_linked_platform_retention_bps', now),
        getEffectiveBusinessSetting(database, 'seller_delivery_hold_days', now),
      ])
    : [null, null, null, null];
  if (hasManagedItems && (
    managedProgram?.value !== 'activation_enabled' ||
    !managedModel?.value ||
    items.some((item) => item.participationRoute === 'managed_maker' && (
      item.applicationStage !== 'active' || item.commercialModel !== managedModel.value ||
      !item.legalSellerReference || !item.invoiceIssuerReference || !item.payoutBeneficiaryReference ||
      !item.managedAgreementVersion || !item.managedAgreementLanguage || !item.managedAgreementAcceptedAt
    ))
  )) throw new CheckoutConflictError('A Managed Maker item is not active under the configured simulated program.');
  const acceptedManaged = new Map<string, AcceptedManagedTerms>();
  for (const sellerId of new Set(items.filter(item => item.commercialModel === 'managed_sale_linked_percentage_v1').map(item => item.sellerId))) {
    const accepted = await getAcceptedManagedTerms(database, sellerId, now);
    if (!accepted) throw new CheckoutConflictError('A maker must accept the current company-store terms before a new order.');
    acceptedManaged.set(sellerId, accepted);
  }
  if (input.deliveryRateVersion && input.deliveryRateVersion !== rates.version)
    throw new CheckoutConflictError(
      'Delivery rates changed. Reload checkout to review the current total.',
    );
  const storeCount = new Set(items.map((item) => item.sellerId)).size;
  const delivery = getDeliveryEstimate(
    input.address.district,
    itemResult.results.map((item) => item.preparationDays),
    rates,
    storeCount,
  );
  if (!delivery)
    throw new CheckoutConflictError('Enter your delivery district.');
  const itemSubtotalPaisa = items.reduce(
    (total, item) => total + item.pricePaisa * item.quantity,
    0,
  );
  if(!Number.isSafeInteger(itemSubtotalPaisa))throw new CheckoutConflictError('Review your cart total.');
  const promo=input.promoCode && customerId ? await quotePromo(database,{userId:customerId,code:input.promoCode,subtotalPaisa:itemSubtotalPaisa,now}) : null;
  if(promo && (promo.revision !== input.promoRevision || await promoQuoteIntent(customerId!,cartId,items,promo,input.customerAuthSubject!) !== input.promoQuoteIntent))
    throw new CheckoutConflictError('Your promo quote changed. Apply it again to review the current total.');
  const promoDiscountPaisa=promo?.discountPaisa ?? 0;
  const customerFeeQuote = await quoteCustomerServiceFee(database, now);
  const serviceFee = customerFeeQuote.snapshot;
  const buyerFeePaisa = serviceFee.chargedPaisa;
  const credit = await quoteOrderCredit(database, {
    userId: customerId,
    subtotalPaisa: itemSubtotalPaisa,
    useWallet: input.useWallet,
    referralCode: input.referralCode,
    phone: input.customerPhone,
    ...(promo ? {merchandiseDiscountPaisa:promoDiscountPaisa} : {}),
    now,
    readOnly: true,
  });
  const total = BigInt(itemSubtotalPaisa) + BigInt(delivery.chargePaisa) +
    BigInt(buyerFeePaisa) - BigInt(credit.walletPaisa) -
    BigInt(credit.discountPaisa) - BigInt(promoDiscountPaisa);
  if (total < BigInt(0) || total > BigInt(Number.MAX_SAFE_INTEGER))
    throw new CheckoutConflictError('Review your cart total before placing the order.');
  const grandTotalPaisa = Number(total);
  const referralCampaign = input.referralCode ? credit.campaignSnapshot : null;
  if (input.reviewedQuote) assertReviewedCheckoutQuote(input.reviewedQuote, {
    lines: items.map(item => ({ id: item.id, sellerId: item.sellerId, pricePaisa: item.pricePaisa, quantity: item.quantity })),
    deliveryPaisa: delivery.chargePaisa, walletPaisa: credit.walletPaisa, referralPaisa: credit.discountPaisa,
    promoPaisa: promoDiscountPaisa, payablePaisa: grandTotalPaisa,
    policyContext: await getCheckoutPolicyContext(), referralCampaign, serviceFee,
  });
  const id = crypto.randomUUID();
  const savedAddressId = reusableAddress?.id ?? crypto.randomUUID();
  const number = orderNumber(now);
  const registeredSettlementTerms = items.some(item => item.participationRoute !== 'managed_maker')
    ? await getRegisteredSettlementTerms(database, now) : null;
  const termsSnapshot = { ...checkoutTermsSnapshot(sellerCommissionBps), serviceFee, sellerCommissionTerms, deliveryRate: delivery, reviewedQuote: input.reviewedQuote ?? null,
    marketplaceFees: [] as (FeeBreakdown & { orderItemId: string })[],
    customerFeeWaiver: customerFeeQuote,
    ...(registeredSettlementTerms ? { registeredSettlementTerms } : {}) };
  const platformDiscounts = allocatePlatformDiscountPaisa(
    items.map((item) => ({
      key: item.id,
      productValuePaisa: item.pricePaisa * item.quantity,
    })),
    credit.discountPaisa + promoDiscountPaisa,
  );
  const promoAllocations=promo ? allocatePromoDiscount(items.map(item=>({key:item.id,subtotalPaisa:item.pricePaisa*item.quantity})),promoDiscountPaisa) : {};
  const checkoutResult:CheckoutResult={orderNumber:number,grandTotalPaisa,estimatedMinDays:delivery.estimatedMinDays,estimatedMaxDays:delivery.estimatedMaxDays};
  const orderItemIds=new Map(items.map(item=>[item.id,crypto.randomUUID()]));
  const billingAllocations=new Map(allocateCancellationItems(items.map(item=>({id:orderItemIds.get(item.id)!,
    sellerId:item.sellerId,amount:item.pricePaisa*item.quantity,...(promoDiscountPaisa?{promo:promoAllocations[item.id]??0}:{})})),
    credit.walletPaisa,credit.discountPaisa+promoDiscountPaisa).map(line=>[line.id,line]));
  const invoiceCompany={reference:companyDetails.entityReference,kind:'company' as const,
    legalName:companyDetails.legalName,pan:companyDetails.pan,address:companyDetails.registeredOffice,taxMode:'PAN' as const};
  const statementSnapshot: OrderDocumentSnapshot = {
    customerServiceFee:{orderId:id,source:'customer_v2',standardPaisa:serviceFee.standardPaisa,
      waivedPaisa:serviceFee.waivedPaisa,netPaisa:serviceFee.chargedPaisa,
      campaign:serviceFee.campaign,policyVersionId:serviceFee.versionId},
    billing:{version:APPROVED_BILLING_VERSION,receiptIssuance:'pending_clearance',company:invoiceCompany,
      customer:{email:input.customerEmail,phone:input.customerPhone},deliveryAddress:{...input.address}},
    walletCreditPaisa: credit.walletPaisa,
    referralDiscountPaisa: credit.discountPaisa,
    promoDiscountPaisa,
    ...(promo ? {promo:{campaignId:promo.campaignId,revision:promo.revision,code:promo.code,label:promo.label}} : {}),
    documentTitle: 'Order Invoice',
    taxDocument: false,
    orderNumber: number,
    issuedAt: now,
    currency: 'NPR',
    paymentMethod: 'Cash on delivery',
    paymentStatus: 'pending',
    items: items.map((item) => ({
      orderItemId:orderItemIds.get(item.id)!,productId:item.productId,sellerId:item.sellerId,
      billingPromotionPaisa:billingAllocations.get(orderItemIds.get(item.id)!)!.discount,
      billingWalletPaisa:billingAllocations.get(orderItemIds.get(item.id)!)!.wallet,
      sellerSku:item.sellerSku??null,
      listPricePaisa:item.compareAtPricePaisa&&item.compareAtPricePaisa>=item.pricePaisa?item.compareAtPricePaisa:item.pricePaisa,
      variant:[item.size,item.colour].filter(Boolean).join(' / ')||null,
      issuer:acceptedManaged.has(item.sellerId)?{
        ...invoiceCompany,reference:acceptedManaged.get(item.sellerId)!.snapshot.companyAccount.entityReference,
        legalName:acceptedManaged.get(item.sellerId)!.snapshot.company.legalName,
        pan:acceptedManaged.get(item.sellerId)!.snapshot.company.pan,
        address:acceptedManaged.get(item.sellerId)!.snapshot.company.registeredOffice,
      }:item.participationRoute!=='managed_maker'?{reference:`registered:${item.sellerId}`,kind:'registered' as const,
        legalName:item.legalBusinessName??'',pan:item.sellerPan,address:item.sellerAddress,taxMode:item.sellerTaxMode}:undefined,
      productName: publicProductName(item.nameEn),
      sellerName: acceptedManaged.get(item.sellerId)?.snapshot.companyAccount.storeName ?? item.tradingName,
      makerName: item.participationRoute === 'managed_maker' ? item.publicMakerName : null,
      legalSellerName: acceptedManaged.get(item.sellerId)?.snapshot.company.legalName ?? (item.participationRoute!=='managed_maker' ? item.legalBusinessName : null),
      sku: item.sku,
      unitPricePaisa: item.pricePaisa,
      quantity: item.quantity,
      lineTotalPaisa: item.pricePaisa * item.quantity,
    })),
    itemSubtotalPaisa,
    deliveryChargePaisa: delivery.chargePaisa,
    buyerPlatformFeePaisa: buyerFeePaisa,
    taxTotalPaisa: 0,
    grandTotalPaisa,
  };
  const managedCheckoutGuards: D1PreparedStatement[] = [];
  if (hasManagedItems) {
    for (const setting of [managedProgram, managedModel, managedRetention, managedHold]) {
      if (!setting) continue;
      managedCheckoutGuards.push(...checkedCheckoutGuard(database, `COALESCE((SELECT id FROM business_setting_versions
        WHERE setting_key=? AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?)
        ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?`, [setting.key, now, now, setting.versionId ?? '']));
    }
    for (const item of items.filter(item => item.participationRoute === 'managed_maker')) {
      managedCheckoutGuards.push(...checkedCheckoutGuard(database, `EXISTS(SELECT 1 FROM seller_participation_profiles
        WHERE seller_id=? AND participation_route='managed_maker' AND application_stage='active' AND commercial_model=?
          AND legal_seller_reference=? AND invoice_issuer_reference=? AND payout_beneficiary_reference=?
          AND managed_agreement_version=? AND managed_agreement_language=? AND managed_agreement_accepted_at=?)`,
        [item.sellerId, item.commercialModel, item.legalSellerReference, item.invoiceIssuerReference, item.payoutBeneficiaryReference,
          item.managedAgreementVersion, item.managedAgreementLanguage, item.managedAgreementAcceptedAt]));
    }
  }
  const placedAt = Date.now();
  const statements: D1PreparedStatement[] = [
    ...customerFeeCheckoutGuards(database, customerFeeQuote, placedAt),
    ...managedCheckoutGuards,
    database.prepare(
      "UPDATE delivery_rate_current SET version_id=version_id WHERE id='default'",
    ),
    ...rateVersionGuard(database, rates.version),
    ...[...acceptedManaged.values()].flatMap(terms => acceptedManagedTermsGuards(database, terms, now)),
    database
      .prepare(
        `INSERT INTO orders (
          id, order_number, receipt_token_hash, customer_id, customer_email,
          customer_phone, delivery_for, recipient_email, source_address_id,
          address_saved_for_future, status, locale, currency, policy_version,
          return_policy_snapshot_json,
          shipping_address_json, item_subtotal_paisa, seller_discount_paisa,
          delivery_charge_paisa, buyer_platform_fee_paisa, tax_total_paisa,
          grand_total_paisa, payment_mode, payment_status, placed_at,
          delivered_at, cancelled_at, created_at, updated_at, wallet_credit_paisa, referral_discount_paisa,
          promo_discount_paisa,promo_campaign_id,promo_revision,promo_code,promo_label,
          current_total_paisa,current_subtotal_paisa,current_delivery_paisa,current_wallet_paisa,current_discount_paisa,current_promo_discount_paisa
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, 'NPR', ?, ?, ?, ?, 0, ?, ?, 0, ?, 'cod', 'pending', ?, NULL, NULL, ?, ?, ?, ?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id,
        number,
        receiptTokenHash,
        customerId,
        input.customerEmail,
        input.customerPhone,
        input.deliveryFor ?? 'self',
        recipientEmail,
        savedAddressId,
        shouldInsertAddress ? 1 : 0,
        input.locale,
        CUSTOMER_POLICY_VERSION,
        JSON.stringify({ ...phaseOneMarketplacePolicy.value.returns, serviceFee }),
        JSON.stringify(input.address),
        itemSubtotalPaisa,
        delivery.chargePaisa,
        buyerFeePaisa,
        grandTotalPaisa,
        placedAt,
        now,
        now,
        credit.walletPaisa,
        credit.discountPaisa,
        promoDiscountPaisa,promo?.campaignId ?? null,promo?.revision ?? null,promo?.code ?? null,promo?.label ?? null,
        promo ? grandTotalPaisa-buyerFeePaisa : null,promo ? itemSubtotalPaisa : null,promo ? delivery.chargePaisa : null,promo ? credit.walletPaisa : null,promo ? promoDiscountPaisa : null,promoDiscountPaisa,
      ),
  ];

  statements.push(customerFeeEvidenceInsert(database, id, serviceFee, placedAt));
  statements.push(...prepareFirstCodReview(database,{customerId:contactProof.actor.userId,orderId:id,
    totalPaisa:grandTotalPaisa+credit.walletPaisa,now}));
  const snapshotGuards:D1PreparedStatement[]=[
    ...checkedCheckoutGuard(database,
      "COALESCE((SELECT id FROM business_setting_versions WHERE setting_key='platform_service_fee_policy' AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?",
      [placedAt, placedAt, serviceFee.versionId ?? '']),
    ...(registeredSettlementTerms ? ([
      ['seller_delivery_hold_days', registeredSettlementTerms.holdSettingVersionId],
      ['new_seller_reserve_bps', registeredSettlementTerms.reserveSettingVersionId],
    ] as const).flatMap(([key, versionId]) => checkedCheckoutGuard(database,
      "COALESCE((SELECT id FROM business_setting_versions WHERE setting_key=? AND status='published' AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=?",
      [key, now, now, versionId ?? ''])) : []),
    ...(referralCampaign ? checkedCheckoutGuard(database,
      "EXISTS(SELECT 1 FROM referral_campaign WHERE id='default' AND enabled=? AND friend_discount_paisa=? AND reward_paisa=? AND minimum_subtotal_paisa=? AND return_window_days=?)",
      [referralCampaign.enabled,referralCampaign.friendDiscountPaisa,referralCampaign.rewardPaisa,referralCampaign.minimumSubtotalPaisa,referralCampaign.returnWindowDays]) : []),
    database.prepare('UPDATE carts SET updated_at=updated_at WHERE id=?').bind(cartId),
    ...checkedCheckoutGuard(database,'EXISTS(SELECT 1 FROM carts WHERE id=? AND anonymous_token_hash=?) AND (SELECT COUNT(*) FROM cart_items WHERE cart_id=?)=?',[cartId,tokenHash,cartId,items.length]),
  ];
  for(const sellerId of [...new Set(items.map(item=>item.sellerId))].sort((a,b)=>a.localeCompare(b))) snapshotGuards.push(
    database.prepare('UPDATE seller_profiles SET updated_at=updated_at WHERE id=?').bind(sellerId),
    database.prepare('UPDATE seller_participation_profiles SET updated_at=updated_at WHERE seller_id=?').bind(sellerId),
  );
  for(const item of items) snapshotGuards.push(
    database.prepare('UPDATE products SET price_paisa=price_paisa WHERE id=?').bind(item.productId),
    database.prepare('UPDATE cart_items SET quantity=quantity WHERE id=?').bind(item.id),
    ...checkedCheckoutGuard(database,`EXISTS(SELECT 1 FROM cart_items JOIN products ON products.id=cart_items.product_id WHERE cart_items.id=? AND cart_items.cart_id=? AND products.id=? AND products.seller_id=? AND products.price_paisa=? AND cart_items.quantity=? AND products.inventory_quantity>=cart_items.quantity AND ${publicProductEligibility('products',now)})`,[item.id,cartId,item.productId,item.sellerId,item.pricePaisa,item.quantity]),
    ...checkedCheckoutGuard(database,`EXISTS(SELECT 1 FROM products JOIN seller_profiles ON seller_profiles.id=products.seller_id
      WHERE products.id=? AND products.sku=? AND COALESCE(products.compare_at_price_paisa,-1)=?
      AND COALESCE(products.size,'')=? AND COALESCE(products.colour,'')=? AND COALESCE(${sellerSkuSql()},'')=? AND products.name_en=?
      AND seller_profiles.legal_name=? AND seller_profiles.trading_name=?
      AND COALESCE((SELECT public_name FROM seller_participation_profiles WHERE seller_id=products.seller_id),seller_profiles.trading_name)=?
      AND seller_profiles.tax_registration_number=? AND seller_profiles.tax_mode=?
      AND (seller_profiles.locality || ', ' || seller_profiles.municipality || ', ' || seller_profiles.district || ', ' || seller_profiles.province || ', Nepal')=?)`,
      [item.productId,item.sku,item.compareAtPricePaisa??-1,item.size??'',item.colour??'',item.sellerSku??'',item.nameEn,
        item.legalBusinessName,item.tradingName,item.publicMakerName,item.sellerPan,item.sellerTaxMode,item.sellerAddress]),
  );
  if (shouldInsertAddress && !input.saveAddressForFuture) {
    // Contact guards serialize checkout for this customer. If another checkout
    // saved an address after our read, retry against the current address book.
    snapshotGuards.push(...checkedCheckoutGuard(database,
      '(SELECT COUNT(*) FROM addresses WHERE user_id=?)=?', [customerId, ownedAddresses.length]));
  }
  // A same-count edit or replacement must also invalidate an insertion decision.
  // Guard the rows we compared, not only the size of the address book.
  for (const savedAddress of reusableAddress ? [reusableAddress] : ownedAddresses) {
    const hasPin = savedAddress.latitude != null && savedAddress.longitude != null;
    snapshotGuards.push(...checkedCheckoutGuard(database, `EXISTS(SELECT 1 FROM addresses a
      WHERE a.id=? AND a.user_id=? AND a.recipient_name=? AND a.phone=? AND a.province=? AND a.district=?
        AND a.municipality=? AND COALESCE(a.ward,'')=? AND a.locality=? AND COALESCE(a.landmark,'')=?
        AND COALESCE(a.postal_code,'')=? AND ${hasPin
          ? 'EXISTS(SELECT 1 FROM address_locations l WHERE l.address_id=a.id AND l.latitude=? AND l.longitude=?)'
          : 'NOT EXISTS(SELECT 1 FROM address_locations l WHERE l.address_id=a.id)'})`,
      [savedAddress.id, customerId, savedAddress.recipientName, savedAddress.phone,
        savedAddress.province, savedAddress.district, savedAddress.municipality,
        savedAddress.ward ?? '', savedAddress.locality, savedAddress.landmark ?? '',
        savedAddress.postalCode ?? '', ...(hasPin ? [savedAddress.latitude!, savedAddress.longitude!] : [])]));
  }
  statements.unshift(...checkoutContactGuards(database,contactProof),...(promo && customerId ? promoCustomerGuards(database,customerId,input.customerAuthSubject!) : []),...snapshotGuards);

  if (customerId && shouldInsertAddress) {
    statements.push(
      database
        .prepare(
          `INSERT INTO addresses (
            id,user_id,label,recipient_name,phone,province,district,municipality,
            ward,locality,landmark,postal_code,is_default,created_at,updated_at
          ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,
            CASE WHEN EXISTS(SELECT 1 FROM addresses WHERE user_id=?) THEN 0 ELSE 1 END,?,?)`,
        )
        .bind(
          savedAddressId,
          customerId,
          effectiveAddressLabel,
          input.address.recipientName,
          input.address.phone,
          input.address.province,
          input.address.district,
          input.address.municipality,
          input.address.ward ?? null,
          input.address.locality,
          input.address.landmark ?? null,
          input.address.postalCode ?? null,
          customerId,
          now,
          now,
        ),
    );
    if (input.address.location)
      statements.push(
        database
          .prepare(
            'INSERT INTO address_locations(address_id,latitude,longitude) VALUES (?,?,?)',
          )
          .bind(
            savedAddressId,
            input.address.location.latitude,
            input.address.location.longitude,
          ),
      );
    statements.push(
      database
        .prepare(
          `INSERT INTO audit_logs (
            id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at
          ) VALUES (?,?,'account.address.created','address',?,
            'Delivery address saved with successful checkout; existing addresses preserved',?,?,?)`,
        )
        .bind(
          crypto.randomUUID(),
          customerId,
          savedAddressId,
          JSON.stringify({ label: effectiveAddressLabel, source: 'checkout' }),
          `${input.idempotencyKey}:save-address`,
          now,
        ),
    );
  }

  statements.push(
    database
      .prepare('UPDATE orders SET delivery_rate_snapshot_json=? WHERE id=?')
      .bind(
        JSON.stringify({
          version: rates.version,
          district: input.address.district,
          band: delivery.rateBand,
          zone: delivery.zone,
          pricingPolicy: delivery.pricingPolicy,
          baseChargePaisa: delivery.baseChargePaisa,
          storeCount: delivery.storeCount,
          chargePaisa: delivery.chargePaisa,
        }),
        id,
      ),
  );
  if (customerId) {
    // Serialize checkout for this customer before inserting the order or consuming credit.
    statements.unshift(
      database.prepare(`INSERT OR IGNORE INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at)
        SELECT ?,?,0,? WHERE EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='customer')`).bind(customerId,crypto.randomUUID().replaceAll('-', '').slice(0,16).toUpperCase(),now,customerId),
      database
        .prepare(
          'UPDATE wallet_accounts SET balance_paisa=balance_paisa WHERE user_id=?',
        )
        .bind(customerId),
    );
    if (credit.referrerId)
      statements.push(
        database
          .prepare(`INSERT INTO referral_redemptions
      (customer_id,referrer_id,order_id,phone_key,reward_paisa,wait_days,created_at) VALUES (?,?,?,?,?,?,?)`)
          .bind(
            customerId,
            credit.referrerId,
            id,
            credit.phoneKey,
            credit.rewardPaisa,
            credit.waitDays,
            now,
          ),
      );
    if (credit.walletPaisa)
      statements.push(
        database
          .prepare(`INSERT INTO wallet_entries
      (id,user_id,order_id,amount_paisa,platform_amount_paisa,kind,created_at) VALUES (?,?,?,?,?,'order_spend',?)`)
          .bind(
            `spend:${id}`,
            customerId,
            id,
            -credit.walletPaisa,
            credit.walletPaisa,
            now,
          ),
      );
  }

  for (const item of items) {
    const commission = sellerCommissionTerms[item.sellerId];
    const orderItemId = orderItemIds.get(item.id)!;
    const lineTotalPaisa = item.pricePaisa * item.quantity;
    const sellerDiscountPaisa = 0;
    const platformDiscountPaisa = promo ? promoAllocations[item.id] ?? 0 : platformDiscounts.get(item.id) ?? 0;
    const commissionBasePaisa = calculateCommissionBasePaisa({
      productValuePaisa: lineTotalPaisa,
      sellerFundedDiscountPaisa: sellerDiscountPaisa,
      platformFundedDiscountPaisa: platformDiscountPaisa,
    });
    const managed = item.participationRoute === 'managed_maker';
    const fee = managed ? null : calculateMarketplaceFee(commissionBasePaisa, commission.basisPoints, null);
    statements.push(
      database
        .prepare(
          `INSERT INTO order_items (
            id, order_id, product_id, seller_id, seller_name_snapshot,
            product_name_snapshot, sku_snapshot, unit_price_paisa, quantity,
            seller_discount_paisa, platform_discount_paisa,
            commission_base_paisa, commission_rule_version,
            seller_agreement_version, commission_bps, commission_paisa,
            tax_paisa, line_total_paisa, return_eligible_snapshot, made_to_order_snapshot, created_at, promo_discount_paisa,current_promo_discount_paisa,referral_discount_paisa
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?,?,?,?)`,
        )
        .bind(
          orderItemId,
          id,
          item.productId,
          item.sellerId,
          acceptedManaged.get(item.sellerId)?.snapshot.companyAccount.storeName ?? item.tradingName,
          publicProductName(item.nameEn),
          item.sku,
          item.pricePaisa,
          item.quantity,
          sellerDiscountPaisa,
          platformDiscountPaisa,
          commissionBasePaisa,
          managed ? `managed-${item.commercialModel ?? 'unconfigured'}` : commission.version,
          managed ? item.managedAgreementVersion : item.sellerAgreementVersion,
          managed ? 0 : fee!.standardBps,
          fee?.netPaisa ?? 0,
          lineTotalPaisa,
          item.returnEligible,
          item.madeToOrder,
          now,
          promoAllocations[item.id] ?? 0,promoAllocations[item.id] ?? 0,promo ? 0 : platformDiscountPaisa,
        ),
    );
    if (fee) {
      termsSnapshot.marketplaceFees.push({ orderItemId, ...fee });
    }
    if (managed) {
      const accepted = acceptedManaged.get(item.sellerId);
      const snapshot = buildManagedCommercialSnapshot({
        sellerId: item.sellerId,
        commercialModel: item.commercialModel!,
        legalSellerReference: accepted?.snapshot.companyAccount.entityReference ?? item.legalSellerReference!,
        invoiceIssuerReference: accepted?.snapshot.companyAccount.entityReference ?? item.invoiceIssuerReference!,
        payoutBeneficiaryReference: item.payoutBeneficiaryReference!,
        agreementVersion: accepted?.agreementVersion ?? item.managedAgreementVersion!,
        agreementLanguage: accepted?.language ?? item.managedAgreementLanguage!,
        termsSettingVersionId: item.commercialModel === 'managed_sale_linked_percentage_v1'
          ? accepted!.settingVersionIds.retention
          : managedModel!.versionId,
        deliveryHoldDays: managedHold!.value,
        holdSettingVersionId: managedHold!.versionId,
        productValuePaisa: lineTotalPaisa,
        makerFundedDiscountPaisa: sellerDiscountPaisa,
        platformFundedDiscountPaisa: platformDiscountPaisa,
        platformRetentionBps: item.commercialModel === 'managed_sale_linked_percentage_v1'
          ? accepted!.retentionBps
          : 0,
        acceptedManagedDetailId: accepted?.detailId ?? null,
        makerName: item.publicMakerName,
        storeName: accepted?.snapshot.companyAccount.storeName ?? null,
        legalSellerName: accepted?.snapshot.company.legalName ?? null,
      });
      const snapshotId = crypto.randomUUID();
      statements.push(
        database.prepare(`INSERT INTO managed_commercial_snapshots(
          id,order_item_id,seller_id,participation_route,commercial_model,
          legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,
          agreement_version,agreement_language,terms_setting_version_id,delivery_hold_days,
          hold_setting_version_id,product_value_paisa,
          maker_funded_discount_paisa,platform_funded_discount_paisa,eligible_base_paisa,
          platform_retention_bps,platform_retained_paisa,maker_entitlement_paisa,
          agreed_supplier_amount_paisa,simulation_label,created_at,accepted_managed_detail_id,
          maker_name_snapshot,company_store_name_snapshot,company_legal_name_snapshot
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          snapshotId, orderItemId, snapshot.sellerId, snapshot.participationRoute,
          snapshot.commercialModel, snapshot.legalSellerReference, snapshot.invoiceIssuerReference,
          snapshot.payoutBeneficiaryReference, snapshot.agreementVersion, snapshot.agreementLanguage,
          snapshot.termsSettingVersionId, snapshot.deliveryHoldDays, snapshot.holdSettingVersionId,
          snapshot.productValuePaisa, snapshot.makerFundedDiscountPaisa,
          snapshot.platformFundedDiscountPaisa, snapshot.eligibleBasePaisa, snapshot.platformRetentionBps,
          snapshot.platformRetainedPaisa, snapshot.makerEntitlementPaisa,
          snapshot.agreedSupplierAmountPaisa, snapshot.simulationLabel, now, snapshot.acceptedManagedDetailId,
          snapshot.makerName, snapshot.storeName, snapshot.legalSellerName,
        ),
      );
      if (snapshot.commercialModel === 'managed_sale_linked_percentage_v1') statements.push(
        database.prepare(`INSERT INTO managed_entitlements(
          id,snapshot_id,seller_id,status,calculated_paisa,earned_at,hold_until,eligible_at,
          paid_at,dispute_hold_reason,dispute_review_at,version,created_at,updated_at
        ) VALUES (?,?,?,'calculated',?,NULL,NULL,NULL,NULL,NULL,NULL,1,?,?)`).bind(
          crypto.randomUUID(), snapshotId, item.sellerId, snapshot.makerEntitlementPaisa, now, now,
        ),
      );
    }
  }

  if(promo && customerId) statements.push(...await preparePromoConsumption(database,{userId:customerId,orderId:id,requestId:input.idempotencyKey,quote:promo,now,payloadDigest:intentDigest,response:{...checkoutResult}}));

  statements.push(
    ...commissionCheckoutGuards(database, Object.values(sellerCommissionTerms)),
    database
      .prepare(
        `INSERT INTO order_policy_acceptances (
          id, order_id, policy_version, terms_snapshot_json, acceptance_method,
          actor_user_id, request_id, accepted_at
        ) VALUES (?, ?, ?, ?, 'affirmative_checkbox', ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        CUSTOMER_POLICY_VERSION,
        JSON.stringify(termsSnapshot),
        customerId,
        `${input.idempotencyKey}:policy-acceptance`,
        now,
      ),
    database
      .prepare(
        `INSERT INTO order_documents (
          id, order_id, kind, document_number, snapshot_json, status,
          request_id, issued_at, voided_at
        ) VALUES (?, ?, 'order_statement', ?, ?, 'issued', ?, ?, NULL)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        `STMT-${number}`,
        JSON.stringify(statementSnapshot),
        `${input.idempotencyKey}:order-statement`,
        now,
      ),
  );

  if (customerId) {
    for (const channel of ['in_app', 'email', 'sms'] as const) {
      statements.push(
        database
          .prepare(
            `INSERT INTO notification_messages (
            id, recipient_user_id, audience_role, channel, template_key, subject_en, subject_ne,
            body_en, body_ne, related_type, related_id, status, provider_reference,
            failure_reason, request_id, created_at, sent_at, read_at
          ) VALUES (?, ?, 'customer', ?, 'order.received', 'Order received', 'अर्डर प्राप्त भयो', ?, ?,
            'order', ?, 'queued', NULL, NULL, ?, ?, NULL, NULL)`,
          )
          .bind(
            crypto.randomUUID(),
            customerId,
            channel,
            `Your cash-on-delivery order ${number} has been received. Check order details for confirmation and delivery progress.`,
            `तपाईंको क्यास अन डेलिभरी अर्डर ${number} प्राप्त भएको छ। पुष्टि र डेलिभरीको प्रगतिको लागि अर्डर विवरण हेर्नुहोस्।`,
            id,
            `${input.idempotencyKey}:customer:${channel}`,
            now,
          ),
      );
    }
  }

  for (const sellerId of new Set(items.map((item) => item.sellerId))) {
    statements.push(
      database
        .prepare(
          `INSERT INTO notification_messages (
          id, recipient_user_id, audience_role, channel, template_key, subject_en, subject_ne,
          body_en, body_ne, related_type, related_id, status, provider_reference,
          failure_reason, request_id, created_at, sent_at, read_at
        ) SELECT ?, seller_profiles.user_id, 'seller', 'in_app', 'seller.order.received', 'New order received',
          'नयाँ अर्डर प्राप्त भयो', ?, ?, 'order', ?, 'queued', NULL, NULL, ?, ?, NULL, NULL
          FROM seller_profiles WHERE seller_profiles.id = ?`,
        )
        .bind(
          crypto.randomUUID(),
          `Order ${number} includes products from your shop.`,
          `अर्डर ${number} मा तपाईंको पसलका उत्पादनहरू छन्।`,
          id,
          `${input.idempotencyKey}:seller:${sellerId}`,
          now,
          sellerId,
        ),
    );
  }

  statements.push(
    database
      .prepare(
        `INSERT INTO payments (
          id, order_id, provider, provider_reference, method, status,
          amount_paisa, currency, idempotency_key, failure_code, created_at, updated_at
        ) VALUES (?, ?, 'manual_cod', ?, 'cod', 'pending', ?, 'NPR', ?, NULL, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        cartReference,
        grandTotalPaisa,
        input.idempotencyKey,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO shipments (
          id, order_id, provider, provider_shipment_id, tracking_code, status,
          payment_mode, cod_amount_paisa, delivery_charge_paisa,
          estimated_min_days, estimated_max_days, created_at, updated_at
        ) VALUES (?, ?, 'nepal_can_move_manual', NULL, NULL, 'pending', 'cod', ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        grandTotalPaisa,
        delivery.chargePaisa,
        delivery.estimatedMinDays,
        delivery.estimatedMaxDays,
        now,
        now,
      ),
    database
      .prepare(
        `INSERT INTO order_status_events (id, order_id, from_status, to_status, note, actor_id, created_at)
         VALUES (?, ?, NULL, 'confirmed', 'Cash-on-delivery order placed', NULL, ?)`,
      )
      .bind(crypto.randomUUID(), id, now),
    database.prepare(`DELETE FROM cart_items WHERE cart_id = ?`).bind(cartId),
    database
      .prepare(
        `INSERT INTO audit_logs (
          id, actor_id, action, subject_type, subject_id, reason,
          previous_json, next_json, request_id, ip_hash, created_at
        ) VALUES (?, ?, 'order.placed', 'order', ?, ?, NULL, ?, ?, NULL, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        customerId,
        id,
        customerId
          ? 'Customer placed a cash-on-delivery order'
          : 'Guest placed a cash-on-delivery order',
        JSON.stringify({
          orderNumber: number,
          status: 'confirmed',
          paymentMode: 'cod',
          checkoutIntentDigest: intentDigest,
          checkoutResult,
        }),
        input.idempotencyKey,
        now,
      ),
  );

  if (form) statements.push(buildFormAnswerInsert(database, {
    formId: 'commerce.checkout', requestId: input.idempotencyKey,
    versionId: form.versionId, subjectType: 'order', subjectId: id,
    actorId: customerId, answers: form.answers, now,
  }));

  try {
    await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('operation_transaction_guards') ||
      message.includes('valid') ||
      message.includes('promo_') ||
      message.includes('product_unavailable') ||
      message.includes('balance_paisa') ||
      message.includes('referral_first_order_only') ||
      message.includes('UNIQUE constraint')
    ) {
      throw new CheckoutConflictError(
        'Availability or delivery rates changed while placing your order. Reload checkout to review the current total.',
      );
    }
    throw error;
  }
  return checkoutResult;
}

export interface OrderReceiptItem extends Partial<PublicSellingIdentity> {
  id: string;
  productName: string;
  sellerName: string;
  unitPricePaisa: number;
  quantity: number;
  lineTotalPaisa: number;
  returnEligible: boolean;
  fulfillmentStatus: string;
}

export interface OrderReceipt {
  customerServiceFee: OrderCustomerFeeView;
  buyerPlatformFeePaisa: number;
  refundedPlatformServiceFeePaisa: number;
  originalBuyerPlatformFeePaisa: number;
  walletCreditPaisa: number;
  referralDiscountPaisa: number;
  promoDiscountPaisa: number;
  originalPromoDiscountPaisa: number;
  refundedPromoDiscountPaisa: number;
  originalReferralDiscountPaisa: number;
  refundedReferralDiscountPaisa: number;
  originalWalletCreditPaisa: number;
  refundedWalletCreditPaisa: number;
  originalGrandTotalPaisa: number;
  promo?: OrderDocumentSnapshot['promo'];
  orderNumber: string;
  customerEmail: string;
  customerPhone: string;
  deliveryFor: 'self' | 'other';
  recipientEmail: string | null;
  sourceAddressId: string | null;
  addressSavedForFuture: number;
  status: string;
  paymentMode: string;
  paymentStatus: string;
  shipmentStatus: string;
  trackingCode: string | null;
  address: CheckoutInput['address'];
  itemSubtotalPaisa: number;
  deliveryChargePaisa: number;
  grandTotalPaisa: number;
  placedAt: number;
  deliveredAt: number | null;
  locale: 'en-NP' | 'ne-NP';
  estimatedMinDays: number;
  estimatedMaxDays: number;
  policyVersion: string;
  termsAcceptedAt: number | null;
  documents: readonly OrderDocumentRow[];
  items: readonly OrderReceiptItem[];
  deliveryPricing:
    | (Pick<DeliveryPricingSnapshot, 'pricingPolicy' | 'baseChargePaisa'> & {
        originalStoreCount: number;
        currentStoreCount: number;
      })
    | null;
}

export interface OrderDocumentRow {
  formatVersion?: string | null;
  id: string;
  kind: 'order_statement' | 'payment_receipt' | 'simulated_invoice';
  documentNumber: string;
  status: 'issued' | 'void';
  issuedAt: number;
}

export async function getOrderReceipt(
  database: D1Database,
  orderNumberValue: string,
  receiptTokenHash: string | null,
  customerId: string | null = null,
): Promise<OrderReceipt | null> {
  const order = await database
    .prepare(
      `SELECT COALESCE(orders.current_wallet_paisa,orders.wallet_credit_paisa) AS walletCreditPaisa, orders.current_referral_discount_paisa AS referralDiscountPaisa,
        orders.buyer_platform_fee_paisa AS originalBuyerPlatformFeePaisa,
        ${currentPlatformServiceFeeSql()} AS buyerPlatformFeePaisa,
        ${lawfulServiceFeeRefundTotalSql()} AS refundedPlatformServiceFeePaisa,
        CASE WHEN orders.current_discount_paisa IS NULL THEN orders.promo_discount_paisa ELSE orders.current_promo_discount_paisa END AS promoDiscountPaisa,
        orders.promo_discount_paisa AS originalPromoDiscountPaisa,orders.refunded_promo_discount_paisa AS refundedPromoDiscountPaisa,
        orders.referral_discount_paisa AS originalReferralDiscountPaisa,orders.wallet_credit_paisa AS originalWalletCreditPaisa,orders.grand_total_paisa AS originalGrandTotalPaisa,
        (SELECT COALESCE(SUM(r.wallet_credit_paisa),0) FROM refunds r WHERE r.order_id=orders.id AND r.status='paid') AS refundedWalletCreditPaisa,
        (SELECT COALESCE(SUM(r.referral_discount_paisa),0) FROM refunds r WHERE r.order_id=orders.id AND r.status='paid') AS refundedReferralDiscountPaisa,
        orders.promo_campaign_id AS promoCampaignId,orders.promo_revision AS promoRevision,orders.promo_code AS promoCode,orders.promo_label AS promoLabel,
        orders.id AS orderId, orders.order_number AS orderNumber, orders.customer_email AS customerEmail,
        orders.customer_phone AS customerPhone, orders.delivery_for AS deliveryFor,
        orders.recipient_email AS recipientEmail, orders.source_address_id AS sourceAddressId,
        orders.address_saved_for_future AS addressSavedForFuture,
        orders.status, orders.payment_mode AS paymentMode,
        orders.payment_status AS paymentStatus, orders.shipping_address_json AS addressJson,
        COALESCE(orders.current_subtotal_paisa,orders.item_subtotal_paisa) AS itemSubtotalPaisa,
        COALESCE(orders.current_delivery_paisa,orders.delivery_charge_paisa) AS deliveryChargePaisa,
        ${payableOrderTotalSql()} AS grandTotalPaisa, orders.placed_at AS placedAt,
        orders.delivered_at AS deliveredAt, orders.locale, orders.delivery_rate_snapshot_json AS deliveryRateSnapshotJson,
        (SELECT COUNT(DISTINCT original_items.seller_id) FROM order_items original_items WHERE original_items.order_id=orders.id) AS originalStoreCount,
        (SELECT COUNT(DISTINCT current_items.seller_id) FROM order_items current_items WHERE current_items.order_id=orders.id AND current_items.fulfillment_status<>'cancelled') AS currentStoreCount,
        orders.policy_version AS policyVersion,
        order_policy_acceptances.accepted_at AS termsAcceptedAt,
        shipments.status AS shipmentStatus, ${publicTrackingReferenceSql('orders.id', 'shipments.tracking_code')} AS trackingCode,
        shipments.estimated_min_days AS estimatedMinDays,
        shipments.estimated_max_days AS estimatedMaxDays
       FROM orders INNER JOIN shipments ON shipments.order_id = orders.id
       LEFT JOIN order_policy_acceptances ON order_policy_acceptances.order_id = orders.id
       WHERE orders.order_number = ?
         AND ((? IS NOT NULL AND orders.receipt_token_hash = ?) OR (? IS NOT NULL AND orders.customer_id = ?))
       LIMIT 1`,
    )
    .bind(
      orderNumberValue,
      receiptTokenHash,
      receiptTokenHash,
      customerId,
      customerId,
    )
    .first<
      Omit<
        OrderReceipt,
        'address' | 'items' | 'documents' | 'deliveryPricing' | 'customerServiceFee'
      > & {
        orderId: string;
        addressJson: string;
        deliveryRateSnapshotJson: string | null;
        originalStoreCount: number;
        currentStoreCount: number;
        promoCampaignId: string | null;
        promoRevision: number | null;
        promoCode: string | null;
        promoLabel: string | null;
      }
    >();
  if (!order) return null;
  const [itemResult, documentResult, customerFees] = await Promise.all([
    database
      .prepare(
        `SELECT order_items.id, order_items.product_name_snapshot AS productName,
        order_items.seller_name_snapshot AS sellerName,
        (SELECT maker_name_snapshot FROM managed_commercial_snapshots WHERE order_item_id=order_items.id) AS makerName,
        (SELECT company_store_name_snapshot FROM managed_commercial_snapshots WHERE order_item_id=order_items.id) AS storeName,
        (SELECT company_legal_name_snapshot FROM managed_commercial_snapshots WHERE order_item_id=order_items.id) AS legalSellerName,
        order_items.unit_price_paisa AS unitPricePaisa, order_items.quantity,
        order_items.line_total_paisa AS lineTotalPaisa,
        order_items.return_eligible_snapshot AS returnEligible,
        order_items.fulfillment_status AS fulfillmentStatus
       FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
       WHERE orders.order_number = ? ORDER BY order_items.created_at ASC`,
      )
      .bind(orderNumberValue)
      .all<OrderReceiptItem>(),
    database
      .prepare(
        `SELECT order_documents.id, order_documents.kind,
        order_documents.document_number AS documentNumber,
        order_documents.status, order_documents.issued_at AS issuedAt,
        json_extract(order_documents.snapshot_json,'$.billing.version') AS formatVersion
       FROM order_documents INNER JOIN orders ON orders.id = order_documents.order_id
       WHERE orders.order_number = ?
       UNION ALL
       SELECT managed_invoice_groups.id,'simulated_invoice' AS kind,
        managed_invoice_groups.invoice_number AS documentNumber,
        managed_invoice_groups.status,managed_invoice_groups.issued_at AS issuedAt,NULL AS formatVersion
       FROM managed_invoice_groups INNER JOIN orders ON orders.id=managed_invoice_groups.order_id
       WHERE orders.order_number = ? AND NOT EXISTS(SELECT 1 FROM order_documents approved
         WHERE approved.order_id=orders.id AND json_extract(approved.snapshot_json,'$.billing.version')='approved-2026-10-21') ORDER BY issuedAt ASC`,
      )
      .bind(orderNumberValue,orderNumberValue)
      .all<OrderDocumentRow>(),
    readOrderCustomerServiceFees(database, [order.orderId]),
  ]);
  const pricing = readDeliveryPricingSnapshot(
    order.deliveryRateSnapshotJson,
    order.deliveryChargePaisa,
  );
  const {
    orderId,
    addressJson,
    deliveryRateSnapshotJson: _deliveryRateSnapshotJson,
    originalStoreCount,
    currentStoreCount,
    promoCampaignId,promoRevision,promoCode,promoLabel,
    ...safeOrder
  } = order;
  return {
    ...safeOrder,
    customerServiceFee: customerFees.get(orderId)!,
    ...(promoCampaignId && promoRevision && promoCode && promoLabel ? {promo:{campaignId:promoCampaignId,revision:promoRevision,code:promoCode,label:promoLabel}} : {}),
    address: JSON.parse(addressJson) as CheckoutInput['address'],
    items: itemResult.results,
    documents: documentResult.results,
    deliveryPricing:
      pricing.kind === 'current' &&
      pricing.snapshot.storeCount === originalStoreCount
        ? {
            pricingPolicy: pricing.snapshot.pricingPolicy,
            baseChargePaisa: pricing.snapshot.baseChargePaisa,
            originalStoreCount: pricing.snapshot.storeCount,
            currentStoreCount,
          }
        : null,
  };
}

export async function getOrderDocument(
  database: D1Database,
  orderNumberValue: string,
  documentId: string,
  receiptTokenHash: string | null,
  customerId: string | null = null,
): Promise<(OrderDocumentRow & { snapshot: OrderDocumentSnapshot }) | null> {
  const row = await database
    .prepare(
      `SELECT order_documents.id, order_documents.kind,
      order_documents.document_number AS documentNumber,
      order_documents.status, order_documents.issued_at AS issuedAt,
      order_documents.snapshot_json AS snapshotJson
     FROM order_documents INNER JOIN orders ON orders.id = order_documents.order_id
     WHERE orders.order_number = ? AND order_documents.id = ?
       AND ((? IS NOT NULL AND orders.receipt_token_hash = ?)
         OR (? IS NOT NULL AND orders.customer_id = ?))
     LIMIT 1`,
    )
    .bind(
      orderNumberValue,
      documentId,
      receiptTokenHash,
      receiptTokenHash,
      customerId,
      customerId,
    )
    .first<OrderDocumentRow & { snapshotJson: string }>();
  if (!row) return null;
  return {
    ...row,
    snapshot: JSON.parse(row.snapshotJson) as OrderDocumentSnapshot,
  };
}

export interface OperationsOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  customerEmail: string;
  customerPhone: string;
  grandTotalPaisa: number;
  paymentMode: string;
  placedAt: number;
  itemCount: number;
}

export async function listOrdersForOperations(
  database: D1Database,
  limit = 100,
  filters: AdminQueueFilters = {},
  page = 1,
): Promise<readonly OperationsOrderRow[]> {
  const where = orderQueueWhere(filters);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Choose a valid order page and page size.');
  const result = await database
    .prepare(
      `SELECT orders.id, orders.order_number AS orderNumber, orders.status,
        orders.customer_email AS customerEmail, orders.customer_phone AS customerPhone,
        ${payableOrderTotalSql()} AS grandTotalPaisa, orders.payment_mode AS paymentMode,
        orders.placed_at AS placedAt, SUM(order_items.quantity) AS itemCount
       FROM orders INNER JOIN order_items ON order_items.order_id = orders.id
       ${where.sql}
       GROUP BY orders.id ORDER BY orders.created_at DESC, orders.id LIMIT ? OFFSET ?`,
    )
    .bind(...where.values, limit, (page - 1) * limit)
    .all<OperationsOrderRow>();
  return result.results;
}

export async function countOrdersForOperations(database:D1Database,filters:AdminQueueFilters={}) {
 const where=orderQueueWhere(filters);
 const row=await database.prepare('SELECT COUNT(*) AS total FROM orders '+(where.sql ? where.sql+' AND ' : 'WHERE ')+'EXISTS(SELECT 1 FROM order_items WHERE order_items.order_id=orders.id)').bind(...where.values).first<{total:number}>();
 return Number(row?.total??0);
}

export interface SellerOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  sellerStatus: string;
  placedAt: number;
  itemCount: number;
  sellerSubtotalPaisa: number;
  sellerCommissionPaisa: number;
}

export async function listOrdersForSeller(
  database: D1Database,
  sellerId: string,
  limit = 100,
): Promise<readonly SellerOrderRow[]> {
  const result = await database
    .prepare(
      `SELECT orders.id, orders.order_number AS orderNumber, orders.status,
        CASE WHEN COUNT(DISTINCT order_items.fulfillment_status) = 1
          THEN MIN(order_items.fulfillment_status) ELSE 'mixed' END AS sellerStatus,
        orders.placed_at AS placedAt, SUM(order_items.quantity) AS itemCount,
        SUM(order_items.line_total_paisa) AS sellerSubtotalPaisa,
        SUM(order_items.commission_paisa) AS sellerCommissionPaisa
       FROM orders INNER JOIN order_items ON order_items.order_id = orders.id
       WHERE order_items.seller_id = ?
       GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT ?`,
    )
    .bind(sellerId, limit)
    .all<SellerOrderRow>();
  return result.results;
}
