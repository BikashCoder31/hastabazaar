import type { Metadata } from 'next';

import { CartView } from '@/components/commerce/cart-view';
import { CheckoutSteps } from '@/components/commerce/checkout-steps';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = { title: 'Your cart' };

export default function CartPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell py-8 sm:py-12">
        <CheckoutSteps current={0} />
        <p className="eyebrow">Your selection</p>
        <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
          A few lovely things.
        </h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Review your cart before these finds make their way to you.
        </p>
        <div className="mt-8">
          <CartView />
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
