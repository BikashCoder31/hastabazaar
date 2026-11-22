import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { StatusBadge } from '@/components/admin/status-badge';
import { ApplicantSection } from '@/components/seller/applicant-section';
import { SellerBankDetailsForm } from '@/components/seller/bank-details-form';
import { PayoutRequestForm } from '@/components/seller/payout-request-form';
import { SellerEarningsSummary } from '@/components/seller/seller-earnings-summary';
import { SellerPayoutFixes } from '@/components/seller/seller-payout-fixes';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { listPayoutRequests, listSellerLedger, listSellerPayouts } from '@/lib/db/repositories/payouts';
import { sellerPayoutRequestReadiness } from '@/lib/payments/payout-request-readiness';
import { getSellerEarnings } from '@/lib/seller/earnings';
import { sellerDate, sellerMoney } from '@/lib/seller/presentation';
import { assertSellerWorkspaceViewer, readSellerLivePayoutHistory } from '@/lib/seller/workspace-tasks';
import { getSellerChecklist, sellerChecklistView } from '@/lib/sellers/shop-checklist';
import { readEarningsOverview } from './overview-data';
import { EarningsExample, financePanel, openPayoutTracker, PayoutHistory, PayoutTracker, WhereMoneyIs } from './payout-overview';

export const dynamic = 'force-dynamic';

export default async function SellerFinancePage() {
  const seller = await requireSellerCenterPage('/seller/finance');
  if (!seller.approvedSeller || !seller.sellerId) return <ApplicantSection viewer={seller} section="finance" />;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const sellerId = seller.sellerId;
  const [earnings, ledger, payouts, requests, readiness, overview, livePayouts, checklist] = await Promise.all([
    getSellerEarnings(database, sellerId, now),
    listSellerLedger(database, sellerId, 150, now),
    listSellerPayouts(database, sellerId),
    listPayoutRequests(database, sellerId),
    sellerPayoutRequestReadiness(database, sellerId, now).catch(() => ({
      ready: false, maskedBeneficiary: null,
      blocker: 'Payout eligibility could not be checked. Refresh Earnings before asking for a payout.',
    })),
    readEarningsOverview(database, sellerId, seller.userId, now),
    readSellerLivePayoutHistory(database, seller.userId, sellerId),
    getSellerChecklist(database, sellerId, { ownerId: seller.userId, audience: 'seller', now }),
  ]);
  await assertSellerWorkspaceViewer(database, seller.userId, sellerId, seller.authSubject);
  const showRegistered = earnings.participationRoute !== 'managed_maker' || earnings.hasRegisteredRecords;
  const open = openPayoutTracker(payouts, requests);
  const bank = overview.bank;
  const { payoutFixes: fixes } = sellerChecklistView(checklist);
  return <div className="min-w-0 space-y-5 text-[#14213D]">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4DACA] pb-4">
      <h1 className="font-heading text-[1.75rem] font-semibold leading-tight">Earnings</h1>
      <p className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D7C4A9] px-3 text-sm font-semibold">
        <CalendarDays className="size-4" />{new Intl.DateTimeFormat('en-NP', { month: 'long', year: 'numeric', timeZone: 'Asia/Kathmandu' }).format(now)}
      </p>
    </header>

    {open ? <PayoutTracker item={open} overview={overview} /> : null}
    {showRegistered ? <WhereMoneyIs summary={earnings.registered} overview={overview} /> : null}
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div className="min-w-0 space-y-5">
        {showRegistered ? <PayoutRequestForm actorId={seller.userId} sellerId={sellerId}
          availablePaisa={earnings.registered.availablePaisa} readiness={readiness}
          hasOpenRequest={requests.some(request => request.status === 'submitted')} /> : null}
        <SellerPayoutFixes fixes={fixes} place="earnings" canSell={checklist.canSell} />
        <div id="seller-bank-evidence" className="scroll-mt-20">
          <SellerBankDetailsForm accountId={seller.userId} overview correctionRequired={fixes.some(fix => fix.id === 'bank_verification' && fix.turn === 'seller')}
            maskedAccount={bank ? { bankName: bank.bankName, lastFour: bank.lastFour, beneficiary: bank.beneficiary } : null} />
        </div>
      </div>
      <div className="min-w-0 space-y-5">
        {showRegistered || payouts.length || requests.length ? <PayoutHistory payouts={payouts} requests={requests} /> :
          <Link href="/seller/finance/recoveries" className="section-link inline-flex min-h-11 items-center">Recovery statements</Link>}
        {showRegistered ? <EarningsExample earnings={earnings} overview={overview} /> : null}
      </div>
    </div>

    {livePayouts.length ? <section className={financePanel} aria-labelledby="live-payout-history">
      <h2 id="live-payout-history" className="font-bold">Live maker payout history</h2>
      {livePayouts.map(payout => <article id={'live-payout-' + payout.id} key={payout.id} className="scroll-mt-28 space-y-1 border-t border-[#E4DACA] pt-3 text-sm">
        <h3 className="break-all font-semibold">{payout.reference}</h3>
        <p className="capitalize">{payout.status.replaceAll('_', ' ')} · {sellerMoney(payout.amountPaisa)} · {sellerDate(payout.createdAt)}</p>
      </article>)}
    </section> : null}
    {earnings.managed ? <SellerEarningsSummary earnings={earnings} /> : null}

    {showRegistered || ledger.length > 0 ? <details className={financePanel}>
      <summary className="min-h-11 cursor-pointer font-bold">Recorded ledger history</summary>
      {ledger.length ? <ul className="divide-y divide-[#E4DACA]">
        {ledger.map(entry => <li key={entry.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 py-3 text-sm md:grid-cols-[minmax(0,1.15fr)_minmax(0,1.5fr)_minmax(0,1fr)_auto]">
          <p className="min-w-0 capitalize">{entry.type.replaceAll('_', ' ')} <span className="block text-xs text-[#46536F]">{sellerDate(entry.createdAt)}</span></p>
          <p className="col-start-1 row-start-2 min-w-0 break-words font-medium md:col-start-auto md:row-start-auto">{entry.orderNumber ?? entry.payoutNumber ?? 'Account entry'}
            <span className="block text-xs font-normal text-[#46536F]">{entry.productName ?? entry.description}</span></p>
          <div className="row-start-2 text-right md:row-start-auto md:text-left">{entry.payoutNumber ? <StatusBadge status={entry.payoutStatus ?? 'prepared'} /> :
            entry.isAvailable ? 'Available' : entry.availableAt ? sellerDate(entry.availableAt) : 'Held'}</div>
          <p className={`col-start-2 row-start-1 text-right font-semibold md:col-start-auto md:row-start-auto ${entry.amountPaisa < 0 ? 'text-[#A8232E]' : 'text-[#236548]'}`}>{sellerMoney(entry.amountPaisa)}</p>
        </li>)}
      </ul> : <p className="text-sm text-[#46536F]">No entries have accrued in this seller ledger.</p>}
    </details> : null}
    <div className="flex flex-wrap gap-x-5">
      <Link className="section-link inline-flex min-h-11 items-center" href="/seller/form-history?kind=payout-request">Payout request answer history</Link>
      {showRegistered ? <Link className="section-link inline-flex min-h-11 items-center" href="/seller-agreement">Seller Marketplace Agreement</Link> : null}
    </div>
  </div>;
}
