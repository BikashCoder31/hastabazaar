import assert from 'node:assert/strict';
import { SELLER_AGREEMENT_VERSION } from '../../lib/content/legal-policies';
import { getCheckoutPolicyContext } from '../../lib/checkout/policy-context';
import {
  getDeliveryEstimate,
  type CheckoutInput,
} from '../../lib/checkout/validation';
import { getDeliveryRates } from '../../lib/db/repositories/delivery-rates';
import { getPlatformServiceFee } from '../../lib/db/repositories/platform-service-fee';
import { quotePromo } from '../../lib/db/repositories/promo-codes';
import { quoteOrderCredit } from '../../lib/db/repositories/wallet';
import { verifySellerDocument } from '../../lib/sellers/document-review';

/** Opt-in prerequisites for fictional, nonpersistent promo fixtures only. */
export async function seedPromoCommissionAcceptance(
  db: D1Database,
  basisPoints: number,
) {
  const sellers = (
    await db
      .prepare(
        `SELECT s.id,s.user_id AS userId,u.email FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.status='approved'`,
      )
      .all<{ id: string; userId: string; email: string }>()
  ).results;
  assert.ok(
    sellers.length && sellers.every((s) => s.email.endsWith('@example.test')),
    'Only fictional promo sellers may receive fixture terms.',
  );
  assert.ok(
    Number.isSafeInteger(basisPoints) &&
      basisPoints >= 0 &&
      basisPoints <= 10000,
  );
  const versionId = 'promo-fixture-commission';
  if (!await db.prepare("SELECT 1 FROM business_setting_versions WHERE setting_key='platform_service_fee_policy'").first())
    await db.prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
      VALUES('promo-no-service-fee','platform_service_fee_policy',1,'{"enabled":false,"amountPaisa":1000}','published',1,'controlled',1,'Explicit historical promo totals','super',1,'promo-no-service-fee')`).run();
  const current = await db
    .prepare('SELECT value_json FROM business_setting_versions WHERE id=?')
    .bind(versionId)
    .first<{ value_json: string }>();
  if (!current)
    await db
      .prepare(`INSERT INTO business_setting_versions(id,setting_key,version,value_json,status,revision,change_control,effective_from,reason,created_by,created_at,last_request_id)
    VALUES (?,'independent_seller_commission_bps',1,?,'published',1,'controlled',1,'Explicit isolated historical promo terms','super',1,?)`)
      .bind(versionId, JSON.stringify(basisPoints), versionId)
      .run();
  else
    assert.equal(
      Number(current.value_json),
      basisPoints,
      'Never replace existing fixture terms.',
    );
  for (const seller of sellers) {
    await db
      .prepare(
        'UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=1 WHERE id=?',
      )
      .bind(SELLER_AGREEMENT_VERSION, seller.id)
      .run();
    if (
      await db
        .prepare(
          'SELECT 1 FROM seller_agreement_acceptance_history WHERE seller_id=? AND commission_setting_version_id=?',
        )
        .bind(seller.id, versionId)
        .first()
    )
      continue;
    await db
      .prepare(`INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at)
      VALUES (?,?,?,'en',?,?,?,?,1)`)
      .bind(
        'promo-accept-' + seller.id,
        seller.id,
        SELLER_AGREEMENT_VERSION,
        versionId,
        basisPoints,
        'promo-accept-' + seller.id,
        seller.userId,
      )
      .run();
  }
}

/** Review the fictional PAN seller used by the promo checkout suites. */
export async function seedVerifiedPromoCheckoutSeller(db: D1Database) {
  await db
    .prepare("UPDATE seller_profiles SET applicant_type='individual' WHERE id='seller'")
    .run();
  for (const kind of ['representative_identity', 'pan_certificate']) {
    const documentId = 'promo-checkout-' + kind;
    await db
      .prepare(
        "INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) " +
        "VALUES (?,'seller',?,?,'fictional.png','image/png',20,'pending',1)",
      )
      .bind(documentId, kind, 'private/fixture/' + documentId)
      .run();
    await verifySellerDocument(db, {
      sellerId: 'seller',
      documentId,
      actorId: 'super',
      commandId: 'verify-' + documentId,
      reason: 'Independently review fictional seller evidence for promo checkout.',
      now: 100,
      expectedReviewId: null,
    });
  }
}

/** Keep concurrent promo tests from competing over first-address auto-saving. */
export async function seedPromoDeliveryAddress(db: D1Database) {
  await db
    .prepare(`INSERT INTO addresses(id,user_id,label,recipient_name,phone,province,district,municipality,locality,is_default,created_at,updated_at)
    VALUES ('promo-address','customer','Fictional home','Fixture Buyer','9811111111','Bagmati','Kathmandu','Kathmandu','Fixture locality',1,1,1)`)
    .run();
}

/** Build the displayed snapshot once, BEFORE the tested mutation or replay.
 * It does not accept terms, spend money, save an address or refresh a replay.
 */
export async function withReviewedPromoQuote<T extends CheckoutInput>(
  db: D1Database,
  cartId: string,
  input: T,
  now = 100,
) {
  const lines = (
    await db
      .prepare(`SELECT ci.id,p.seller_id AS sellerId,p.price_paisa AS pricePaisa,ci.quantity,p.preparation_days AS preparationDays
    FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=? ORDER BY ci.id`)
      .bind(cartId)
      .all<{
        id: string;
        sellerId: string;
        pricePaisa: number;
        quantity: number;
        preparationDays: number;
      }>()
  ).results;
  assert.ok(
    lines.length,
    'Build the displayed quote while its fixture cart still exists.',
  );
  const rates = await getDeliveryRates(db);
  const serviceFee = await getPlatformServiceFee(db, now);
  const delivery = getDeliveryEstimate(
    input.address.district,
    lines.map((l) => l.preparationDays),
    rates,
    new Set(lines.map((l) => l.sellerId)).size,
  );
  assert.ok(delivery);
  const subtotal = lines.reduce(
    (n, l) => n + BigInt(l.pricePaisa) * BigInt(l.quantity),
    BigInt(0),
  );
  assert.ok(subtotal <= BigInt(Number.MAX_SAFE_INTEGER));
  const promo = input.promoCode
    ? await quotePromo(db, {
        userId: 'customer',
        code: input.promoCode,
        subtotalPaisa: Number(subtotal),
        now,
      })
    : null;
  const credit = await quoteOrderCredit(db, {
    userId: 'customer',
    subtotalPaisa: Number(subtotal),
    useWallet: input.useWallet,
    referralCode: input.referralCode,
    phone: input.customerPhone,
    now,
    readOnly: true,
    ...(promo ? { merchandiseDiscountPaisa: promo.discountPaisa } : {}),
  });
  const payable =
    subtotal + BigInt(serviceFee.chargedPaisa) +
    BigInt(delivery.chargePaisa) -
    BigInt(credit.walletPaisa) -
    BigInt(credit.discountPaisa) -
    BigInt(promo?.discountPaisa ?? 0);
  assert.ok(payable >= BigInt(0) && payable <= BigInt(Number.MAX_SAFE_INTEGER));
  return {
    ...input,
    reviewedQuote: {
      lines: lines.map(({ preparationDays: _days, ...line }) => line),
      deliveryPaisa: delivery.chargePaisa,
      walletPaisa: credit.walletPaisa,
      referralPaisa: credit.discountPaisa,
      promoPaisa: promo?.discountPaisa ?? 0,
      payablePaisa: Number(payable),
      policyContext: await getCheckoutPolicyContext(),
      referralCampaign: input.referralCode ? credit.campaignSnapshot : null,
      serviceFee,
    },
  };
}
