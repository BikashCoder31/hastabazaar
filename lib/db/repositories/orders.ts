import { getDeliveryRates, rateVersionGuard } from './delivery-rates';
import { getMarketplaceCommissionBps } from './marketplace-settings';
import { publicProductEligibility } from '@/lib/products/eligibility';
import {
  getDeliveryEstimate,
  type CheckoutInput,
} from '@/lib/checkout/validation';
import {
  phaseOneMarketplacePolicy,
  allocatePlatformDiscountPaisa,
  calculateCommissionBasePaisa,
  calculateSellerCommissionPaisa,
  COMMISSION_RULE_VERSION,
} from '@/lib/marketplace/policy';
import {
  CUSTOMER_POLICY_VERSION,
  SELLER_AGREEMENT_VERSION,
  publicLegalPolicies,
} from '@/lib/content/legal-policies';

import { getCart, getCartId } from './cart';
import { quoteOrderCredit } from './wallet';
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
  id: string;
  productId: string;
  sellerId: string;
  tradingName: string;
  nameEn: string;
  sku: string;
  pricePaisa: number;
  quantity: number;
  inventoryQuantity: number;
  status: string;
  returnEligible: number;
  madeToOrder: number;
  preparationDays: number;
  sellerAgreementVersion: string | null;
}

