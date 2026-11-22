import {getDeliveryRates} from '@/lib/db/repositories/delivery-rates';
import {readCheckoutPaymentCapabilities} from '@/lib/checkout/payment-capabilities';
import {CART_COOKIE,hashOpaqueToken} from '@/lib/cart/session';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getWallet } from '@/lib/db/repositories/wallet';

import { CheckoutForm } from '@/components/commerce/checkout-form';
import { CheckoutHeader } from '@/components/commerce/checkout-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { getCustomerUser } from '@/lib/auth/customer';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerAddresses } from '@/lib/db/repositories/customers';
import {getContactVerificationStatus, resolveCheckoutContactPolicy} from '@/lib/auth/contact-verification';
import { getCheckoutPolicyContext } from '@/lib/checkout/policy-context';
import { getPlatformServiceFee } from '@/lib/db/repositories/platform-service-fee';
import { VARIANT_PRICING_RULE_VERSION, variantPricingEnabled } from '@/lib/products/variant-pricing';
import { ncmDemoCheckout } from '@/lib/shipping/ncm-demo-checkout';
import { customerMustConfirmCod } from '@/lib/orders/first-cod-review';

export const metadata: Metadata = { title: 'Secure checkout' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const cookieStore=await cookies(),cartToken=cookieStore.get(CART_COOKIE)?.value;
  const cartHash=cartToken?await hashOpaqueToken(cartToken):null;
  const database=requireDatabase(env as unknown as {DB?:D1Database});
  const paymentCapabilities=await readCheckoutPaymentCapabilities(database,{cartHash});
  const deliveryRates=await getDeliveryRates(database);
  const customer = await getCustomerUser();
  const contactStatus=customer?await getContactVerificationStatus(database,customer):null;
  const contactPolicy=resolveCheckoutContactPolicy((env as unknown as {CHECKOUT_CONTACT_POLICY?:string}).CHECKOUT_CONTACT_POLICY);
  const wallet = customer
    ? await getWallet(database, customer.userId)
    : null;
  const referralCode =
    (await cookies()).get('hastabazaar_referral')?.value || '';
  const addresses = customer
    ? await listCustomerAddresses(database, customer.userId)
    : [];
  return (
    <div className="min-h-screen bg-[#f5efe3] text-[#14213d]">
      <CheckoutHeader />
      <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-[1264px] px-4 pb-16 pt-6 md:px-12 md:pb-20 md:pt-9 min-[1360px]:px-0">
        <h1 className="font-heading text-4xl leading-none tracking-tight sm:text-5xl">Checkout</h1>
        <div className="mt-6">
          <CheckoutForm
            cartScope={cartHash??'no-cart'}
            paymentCapabilities={paymentCapabilities}
            pricingRuleVersion={variantPricingEnabled(database) ? VARIANT_PRICING_RULE_VERSION : undefined}
            serviceFee={await getPlatformServiceFee(database)}
            policyContext={await getCheckoutPolicyContext()}
            deliveryRates={deliveryRates}
            ncmDemoQuotesEnabled={Boolean(ncmDemoCheckout(env))}
            walletBalancePaisa={wallet?.balancePaisa ?? 0}
            referralCampaign={wallet?.campaign}
            initialReferralCode={referralCode}
            customerEmail={customer?.email}
            customerPhone={customer?.phone ?? undefined}
            contactStatus={contactStatus}
            contactPolicy={contactPolicy}
            customerId={customer?.userId}
            customerDisplayName={customer?.displayName}
            codConfirmationRequired={customer ? await customerMustConfirmCod(database, customer.userId) : false}
            savedAddresses={addresses}
          />
        </div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
