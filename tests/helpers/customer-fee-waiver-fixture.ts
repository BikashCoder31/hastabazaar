import { commissionDatabase } from './commission-database';
import { seedCheckoutBuyer } from './checkout-contact';
import { saveBusinessSettingChange } from '../../lib/db/repositories/business-settings';
import {
  getRegisteredSellerTerms,
  prepareSellerCommissionAcceptance,
} from '../../lib/db/repositories/marketplace-settings';
import { managedMakerAgreementSnapshot } from '../../lib/sellers/managed-identity';
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
export async function customerFeeCheckoutFixture() {
  const f = await commissionDatabase();
  for (const key of [
    'independent_seller_commission_bps',
    'managed_sale_linked_platform_retention_bps',
  ] as const)
    await saveBusinessSettingChange(f.database, {
      key,
      value: 1200,
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
