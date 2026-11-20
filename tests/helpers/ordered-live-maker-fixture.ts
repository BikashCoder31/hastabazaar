import assert from 'node:assert/strict';
import {activatedLiveMakerFixture} from './activated-live-maker-fixture';
import {seedCheckoutBuyer} from './checkout-contact';
import {getPublicOfferSet} from '../../lib/products/public-offers';
import {addOfferCartLine} from '../../lib/cart/offer-cart';
import {getCheckoutPolicyContext} from '../../lib/checkout/policy-context';
import {getDeliveryEstimate, type CheckoutInput} from '../../lib/checkout/validation';
import {getCart} from '../../lib/db/repositories/cart';
import {quoteCustomerServiceFee} from '../../lib/db/repositories/customer-service-fees';
import {getDeliveryRates} from '../../lib/db/repositories/delivery-rates';
import {createCodOrder} from '../../lib/db/repositories/orders';
import {VARIANT_PRICING_CAPABILITY} from '../../lib/products/variant-pricing';
import {getSellerReadiness} from '../../lib/sellers/readiness';

/** Actual current offer/cart/order writer; no simulated environment or manual order rows. */
export async function orderedLiveMakerFixture({variantPricing = false}: {variantPricing?: boolean} = {}){
 const f=await activatedLiveMakerFixture('actual-live-order');try{
  if (variantPricing) Object.assign(f.db, {[VARIANT_PRICING_CAPABILITY]: true});
  const buyerId='actual-live-buyer',cartToken='actual-live-cart';
  const input: CheckoutInput={customerAuthSubject:buyerId,customerEmail:buyerId+'@local.hastabazaar.test',customerPhone:'9811111111',locale:'en-NP',termsAccepted:true,idempotencyKey:crypto.randomUUID(),address:{recipientName:'Fictional live buyer',phone:'9811111111',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Fictional delivery location'}};
  await seedCheckoutBuyer(f.db,buyerId,input.customerEmail,input.customerPhone);
  const offers=await getPublicOfferSet(f.db,f.productId);assert.ok(offers);
  assert.equal(offers.orderable,true,JSON.stringify({offers,readiness:await getSellerReadiness(f.db,f.sellerId,Date.now())}));
  const offer = offers.offers.find(candidate => candidate.id === f.offerId);
  assert.ok(offer?.orderable);
  await addOfferCartLine(f.db,cartToken,{productId:f.productId,offerId:f.offerId,versionId:offers.versionId,publicVersionId:offers.publicVersionId,pricePaisa:offer.pricePaisa,quantity:1,requestId:'actual-live-cart-add'},Date.now());
  if (variantPricing) {
   const [cart, rates, {snapshot: serviceFee}, policyContext] = await Promise.all([
    getCart(f.db, cartToken),
    getDeliveryRates(f.db),
    quoteCustomerServiceFee(f.db, Date.now()),
    getCheckoutPolicyContext(),
   ]);
   assert.equal(cart.items.length, 1);
   assert.equal(cart.hasUnavailableItems, false);
   const [line] = cart.items;
   const pricingRuleVersion = line.selectedOffer?.pricingRuleVersion;
   assert.ok(pricingRuleVersion && line.offerId && line.offerVersionId && line.publicVersionId);
   assert.ok(line.pricePaisa !== null && typeof line.revision === 'number');
   const delivery = getDeliveryEstimate(input.address.district, [line.preparationDays], rates);
   assert.ok(delivery);
   input.reviewedQuote = {
    lines: [{
     id: line.id, sellerId: line.sellerId, pricePaisa: line.pricePaisa, quantity: line.quantity,
     offerId: line.offerId, offerVersionId: line.offerVersionId, publicVersionId: line.publicVersionId,
     revision: line.revision, pricingRuleVersion,
    }],
    deliveryPaisa: delivery.chargePaisa, serviceFee, walletPaisa: 0, referralPaisa: 0, promoPaisa: 0,
    payablePaisa: cart.itemSubtotalPaisa + delivery.chargePaisa + serviceFee.chargedPaisa,
    policyContext, referralCampaign: null,
   };
  }
  const order=await createCodOrder(f.db,cartToken,'actual-live-receipt-token',input,Date.now(),buyerId);
  const row=f.sqlite.prepare('SELECT id FROM orders WHERE order_number=?').get(order.orderNumber)!;
  const item=f.sqlite.prepare('SELECT id FROM order_items WHERE order_id=?').get(row.id)!;
  return {...f,buyerId,cartToken,checkoutInput:input,order,orderId:String(row.id),orderItemId:String(item.id)};
 }catch(error){f.dispose();throw error;}
}
