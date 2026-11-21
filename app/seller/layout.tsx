import Image from 'next/image';
import {SellerAccessBoundary} from '@/components/seller/seller-access-boundary';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { signOutPath } from '@/app/auth';
import { BrandWordmark } from '@/components/layout/brand-wordmark';
import { SellerNavigation } from '@/components/seller/seller-navigation';
import { NotificationBell } from '@/components/account/notification-bell';
import { WorkspaceRefresh } from '@/components/ui/workspace-refresh';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { getSellerWorkSummary } from '@/lib/db/repositories/seller-workspace';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCommissionNotices } from '@/lib/db/repositories/commission-rates';
import { CommissionFeeNotice } from '@/components/seller/commission-fee-notice';
import { CommonFeeTerms } from '@/components/seller/common-fee-terms';
import { getRegisteredFeeOffers } from '@/lib/commission/coordinated-policy';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { mediaObjectClass } from '@/lib/media/responsive-media';
import { AccountSessionActivity } from '@/components/security/session-activity';
import { sellerMfaRequired } from '@/lib/security/session';
import { readSecurityInitialization, type SecurityPolicyBindings } from '@/lib/security/runtime-policy';

export const dynamic = 'force-dynamic';

/** Server-owned current-time read, never a browser-supplied eligibility clock. */
async function currentRegisteredFeeOffers(database:D1Database,sellerId:string){
  return getRegisteredFeeOffers(database,sellerId,Date.now()).catch(error=>{if(error instanceof CommissionRateUnavailableError)return null;throw error;});
}

export default async function SellerLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const seller = await requireSellerCenterPage('/seller');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const security = env as unknown as SecurityPolicyBindings;
  const mfaEnabled = await sellerMfaRequired(database, seller.userId, security.HASTABAZAAR_SECURITY_KEY, await readSecurityInitialization(security));
  const participation = seller.sellerId ? await database.prepare('SELECT participation_route AS route FROM seller_participation_profiles WHERE seller_id=?').bind(seller.sellerId).first<{route:string}>() : null;
  const notices = !seller.approvedSeller || !seller.sellerId || participation?.route === 'managed_maker' ? [] : await getSellerCommissionNotices(database, seller.sellerId);
  const feeOffers = !seller.sellerId || participation?.route === 'managed_maker' ? null : await currentRegisteredFeeOffers(database,seller.sellerId);
  const publicShop = seller.sellerId ? await getPublicMakerProfile(database, seller.sellerId) : null;
  const addProductHref = seller.sellerId
    ? seller.approvedSeller ? '/seller/products/new' : '/sell/application/products/new'
    : '/seller/registration';
  const sellerWork = seller.approvedSeller && seller.sellerId
    ? await getSellerWorkSummary(database, seller.sellerId).catch(() => null)
    : null;
  const navigation = {
    tradingName: seller.tradingName,
    sellerId: seller.sellerId,
    canReplyToReviews: seller.approvedSeller,
    publicShopHref: publicShop ? `/makers/${publicShop.id}` : null,
    addProductHref,
    openOrderCount: sellerWork?.toPack,
  };
  const signOut = signOutPath('/');
  const feeTermsNeedReview = feeOffers && (!feeOffers.current.accepted || feeOffers.upcoming.some(offer => !offer.accepted));
  return (
    <div className="seller-shell">
      {mfaEnabled ? <AccountSessionActivity accountLabel="seller" returnTo="/seller" /> : null}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-background focus:p-4"
      >
        Skip to workspace
      </a>
      <SellerNavigation {...navigation} mode="mobile" signOut={signOut}
        brand={<Image src="/brand/hastabazaar-mark-96.png" alt="" width={30} height={30} sizes="30px" priority
          data-media-mode="contain" className={mediaObjectClass('contain', 'size-[30px] shrink-0 rounded-md')} />}
        notifications={<>
          <WorkspaceRefresh key={seller.userId} />
          <NotificationBell workspace="seller" accountId={seller.userId} />
        </>}
        desktopBrand={
          <Link href="/seller" className="flex w-fit items-center gap-3 rounded-xl">
            <Image data-media-mode="contain" src="/brand/hastabazaar-mark-96.png" alt=""
              width={44} height={44} sizes="44px" priority className={mediaObjectClass('contain', 'size-11')} />
            <span><BrandWordmark className="block text-xl" /><span className="block text-xs font-semibold text-[#A8232E]">Seller Studio</span></span>
          </Link>
        }
        desktopActions={<>
          <Link href="/account" prefetch={false} className="header-action">Switch to customer dashboard</Link>
          <Link href="/shop" className="header-action">
            Marketplace <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href={addProductHref} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#A8232E] px-4 text-sm font-semibold text-white">
            <Plus className="size-4" aria-hidden="true" />Add product
          </Link>
          <form data-form-id="identity.logout" method="POST" action={signOut} target="_top">
            <button type="submit" className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold hover:bg-muted">Sign out</button>
          </form>
        </>}
      />
      <SellerAccessBoundary actorId={seller.userId}>
      <div className="shell grid items-start gap-6 py-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-6 lg:py-8 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-8">
        <aside className="sticky top-28 hidden min-w-0 lg:block">
          <SellerNavigation {...navigation} mode="desktop" />
        </aside>
        <main tabIndex={-1} id="main-content" className="seller-main min-w-0">
          {feeOffers && feeTermsNeedReview ? <CommonFeeTerms offers={feeOffers} /> : null}
          {notices.map(notice => <CommissionFeeNotice key={notice.id} notice={notice} agreementAccepted={seller.sellerAgreementVersion === notice.agreementVersion} />)}
          {children}
          {feeOffers && !feeTermsNeedReview ? <details className="mt-6 rounded-xl border bg-card px-4">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">View accepted selling fee terms</summary>
            <CommonFeeTerms offers={feeOffers} />
          </details> : null}
        </main>
      </div>
      </SellerAccessBoundary>
    </div>
  );
}
