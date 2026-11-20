import { commissionDatabase } from './commission-database';
import { seedCheckoutBuyer, readyCheckoutSeller } from './checkout-contact';
import { saveBusinessSettingChange } from '../../lib/db/repositories/business-settings';
import {
  getRegisteredSellerTerms,
  prepareSellerCommissionAcceptance,
} from '../../lib/db/repositories/marketplace-settings';
import {addCustomerFeeLiveMaker} from './customer-fee-managed-fixture';
import { savePromoDraft, publishPromo } from '../../lib/db/repositories/promo-codes';
import { quoteCheckoutPromo } from '../../lib/incentives/quote-intent';
import type { CheckoutInput } from '../../lib/checkout/validation';
export {
  feeWaiverContext,
  interleaveFeeWaiverBatch,
  interleaveFeeWaiverStateRead,
} from './fee-waiver-fixture';
export const AT = 2_000_000_000;
export const terms = {
  name: 'Customer launch',
  description: 'Whole customer fee',
  startsAt: AT - 10,
  endsAt: AT + 1000,
};
export const customerFeeFixture = commissionDatabase;
/** Real disposable promo and gift-credit sources make rollback assertions cover
 * pending consumption, wallet posting and address writes as well as order money. */
export async function withCommercialFinancialIntent(db: D1Database, token: string, input: CheckoutInput, now: number): Promise<CheckoutInput> {
  const key = crypto.randomUUID(), code = 'CF' + key.replaceAll('-', '').slice(0, 16).toUpperCase();
  const formId = 'staff.promo-code', versionId = 'commercial-promo-form';
  await db.prepare(`INSERT OR IGNORE INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id)
    VALUES(?,?,1,'published',?,'SIMULATED commercial rollback fixture','owner',1,'owner',1,'owner',1,?)`)
    .bind(versionId, formId, JSON.stringify({ formId, fields: [] }), versionId).run();
  const context = { actorId: 'owner', authSubject: 'owner', requestId: key + '-draft', expectedVersion: 0, now,
    reason: 'SIMULATED commercial rollback promo', form: { formId: 'staff.promo-code' as const, versionId,
      answers: { formId, version: 1, answers: [] } } };
  const draft = await savePromoDraft(db, context, { code, label: 'Fictional rollback promo', kind: 'fixed', fixedPaisa: 1000,
    minimumSubtotalPaisa: 0, startsAt: 0, endsAt: now + 100000, totalUseLimit: 10, perCustomerUseLimit: 2, budgetPaisa: 10000 });
  await publishPromo(db, { ...context, requestId: key + '-publish', expectedVersion: 1 }, draft.campaignId);
  await db.prepare("INSERT OR IGNORE INTO wallet_accounts(user_id,referral_code,balance_paisa,created_at) VALUES('checkout-buyer',?,0,1)")
    .bind(key.replaceAll('-', '').slice(0, 16).toUpperCase()).run();
  await db.prepare(`INSERT INTO gift_cards(id,code_hash,amount_paisa,issued_by,issuance_request_id,issued_at,redeemed_by,redeemed_at,redemption_request_id)
    VALUES(?,?,500,'owner',?,?,'checkout-buyer',?,?)`).bind(key, key, key + '-issue', now, now, key + '-redeem').run();
  await db.prepare(`INSERT INTO wallet_entries(id,user_id,gift_card_id,amount_paisa,platform_amount_paisa,kind,created_at)
    VALUES(?,'checkout-buyer',?,500,-500,'gift_card',?)`).bind(key, key, now).run();
  const quote = await quoteCheckoutPromo(db, 'checkout-buyer', token, code, now, 'checkout-buyer');
  return { ...input, useWallet: true, saveAddressForFuture: true, saveAddressLabel: 'Fictional commercial address',
    promoCode: quote.code, promoRevision: quote.revision, promoQuoteIntent: quote.quoteIntent };
}
/** Advance only the fixture clock after a real asynchronous quote-state read.
 * Seller/cart preparation still sees the request instant; no SQL result is faked. */
