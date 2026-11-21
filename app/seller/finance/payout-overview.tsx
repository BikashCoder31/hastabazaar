import { Banknote, Clock3, Landmark, Truck, Wallet } from 'lucide-react';
import Link from 'next/link';
import type { PayoutRequestRow, PayoutRow, SellerFinanceSummary } from '@/lib/db/repositories/payouts';
import type { SellerEarnings } from '@/lib/seller/earnings';
import { sellerDate, sellerMoney } from '@/lib/seller/presentation';
import { calculateSellerCommissionPaisa } from '@/lib/marketplace/policy';
import { NextStepBox } from '@/components/ui/next-step-box';
import { StepLine, type StepLineStep } from '@/components/ui/step-line';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { payoutCutoffLabel, type readEarningsOverview } from './overview-data';

type Overview = Awaited<ReturnType<typeof readEarningsOverview>>;
export const financePanel = 'min-w-0 space-y-4 rounded-[0.9rem] border border-[#E4DACA] bg-white p-4 sm:p-5';

const pendingStatuses = ['prepared', 'scheduled', 'approved', 'processing'];
export function openPayoutTracker(payouts: readonly PayoutRow[], requests: readonly PayoutRequestRow[]) {
  const submitted = requests.find(request => request.status === 'submitted');
  if (submitted) return { request: submitted, payout: null };
  const payout = payouts.find(row => pendingStatuses.includes(row.status));
  return payout ? { payout, request: requests.find(row => row.payoutId === payout.id) ?? null } : null;
}

export function PayoutTracker({ item, overview }: { item: NonNullable<ReturnType<typeof openPayoutTracker>>; overview: Overview }) {
  const { request, payout } = item;
  const askedAt = request?.createdAt;
  const approvedAt = payout?.approvedAt;
  const bank = overview.bank;
  const hasBankDestination = bank && (!payout || bank.reference === payout.destinationReference);
  const steps: StepLineStep[] = [
    { id: 'requested', label: request ? 'You asked' : 'Payout prepared', state: 'complete', detail: askedAt ? sellerDate(askedAt) : 'Payout prepared' },
    { id: 'approved', label: 'Hastabazaar approves', state: approvedAt ? 'complete' : 'current', detail: approvedAt ? sellerDate(approvedAt) : 'Hastabazaar is checking it' },
    { id: 'sent', label: 'Sent to your bank', state: approvedAt ? 'current' : 'upcoming', detail: payout?.processedAt ? 'Bank instruction in progress' : 'After approval' },
    { id: 'confirmed', label: 'In your account', state: 'upcoming', detail: 'When the bank confirms payment' },
  ];
  const { weekday } = overview.payoutCalendar;
  return <section className={financePanel} aria-labelledby="open-payout">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="open-payout" className="font-bold">Payout {payout ? <span className="break-all font-mono">{payout.payoutNumber}</span> : 'request'}</h2>
          <WhoseTurn status="with-hastabazaar" />
        </div>
        <p className="text-sm text-[#46536F]">{askedAt ? 'You asked on ' + sellerDate(askedAt) : payout ? 'Prepared on ' + sellerDate(payout.createdAt) : ''}
          {hasBankDestination ? ` · to ${bank.bankName}, account ending ${bank.lastFour}` : null}</p>
      </div>
      <p className="break-words font-heading text-3xl font-semibold tabular-nums sm:text-4xl">{sellerMoney(payout?.amountPaisa ?? request?.availableAmountSnapshotPaisa ?? 0)}</p>
    </div>
    <StepLine label="Payout progress" className="grid-cols-2 md:grid-cols-4" steps={steps} />
    <NextStepBox title="Payout schedule">
      {payout?.scheduledFor ? <p>Scheduled for {sellerDate(payout.scheduledFor)}. Hastabazaar will confirm after the bank payment is recorded.</p>
        : <p>Eligible payouts go out on <strong>{weekday}s</strong>. The cutoff for the payout batch is <strong>{payoutCutoffLabel(overview.cutoff)} Nepal time</strong>.</p>}
    </NextStepBox>
  </section>;
}

