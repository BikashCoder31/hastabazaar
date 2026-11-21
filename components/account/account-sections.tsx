import Link from 'next/link';
import type { ReactNode } from 'react';

const settings = {
  profile: { label: 'Profile & contacts', href: '/account/profile' },
  addresses: { label: 'Addresses', href: '/account/addresses' },
  notifications: { label: 'Notifications', href: '/account/notifications' },
  security: { label: 'Sign-in & security', href: '/account/security' },
  privacy: { label: 'Privacy', href: '/account/privacy' },
} as const;

const wallet = {
  credit: { label: 'Shopping credit', href: '/account/wallet' },
  rewards: { label: 'Rewards', href: '/account/rewards' },
  referrals: { label: 'Refer a friend', href: '/account/referrals' },
  refunds: { label: 'Refunds', href: '/account/refunds' },
} as const;

export const accountSurface = 'account-surface rounded-2xl border border-[#e3d8c7] bg-[#fdfbf7]';
export const accountAction = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#d8cbb8] bg-[#fdfbf7] px-3 py-2 text-sm font-semibold text-[#14213d] hover:border-[#14213d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e]';

export const touchTargets = '[&_:is(button,summary,select,input:not([type=hidden],[type=checkbox],[type=radio]))]:min-h-11 [&_button]:min-w-11 [&_summary]:content-center';

function AccountSection({ title, tabs, current, children }: {
  title: string;
  tabs: Record<string, { label: string; href: string }>;
  current: string;
  children: ReactNode;
}) {
  return (
    <div className={touchTargets + " min-w-0 space-y-5 text-[#14213d]"}>
      <header>
        <p className="flex flex-wrap items-center gap-2 text-sm text-[#675c4b]">
          <Link href="/account" className="inline-flex min-h-11 items-center hover:underline">Your account</Link>
          <span aria-hidden="true">/</span> {title}
        </p>
        <h1 className="font-heading text-4xl leading-tight tracking-tight sm:text-5xl">{title}</h1>
      </header>
      <nav aria-label={title} className="flex flex-wrap gap-x-1 border-b border-[#e3d8c7] sm:gap-x-3">
        {Object.entries(tabs).map(([key, tab]) => (
          <Link key={key} href={tab.href} aria-current={key === current ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center gap-1.5 border-b-2 px-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#a8232e] sm:px-3 ${key === current ? 'border-[#a8232e] font-semibold text-[#14213d]' : 'border-transparent text-[#554d41] hover:text-[#a8232e]'}`}>
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function CustomerSettings({ active, children }: {
  active: keyof typeof settings; children: ReactNode;
}) {
  return <AccountSection title="Settings" tabs={settings} current={active}>{children}</AccountSection>;
}

export function CustomerWallet({ active, children }: { active: keyof typeof wallet; children: ReactNode }) {
  return <AccountSection title="Wallet & rewards" tabs={wallet} current={active}>{children}</AccountSection>;
}
