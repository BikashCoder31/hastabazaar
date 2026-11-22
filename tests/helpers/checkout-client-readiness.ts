import {publicCheckoutFixture} from './public-checkout-fixture';
import {readCheckoutPaymentCapabilities} from '../../lib/checkout/payment-capabilities';

/** Captured genuine public readiness for focused client/configuration fixtures.
 * Their mocked configuration/HTTP failures remain client-only evidence; actual public
 * native guards and commit recovery are covered by public-checkout-* tests.
 */
let captured:Promise<{cartScope:string;paymentCapabilities:Awaited<ReturnType<typeof readCheckoutPaymentCapabilities>>}>|undefined;
export function checkoutClientReadiness(){return captured??= (async()=>{const f=await publicCheckoutFixture();try{return{cartScope:f.cartHash,paymentCapabilities:await readCheckoutPaymentCapabilities(f.db,{cartHash:f.cartHash})};}finally{f.dispose();}})();}
