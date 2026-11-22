import Link from 'next/link';
import { FileText } from 'lucide-react';
import type { SellerPayoutFix } from '@/lib/sellers/payout-fixes';

const button = 'inline-flex min-h-11 items-center justify-center rounded-lg bg-[#A8232E] px-4 text-sm font-semibold text-white hover:bg-[#8D1D27] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#A8232E]';

function FixDetails({ fix }: { fix: SellerPayoutFix }) {
  return <>
    <p className="break-words text-sm">Hastabazaar: <q>{fix.note}</q></p>
    {fix.waitingFor === 'staff' ? <p className="text-sm font-semibold">With Hastabazaar · We’re checking your new file</p> : null}
  </>;
}

export function SellerPayoutFixFirst({ fix }: { fix: SellerPayoutFix }) {
  const yourTurn = fix.waitingFor === 'seller';
  return <section className={`flex min-w-0 flex-col gap-4 rounded-xl p-5 sm:flex-row sm:items-center ${yourTurn ? 'bg-[#14213D] text-white' : 'border border-[#D3DEEF] bg-[#EAF0F9] text-[#14213D]'}`} aria-labelledby="payout-fix-first-title">
    <FileText className="size-11 shrink-0 rounded-lg bg-white/15 p-2.5" aria-hidden="true" />
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
        <span className="rounded-full bg-white px-2 py-0.5 font-semibold text-[#14213D]">{yourTurn ? 'Your turn' : 'With Hastabazaar'}</span>
        <span>Needed before your first payout · you can keep selling</span>
      </div>
      <h2 id="payout-fix-first-title" className="text-lg font-bold">{yourTurn ? 'Fix your ' + fix.label.toLowerCase() : 'Checking your ' + fix.label.toLowerCase()}</h2>
      <FixDetails fix={fix} />
    </div>
    {yourTurn ? <Link className={button + ' shrink-0'} href={fix.sellerHref}>Upload new file</Link> : null}
  </section>;
}

export function SellerPayoutFixes({ fixes, place }: { fixes: readonly SellerPayoutFix[]; place: 'today' | 'earnings' | 'documents' }) {
  if (!fixes.length) return null;
  const yourTurn = fixes.some(fix => fix.waitingFor === 'seller');
  const title = place === 'earnings'
    ? `Payout on hold · ${fixes.length} ${fixes.length === 1 ? 'fix' : 'fixes'} needed`
    : place === 'today'
      ? `${yourTurn ? 'Your turn' : 'With Hastabazaar'} · Fix before your first payout`
      : 'Fix before your first payout';
  return <section id="seller-payout-fixes" className="scroll-mt-20 space-y-3 rounded-xl border border-[#E2D6C2] bg-white p-4" aria-labelledby="seller-payout-fixes-title">
    <div>
      <h2 id="seller-payout-fixes-title" className="font-bold">{title}</h2>
      <p className="text-sm text-[#465573]">You can keep selling while these documents are being fixed.</p>
    </div>
    <ul className="divide-y divide-[#E2D6C2]">
      {fixes.map(fix => <li key={fix.id} className="flex min-w-0 flex-col gap-2 py-3 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{fix.label}</p>
          <FixDetails fix={fix} />
        </div>
        {fix.waitingFor === 'seller' ? <Link className={button + ' shrink-0'} href={fix.sellerHref}>Upload new file</Link> : null}
      </li>)}
    </ul>
  </section>;
}
