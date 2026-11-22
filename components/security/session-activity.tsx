'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sessionExpiredSignInPath } from '@/lib/auth/sign-in-destination';

/** Explicit foreground input refreshes idle time. No timer/poll keeps a tab alive. */
export function AdminSessionActivity() {
  return <AccountSessionActivity redirectOnExpiry />;
}
export function AccountSessionActivity({
  accountLabel = 'account',
  returnTo = '/account',
  redirectOnExpiry = false,
}: {
  accountLabel?: string;
  returnTo?: string;
  redirectOnExpiry?: boolean;
}) {
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    let last = 0,
      busy = false,
      active = true;
    const touch = () => {
      if (
        !document.hasFocus() ||
        document.visibilityState !== 'visible' ||
        busy ||
        Date.now() - last < 60000
      )
        return;
      busy = true;
      last = Date.now();
      void fetch('/api/security/activity', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: '{}',
        cache: 'no-store',
      })
        .then((response) => {
          if (!active || response.status !== 401) return;
          if (redirectOnExpiry) {
            const { pathname, search, hash } = window.location;
            window.location.replace(sessionExpiredSignInPath(pathname + search + hash));
          } else setExpired(true);
        })
        .catch(() => undefined)
        .finally(() => {
          busy = false;
        });
    };
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    return () => {
      active = false;
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
    };
  }, [redirectOnExpiry]);
  if (!expired) return null;
  return (
    <div
      role="alert"
      className="border-b bg-amber-50 px-5 py-3 text-center text-sm text-amber-950"
    >
      Your {accountLabel} session ended. Your unsaved entries have not been
      submitted.{' '}
      <Link
        className="font-semibold underline"
        href={`/security?return_to=${encodeURIComponent(returnTo)}`}
      >
        Sign in again
      </Link>
    </div>
  );
}
