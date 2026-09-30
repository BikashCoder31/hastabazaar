import Image from 'next/image';
import Link from 'next/link';
import { ShieldX } from 'lucide-react';

import { getAuthenticatedUser, signInPath, signOutPath } from '@/app/auth';
import { BrandWordmark } from '@/components/layout/brand-wordmark';
import { mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';

export const dynamic = 'force-dynamic';

export default async function StaffAccessDeniedPage() {
  const user = await getAuthenticatedUser();

  return (
    <main
      tabIndex={-1}
      id="main-content"
      className="flex min-h-screen items-center justify-center bg-muted/40 px-5 py-12"
    >
      <div className="w-full max-w-lg rounded-2xl bg-background p-7 text-center shadow-xl ring-1 ring-foreground/10 sm:p-10">
        <Link href="/" className="inline-flex items-center gap-3">
          <Image
            src="/brand/hastabazaar-mark-96.png"
            alt=""
            width={48}
            height={48}
            data-media-mode="contain"
            sizes={mediaSizes.brandMark}
            className={mediaObjectClass('contain', 'size-12')}
          />
          <BrandWordmark className="text-2xl" />
        </Link>
        <ShieldX className="mx-auto mt-8 size-12 text-primary" />
        <h1 className="mt-4 font-heading text-3xl tracking-tight">
          Staff invitation required
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          {user
            ? `${user.email} is authenticated, but this account has not been granted HastaBazaar staff access.`
            : 'Sign in with the email address invited by a HastaBazaar Super Admin.'}
        </p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          To accept a new staff invitation, verify your email by signing in with
          an email code or Google. Password registration alone does not verify
          an invitation. This area is for HastaBazaar Admins and Super Admins.
          Sellers use a separate dashboard and do not need a staff invitation.
          Seller applications are reviewed by the marketplace team.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href="/login?return_to=/admin"
            className="rounded-lg border px-4 py-2 text-sm font-semibold"
          >
            Verify invited email
          </Link>
          <Link
            href="/seller"
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85"
          >
            Open seller dashboard
          </Link>
          <Link
            href="/sell"
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Seller application
          </Link>
          {user ? (
            <form data-form-id="identity.logout" method="POST" action={signOutPath('/staff-access-denied')} target="_top">
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
            >
              Use an invited staff account
            </button>
            </form>
          ) : (
            <a
              href={signInPath('/admin')}
              target="_top"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/85"
            >
              Staff sign in
            </a>
          )}
          <Link
            href="/"
            className="rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            Return to storefront
          </Link>
        </div>
      </div>
    </main>
  );
}
