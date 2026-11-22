import type { Metadata } from 'next';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { getPlatformServiceFee } from '@/lib/db/repositories/platform-service-fee';
import { getCustomerUser } from '@/lib/auth/customer';
import { listWishlist } from '@/lib/db/repositories/customers';
import { getWallet } from '@/lib/db/repositories/wallet';
import Link from 'next/link';

import { CartView } from '@/components/commerce/cart-view';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = { title: 'Your bag' };

export const dynamic = 'force-dynamic';
export default async function CartPage() {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [serviceFee, customer] = await Promise.all([getPlatformServiceFee(database), getCustomerUser()]);
  const [saved, wallet] = customer ? await Promise.all([listWishlist(database, customer.userId), getWallet(database, customer.userId)]) : [[], null];
  const savedProducts = saved.map(({ id, slug, nameEn, pricePaisa, tradingName, primaryMediaId, priceFrom, offerSet }) => {
    const offer = offerSet?.offers.length === 1 ? offerSet.offers[0] : undefined;
    return {
      id, slug, nameEn, pricePaisa, tradingName, primaryMediaId, priceFrom,
      ...(offer?.orderable && offer.available > 0 && offerSet ? {
        choice: { offerId: offer.id, versionId: offerSet.versionId, publicVersionId: offerSet.publicVersionId, pricePaisa: offer.pricePaisa },
      } : {}),
    };
  });
  return (
    <div className="min-h-screen bg-[#f5efe3] text-[#14213d]">
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="mx-auto w-full max-w-[1264px] px-4 pb-16 pt-6 md:px-12 md:pb-20 md:pt-8 min-[1360px]:px-0">
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-2 text-sm text-[#655848]">
          <Link href="/" className="inline-flex min-h-11 items-center text-[#465573] hover:underline">Home</Link>
          <span aria-hidden="true">/</span><span aria-current="page">Your bag</span>
        </nav>
        <h1 className="mb-1 font-heading text-4xl tracking-tight sm:text-5xl">Your bag</h1>
        <CartView key={customer?.userId ?? 'guest'} serviceFee={serviceFee} customerId={customer?.userId} savedProducts={savedProducts} walletBalancePaisa={wallet?.balancePaisa} />
      </main>
      <SiteFooter compact />
    </div>
  );
}