export function afterCustomerFeePreparation(db: D1Database, advance: () => void): D1Database {
  return new Proxy(db, { get(target, key) {
    if (key === 'prepare') return (sql: string) => {
      const statement = target.prepare(sql);
      if (!sql.startsWith('SELECT ctl.revision AS controlRevision')) return statement;
      return new Proxy(statement, { get(prepared, property) {
        if (property === 'all') return async () => {
          const result = await prepared.all(); advance(); return result;
        };
        const value = Reflect.get(prepared, property);
        return typeof value === 'function' ? value.bind(prepared) : value;
      } });
    };
    const value = Reflect.get(target, key);
    return typeof value === 'function' ? value.bind(target) : value;
  } });
}
export async function customerFeeCheckoutFixture(basisPoints = 1200) {
  const f = await commissionDatabase();
  // Current mixed issuer receipts require real-shaped fictional PAN identities,
  // established before the independent document-readiness decisions below.
  f.sqlite.exec("UPDATE seller_profiles SET tax_registration_number=CASE id WHEN 'seller-a' THEN '123456789' ELSE '987654321' END WHERE id IN ('seller-a','seller-b')");

  // The fee boundary tests control Date.now; keep the isolated native execution
  // clock on that same instant so sessions, clearance and commit guards agree.
  f.sqlite.function('strftime', { varargs: true }, (...args) => {
    if(args[1]!=='now'||!['%s','%f'].includes(String(args[0])))throw new Error('Unexpected fixture clock format.');
    const now=Date.now();
    return args[0]==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0');
  });

  for (const key of [
    'independent_seller_commission_bps',
    'managed_sale_linked_platform_retention_bps',
  ] as const)
    await saveBusinessSettingChange(f.database, {
      key,
      value: basisPoints,
      actorId: 'owner',
      reason: 'Explicit disposable twelve percent terms',
      requestId: `fixture:${key}`,
      now: 1,
      effectiveFrom: 1_300_000_001,
      expectedVersion: 0,
    });
  const offer = await getRegisteredSellerTerms(f.database, AT);
  for (const suffix of ['a', 'b']) {
    const accepted = await prepareSellerCommissionAcceptance(f.database, {
      sellerId: `seller-${suffix}`,
      actorId: `user-${suffix}`,
      context: offer.context,
      requestId: `fixture:accept:${suffix}`,
      now: AT - 1,
    });
    await f.database.batch(accepted.statements);
  }
  // Verify the exact fictional owners' documents before testing customer fee effects.
  for (const suffix of ['a', 'b'])
    await readyCheckoutSeller(f, `seller-${suffix}`, `user-${suffix}`, 'owner', AT - 1);
  await seedCheckoutBuyer(f.database);
  f.sqlite
    .exec(`INSERT INTO categories(id,slug,name_en,is_active,sort_order,created_at,updated_at) VALUES('cat','craft','Craft',1,1,1,1);
    INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    VALUES('product','seller-a','cat','craft','SKU','Craft','Fictional craft',100000,10,'Maker','NP','Wood','published',1,1);
    INSERT INTO carts(id,anonymous_token_hash,currency,created_at,updated_at) VALUES('cart','token','NPR',1,1);
    INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-a','cart','product',1,1,1);`);
  return {
    ...f,
    input: {
      customerAuthSubject: 'checkout-buyer',
      customerEmail: 'buyer@example.test',
      customerPhone: '9811111111',
      locale: 'en-NP' as const,
      termsAccepted: true,
      idempotencyKey: crypto.randomUUID(),
      address: {
        recipientName: 'Fictional Buyer',
        phone: '9811111111',
        province: 'Bagmati',
        district: 'Kathmandu',
        municipality: 'Kathmandu',
        locality: 'Ward 1',
      },
    },
  };
}
export async function addManaged(
  f: Awaited<ReturnType<typeof customerFeeCheckoutFixture>>,
  only = false,
  identityValidUntil?: number,
) {
  await addCustomerFeeLiveMaker(f, Date.now(), identityValidUntil);
  f.sqlite.exec("INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-b','cart','managed-product',1,1,1)");
  if (only) f.sqlite.exec("DELETE FROM cart_items WHERE id='line-a'");
}
