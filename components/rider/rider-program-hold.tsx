import Link from 'next/link';
import { riderPortalHoldMessage } from '@/lib/riders/portal-hold';

export function RiderProgramHold() {
  return (
    <main
      tabIndex={-1}
      id="main-content"
      className="shell space-y-5 py-12 sm:py-16"
    >
      <h1 className="font-heading text-3xl font-semibold text-primary">
        Rider services are on hold
      </h1>
      <p className="max-w-xl text-muted-foreground">{riderPortalHoldMessage}</p>
      <nav
        aria-label="Continue with Hastabazaar"
        className="flex flex-wrap gap-4"
      >
        <Link
          href="/account"
          className="rounded-lg border px-4 py-3 font-semibold text-primary"
        >
          Go to my account
        </Link>
        <Link
          href="/shop"
          className="rounded-lg border px-4 py-3 font-semibold text-primary"
        >
          Explore products
        </Link>
      </nav>
    </main>
  );
}
