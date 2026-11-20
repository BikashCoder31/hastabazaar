import assert from 'node:assert/strict';
import test from 'node:test';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {saveOfferCandidate,publishOfferCandidate,offerHead} from '../lib/products/offers';
import {physicalOfferIdentity} from '../lib/products/offer-contracts';
import {reviewPriceReference,approvedPriceReference} from '../lib/products/price-references';
import {prepareDiscountPublicationStatements,scanProductDiscountAdvisories,dismissDiscountSuggestion,currentDiscountAdvisory,discountVisibilityStatements,listDiscountSuggestions} from '../lib/products/discount-advisory-store';
import {isCurrentOperationalNotice} from '../lib/operations/event-catalog';
import {updateOfferCartLine} from '../lib/cart/offer-cart';
import {getCart} from '../lib/db/repositories/cart';
import {createCodOrder} from '../lib/db/repositories/orders';
import {getProductWorkspace} from '../lib/products/intake-workspace';
import {submitProductPriceRevision} from '../lib/products/price-revision';
import {getProductPublicationReview} from '../lib/products/publication';
import {VARIANT_PRICING_CAPABILITY,VARIANT_PRICING_RULE_VERSION} from '../lib/products/variant-pricing';
import {publicCheckoutFixture} from './helpers/public-checkout-fixture';
const day=86400000;
async function fixture(){const f=await completeVersionFixture();f.sqlite.exec("INSERT INTO categories(id,slug,name_en,is_active,created_at,updated_at) VALUES('price-cat','price-fixture','Fictional prices',1,1,1); INSERT INTO products(id,seller_id,category_id,slug,sku,name_en,description_en,price_paisa,inventory_quantity,producer,country_of_origin,materials,return_eligible,status,created_at,updated_at) VALUES('price-product','registered','price-cat','fictional-price','FIX-PRICE','Fictional cup','Unused fictional cup',100000,0,'Maker','NP','Clay',1,'published',1,1); DELETE FROM seller_restrictions WHERE seller_id='registered'; INSERT INTO review_tasks(id,source_type,source_id,source_revision,started_at,due_at,calendar_version,has_deadline,owner_id,revision,updated_at) VALUES('price-review','product_review','price-product','price-submitted-audit',1,1,'fixture',0,'delegate',0,1); INSERT INTO user_roles(user_id,role,assigned_at) VALUES('foreign','admin',1);");const offers=['blue','red'].map(id=>({id:'price-'+id,selection:{colour:id},price:'1000',compareAt:'1500',sku:'FIX-'+id,mediaId:null,stockFamilyKey:'fictional-'+id,baseUnit:'piece' as const,unitsPerOffer:'1',included:true,browseOnly:false,stockIntent:''})),matrix={axes:[{id:'colour',label:'Colour',values:[{id:'blue',label:'Blue'},{id:'red',label:'Red'}]}],offers};const saved=await saveOfferCandidate(f.db,{actorId:'registered-owner',requestId:'price-candidate',expectedRevision:null,now:f.now},{productId:'price-product',matrix});f.sqlite.exec("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,created_at) VALUES('price-submitted-audit','registered-owner','product.submitted','product','price-product',1)");return {...f,offers,saved};}
void test('price comparison review binds seller, exact physical offer, candidate and pair; approval alone starts no cycle',async()=>{
 const f=await fixture();try{const row=f.offers[0],ctx={actorId:'reviewer',requestId:'price-proof',expectedRevision:String(f.saved.revision),now:f.now+1},input={productId:'price-product',versionId:f.saved.versionId,offerId:row.id,decision:'approved' as const,evidence:{kind:'external_offer' as const,reference:'Fictional dated same-seller orderable offer evidence',sellerId:'registered',offerId:row.id,physicalIdentity:physicalOfferIdentity(row),originalPaisa:150000,offeredFrom:f.now-day,offeredTo:f.now-1,checkedSameSellerOffer:true as const},reason:'Independently checked genuine former seller price and same pack'};
 await assert.rejects(reviewPriceReference(f.db,{...ctx,actorId:'registered-owner'},input));for(const change of [{sellerId:'maker'},{offerId:'price-red'},{originalPaisa:200000},{kind:'competitor'},{offeredTo:f.now+day}])await assert.rejects(reviewPriceReference(f.db,ctx,{...input,evidence:{...input.evidence,...change}} as typeof input));
 const approved=await reviewPriceReference(f.db,ctx,input);assert.deepEqual(await reviewPriceReference(f.db,ctx,input),approved);assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_discount_cycles').get()?.n,0);
 await assert.rejects(prepareDiscountPublicationStatements(f.db,'price-product',f.saved.versionId,f.now+2),/independent evidence/);
 const finding=await reviewPriceReference(f.db,{...ctx,requestId:'unsupported-reference-finding',expectedRevision:String(approved.revision)},{...input,decision:'suppressed',evidence:{...input.evidence,kind:'review_finding',offeredFrom:null,offeredTo:null,checkedSameSellerOffer:false},reason:'Evidence is an MRP label, not this seller genuine former selling price'});assert.equal(finding.approved,false);assert.equal(await approvedPriceReference(f.db,'price-product',f.saved.versionId,row.id),null);assert.equal(f.sqlite.prepare("SELECT price_paisa FROM products WHERE id='price-product'").get()?.price_paisa,100000);
 }finally{f.dispose();}
});
void test('published variant cycles group shared notices, deduplicate, dismiss and preserve prices at day 30 and 60',async()=>{
 const f=await fixture();try{let revision=f.saved.revision;for(const row of f.offers){const reviewed=await reviewPriceReference(f.db,{actorId:'reviewer',requestId:'proof-'+row.id,expectedRevision:String(revision),now:f.now},{productId:'price-product',versionId:f.saved.versionId,offerId:row.id,decision:'approved',evidence:{kind:'external_offer',reference:'Fictional dated genuine same-seller offer record',sellerId:'registered',offerId:row.id,physicalIdentity:physicalOfferIdentity(row),originalPaisa:150000,offeredFrom:f.now-day,offeredTo:f.now-1,checkedSameSellerOffer:true},reason:'Checked original seller price and exact physical variant'});revision=reviewed.revision;}
 await publishOfferCandidate(f.db,{actorId:'reviewer',requestId:'publish-priced-offers',expectedRevision:String(revision),now:f.now},{productId:'price-product',versionId:f.saved.versionId,reason:'Publish independently reviewed public price pair'});await f.db.batch(await prepareDiscountPublicationStatements(f.db,'price-product',f.saved.versionId,f.now));const original=f.sqlite.prepare('SELECT * FROM product_offer_current ORDER BY offer_id').all();assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_discount_cycles').get()?.n,2);
 await f.db.batch(await prepareDiscountPublicationStatements(f.db,'price-product',f.saved.versionId,f.now+day));assert.equal(f.sqlite.prepare('SELECT MIN(first_published_at) at FROM product_discount_cycles').get()?.at,f.now);
 assert.equal((await scanProductDiscountAdvisories(f.db,'price-product',f.now+23*day)).suggestions,1);await scanProductDiscountAdvisories(f.db,'price-product',f.now+23*day);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.product.discount_suggestion'").get()?.n,6);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.product.discount_suggestion' AND recipient_user_id='foreign'").get()?.n,0);
 const advisory=f.sqlite.prepare('SELECT id FROM product_discount_advisories').get()!;assert.equal(await currentDiscountAdvisory(f.db,String(advisory.id),f.now+23*day),true);
 const suggestions=await listDiscountSuggestions(f.db,'registered-owner','price-product',f.now+23*day);assert.deepEqual(suggestions.map(item=>item.name),['Colour: Blue','Colour: Red']);await assert.rejects(listDiscountSuggestions(f.db,'foreign','price-product',f.now+23*day));
 const notice=f.sqlite.prepare("SELECT template_key AS template,related_id AS relatedId,related_type AS relatedType,recipient_user_id AS userId,audience_role AS audience,channel,request_id AS requestId FROM notification_messages WHERE recipient_user_id='delegate' AND template_key='business.product.discount_suggestion' LIMIT 1").get()!;assert.equal(await isCurrentOperationalNotice(f.db,notice as never,f.now+23*day),true);f.sqlite.exec("UPDATE review_tasks SET owner_id=NULL WHERE id='price-review'");assert.equal(await isCurrentOperationalNotice(f.db,notice as never,f.now+23*day),false);
 f.sqlite.exec("UPDATE review_tasks SET owner_id='foreign' WHERE id='price-review'");await scanProductDiscountAdvisories(f.db,'price-product',f.now+23*day);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.product.discount_suggestion' AND recipient_user_id='foreign'").get()?.n,2);
 const dismissed=f.sqlite.prepare('SELECT id,revision FROM product_discount_cycles ORDER BY id LIMIT 1').get()!;await assert.rejects(dismissDiscountSuggestion(f.db,{actorId:'delegate',requestId:'foreign-dismiss',expectedRevision:String(dismissed.revision),now:f.now+24*day},String(dismissed.id)));await dismissDiscountSuggestion(f.db,{actorId:'registered-owner',requestId:'owner-dismiss',expectedRevision:String(dismissed.revision),now:f.now+24*day},String(dismissed.id));
 assert.equal((await scanProductDiscountAdvisories(f.db,'price-product',f.now+29*day)).suggestions,1);for(const age of [30,60])assert.equal((await scanProductDiscountAdvisories(f.db,'price-product',f.now+age*day)).suggestions,0);assert.deepEqual(f.sqlite.prepare('SELECT * FROM product_offer_current ORDER BY offer_id').all(),original);
 f.sqlite.exec("UPDATE products SET status='approved' WHERE id='price-product'");await f.db.batch(discountVisibilityStatements(f.db,'price-product',f.now+61*day));f.sqlite.exec("UPDATE products SET status='published' WHERE id='price-product'");await f.db.batch(await prepareDiscountPublicationStatements(f.db,'price-product',f.saved.versionId,f.now+62*day));assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM product_discount_cycles').get()?.n,2);assert.equal((await scanProductDiscountAdvisories(f.db,'price-product',f.now+63*day)).suggestions,0);assert.ok(await offerHead(f.db,'price-product'));
 }finally{f.dispose();}
});

