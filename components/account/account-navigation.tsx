'use client';

import {
  Bell,
  CircleHelp,
  Gift,
  Heart,
  House,
  LogOut,
  MapPin,
  Package,
  ShieldCheck,
  ShoppingBag,
  Undo2,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { isRiderPortalEnabled } from '@/lib/riders/availability';

const groups = [
  { title: 'Shopping', links: [
    { href: '/account', label: 'Overview', icon: House },
    { href: '/account/orders', label: 'My orders', icon: Package },
    { href: '/account/refunds', label: 'Returns & help', icon: Undo2 },
    { href: '/account/wishlist', label: 'Saved items', icon: Heart },
  ] },
  { title: 'Money & rewards', links: [
    { href: '/account/wallet', label: 'Wallet & rewards', icon: Wallet },
    { href: '/account/referrals', label: 'Refer a friend', icon: UsersRound },
  ] },
  { title: 'Settings', links: [
    { href: '/account/addresses', label: 'Addresses', icon: MapPin },
    { href: '/account/profile', label: 'Profile & sign-in', icon: UserRound },
    { href: '/account/notifications', label: 'Notifications', icon: Bell },
    { href: '/account/privacy', label: 'Privacy', icon: ShieldCheck },
  ] },
] as const;

const baseLink = 'flex min-h-11 min-w-0 items-center gap-3 rounded-[10px] px-3 text-left text-sm text-[#344766] hover:bg-[#F6F1E8] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D] aria-[current=page]:bg-[#F3ECDF] aria-[current=page]:font-semibold aria-[current=page]:text-[#14213D]';

export function AccountNavigation({ displayName, email, signOutPath, showAssignedDeliveries = false, desktopSwitches }: {
  displayName: string;
  email: string;
  signOutPath: string;
  showAssignedDeliveries?: boolean;
  desktopSwitches?: ReactNode;
}) {
  const pathname = usePathname() ?? '';
  const initial = Array.from(displayName.trim())[0]?.toUpperCase() || 'H';
  const showRiderLink = isRiderPortalEnabled() && showAssignedDeliveries;

  return (
    <>
      <div className="account-menu-panel hidden px-2 py-3 lg:block">
        <div className="flex items-center gap-3 px-3 py-2">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#F1E4C5] font-semibold text-[#704D15]">{initial}</span>
          <div className="min-w-0 wrap-anywhere">
            <p className="font-semibold text-[#14213D]">{displayName}</p>
            <p className="text-xs text-[#655848]">{email}</p>
          </div>
        </div>
        <p className="mx-3 mb-3 mt-1 inline-flex min-h-[26px] max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-[#E3E9F4] px-2.5 text-xs font-semibold text-[#1E3566]">
          <ShoppingBag className="size-3.5 shrink-0" aria-hidden="true" />Customer account
        </p>
        {desktopSwitches ? <div className="mx-1 mb-3.5">{desktopSwitches}</div> : null}
        <AccountLinks pathname={pathname} signOutPath={signOutPath} showRiderLink={showRiderLink} />
      </div>
      <details className="account-menu-panel lg:hidden">
        <summary aria-label="Customer account menu" className="min-h-11 cursor-pointer content-center rounded-xl px-4 text-sm font-semibold text-[#14213D] focus-visible:outline-2 focus-visible:outline-[#14213D]">Customer account</summary>
        <div className="px-2 pb-2">
          <AccountLinks pathname={pathname} signOutPath={signOutPath} showRiderLink={showRiderLink} />
        </div>
      </details>
    </>
  );
}

function AccountLinks({ pathname, signOutPath, showRiderLink }: {
  pathname: string;
  signOutPath: string;
  showRiderLink: boolean;
}) {
  return (
    <nav aria-label="Customer account">
      {groups.map(({ title, links }) => (
        <div key={title} className="mt-2 border-t border-[#EFE7D9] pt-3.5">
          <p className="mb-1 px-3 text-xs font-semibold text-[#655848]">{title}</p>
          <ul>
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? 'page' : undefined}
                    className={baseLink}>
                    <Icon className={`size-4 shrink-0 ${active ? 'text-[#A8232E]' : ''}`} aria-hidden="true" />{label}
                  </Link>
                  {href === '/account/wallet' && (active || pathname === '/account/rewards') ? (
                    <Link href="/account/rewards" aria-current={pathname === '/account/rewards' ? 'page' : undefined} className={`${baseLink} ml-3`}>
                      <Gift className="size-4 shrink-0" aria-hidden="true" />My Rewards
                    </Link>
                  ) : null}
                  {href === '/account/profile' && (active || pathname === '/account/security') ? (
                    <Link href="/account/security" aria-current={pathname === '/account/security' ? 'page' : undefined} className={`${baseLink} ml-3`}>
                      <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Sign-in & security
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-2">
        {showRiderLink ? (
          <Link href="/rider" className={baseLink}>
            <Package className="size-4 shrink-0" aria-hidden="true" />Assigned deliveries
          </Link>
        ) : null}
        <Link href="/help" className={baseLink}>
          <CircleHelp className="size-4 shrink-0" aria-hidden="true" />Help centre
        </Link>
        <form data-form-id="identity.logout" method="POST" action={signOutPath} target="_top">
          <button type="submit" className={`${baseLink} w-full`}>
            <LogOut className="size-4 shrink-0" aria-hidden="true" />Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
