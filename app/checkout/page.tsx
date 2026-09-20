import {getDeliveryRates} from '@/lib/db/repositories/delivery-rates';
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

export const metadata: Metadata = { title: 'Secure checkout' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const deliveryRates=await getDeliveryRates(requireDatabase(env as unknown as {DB?:D1Database}));
  const customer = await getCustomerUser();
  const wallet = customer
    ? await getWallet(
        requireDatabase(env as unknown as { DB?: D1Database }),
        customer.userId,
      )
    : null;
  const referralCode =
    (await cookies()).get('hastabazaar_referral')?.value || '';
  const addresses = customer
    ? await listCustomerAddresses(
        requireDatabase(env as unknown as { DB?: D1Database }),
        customer.userId,
      )
    : [];
  return (
    <div className="min-h-screen bg-muted/25">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell py-8 sm:py-12">
        <CheckoutSteps current={1} />
        <p className="eyebrow">Delivery within Nepal · Cash on delivery</p>
        <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
          Let’s bring them home.
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">
          Enter a complete Nepal delivery address. Your order is confirmed only
          after stock is checked.
        </p>
        <div className="mt-8">
          <CheckoutForm
            deliveryRates={deliveryRates}
            walletBalancePaisa={wallet?.balancePaisa ?? 0}
            referralCampaign={wallet?.campaign}
            initialReferralCode={referralCode}
            customerEmail={customer?.email}
            customerPhone={customer?.phone ?? undefined}
            customerDisplayName={customer?.displayName}
            savedAddresses={addresses}
          />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
