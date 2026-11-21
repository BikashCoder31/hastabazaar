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
  Undo2,
  UserRound,
  UsersRound,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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

const baseLink = 'flex min-h-11 min-w-0 items-center gap-3 rounded-xl border px-3 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213D]';

export function AccountNavigation({ displayName, email, signOutPath, showAssignedDeliveries = false }: {
  displayName: string;
  email: string;
  signOutPath: string;
  showAssignedDeliveries?: boolean;
}) {
  const pathname = usePathname() ?? '';
  const initial = Array.from(displayName.trim())[0]?.toUpperCase() || 'H';
  const showRiderLink = isRiderPortalEnabled() && showAssignedDeliveries;

  return (
    <>
      <div className="hidden lg:block">
        <div className="mb-7 flex items-center gap-3 px-3">
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-full bg-[#F1E4C5] font-semibold text-[#704D15]">{initial}</span>
          <div className="min-w-0 wrap-anywhere">
            <p className="font-semibold text-[#14213D]">{displayName}</p>
            <p className="text-xs text-[#655848]">{email}</p>
          </div>
        </div>
        <AccountLinks pathname={pathname} signOutPath={signOutPath} showRiderLink={showRiderLink} />
      </div>
      <details className="rounded-xl border border-[#E3D6C3] bg-[#FDFAF5] lg:hidden">
        <summary className="min-h-11 cursor-pointer content-center rounded-xl px-4 text-sm font-semibold text-[#14213D] focus-visible:outline-2 focus-visible:outline-[#14213D]">Account menu</summary>
        <div className="border-t border-[#E3D6C3] p-3">
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
    <nav aria-label="Customer account" className="space-y-5">
      {groups.map(({ title, links }) => (
        <div key={title}>
          <p className="mb-1 px-3 text-xs font-semibold text-[#655848]">{title}</p>
          <ul>
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href;
              return (
                <li key={href}>
                  <Link href={href} aria-current={active ? 'page' : undefined}
                    className={`${baseLink} ${active ? 'border-[#E3D6C3] bg-white font-semibold text-[#14213D]' : 'border-transparent text-[#344766] hover:bg-white/75'}`}>
                    <Icon className={`size-4 shrink-0 ${active ? 'text-[#A8232E]' : ''}`} aria-hidden="true" />{label}
                  </Link>
                  {href === '/account/wallet' && (active || pathname === '/account/rewards') ? (
                    <Link href="/account/rewards" aria-current={pathname === '/account/rewards' ? 'page' : undefined} className={`${baseLink} ml-3 border-transparent text-[#344766] hover:bg-white/75 aria-[current=page]:font-semibold`}>
                      <Gift className="size-4 shrink-0" aria-hidden="true" />My Rewards
                    </Link>
                  ) : null}
                  {href === '/account/profile' && active ? (
                    <Link href="/account/security" className={`${baseLink} ml-3 border-transparent text-[#344766] hover:bg-white/75`}>
                      <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />Sign-in & security
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div>
        {showRiderLink ? (
          <Link href="/rider" className={`${baseLink} border-transparent text-[#344766] hover:bg-white/75`}>
            <Package className="size-4 shrink-0" aria-hidden="true" />Assigned deliveries
          </Link>
        ) : null}
        <Link href="/help" className={`${baseLink} border-transparent text-[#344766] hover:bg-white/75`}>
          <CircleHelp className="size-4 shrink-0" aria-hidden="true" />Help centre
        </Link>
        <form data-form-id="identity.logout" method="POST" action={signOutPath} target="_top">
          <button type="submit" className={`${baseLink} w-full border-transparent text-[#344766] hover:bg-white/75`}>
            <LogOut className="size-4 shrink-0" aria-hidden="true" />Sign out
          </button>
        </form>
      </div>
    </nav>
  );
}