export function WhereMoneyIs({ summary, overview }: { summary: SellerFinanceSummary; overview: Overview }) {
  const { paid, upcoming, holdDays } = overview;
  const buckets = [
    { label: 'Not delivered yet', amount: upcoming?.amountPaisa ?? 0, icon: Truck, note: `${upcoming?.orders ?? 0} ${upcoming?.orders === 1 ? 'order' : 'orders'} · Estimated earnings before delivery and payment are confirmed.` },
    { label: 'In the return window', amount: summary.pendingPaisa, icon: Clock3, note: `New sales are held for ${holdDays} ${holdDays === 1 ? 'day' : 'days'} after delivery. Each order keeps its original payout terms.` },
    { label: 'You can ask for', amount: summary.availablePaisa, icon: Wallet, note: 'Available earnings after commission.', highlight: true },
    { label: 'Paid to you this month', amount: paid?.amountPaisa ?? 0, icon: Landmark, note: `${paid?.payouts ?? 0} ${paid?.payouts === 1 ? 'payout' : 'payouts'}` },
  ];
  return <section className={financePanel} aria-labelledby="money-status">
    <h2 id="money-status" className="font-bold">Where the rest of your money is</h2>
    <dl className="grid min-w-0 gap-x-4 gap-y-4 xl:grid-cols-4">
      {buckets.map(({ label, amount, icon: Icon, note, highlight }) => <div key={label} className="min-w-0 space-y-1.5 border-t border-[#E4DACA] pt-3 first:border-t-0 first:pt-0 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4 xl:first:border-0 xl:first:pt-0 xl:first:pl-0">
        <dt className={`flex items-start gap-2 text-sm ${highlight ? 'font-semibold text-[#236548]' : 'text-[#46536F]'}`}><Icon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{label}</dt>
        <dd className={`break-words font-heading text-[1.75rem] leading-tight font-semibold tabular-nums ${highlight ? 'text-[#236548]' : ''}`}>{sellerMoney(amount)}</dd>
        <dd className="text-xs leading-relaxed text-[#46536F]">{note}</dd>
      </div>)}
    </dl>
  </section>;
}