for (const scenario of [
 { name: 'a delivered variant proves its recorded customer price after variant pricing is disabled', compareAt: '880', ambiguous: false },
 { name: 'conflicting pricing markers cannot certify the seller base as a former selling price', compareAt: '800', ambiguous: true },
]) void test(scenario.name, async () => {
 const f = await publicCheckoutFixture();
 try {
  Object.assign(f.db, { [VARIANT_PRICING_CAPABILITY]: true });
  const [previous] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(previous.currentChoice?.orderable && previous.revision !== null && previous.revision !== undefined);
  assert.equal(previous.currentChoice.pricePaisa, 88_000);
  await updateOfferCartLine(f.db, f.cartHash, {
   itemId: previous.id, revision: previous.revision, quantity: 1, requestId: 'evidence-refresh-variant-price',
   refresh: previous.currentChoice,
  }, Date.now());
  const [current] = (await getCart(f.db, f.cartHash)).items;
  assert.ok(current.revision !== null && current.revision !== undefined);
  const baseQuote = f.body.reviewedQuote;
  const order = await createCodOrder(f.db, f.cartHash, 'historical-price-evidence-receipt', {
   customerAuthSubject: 'customer', customerEmail: f.body.customerEmail, customerPhone: f.body.customerPhone,
   locale: 'en-NP', termsAccepted: true, idempotencyKey: 'historical-price-evidence-order', address: f.body.address,
   reviewedQuote: {
    ...baseQuote, payablePaisa: baseQuote.payablePaisa + 8_000,
    lines: [{ ...baseQuote.lines[0], revision: current.revision, pricePaisa: 88_000, pricingRuleVersion: VARIANT_PRICING_RULE_VERSION }],
   },
  }, Date.now(), 'customer');
  const item = f.sqlite.prepare(`SELECT i.id, i.order_id AS orderId, i.unit_price_paisa AS base, o.created_at AS placedAt
   FROM order_items i JOIN orders o ON o.id=i.order_id WHERE o.order_number=?`).get(order.orderNumber);
  assert.ok(item);
  assert.equal(item.base, 80_000);
  f.sqlite.prepare("UPDATE orders SET status='delivered' WHERE id=?").run(item.orderId);
  Reflect.deleteProperty(f.db, VARIANT_PRICING_CAPABILITY);
  if (scenario.ambiguous) {
   const original = f.sqlite.prepare('SELECT terms_snapshot_json AS terms FROM order_policy_acceptances WHERE order_id=?').get(item.orderId)?.terms;
   assert.ok(typeof original === 'string');
   // Represent evidence retained before acceptance updates were locked.
   f.sqlite.exec('DROP TRIGGER priced_order_acceptance_update;');
   f.sqlite.prepare('UPDATE order_policy_acceptances SET terms_snapshot_json=? WHERE order_id=?')
    .run(`${original.slice(0, -1)},"variantPricingRuleVersion":null}`, item.orderId);
  }

  const work = await getProductWorkspace(f.db, 'registered-owner', f.attached.id);
  assert.ok(work.case && work.publication);
  const sent = await submitProductPriceRevision(f.db, {
   actorId: 'registered-owner', requestId: 'evidence-new-candidate', expectedRevision: String(work.publication.revision), now: Date.now(),
  }, {
   draftId: f.attached.id, baseVersionId: f.approved.versionId, expectedDraftRevision: String(work.revision),
   expectedCaseId: work.case.caseId, expectedCaseRevision: String(work.case.revision), replaceVersionId: work.case.versionId,
   offerId: 'medium', price: '700', compareAt: scenario.compareAt, note: 'Review the lower price and previous delivered offer.',
  });
  const review = await getProductPublicationReview(f.db, 'reviewer', sent.caseId);
  const offer = review.candidate.snapshot.offers.offers.find(row => row.id === 'medium');
  assert.ok(offer);
  const reviewReference = () => reviewPriceReference(f.db, {
   actorId: 'reviewer', requestId: 'evidence-delivered-variant-price', expectedRevision: String(review.offerRevision), now: Date.now(),
  }, {
   productId: f.productId, versionId: review.candidate.offerVersionId, offerId: offer.id, decision: 'approved',
   evidence: {
    kind: 'historical_order', reference: String(item.id), sellerId: 'registered', offerId: offer.id,
    physicalIdentity: physicalOfferIdentity(offer), originalPaisa: Number(scenario.compareAt) * 100,
    offeredFrom: Number(item.placedAt), offeredTo: Number(item.placedAt), checkedSameSellerOffer: true,
   },
   reason: 'Review the exact delivered variant and its originally recorded customer price.',
  });
  if (scenario.ambiguous) {
   await assert.rejects(reviewReference, /does not prove the same genuine offer/);
   assert.equal(await approvedPriceReference(f.db, f.productId, review.candidate.offerVersionId, offer.id), null);
   return;
  }
  const proof = await reviewReference();
  assert.equal(proof.approved, true);
  const recorded = await approvedPriceReference(f.db, f.productId, review.candidate.offerVersionId, offer.id);
  assert.equal(recorded?.sellingPaisa, 70_000);
  assert.equal(recorded?.comparePaisa, 88_000);
 } finally {
  f.dispose();
 }
});
