'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export function SellerAgreementAcceptance({
  termsContext,
}: {
  termsContext: string;
}) {
  const router = useRouter();
  const [acceptedContext, setAcceptedContext] = useState<string | null>(null);
  const accepted = acceptedContext === termsContext;
  const [savedContext, setSavedContext] = useState<string | null>(null);
  const saved = savedContext === termsContext;
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!accepted || saved || inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/seller/agreements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accepted: true, language: 'en', termsContext }),
      });
      const result = (await response.json().catch(() => null)) as { error?: string; status?: string } | null;
      if (!response.ok)
        throw new Error(result?.error || 'Acceptance could not be confirmed. Please try again.');
      if (result?.status !== 'accepted' && result?.status !== 'already_accepted')
        throw new Error('Acceptance could not be confirmed. Please try again.');
      setSavedContext(termsContext);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Acceptance could not be recorded.',
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-amber-300/70 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 sm:p-6">
      <h2 className="font-heading text-2xl">Accept the current seller terms</h2>
      <p className="mt-2 text-sm leading-6">
        Acceptance is required for future orders. Existing orders and their
        recorded commission terms are unchanged.
      </p>
      <label className="mt-4 flex items-start gap-3 text-sm leading-6">
        <Checkbox
          checked={accepted}
          disabled={pending || saved}
          onCheckedChange={(value) =>
            setAcceptedContext(value === true ? termsContext : null)
          }
          className="mt-1"
        />
        <span>
          I agree to the{' '}
          <Link
            href="/seller-agreement"
            target="_blank"
            className="font-semibold underline"
          >
            Seller Marketplace Agreement
          </Link>
          , including its commission terms, and the{' '}
          <Link
            href="/prohibited-products"
            target="_blank"
            className="font-semibold underline"
          >
            Prohibited & Restricted Products Policy
          </Link>
          .
        </span>
      </label>
      <p className="mt-3 text-sm leading-6">
        New fee schedules require separate acceptance and apply only after their
        effective date. View your currently applied saved rate in{' '}
        <Link href="/seller/finance" className="font-semibold underline">
          Earnings
        </Link>
        .
      </p>
      <p className="mt-3 text-sm">
        Your account information is handled under our{' '}
        <Link
          href="/privacy"
          target="_blank"
          className="font-semibold underline"
        >
          Privacy Policy
        </Link>
        .
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm font-semibold">
          {error}
        </p>
      ) : null}
      {saved ? (
        <output className="mt-3 block text-sm font-semibold">
          Your acceptance of the current agreement has been recorded.
        </output>
      ) : null}
      <Button
        type="button"
        className="mt-5"
        disabled={!accepted || pending || saved}
        onClick={submit}
      >
        {pending ? 'Recording…' : 'Accept current agreement'}
      </Button>
    </section>
  );
}
