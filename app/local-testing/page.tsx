import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Bike, ShieldCheck, ShoppingBag, Store, UserRound, UsersRound } from 'lucide-react';

import { isLocalTestRequest, readLocalTestRole } from '@/lib/auth/local-test-access';

export const dynamic = 'force-dynamic';

const roles = [
  {
    value: 'customer',
    label: 'Managed Maker applicant',
    detail: 'Maker onboarding, shared profile, product drafts and settlement view.',
    icon: UserRound,
  },
  {
    value: 'buyer',
    label: 'Buyer',
    detail: 'Independent fictional purchaser for checkout, inspection and order-history tests.',
    icon: ShoppingBag,
  },
  {
    value: 'rider',
    label: 'Rider',
    detail: 'Approved fictional rider for mobile assignment, proof, OTP and COD tests.',
    icon: Bike,
  },
  {
    value: 'seller',
    label: 'Seller',
    detail: 'Products, orders, cases, earnings, analytics, shipping and seller profile.',
    icon: Store,
  },
  {
    value: 'admin',
    label: 'Admin',
    detail: 'Daily marketplace operations without Super Admin-only team controls.',
    icon: UsersRound,
  },
  {
    value: 'super_admin',
    label: 'Super Admin',
    detail: 'Full operations access, staff management and high-risk approvals.',
    icon: ShieldCheck,
  },
] as const;

export default async function LocalTestingPage() {
  const requestHeaders = await headers();
  if (!isLocalTestRequest(requestHeaders)) notFound();
  const activeRole = readLocalTestRole(requestHeaders);

  return (
    <main tabIndex={-1} id="main-content" className="min-h-screen bg-muted/35 py-12 sm:py-20">
      <div className="shell max-w-5xl">
        <Link href="/" className="text-sm font-semibold text-primary hover:underline">
          ← Storefront home
        </Link>
        <div className="mt-8 rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
          <p className="eyebrow">Local development only</p>
          <h1 className="mt-3 font-heading text-4xl tracking-tight sm:text-5xl">
            Test every HastaBazaar interface
          </h1>
          <p className="mt-4 max-w-2xl leading-7 text-muted-foreground">
            Choose a sample role. The role switch and its sample records exist only in the local development server and are disabled in production builds.
          </p>
          {activeRole ? (
            <p className="mt-5 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
              Current local role: <strong className="capitalize">{activeRole.replace('_', ' ')}</strong>
            </p>
          ) : null}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {roles.map(({ value, label, detail, icon: Icon }) => (
              <form
                key={value}
                action="/api/local-testing/session"
                method="post"
                className="rounded-2xl border bg-background p-5"
              >
                <input type="hidden" name="role" value={value} />
                <Icon className="size-6 text-primary" aria-hidden="true" />
                <h2 className="mt-4 font-heading text-2xl">{label}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">{detail}</p>
                <button
                  type="submit"
                  className="mt-5 w-full rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Open {label} interface
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

