import {getDeliveryRates} from '@/lib/db/repositories/delivery-rates';
import {readCheckoutPaymentCapabilities} from '@/lib/checkout/payment-capabilities';
import {CART_COOKIE,hashOpaqueToken} from '@/lib/cart/session';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getWallet } from '@/lib/db/repositories/wallet';

import { CheckoutForm } from '@/components/commerce/checkout-form';
import { CheckoutSteps } from '@/components/commerce/checkout-steps';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { getCustomerUser } from '@/lib/auth/customer';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerAddresses } from '@/lib/db/repositories/customers';
import {getContactVerificationStatus, resolveCheckoutContactPolicy} from '@/lib/auth/contact-verification';
import { getCheckoutPolicyContext } from '@/lib/checkout/policy-context';
import { getPlatformServiceFee } from '@/lib/db/repositories/platform-service-fee';
import { VARIANT_PRICING_RULE_VERSION, variantPricingEnabled } from '@/lib/products/variant-pricing';
import { ncmDemoCheckout } from '@/lib/shipping/ncm-demo-checkout';

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
    <div className="min-h-screen bg-muted/25">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell py-8 sm:py-12">
        <CheckoutSteps current={1} />
        <p className="eyebrow">Delivery within Nepal · Review your payment method</p>
        <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
          Let’s bring them home.
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Enter a complete Nepal delivery address. Your order is confirmed only
          after stock is checked.
        </p>
        <div className="mt-8">
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
            savedAddresses={addresses}
          />
        </div>
      </main>
      <SiteFooter compact />
    </div>
  );
}