function PayoutStatus({ status, paidAt }: { status: string; paidAt?: number | null }) {
  const label = status === 'paid' ? paidAt ? 'Paid ' + sellerDate(paidAt) : 'Paid'
    : status === 'submitted' ? 'Being approved'
      : status === 'processing' ? 'Bank instruction in progress'
        : status === 'recorded_paid' ? 'Recorded as paid'
          : status === 'reversed' ? 'Bank transfer reversed'
            : status.replaceAll('_', ' ');
  const positive = status === 'paid';
  const attention = ['failed', 'recorded_paid', 'rejected', 'reversed'].includes(status);
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold leading-tight first-letter:uppercase ${positive ? 'bg-[#DFECE4] text-[#236548]' : attention ? 'bg-[#F7E8C6] text-[#80520A]' : 'bg-[#E3E9F4] text-[#264880]'}`}>
    <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />{label}
  </span>;
}

export function PayoutHistory({ payouts, requests }: { payouts: readonly PayoutRow[]; requests: readonly PayoutRequestRow[] }) {
  const payoutById = new Map(payouts.map(row => [row.id, row]));
  const linked = new Set(requests.flatMap(row => row.payoutId ? [row.payoutId] : []));
  const combined = [
    ...requests.map(request => ({ request, payout: request.payoutId ? payoutById.get(request.payoutId) ?? null : null })),
    ...payouts.filter(row => !linked.has(row.id)).map(payout => ({ request: null, payout })),
  ].sort((a, b) => (b.request?.createdAt ?? b.payout?.createdAt ?? 0) - (a.request?.createdAt ?? a.payout?.createdAt ?? 0));
  const columns = 'md:grid-cols-[minmax(0,0.9fr)_minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1fr)]';
  return <section className="min-w-0 space-y-2" aria-labelledby="payout-history">
    <div className="flex flex-wrap items-center justify-between gap-x-3">
      <h2 id="payout-history" className="font-bold">Payout history</h2>
      <Link href="/seller/finance/recoveries" className="section-link inline-flex min-h-11 items-center">Recovery statements</Link>
    </div>
    {combined.length ? <table className="block w-full min-w-0 rounded-[0.9rem] border border-[#E4DACA] bg-white text-sm" aria-labelledby="payout-history">
      <thead className="hidden md:block"><tr className={`grid gap-x-3 rounded-t-[0.9rem] border-b border-[#E4DACA] bg-[#FAF7F1] p-3 text-[#665B4C] ${columns}`}>
        <th className="text-left">Payout</th><th className="text-left">Asked</th><th className="text-left">Status</th><th className="text-right">Amount</th>
      </tr></thead>
      <tbody className="block">
        {combined.map(({ request, payout }) => {
          const status = payout?.status ?? request?.status ?? 'submitted';
          const createdAt = request?.createdAt ?? payout?.createdAt;
          const details = request?.sellerNote || request?.processingNote || payout?.providerReference;
          return <tr key={request?.id ?? payout?.id} id={request ? 'payout-request-' + request.id : undefined}
            className={`grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-1 border-[#E4DACA] p-3 [&+&]:border-t ${columns}`}>
            <td className="min-w-0 break-all font-mono font-semibold">{payout?.payoutNumber ?? 'Request'}</td>
            <td className="min-w-0">{createdAt ? sellerDate(createdAt) : '—'}</td>
            <td className="col-span-full row-start-2 min-w-0 md:col-span-1 md:row-start-auto"><PayoutStatus status={status} paidAt={payout?.paidAt} /></td>
            <td className="col-start-3 row-start-1 text-right font-bold tabular-nums md:col-start-auto md:row-start-auto">{sellerMoney(payout?.amountPaisa ?? request?.availableAmountSnapshotPaisa ?? 0)}</td>
            {details ? <td colSpan={4} className="col-span-full">
              <details>
                <summary aria-label={payout?.providerReference ? 'Transfer reference' : 'Request details'} className="inline-flex min-h-11 cursor-pointer items-center text-[#A8232E] underline underline-offset-4">{payout?.providerReference ? 'Transfer reference' : 'Request details'}</summary>
                <div className="space-y-1 break-words text-xs text-[#46536F]">
                  {request?.sellerNote ? <p>Your note · {request.sellerNote}</p> : null}
                  {request?.processingNote ? <p>Hastabazaar’s note · {request.processingNote}</p> : null}
                  {payout?.providerReference ? <p>{payout.providerReference}</p> : null}
                </div>
              </details>
            </td> : null}
          </tr>;
        })}
      </tbody>
    </table> : <p className={financePanel + ' text-sm text-[#46536F]'}>Your payout requests and transfers will appear here.</p>}
  </section>;
}

export function EarningsExample({ earnings, overview }: { earnings: SellerEarnings; overview: Overview }) {
  const rate = earnings.commission?.basisPoints;
  const price = overview.exampleSalePaisa;
  const commission = price !== null && rate !== undefined ? calculateSellerCommissionPaisa(price, rate) : null;
  const fee = overview.marketplaceFee;
  const { weekday, runDay } = overview.payoutCalendar;
  return <section className={financePanel} aria-labelledby="earning-example">
    <h2 id="earning-example" className="flex items-center gap-2 font-bold"><Banknote className="size-4 shrink-0" aria-hidden="true" /> How a sale becomes your money</h2>
    <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm">
      {price !== null ? <><dt className="text-[#46536F]">A sale of</dt><dd className="text-right">{sellerMoney(price)}</dd></> : null}
      <dt className="text-[#46536F]">Hastabazaar commission{rate === undefined ? '' : ', ' + rate / 100 + '%'}</dt>
      <dd className="text-right">{rate === undefined ? 'Unavailable' : commission === null ? rate / 100 + '%' : '− ' + sellerMoney(commission)}</dd>
      <dt className="text-[#46536F]">Marketplace fee{fee.enabled ? ' (paid by the customer)' : ''}</dt>
      <dd className="text-right">{fee.enabled ? sellerMoney(fee.amountPaisa) : 'Off'}</dd>
      {price !== null && commission !== null ? <>
        <dt className="border-t border-[#E4DACA] pt-2 font-bold">You receive</dt>
        <dd className="border-t border-[#E4DACA] pt-2 text-right font-bold text-[#236548]">{sellerMoney(price - commission)}</dd>
      </> : null}
    </dl>
    <div className="space-y-1 text-sm text-[#46536F]">
      <p>Payouts are sent every {weekday}.</p>
      <p>The next run for eligible payouts is <strong>{runDay}</strong>.</p>
    </div>
  </section>;
}
