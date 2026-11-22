'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { CommissionRateChange } from '@/lib/commission/rates';
import { commissionDate } from '@/lib/commission/reporting';

export function SellerMarketplaceFeeNotice({basisPoints}:{basisPoints:number}) {
  return <section className="mb-7 space-y-2 rounded-2xl border bg-card p-5 text-sm" aria-label="Current marketplace fees">
    <h2 className="font-heading text-2xl">Marketplace fees for new orders</h2>
    <p>Selling fee: {basisPoints/100}%. Current consent is required for new orders.</p>
    <p>Customer service fee campaigns do not change the seller fee. Original orders keep their recorded amounts.</p>
  </section>;
}

type Notice = Pick<
  CommissionRateChange,
  'id' | 'basisPoints' | 'effectiveAt' | 'termsText' | 'agreementVersion'
>;

export function CommissionFeeNotice({
  notice,
  agreementAccepted,
}: {
  notice: Notice;
  agreementAccepted: boolean;
}) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit() {
    if (!accepted || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/seller/commission', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rateId: notice.id, accepted: true }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(result.error ?? 'Acceptance could not be recorded.');
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Acceptance could not be recorded.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="mb-7 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950">
      <h2 className="font-heading text-2xl">
        Review your commission fee schedule
      </h2>
      <p className="text-sm leading-6">
        A {notice.basisPoints / 100}% commission rate is published for new
        orders from {commissionDate(notice.effectiveAt)} (Nepal time). Your
        new orders require acceptance of these terms from that date. Existing
        orders keep their recorded rates.
      </p>
      <details>
        <summary className="cursor-pointer text-sm font-semibold underline">
          Read the full fee schedule
        </summary>
        <p className="mt-3 whitespace-pre-line text-sm leading-6">
          {notice.termsText}
        </p>
        <p className="mt-3 break-all text-xs">Version: {notice.id}</p>
      </details>
      {!agreementAccepted ? (
        <p className="text-sm">
          Accept the referenced{' '}
          <Link href="/seller" className="font-semibold underline">
            Seller Marketplace Agreement
          </Link>{' '}
          first.
        </p>
      ) : null}
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          checked={accepted}
          disabled={busy || !agreementAccepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 size-5 shrink-0"
        />
        <span>
          I have read and accept this fee schedule as a supplement to my Seller
          Marketplace Agreement for future orders.
        </span>
      </label>
      <Button
        disabled={!accepted || busy || !agreementAccepted}
        className="min-h-11"
        onClick={() => void submit()}
      >
        {busy ? 'Recording acceptance…' : 'Accept commission fee schedule'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-semibold">
          {error}
        </p>
      ) : null}
    </section>
  );
}
