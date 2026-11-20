import assert from 'node:assert/strict';
import test from 'node:test';
import {readyMaker} from './helpers/company-store-lifecycle-fixture';
import {activatedLiveMakerFixture} from './helpers/activated-live-maker-fixture';
import {acceptLiveCurrentTerms} from './helpers/live-maker-current-proof-fixture';
import {listPublishedProducts,countPublishedProducts,listHomepageLatestProducts,getPublishedProductBySlug} from '../lib/db/repositories/products';
import {listPublishedProducts as listCatalogue} from '../lib/db/repositories/catalog';
import {createBusinessSettingDraft,publishBusinessSettingDraft} from '../lib/db/repositories/business-settings';
import {getAcceptedManagedTerms,getManagedTermsOffers} from '../lib/managed-commerce/accepted-terms';
import {activateManagedMakerForSimulation} from '../lib/managed-commerce/activation';
import {readManagedLiveEligibility} from '../lib/managed-commerce/live-readiness';
import {getPublicOfferSet} from '../lib/products/public-offers';
import {addOfferCartLine} from '../lib/cart/offer-cart';
import {getCart} from '../lib/db/repositories/cart';
import {createCodOrder} from '../lib/db/repositories/orders';
import {seedCheckoutBuyer} from './helpers/checkout-contact';
import {issueManagedInvoiceGroups} from '../lib/db/repositories/managed-documents';

type LiveFixture=Awaited<ReturnType<typeof activatedLiveMakerFixture>>;
async function addCurrentOffer(f:LiveFixture,token:string){
 const set=await getPublicOfferSet(f.db,f.productId);assert.ok(set?.orderable);const offer=set.offers.find(row=>row.id===f.offerId)!;
 await addOfferCartLine(f.db,token,{productId:f.productId,offerId:offer.id,versionId:set.versionId,publicVersionId:set.publicVersionId,pricePaisa:offer.pricePaisa,quantity:1,requestId:token+'-actual-offer-add'},Date.now());
 return getCart(f.db,token);
}
const buyerInput=(key:string)=>({customerEmail:'buyer@local.hastabazaar.test',customerPhone:'9811111111',customerAuthSubject:'buyer',locale:'en-NP' as const,termsAccepted:true,idempotencyKey:key,address:{recipientName:'Fictional buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional test street'}});

