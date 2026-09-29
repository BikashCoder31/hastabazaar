import Image from 'next/image';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {
  Heart,
  MapPin,
  Package,
  Search,
  ShoppingBag,
  Store,
  UserRound,
} from 'lucide-react';

import { getAuthenticatedUser, signInPath } from '@/app/auth';
import { BrandWordmark } from '@/components/layout/brand-wordmark';
import { RewardsShortcut } from '@/components/layout/rewards-shortcut';
import { MobileNavigation } from '@/components/layout/mobile-navigation';
import { Input } from '@/components/ui/input';
import { storefrontNavigation } from '@/lib/catalog/storefront-navigation';
import { mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';
import { loadQueryPresentationConfig, queryFieldPresentation } from '@/lib/catalog/shop-query';
import type { PublishedFormConfig } from '@/lib/forms/types';

export async function SiteHeader() {
  const [identity, searchPresentation] = await Promise.all([getAuthenticatedUser(),
    loadQueryPresentationConfig((env as unknown as { DB?: D1Database }).DB, 'catalog.header-search')]);
  return (
    <>
      <div className="bg-[#142d56] text-white">
        <div className="shell flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2 text-xs sm:text-sm">
          <p>From the hands of Nepal, with love.</p>
          <p className="flex items-center gap-2 text-white/80">
            <MapPin className="size-3.5" />
            Nepal <span aria-hidden="true">·</span> NPR{' '}
            <span className="hidden sm:inline">· Cash on delivery</span>
          </p>
        </div>
      </div>
      <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 shadow-[0_3px_18px_-12px_rgb(20_45_86/25%)] backdrop-blur-xl">
        <div className="shell flex min-h-20 items-center justify-between gap-2 py-3 sm:gap-5">
          <div className="flex min-w-0 items-center gap-1 sm:gap-2">
            <MobileNavigation />
            <Link
              href="/"
              aria-label="HastaBazaar home"
              className="flex min-w-0 items-center gap-2 rounded-lg sm:gap-3"
            >
              <Image
                src="/brand/hastabazaar-mark-96.png"
                alt=""
                width={48}
                height={48}
                priority
                data-media-mode="contain"
                sizes={mediaSizes.brandMark}
                className={mediaObjectClass(
                  'contain',
                  'hidden size-11 sm:block',
                )}
              />
              <div>
                <BrandWordmark className="text-[1.35rem] sm:text-3xl" />
                <span className="mt-0.5 hidden text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground sm:block">
                  Handmade with heart
                </span>
              </div>
            </Link>
          </div>

          <div className="hidden min-w-0 max-w-xl flex-1 lg:block">
            <HeaderSearch id="desktop-product-search" {...searchPresentation} />
          </div>

          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            <HeaderOrdersLink authenticated={Boolean(identity)} />
            <RewardsShortcut
              subjectId={identity?.userId ?? null}
              href={identity ? '/account/rewards' : signInPath('/account/rewards')}
            />
            {identity ? (
              <Link
                href="/account/wishlist"
                aria-label="My wishlist"
                className="header-action hidden sm:inline-flex"
              >
                <Heart className="size-5" />
              </Link>
            ) : (
              <a
                href={signInPath('/account/wishlist')}
                target="_top"
                aria-label="Sign in to your wishlist"
                className="header-action hidden sm:inline-flex"
              >
                <Heart className="size-5" />
              </a>
            )}
            <Link
              href="/cart"
              aria-label="Shopping cart"
              className="header-action"
            >
              <ShoppingBag className="size-5" />
            </Link>
            {identity ? (
              <Link
                href="/account"
                className="header-action bg-secondary text-primary"
              >
                <UserRound className="size-5" />
                <span className="hidden sm:inline">Account</span>
                <span className="sr-only sm:hidden">My account</span>
              </Link>
            ) : (
              <a
                href={signInPath('/account')}
                target="_top"
                className="header-action bg-secondary text-primary"
              >
                <UserRound className="size-5" />
                <span className="hidden sm:inline">Sign in</span>
                <span className="sr-only sm:hidden">Sign in</span>
              </a>
            )}
          </div>
        </div>
        <div className="shell pb-3 lg:hidden">
          <HeaderSearch id="mobile-product-search" {...searchPresentation} />
        </div>
        <div className="hidden border-t border-border/60 lg:block">
          <div className="shell flex min-h-12 items-center justify-between gap-4">
            <nav
              aria-label="Primary navigation"
              className="flex flex-wrap items-center gap-x-6 xl:gap-x-8"
            >
              {storefrontNavigation.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-link inline-flex min-h-12 items-center"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <Link
              href="/sell"
              className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-md text-sm font-semibold text-[#b5121b]"
            >
              <Store className="size-4" />
              Sell with us
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}

export function HeaderOrdersLink({
  authenticated,
}: {
  authenticated: boolean;
}) {
  if (!authenticated) return null;

  return (
    <Link
      href="/account/orders"
      className="header-action hidden xl:inline-flex"
    >
      <Package className="size-5" />
      <span>Orders</span>
    </Link>
  );
}

function HeaderSearch({ id, config, unavailable }: { id: string; config: PublishedFormConfig | null; unavailable: boolean }) {
  const search = queryFieldPresentation('catalog.header-search', config, 'q', {
    label: 'Search products, materials, or makers', placeholder: 'Search gifts, crafts & makers…' });
  return (
    <search aria-label="Search handmade products">
      <form
        data-form-id="catalog.header-search"
        action="/shop"
        method="get"
        className="flex min-h-11 items-center gap-2 rounded-full border border-border bg-muted/60 py-1 pl-4 pr-1 transition-colors focus-within:border-primary focus-within:bg-card"
      >
        <Search
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <label htmlFor={id} className="sr-only">
          {search.label}
        </label>
        <Input
          id={id}
          type="search"
          name="q"
          maxLength={100}
          placeholder={search.placeholder}
          aria-describedby={search.helpText ? `${id}-help` : undefined}
          className="h-auto min-w-0 flex-1 rounded-none border-0 bg-transparent px-0 py-1.5 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 md:text-base"
        />
        <button
          type="submit"
          className="inline-flex min-h-9 items-center justify-center rounded-full bg-[#b5121b] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#921018]"
        >
          Search
        </button>
      </form>
      {search.helpText ? <p id={`${id}-help`} className="mt-1 text-xs text-muted-foreground">{search.helpText}</p> : null}
      {unavailable ? <output className="block mt-1 text-xs text-muted-foreground">Search presentation is unavailable. Standard search remains available.</output> : null}
    </search>
  );
}
