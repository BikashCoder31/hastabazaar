'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import type { PayoutBankFileOverview } from '@/lib/payments/payout-bank-file';
import { payoutAmount } from '../workspace-data';

export function PayoutBankFileExclusions({ blocked }: { blocked: PayoutBankFileOverview['blocked'] }) {
  if (!blocked.length) return null;
  return <section aria-labelledby="bank-file-exclusions" className="min-w-0 overflow-hidden rounded-[14px] border border-[#E4DACA] bg-white">
    <h2 id="bank-file-exclusions" className="px-4 py-3.5 font-bold sm:px-[18px]">Left out of the bank file</h2>
    <ul className="divide-y divide-[#E4DACA] border-t border-[#E4DACA]">
      {blocked.map(row => <li key={row.id}>
        <Link href={'/admin/payouts/' + encodeURIComponent(row.id)} className="flex min-h-11 min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 break-words px-4 py-2 text-sm hover:bg-[#FFFCF7] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#A8232E] sm:px-[18px]">
          <span className="min-w-0 [overflow-wrap:anywhere]"><strong>{row.reference}</strong> · {row.seller}</span>
          <span className="font-semibold text-[#A8232E] underline underline-offset-4">Fix bank details first</span>
        </Link>
      </li>)}
    </ul>
  </section>;
}

export function PayoutBankFileDownload({ actorId, bankFile }: { actorId: string; bankFile: PayoutBankFileOverview | null }) {
  const helpId = useId();
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; signIn?: boolean } | null>(null);

  async function download() {
    if (inFlight.current || !bankFile?.count) return;
    inFlight.current = true;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch('/admin/payouts/run/bank-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
        body: JSON.stringify({ runId: bankFile.runId }),
        cache: 'no-store',
      });
      if (!response.ok) {
        const reply = await response.json().catch(() => null) as { error?: string; code?: string } | null;
        setMessage({ text: reply?.error ?? 'The bank file could not be downloaded. Refresh and try again.',
          signIn: response.status === 401 || reply?.code === 'MFA_REQUIRED' });
        return;
      }
      if (!response.headers.get('Content-Type')?.startsWith('text/csv')) throw new Error('Unexpected download response.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'hastabazaar-payout-run-' + bankFile.runId + '.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setMessage({ text: 'The bank file could not be downloaded. Refresh and try again.' });
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return <div className="min-w-0 space-y-1">
    <button type="button" disabled={pending || !bankFile?.count}
      className="min-h-11 max-w-full rounded-lg border border-white/40 px-3 text-sm font-semibold text-white hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:text-white/65"
      aria-describedby={helpId} onClick={() => { void download(); }}>
      {pending ? 'Preparing bank file…' : 'Download bank file'}
    </button>
    <p id={helpId} className="break-words text-[13px] leading-tight text-[#C9D0DD]">
      {!bankFile?.count ? 'No approved payouts are ready to export. ' : `${bankFile.count} approved ${bankFile.count === 1 ? 'payout' : 'payouts'} · ${payoutAmount(bankFile.totalPaisa)}. `}
      Record the payment separately in payout transfers.
    </p>
    {message ? <p role="alert" className="break-words text-[13px] leading-tight text-white">
      {message.text}{message.signIn ? <> <Link href="/login?return_to=%2Fadmin%2Fpayouts%2Frun&reauth=password"
        className="inline-flex min-h-11 items-center font-semibold text-white underline underline-offset-4">Sign in again</Link></> : null}
    </p> : null}
  </div>;
}
