import { commissionDatabase } from './commission-database';
import { seedCheckoutBuyer } from './checkout-contact';
import { saveBusinessSettingChange } from '../../lib/db/repositories/business-settings';
import {
  getRegisteredSellerTerms,
  prepareSellerCommissionAcceptance,
} from '../../lib/db/repositories/marketplace-settings';
import { managedMakerAgreementSnapshot } from '../../lib/sellers/managed-identity';
import { savePromoDraft, publishPromo } from '../../lib/db/repositories/promo-codes';
import { quoteCheckoutPromo } from '../../lib/incentives/quote-intent';
import type { CheckoutInput } from '../../lib/checkout/validation';
import {
  acceptManagedTerms,
  getManagedTermsOffers,
  managedTermsFormId,
} from '../../lib/managed-commerce/accepted-terms';
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
) {
  for (const [key, value] of [
    ['managed_maker_program_mode', 'activation_enabled'],
    ['managed_maker_active_model', 'managed_sale_linked_percentage_v1'],
  ] as const)
    await saveBusinessSettingChange(f.database, {
      key,
      value,
      actorId: 'owner',
      reason: 'Isolated simulated managed sale',
      requestId: `fixture:${key}`,
      now: AT - 2,
      effectiveFrom: null,
      expectedVersion: 0,
      simulationAllowed: true,
    });
  const offer = (await getManagedTermsOffers(f.database, 'seller-b', AT - 1))
    .current;
  f.sqlite
    .prepare(
      `INSERT INTO seller_documents(id,seller_id,kind,status,object_key,original_name,mime_type,size_bytes,uploaded_at) VALUES('managed-id','seller-b','representative_identity','pending','private/seller-documents/seller-b/fictional-id','SIMULATED.pdf','application/pdf',24,1)`,
    )
    .run();
  f.sqlite
    .prepare(`INSERT INTO managed_maker_application_details(id,seller_id,government_id_type,identity_document_id,agreement_version,agreement_language,agreement_accepted_at,agreement_accepted_by,agreement_snapshot_json,created_at)
    VALUES('managed-accepted','seller-b','citizenship','managed-id',?,'en',?,'user-b',?,?)`)
    .run(
      offer.agreementVersion,
      AT - 1,
      JSON.stringify(
        managedMakerAgreementSnapshot(
          offer.snapshot.companyAccount,
          900,
          offer.snapshot.version,
        ),
      ),
      AT - 1,
    );
  f.sqlite
    .prepare(`INSERT INTO seller_participation_profiles(seller_id,participation_route,application_stage,public_name,public_city,commercial_model,legal_seller_reference,invoice_issuer_reference,payout_beneficiary_reference,managed_agreement_version,managed_agreement_language,managed_agreement_accepted_at,accepted_managed_detail_id,created_at,updated_at)
    VALUES('seller-b','managed_maker','active','Fictional maker','Kathmandu','managed_sale_linked_percentage_v1',?,?,'SIM-MAKER',?,'en',?,'managed-accepted',1,1)`)
    .run(
      offer.snapshot.companyAccount.entityReference,
      offer.snapshot.companyAccount.entityReference,
      offer.agreementVersion,
      AT - 1,
    );
  // Existing private identity evidence is fictional; renew the real published offer through the owner API.
  f.sqlite.exec(
    "INSERT INTO user_roles(user_id,role,assigned_at) VALUES('user-b','customer',1)",
  );
  f.sqlite
    .prepare(
      `INSERT INTO form_config_versions(id,form_id,version,status,config_json,reason,created_by,created_at,updated_by,updated_at,published_by,published_at,last_request_id) VALUES('managed-terms-form',?,1,'published',?,'Disposable fixture','owner',1,'owner',1,'owner',1,'fixture:terms-form')`,
    )
    .run(
      managedTermsFormId,
      JSON.stringify({ formId: managedTermsFormId, fields: [] }),
    );
  const acceptance = await acceptManagedTerms(f.database, {
    sellerId: 'seller-b',
    actorId: 'user-b',
    offerId: offer.id,
    context: offer.context,
    language: 'en',
    requestId: 'fixture:managed-acceptance',
    now: AT - 1,
    form: {
      versionId: 'managed-terms-form',
      answers: { formId: managedTermsFormId, version: 1, answers: [] },
    },
  });
  f.sqlite
    .prepare(
      "UPDATE seller_participation_profiles SET accepted_managed_detail_id=? WHERE seller_id='seller-b'",
    )
    .run(acceptance.detailId);
  f.sqlite
    .exec(`INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,status,created_at,updated_at)
    VALUES('managed-product','seller-b','cat','managed-craft','MANAGED-SKU','Managed craft','Fictional managed craft',100000,10,'Maker','NP','Wood','published',1,1);
    INSERT INTO cart_items(id,cart_id,product_id,quantity,created_at,updated_at) VALUES('line-b','cart','managed-product',1,1,1);`);
  if (only) f.sqlite.exec("DELETE FROM cart_items WHERE id='line-a'");
}
