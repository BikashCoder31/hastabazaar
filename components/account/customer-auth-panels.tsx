import { Gift, Heart, Package, ShieldCheck, Undo2 } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { OrderTracker } from '@/components/commerce/order-tracker';
import { accountSurface, touchTargets } from './account-sections';

export const authField = 'mt-2 min-h-11 w-full min-w-0 rounded-lg border border-[#dacdb9] bg-white px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-[#14213d]';
export const authSubmit = 'inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[#14213d] px-4 py-2 font-semibold text-white hover:bg-[#263957] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e]';

const benefits = [
  { Icon: Package, label: 'See every parcel and answer sellers in one place' },
  { Icon: Heart, label: 'Save items and move them to your bag later' },
  { Icon: Gift, label: 'Collect daily reward points and referral credit' },
  { Icon: Undo2, label: 'Ask for a return from your order' },
];

export function AuthPanels({ children, page, returnTo, challenge = false }: {
  children: ReactNode;
  page: 'login' | 'register';
  returnTo: string;
  challenge?: boolean;
}) {
  return (
    <main tabIndex={-1} id="main-content" className={touchTargets + " shell max-w-6xl min-w-0 py-7 text-[#14213d] sm:py-10"}>
      <div className={challenge ? 'mx-auto max-w-lg' : 'grid min-w-0 items-start gap-5 md:grid-cols-2 md:gap-6'}>
        <section className={accountSurface + ' min-w-0 p-4 sm:p-6 lg:p-8'}>
          {!challenge ? (
            <nav aria-label="Account access" className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[#ebe1d1] p-1">
              {[{ path: 'login', label: 'Sign in' }, { path: 'register', label: 'Create account' }].map(tab => (
                <Link key={tab.path} href={`/${tab.path}?return_to=${encodeURIComponent(returnTo)}`}
                  aria-current={tab.path === page ? 'page' : undefined}
                  className={`flex min-h-11 items-center justify-center rounded-lg px-2 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-[#a8232e] ${tab.path === page ? 'bg-white' : 'text-[#675c4b]'}`}>
                  {tab.label}
                </Link>
              ))}
            </nav>
          ) : null}
          {children}
        </section>
        {!challenge ? (
          <aside className="min-w-0 space-y-5">
            <section className={accountSurface + ' min-w-0 p-4 sm:p-6'}>
              <h2 className="font-heading text-2xl leading-tight">Track an order without signing in</h2>
              <p className="mt-2 text-sm text-muted-foreground">Use the order number from your receipt and the email you ordered with.</p>
              <OrderTracker initialOrder="" compact />
            </section>
            <section className={accountSurface + ' p-4 sm:p-6'}>
              <h2 className="text-lg font-semibold">With an account you can</h2>
              <ul className="mt-3 space-y-3">
                {benefits.map(({ Icon, label }) => <li key={label} className="flex items-start gap-2.5 text-sm"><Icon className="size-4 shrink-0 text-[#22664b]" aria-hidden="true" />{label}</li>)}
              </ul>
            </section>
          </aside>
        ) : null}
      </div>
      <p className="mt-5 flex items-start gap-2 rounded-xl bg-[#ebe1d1] p-3 text-sm leading-6 text-[#675c4b]">
        <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
        Hastabazaar never asks for your password or code by phone or WhatsApp. Keep both private.
      </p>
    </main>
  );
}
