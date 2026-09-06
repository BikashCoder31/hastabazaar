import type { Metadata } from 'next';

import { CartView } from '@/components/commerce/cart-view';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = { title: 'Your cart' };

export default function CartPage() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main className="shell py-10 sm:py-14">
        <p className="eyebrow">Your selection</p>
        <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">Shopping cart</h1>
        <div className="mt-8"><CartView /></div>
      </main>
      <SiteFooter />
    </div>
  );
}