export interface OrderDocumentSnapshot {
  walletCreditPaisa?: number;
  referralDiscountPaisa?: number;
  documentTitle: string;
  taxDocument: false;
  orderNumber: string;
  issuedAt: number;
  currency: 'NPR';
  paymentMethod: 'Cash on delivery';
  paymentStatus: 'pending' | 'paid';
  items: readonly {
    productName: string;
    sellerName: string;
    sku: string;
    unitPricePaisa: number;
    quantity: number;
    lineTotalPaisa: number;
  }[];
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

export async function createCodOrder(
  database: D1Database,
  tokenHash: string,
  receiptTokenHash: string,
  input: CheckoutInput,
  now: number,
  customerId: string | null = null,
): Promise<CheckoutResult> {
  const cartReference = `${tokenHash}:${input.idempotencyKey}`;
  const previous = await database
    .prepare(
      `SELECT orders.order_number AS orderNumber, COALESCE(orders.current_total_paisa,orders.grand_total_paisa) AS grandTotalPaisa,
        shipments.estimated_min_days AS estimatedMinDays,
        shipments.estimated_max_days AS estimatedMaxDays
       FROM payments INNER JOIN orders ON orders.id = payments.order_id
       INNER JOIN shipments ON shipments.order_id = orders.id
       WHERE payments.idempotency_key = ? AND payments.provider_reference = ? LIMIT 1`,
    )
    .bind(input.idempotencyKey, cartReference)
    .first<CheckoutResult>();
  if (previous) return previous;

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
        seller_profiles.seller_agreement_version AS sellerAgreementVersion,
        products.name_en AS nameEn,
        products.sku, products.price_paisa AS pricePaisa, cart_items.quantity,
        products.inventory_quantity AS inventoryQuantity, CASE WHEN ${publicProductEligibility()} THEN 'published' ELSE 'archived' END AS status,
        products.return_eligible AS returnEligible, products.made_to_order AS madeToOrder,
        products.preparation_days AS preparationDays
       FROM cart_items
       INNER JOIN products ON products.id = cart_items.product_id
       INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
       WHERE cart_items.cart_id = ? ORDER BY cart_items.created_at ASC`,
    )
    .bind(cartId)
    .all<CheckoutCartItem>();
  const items = itemResult.results;
  if (items.length === 0)
    throw new CheckoutConflictError('Your cart is empty.');
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
  if (
    items.some(
      (item) => item.sellerAgreementVersion !== SELLER_AGREEMENT_VERSION,
    )
  ) {
    throw new CheckoutConflictError(
      'A seller must accept the current marketplace agreement before receiving a new order.',
    );
  }

  const rates = await getDeliveryRates(database);
  const sellerCommissionBps = await getMarketplaceCommissionBps(database);
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
  const buyerFeePaisa =
    phaseOneMarketplacePolicy.value.fees.buyerPlatformFeePaisa;
  const credit = await quoteOrderCredit(database, {
    userId: customerId,
    subtotalPaisa: itemSubtotalPaisa,
    useWallet: input.useWallet,
    referralCode: input.referralCode,
    phone: input.customerPhone,
    now,
  });
  const grandTotalPaisa =
    itemSubtotalPaisa +
    delivery.chargePaisa +
    buyerFeePaisa -
    credit.walletPaisa -
    credit.discountPaisa;
  const id = crypto.randomUUID();
  const number = orderNumber(now);
  const termsSnapshot = { ...checkoutTermsSnapshot(sellerCommissionBps), deliveryRate: delivery };
  const platformDiscounts = allocatePlatformDiscountPaisa(
    items.map((item) => ({
      key: item.id,
      productValuePaisa: item.pricePaisa * item.quantity,
    })),
    credit.discountPaisa,
  );
  const statementSnapshot: OrderDocumentSnapshot = {
    walletCreditPaisa: credit.walletPaisa,
    referralDiscountPaisa: credit.discountPaisa,
    documentTitle: 'Order statement',
    taxDocument: false,
    orderNumber: number,
    issuedAt: now,
    currency: 'NPR',
    paymentMethod: 'Cash on delivery',
    paymentStatus: 'pending',
    items: items.map((item) => ({
      productName: item.nameEn,
      sellerName: item.tradingName,
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
  const statements: D1PreparedStatement[] = [
    database.prepare(
      "UPDATE delivery_rate_current SET version_id=version_id WHERE id='default'",
    ),
    ...rateVersionGuard(database, rates.version),
    database
      .prepare(
        `INSERT INTO orders (
          id, order_number, receipt_token_hash, customer_id, customer_email,
          customer_phone, status, locale, currency, policy_version,
          return_policy_snapshot_json,
          shipping_address_json, item_subtotal_paisa, seller_discount_paisa,
          delivery_charge_paisa, buyer_platform_fee_paisa, tax_total_paisa,
          grand_total_paisa, payment_mode, payment_status, placed_at,
          delivered_at, cancelled_at, created_at, updated_at, wallet_credit_paisa, referral_discount_paisa
        ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, 'NPR', ?, ?, ?, ?, 0, ?, ?, 0, ?, 'cod', 'pending', ?, NULL, NULL, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        number,
        receiptTokenHash,
        customerId,
        input.customerEmail,
        input.customerPhone,
        input.locale,
        CUSTOMER_POLICY_VERSION,
        JSON.stringify(phaseOneMarketplacePolicy.value.returns),
        JSON.stringify(input.address),
        itemSubtotalPaisa,
        delivery.chargePaisa,
        buyerFeePaisa,
        grandTotalPaisa,
        now,
        now,
        now,
        credit.walletPaisa,
        credit.discountPaisa,
      ),
  ];

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
    const lineTotalPaisa = item.pricePaisa * item.quantity;
    const sellerDiscountPaisa = 0;
    const platformDiscountPaisa = platformDiscounts.get(item.id) ?? 0;
    const commissionBasePaisa = calculateCommissionBasePaisa({
      productValuePaisa: lineTotalPaisa,
      sellerFundedDiscountPaisa: sellerDiscountPaisa,
      platformFundedDiscountPaisa: platformDiscountPaisa,
    });
    statements.push(
      database
        .prepare(
          `INSERT INTO order_items (
            id, order_id, product_id, seller_id, seller_name_snapshot,
            product_name_snapshot, sku_snapshot, unit_price_paisa, quantity,
            seller_discount_paisa, platform_discount_paisa,
            commission_base_paisa, commission_rule_version,
            seller_agreement_version, commission_bps, commission_paisa,
            tax_paisa, line_total_paisa, return_eligible_snapshot, made_to_order_snapshot, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          id,
          item.productId,
          item.sellerId,
          item.tradingName,
          item.nameEn,
          item.sku,
          item.pricePaisa,
          item.quantity,
          sellerDiscountPaisa,
          platformDiscountPaisa,
          commissionBasePaisa,
          COMMISSION_RULE_VERSION,
          item.sellerAgreementVersion,
          sellerCommissionBps,
          calculateSellerCommissionPaisa(
            commissionBasePaisa,
            sellerCommissionBps,
          ),
          lineTotalPaisa,
          item.returnEligible,
          item.madeToOrder,
          now,
        ),
    );
  }

  statements.push(
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
          ) VALUES (?, ?, 'customer', ?, 'order.confirmed', 'Order confirmed', 'अर्डर पुष्टि भयो', ?, ?,
            'order', ?, 'queued', NULL, NULL, ?, ?, NULL, NULL)`,
          )
          .bind(
            crypto.randomUUID(),
            customerId,
            channel,
            `Your cash-on-delivery order ${number} has been confirmed.`,
            `तपाईंको क्यास अन डेलिभरी अर्डर ${number} पुष्टि भएको छ।`,
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
        }),
        input.idempotencyKey,
        now,
      ),
  );

  try {
    await database.batch(statements);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (
      message.includes('operation_transaction_guards') ||
      message.includes('valid') ||
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
  return {
    orderNumber: number,
    grandTotalPaisa,
    estimatedMinDays: delivery.estimatedMinDays,
    estimatedMaxDays: delivery.estimatedMaxDays,
  };
}

export interface OrderReceiptItem {
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
  walletCreditPaisa: number;
  referralDiscountPaisa: number;
  orderNumber: string;
  customerEmail: string;
  customerPhone: string;
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
  id: string;
  kind: 'order_statement' | 'payment_receipt';
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
      `SELECT COALESCE(orders.current_wallet_paisa,orders.wallet_credit_paisa) AS walletCreditPaisa, COALESCE(orders.current_discount_paisa,orders.referral_discount_paisa) AS referralDiscountPaisa,
        orders.order_number AS orderNumber, orders.customer_email AS customerEmail,
        orders.customer_phone AS customerPhone, orders.status, orders.payment_mode AS paymentMode,
        orders.payment_status AS paymentStatus, orders.shipping_address_json AS addressJson,
        COALESCE(orders.current_subtotal_paisa,orders.item_subtotal_paisa) AS itemSubtotalPaisa,
        COALESCE(orders.current_delivery_paisa,orders.delivery_charge_paisa) AS deliveryChargePaisa,
        COALESCE(orders.current_total_paisa,orders.grand_total_paisa) AS grandTotalPaisa, orders.placed_at AS placedAt,
        orders.delivered_at AS deliveredAt, orders.locale, orders.delivery_rate_snapshot_json AS deliveryRateSnapshotJson,
        (SELECT COUNT(DISTINCT original_items.seller_id) FROM order_items original_items WHERE original_items.order_id=orders.id) AS originalStoreCount,
        (SELECT COUNT(DISTINCT current_items.seller_id) FROM order_items current_items WHERE current_items.order_id=orders.id AND current_items.fulfillment_status<>'cancelled') AS currentStoreCount,
        orders.policy_version AS policyVersion,
        order_policy_acceptances.accepted_at AS termsAcceptedAt,
        shipments.status AS shipmentStatus, shipments.tracking_code AS trackingCode,
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
        'address' | 'items' | 'documents' | 'deliveryPricing'
      > & {
        addressJson: string;
        deliveryRateSnapshotJson: string | null;
        originalStoreCount: number;
        currentStoreCount: number;
      }
    >();
  if (!order) return null;
  const [itemResult, documentResult] = await Promise.all([
    database
      .prepare(
        `SELECT order_items.id, order_items.product_name_snapshot AS productName,
        order_items.seller_name_snapshot AS sellerName,
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
        order_documents.status, order_documents.issued_at AS issuedAt
       FROM order_documents INNER JOIN orders ON orders.id = order_documents.order_id
       WHERE orders.order_number = ? ORDER BY order_documents.issued_at ASC`,
      )
      .bind(orderNumberValue)
      .all<OrderDocumentRow>(),
  ]);
  const pricing = readDeliveryPricingSnapshot(
    order.deliveryRateSnapshotJson,
    order.deliveryChargePaisa,
  );
  const {
    addressJson,
    deliveryRateSnapshotJson: _deliveryRateSnapshotJson,
    originalStoreCount,
    currentStoreCount,
    ...safeOrder
  } = order;
  return {
    ...safeOrder,
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
): Promise<readonly OperationsOrderRow[]> {
  const result = await database
    .prepare(
      `SELECT orders.id, orders.order_number AS orderNumber, orders.status,
        orders.customer_email AS customerEmail, orders.customer_phone AS customerPhone,
        COALESCE(orders.current_total_paisa,orders.grand_total_paisa) AS grandTotalPaisa, orders.payment_mode AS paymentMode,
        orders.placed_at AS placedAt, SUM(order_items.quantity) AS itemCount
       FROM orders INNER JOIN order_items ON order_items.order_id = orders.id
       GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<OperationsOrderRow>();
  return result.results;
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
