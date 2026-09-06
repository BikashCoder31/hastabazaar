import {
  getManualDeliveryQuote,
  type CheckoutInput,
} from '@/lib/checkout/validation';
import {
  phaseOneMarketplacePolicy,
  calculateSellerCommissionPaisa,
} from '@/lib/marketplace/policy';

import { getCart, getCartId } from './cart';

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
}

export interface OrderDocumentSnapshot {
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

function checkoutTermsSnapshot(): Record<string, unknown> {
  const policy = phaseOneMarketplacePolicy;
  return {
    policyVersion: policy.version,
    effectiveFrom: policy.effectiveFrom,
    language: 'English',
    payment: 'Cash on delivery; no online payment is collected.',
    cancellation: {
      freeBeforePacking: policy.value.cancellations.freeBeforePacking,
      afterDispatchHandledAsReturn:
        policy.value.cancellations.afterDispatchHandledAsReturn,
    },
    returns: policy.value.returns,
    privacy:
      'Order and contact data is used to fulfil the order, provide support, prevent abuse, and meet approved retention duties.',
    grievancePath:
      'Use the secure order page or Help page to contact Hastabazaar.',
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
      `SELECT orders.order_number AS orderNumber, orders.grand_total_paisa AS grandTotalPaisa,
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
        seller_profiles.trading_name AS tradingName, products.name_en AS nameEn,
        products.sku, products.price_paisa AS pricePaisa, cart_items.quantity,
        products.inventory_quantity AS inventoryQuantity, products.status,
        products.return_eligible AS returnEligible
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

  const delivery = getManualDeliveryQuote(input.address.district);
  const itemSubtotalPaisa = items.reduce(
    (total, item) => total + item.pricePaisa * item.quantity,
    0,
  );
  const buyerFeePaisa =
    phaseOneMarketplacePolicy.value.fees.buyerPlatformFeePaisa;
  const grandTotalPaisa =
    itemSubtotalPaisa + delivery.chargePaisa + buyerFeePaisa;
  const id = crypto.randomUUID();
  const number = orderNumber(now);
  const termsSnapshot = checkoutTermsSnapshot();
  const statementSnapshot: OrderDocumentSnapshot = {
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
    database
      .prepare(
        `INSERT INTO orders (
          id, order_number, receipt_token_hash, customer_id, customer_email,
          customer_phone, status, locale, currency, policy_version,
          return_policy_snapshot_json,
          shipping_address_json, item_subtotal_paisa, seller_discount_paisa,
          delivery_charge_paisa, buyer_platform_fee_paisa, tax_total_paisa,
          grand_total_paisa, payment_mode, payment_status, placed_at,
          delivered_at, cancelled_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'confirmed', ?, 'NPR', ?, ?, ?, ?, 0, ?, ?, 0, ?, 'cod', 'pending', ?, NULL, NULL, ?, ?)`,
      )
      .bind(
        id,
        number,
        receiptTokenHash,
        customerId,
        input.customerEmail,
        input.customerPhone,
        input.locale,
        phaseOneMarketplacePolicy.version,
        JSON.stringify(phaseOneMarketplacePolicy.value.returns),
        JSON.stringify(input.address),
        itemSubtotalPaisa,
        delivery.chargePaisa,
        buyerFeePaisa,
        grandTotalPaisa,
        now,
        now,
        now,
      ),
  ];

  for (const item of items) {
    const lineTotalPaisa = item.pricePaisa * item.quantity;
    statements.push(
      database
        .prepare(
          `INSERT INTO order_items (
            id, order_id, product_id, seller_id, seller_name_snapshot,
            product_name_snapshot, sku_snapshot, unit_price_paisa, quantity,
            seller_discount_paisa, commission_bps, commission_paisa,
            tax_paisa, line_total_paisa, return_eligible_snapshot, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, 0, ?, ?, ?)`,
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
          phaseOneMarketplacePolicy.value.fees.sellerCommissionBps,
          calculateSellerCommissionPaisa(lineTotalPaisa),
          lineTotalPaisa,
          item.returnEligible,
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
        phaseOneMarketplacePolicy.version,
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
      message.includes('product_unavailable') ||
      message.includes('UNIQUE constraint')
    ) {
      throw new CheckoutConflictError(
        'Availability changed while the order was being placed. Review your cart and try again.',
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
}

export interface OrderReceipt {
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
      `SELECT orders.order_number AS orderNumber, orders.customer_email AS customerEmail,
        orders.customer_phone AS customerPhone, orders.status, orders.payment_mode AS paymentMode,
        orders.payment_status AS paymentStatus, orders.shipping_address_json AS addressJson,
        orders.item_subtotal_paisa AS itemSubtotalPaisa,
        orders.delivery_charge_paisa AS deliveryChargePaisa,
        orders.grand_total_paisa AS grandTotalPaisa, orders.placed_at AS placedAt,
        orders.delivered_at AS deliveredAt, orders.locale,
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
      Omit<OrderReceipt, 'address' | 'items' | 'documents'> & {
        addressJson: string;
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
        order_items.return_eligible_snapshot AS returnEligible
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
  return {
    ...order,
    address: JSON.parse(order.addressJson) as CheckoutInput['address'],
    items: itemResult.results,
    documents: documentResult.results,
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
        orders.grand_total_paisa AS grandTotalPaisa, orders.payment_mode AS paymentMode,
        orders.placed_at AS placedAt, SUM(order_items.quantity) AS itemCount
       FROM orders INNER JOIN order_items ON order_items.order_id = orders.id
       GROUP BY orders.id ORDER BY orders.created_at DESC LIMIT ?`,
    )
    .bind(limit)
    .all<OperationsOrderRow>();
  return result.results;
}

export interface SellerOrderRow extends OperationsOrderRow {
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
        orders.customer_email AS customerEmail, orders.customer_phone AS customerPhone,
        orders.grand_total_paisa AS grandTotalPaisa, orders.payment_mode AS paymentMode,
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
