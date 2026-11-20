import Image from 'next/image';
import {SellerAccessBoundary} from '@/components/seller/seller-access-boundary';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { signOutPath } from '@/app/auth';
import { BrandWordmark } from '@/components/layout/brand-wordmark';
import { SellerNavigation } from '@/components/seller/seller-navigation';
import { NotificationBell } from '@/components/account/notification-bell';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { env } from 'cloudflare:workers';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerCommissionNotices } from '@/lib/db/repositories/commission-rates';
import { CommissionFeeNotice } from '@/components/seller/commission-fee-notice';
import { CommonFeeTerms } from '@/components/seller/common-fee-terms';
import { getRegisteredFeeOffers } from '@/lib/commission/coordinated-policy';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';
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
  return (
    <div className="min-h-screen bg-secondary/35">
      {mfaEnabled ? <AccountSessionActivity accountLabel="seller" returnTo="/seller" /> : null}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-background focus:p-4"
      >
        Skip to workspace
      </a>
      <header className="border-b bg-card xl:sticky xl:top-0 xl:z-30">
        <div className="shell flex min-h-20 flex-wrap items-center justify-between gap-4 py-3">
          <Link href="/seller" className="flex items-center gap-3 rounded-xl">
            <Image
              data-media-mode="contain"
              src="/brand/hastabazaar-mark-96.png"
              alt=""
              width={44}
              height={44}
              sizes={mediaSizes.brandMark}
              className={mediaObjectClass('contain', 'size-11')}
            />
            <span>
              <BrandWordmark className="block text-xl" />
              <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Seller Center
              </span>
            </span>
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationBell workspace="seller" accountId={seller.userId} />
            <Link href="/account" prefetch={false} className="header-action">Switch to customer dashboard</Link>
            <Link href="/shop" className="header-action">
              <span className="hidden sm:inline">Marketplace</span>
              <ArrowUpRight className="size-4" />
              <span className="sr-only sm:hidden">Marketplace</span>
            </Link>
            <Link
              href={seller.sellerId ? seller.approvedSeller ? '/seller/products/new' : '/sell/application/products/new' : '/seller/registration'}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="size-4" />
              Add product
            </Link>
            <form data-form-id="identity.logout" method="POST" action={signOutPath('/')} target="_top">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold hover:bg-muted"
            >
              Sign out
            </button>
            </form>
          </div>
        </div>
      </header>
      <SellerAccessBoundary actorId={seller.userId}>
      <div className="shell grid items-start gap-6 py-6 xl:grid-cols-[15rem_minmax(0,1fr)] xl:gap-8 xl:py-8">
        <aside className="min-w-0 xl:sticky xl:top-28">
          <SellerNavigation
            tradingName={seller.tradingName}
            sellerId={seller.sellerId}
            canReplyToReviews={seller.approvedSeller}
            publicShopHref={publicShop ? `/makers/${publicShop.id}` : null}
          />
        </aside>
        <main tabIndex={-1} id="main-content" className="min-w-0 pb-10">
          {feeOffers?<CommonFeeTerms offers={feeOffers}/>:null}
          {notices.map(notice => <CommissionFeeNotice key={notice.id} notice={notice} agreementAccepted={seller.sellerAgreementVersion === notice.agreementVersion} />)}
          {children}
        </main>
      </div>
      </SellerAccessBoundary>
    </div>
  );
}
