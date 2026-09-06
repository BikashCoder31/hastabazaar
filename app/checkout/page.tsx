import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/commerce/checkout-form';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { getCustomerUser } from '@/lib/auth/customer';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerAddresses } from '@/lib/db/repositories/customers';

export const metadata: Metadata = { title: 'Secure checkout' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const customer = await getCustomerUser();
  const addresses = customer ? await listCustomerAddresses(requireDatabase(env as unknown as { DB?: D1Database }), customer.userId) : [];
  return (
    <div className="min-h-screen bg-muted/25">
      <SiteHeader />
      <main className="shell py-10 sm:py-14">
        <p className="eyebrow">Nationwide delivery · Cash on delivery</p>
        <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">Checkout</h1>
        <p className="mt-3 max-w-2xl leading-7 text-muted-foreground">Enter a complete Nepal delivery address. Your order is confirmed only after stock is checked.</p>
        <div className="mt-8"><CheckoutForm customerEmail={customer?.email} customerPhone={customer?.phone ?? undefined} savedAddresses={addresses} /></div>
      </main>
      <SiteFooter />
    </div>
  );
}
