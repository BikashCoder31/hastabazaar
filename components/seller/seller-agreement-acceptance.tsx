'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export function SellerAgreementAcceptance() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!accepted) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/seller/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Acceptance could not be recorded.');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Acceptance could not be recorded.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 sm:p-6">
      <h2 className="font-heading text-2xl">Accept the current seller terms</h2>
      <p className="mt-2 text-sm leading-6">
        Acceptance is required for future orders. Existing orders and their recorded commission terms are unchanged.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6">
        <Checkbox
          checked={accepted}
          onCheckedChange={(value) => setAccepted(value === true)}
          className="mt-1"
        />
        <span>
          I agree to the{' '}
          <Link href="/seller-agreement" target="_blank" className="font-semibold underline">
            Seller Marketplace Agreement
          </Link>
          , including the 9% commission on completed, paid product sales, and the{' '}
          <Link href="/prohibited-products" target="_blank" className="font-semibold underline">
            Prohibited & Restricted Products Policy
          </Link>
          .
        </span>
      </label>
      <p className="mt-3 text-sm">
        Your account information is handled under our{' '}
        <Link href="/privacy" target="_blank" className="font-semibold underline">
          Privacy Policy
        </Link>
        .
      </p>
      {error ? <p role="alert" className="mt-3 text-sm font-semibold">{error}</p> : null}
      <Button type="button" className="mt-5" disabled={!accepted || pending} onClick={submit}>
        {pending ? 'Recording…' : 'Accept current agreement'}
      </Button>
    </section>
  );
}