void test('current accepted terms agree across discovery detail and an existing cart after a rate change',async()=>{
 const f=await activatedLiveMakerFixture('lifecycle-renewal');try{
  await addCurrentOffer(f,'renewal-cart');const originalDecision=f.sqlite.prepare('SELECT source_json FROM managed_live_activation_decisions WHERE id=?').get(f.activation.id)!;
  const now=Date.now(),draft=await createBusinessSettingDraft(f.db,{key:'managed_sale_linked_platform_retention_bps',value:1200,actorId:'reviewer',reason:'Fictional retention renewal',requestId:'renewal-rate',now});
  await publishBusinessSettingDraft(f.db,{id:draft.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Fictional new effective retention',requestId:'renewal-publish',now});
  assert.equal(await getAcceptedManagedTerms(f.db,f.sellerId,Date.now()),null);
  // A fee-only order hold preserves reviewed discovery content and the saved exact option.
  assert.equal(await countPublishedProducts(f.db),1);assert.equal((await listPublishedProducts(f.db)).length,1);assert.equal((await listCatalogue(f.db)).length,1,'Catalogue discovery must retain the reviewed listing.');assert.equal((await listHomepageLatestProducts(f.db)).length,1);assert.ok(await getPublishedProductBySlug(f.db,f.slug));
  assert.equal((await getPublicOfferSet(f.db,f.productId))!.orderable,false);assert.equal((await getCart(f.db,'renewal-cart')).hasUnavailableItems,true);
  const offer=(await getManagedTermsOffers(f.db,f.sellerId,Date.now())).current,accepted=await acceptLiveCurrentTerms(f,'renewed-acceptance');
  assert.equal((await getAcceptedManagedTerms(f.db,f.sellerId,Date.now()))!.detailId,accepted.detailId);assert.equal((await getAcceptedManagedTerms(f.db,f.sellerId,Date.now()))!.retentionBps,1200);
  assert.equal(await countPublishedProducts(f.db),1);assert.equal((await getCart(f.db,'renewal-cart')).hasUnavailableItems,false);assert.equal((await getPublicOfferSet(f.db,f.productId))!.orderable,true);
  assert.equal((await getPublishedProductBySlug(f.db,f.slug))!.storeName,offer.snapshot.companyAccount.storeName);
  const eligibility=await readManagedLiveEligibility(f.db,f.sellerId,Date.now());assert.equal(eligibility.proof!.activationDecisionId,f.activation.id);assert.deepEqual(f.sqlite.prepare('SELECT source_json FROM managed_live_activation_decisions WHERE id=?').get(f.activation.id),originalDecision);
 }finally{f.dispose();}
});

void test('new no-business-PAN v2 maker reaches actual review activation publication checkout and original live invoice',async()=>{
 const f=await activatedLiveMakerFixture('lifecycle-checkout');try{
  const accepted=f.clearance.scope.acceptedTerms!,company=f.clearance.scope.currentOffer.snapshot,identity=f.sqlite.prepare('SELECT government_id_description,personal_pan FROM managed_maker_application_details WHERE id=?').get(accepted.detailId)!,privateMarker=String(identity.personal_pan);
  assert.equal(privateMarker,'123456789');
  const seller=f.sqlite.prepare('SELECT status,tax_mode,tax_registration_number FROM seller_profiles WHERE id=?').get(f.sellerId)!;assert.equal(seller.status,'under_review');assert.equal(seller.tax_mode,'NONE');assert.equal(seller.tax_registration_number??'','');
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM user_roles WHERE user_id=? AND role='seller'").get(f.ownerId)!.n,0);
  assert.equal((await listPublishedProducts(f.db)).length,1);assert.equal(await countPublishedProducts(f.db),1);assert.equal((await listCatalogue(f.db)).length,1,'Catalogue discovery must retain the reviewed listing.');assert.equal((await listHomepageLatestProducts(f.db)).length,1);
  const product=await getPublishedProductBySlug(f.db,f.slug);assert.ok(product);assert.equal(product.makerName,'Fictional Live Studio');assert.equal(product.storeName,company.companyAccount.storeName);assert.equal(product.legalSellerName,company.company.legalName);assert.equal(product.participationRoute,'managed_maker');
  const cart=await addCurrentOffer(f,'fictional-cart');assert.equal(cart.hasUnavailableItems,false);assert.equal(cart.items[0].legalSellerName,company.company.legalName);assert.equal(cart.items[0].offerId,f.offerId);
  await seedCheckoutBuyer(f.db,'buyer','buyer@local.hastabazaar.test','9811111111');
  const order=await createCodOrder(f.db,'fictional-cart','fictional-receipt',buyerInput('fictional-checkout'),Date.now(),'buyer');assert.ok(order.orderNumber);
  const orderId=String(f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!.id),snapshot=f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots').get()!;
  assert.equal(snapshot.record_kind,'live');assert.equal(snapshot.platform_retention_bps,1375);assert.equal(snapshot.platform_retained_paisa,11000);assert.equal(snapshot.maker_entitlement_paisa,69000);assert.equal(snapshot.accepted_managed_detail_id,accepted.detailId);assert.equal(snapshot.live_activation_decision_id,f.activation.id);assert.equal(snapshot.maker_name_snapshot,'Fictional Live Studio');assert.equal(snapshot.company_store_name_snapshot,company.companyAccount.storeName);
  assert.equal(f.sqlite.prepare('SELECT seller_name_snapshot seller FROM order_items').get()!.seller,company.companyAccount.storeName);
  const invoice=f.sqlite.prepare('SELECT * FROM managed_invoice_groups WHERE order_id=?').get(orderId)!;assert.equal(invoice.record_kind,'live');assert.doesNotMatch(String(invoice.invoice_number),/SIM/);
  const invoiceJson=JSON.parse(String(invoice.snapshot_json));assert.equal(invoiceJson.items[0].sellerName,company.companyAccount.storeName);assert.equal(invoiceJson.issuer.legalName,company.company.legalName);
  // Actual checkout already issued its canonical invoice; legacy issuance must never duplicate it.
  assert.equal(await issueManagedInvoiceGroups(f.db,{orderId,requestId:'approved-no-duplicate',now:Date.now()}),0);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_invoice_groups').get()!.n,1);
  const statement=f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE order_id=? AND kind='order_statement'").get(orderId)!;
  const now=Date.now(),changedCompany=await createBusinessSettingDraft(f.db,{key:'managed_maker_company_account',value:{...company.companyAccount,storeName:'Fictional later company store'},actorId:'reviewer',reason:'Isolated later company contact change',requestId:'later-company-draft',now});
  await publishBusinessSettingDraft(f.db,{id:changedCompany.id,actorId:'reviewer',expectedRevision:1,effectiveFrom:now,reason:'Publish isolated later store identity',requestId:'later-company-publish',now});
  assert.equal(await getAcceptedManagedTerms(f.db,f.sellerId,Date.now()),null);assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_commercial_snapshots').get(),snapshot);assert.deepEqual(f.sqlite.prepare('SELECT * FROM managed_invoice_groups WHERE order_id=?').get(orderId),invoice);assert.deepEqual(f.sqlite.prepare("SELECT snapshot_json FROM order_documents WHERE order_id=? AND kind='order_statement'").get(orderId),statement);
  const publicJson=JSON.stringify({product,cart});assert.doesNotMatch(publicJson,/government_id|identityDocument|personal_pan/);assert.ok(!publicJson.includes(privateMarker)&&!publicJson.includes(f.sources.beneficiaryReference),'Private values must not leak under other public keys');
 }finally{f.dispose();}
});

void test('activation cannot substitute staff company or agreement references for maker acceptance', async () => {
  const f = await readyMaker();
  try {
    await assert.rejects(activateManagedMakerForSimulation(f.db, { ...f.activation,
      legalSellerReference: 'SIM-UNACCEPTED-COMPANY', agreementVersion: 'SIM-UNACCEPTED-AGREEMENT' }), /accepted|agreement|company/i);
    assert.equal(f.sqlite.prepare("SELECT application_stage FROM seller_participation_profiles WHERE seller_id='maker'").get()?.application_stage, 'approved_for_activation');
  } finally { f.dispose(); }
});

void test('program closure racing checkout leaves no order, entitlement or commercial snapshot',async()=>{
 const f=await activatedLiveMakerFixture('lifecycle-program-race');try{
  await addCurrentOffer(f,'race-cart');await seedCheckoutBuyer(f.db,'buyer','buyer@local.hastabazaar.test','9811111111');
  let closedAtCommit=false;
  f.setBeforeBatch(()=>{f.sqlite.prepare("UPDATE business_setting_versions SET status='cancelled' WHERE setting_key='managed_maker_program_mode'").run();closedAtCommit=true;});
  await assert.rejects(createCodOrder(f.db,'race-cart','race-receipt',buyerInput('race-checkout'),Date.now(),'buyer'));
  assert.equal(closedAtCommit,true,'The actual program policy change must occur at the intercepted transaction boundary.');
  for(const table of ['orders','managed_entitlements','managed_commercial_snapshots','managed_invoice_groups','managed_live_invoice_numbers'])assert.equal(f.sqlite.prepare(`SELECT COUNT(*) n FROM ${table}`).get()!.n,0);
  assert.equal((await getCart(f.db,'race-cart')).items.length,1);assert.equal(f.sqlite.prepare('SELECT available FROM offer_stock WHERE offer_id=?').get(f.offerId)!.available,9);
 }finally{f.dispose();}
});
