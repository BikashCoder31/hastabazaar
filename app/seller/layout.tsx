import Image from 'next/image';
import {SellerAccessBoundary} from '@/components/seller/seller-access-boundary';
import Link from 'next/link';
import { signOutPath } from '@/app/auth';
import { BrandWordmark } from '@/components/layout/brand-wordmark';
import { SellerNavigation } from '@/components/seller/seller-navigation';
import { NotificationBell } from '@/components/account/notification-bell';
import { WorkspaceRefresh } from '@/components/ui/workspace-refresh';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { getReviewedPublicProfileExtras } from '@/lib/sellers/public-profile-media';
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
  const feeOffers = !seller.approvedSeller || !seller.sellerId || participation?.route === 'managed_maker' ? null : await currentRegisteredFeeOffers(database,seller.sellerId);
  const [publicShop, profileExtras, sellerWork] = await Promise.all([
    seller.sellerId ? getPublicMakerProfile(database, seller.sellerId) : null,
    seller.sellerId ? getReviewedPublicProfileExtras(database, seller.sellerId).catch(() => null) : null,
    seller.approvedSeller && seller.sellerId ? getSellerWorkSummary(database, seller.sellerId).catch(() => null) : null,
  ]);
  const shopPhoto = profileExtras?.media.find(media => media.kind === 'profile_image');
  const addProductHref = seller.sellerId
    ? seller.approvedSeller ? '/seller/products/new' : '/sell/application/products/new'
    : '/seller/registration';
  const navigation = {
    tradingName: seller.tradingName,
    sellerId: seller.sellerId,
    canReplyToReviews: seller.approvedSeller,
    publicShopHref: publicShop ? `/makers/${publicShop.id}` : null,
    shopLive: Boolean(publicShop?.productCount),
    addProductHref,
    openOrderCount: sellerWork?.toPack,
  };
  const signOut = signOutPath('/');
  const feeTermsNeedReview = feeOffers && (!feeOffers.current.accepted || feeOffers.upcoming.some(offer => !offer.accepted));
  return (
    <div className="seller-shell lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:[&>#main-content]:col-start-2">
      {mfaEnabled ? <AccountSessionActivity accountLabel="seller" returnTo="/seller" /> : null}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-background focus:p-4"
      >
        Skip to workspace
      </a>
      <div className="sticky top-0 z-30 min-w-0 lg:col-start-2 lg:row-start-1">
        <SellerNavigation {...navigation} mode="toolbar" signOut={signOut}
          brand={<Image src="/brand/hastabazaar-mark-96.png" alt="" width={30} height={30} sizes="30px" priority
            data-media-mode="contain" className={mediaObjectClass('contain', 'size-[30px] shrink-0 rounded-md')} />}
          notifications={<>
            <WorkspaceRefresh key={seller.userId} />
            <NotificationBell workspace="seller" accountId={seller.userId} />
          </>}
        />
      </div>
      <SellerAccessBoundary actorId={seller.userId}>
        <aside className="hidden min-w-0 border-e bg-[#FFFCF7] lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:block">
          <SellerNavigation {...navigation} mode="sidebar"
            shopPhoto={shopPhoto ? <Image src={`/api/profile-media/${encodeURIComponent(shopPhoto.id)}`} alt="" width={40} height={40}
              unoptimized data-media-mode="cover" className={mediaObjectClass('cover', 'size-10 shrink-0 rounded-lg')} /> : null}
            desktopBrand={
              <Link href="/seller" className="flex min-h-11 w-fit items-center gap-2 rounded-xl">
                <Image data-media-mode="contain" src="/brand/hastabazaar-mark-96.png" alt=""
                  width={44} height={44} sizes="44px" priority className={mediaObjectClass('contain', 'size-11')} />
                <span><BrandWordmark className="block text-xl" /><span className="block text-xs font-semibold text-[#A8232E]">Seller Studio</span></span>
              </Link>
            }
          />
        </aside>
        <main tabIndex={-1} id="main-content" className="seller-main mx-auto w-full min-w-0 max-w-[1400px] px-3 pt-6 sm:px-5 lg:row-start-2 lg:px-7">
          {feeOffers && feeTermsNeedReview ? <CommonFeeTerms offers={feeOffers} /> : null}
          {notices.map(notice => <CommissionFeeNotice key={notice.id} notice={notice} agreementAccepted={seller.sellerAgreementVersion === notice.agreementVersion} />)}
          {children}
          {feeOffers && !feeTermsNeedReview ? <details className="mt-6 rounded-xl border bg-card px-4">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold">View accepted selling fee terms</summary>
            <CommonFeeTerms offers={feeOffers} />
          </details> : null}
        </main>
      </SellerAccessBoundary>
    </div>
  );
}
