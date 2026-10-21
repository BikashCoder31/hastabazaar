import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Clock3,
  HandCoins,
  ReceiptText,
} from 'lucide-react';
import { SellerMetric } from './workspace-ui';
import { sellerMoney } from '@/lib/seller/presentation';
import type { SellerEarnings } from '@/lib/seller/earnings';

export function SellerEarningsSummary({
  earnings,
  compact = false,
}: {
  earnings: SellerEarnings;
  compact?: boolean;
}) {
  const { registered, commission, managed } = earnings;
  const showRegistered =
    earnings.participationRoute !== 'managed_maker' ||
    earnings.hasRegisteredRecords;
  return (
    <div className="flex flex-col gap-6">
      {managed ? (
        <section
          aria-labelledby="managed-earnings-title"
          className="flex flex-col gap-4"
        >
          <div>
            <h2 id="managed-earnings-title" className="font-heading text-2xl">
              Managed Maker earnings
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Recorded sale-linked maker amounts. These are separate from
              Registered Seller earnings and fixed supplier payments.
            </p>
            {managed.commercialModel === 'managed_sale_linked_percentage_v1' ? (
              <p className="mt-2 text-sm leading-6">
                {managed.retentionBps !== null ? (
                  <>
                    Saved terms for new sales:{' '}
                    <strong>
                      {managed.retentionBps / 100}% company /{' '}
                      {(10000 - managed.retentionBps) / 100}% maker
                    </strong>
                    . Historical amounts keep their recorded terms.
                  </>
                ) : managed.offeredRetentionBps !== null && managed.offeredRetentionBps !== undefined ? (
                  <>
                    Current offer for new sales:{' '}
                    <strong>{managed.offeredRetentionBps / 100}% company / {(10000 - managed.offeredRetentionBps) / 100}% maker</strong>.
                    {' '}Review and accept these terms in{' '}
                    <Link href="/seller#managed-program" className="font-semibold text-primary underline">Managed Maker program details</Link>
                    {' '}before new sales. Historical amounts keep their recorded terms.
                  </>
                ) : (
                  'Current accepted sale-linked terms need review. Recorded earnings are shown without applying a replacement rate.'
                )}
              </p>
            ) : managed.commercialModel ===
              'managed_fixed_supplier_price_v1' ? (
              <p className="mt-2 text-sm leading-6">
                Fixed supplier prices are separate from the sale-linked totals
                below. View your existing supply history in{' '}
                <Link
                  className="font-semibold text-primary underline"
                  href="/seller#managed-program"
                >
                  Managed Maker program details
                </Link>
                . No percentage is applied to fixed supplier prices.
              </p>
            ) : (
              <p className="mt-2 text-sm leading-6">
                Current sale-linked terms are not available for this route.
                Historical maker amounts keep their recorded terms.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <SellerMetric
              label="Eligible for payment"
              value={sellerMoney(managed.summary.payablePaisa)}
              detail="After the existing release, case and reconciliation checks. Not yet paid."
              icon={HandCoins}
              href={compact ? '/seller/finance' : undefined}
            />
            <SellerMetric
              label="Held or blocked"
              value={sellerMoney(managed.summary.blockedPaisa)}
              detail="Positive unpaid earnings still awaiting release or review. May overlap allocated payouts."
              icon={Clock3}
            />
            <SellerMetric
              label="Allocated to payouts"
              value={sellerMoney(managed.summary.reservedPaisa)}
              detail="Reserved in prepared, approved, processing or failed payouts. Not a payment confirmation."
              icon={ReceiptText}
            />
            <SellerMetric
              label="Recorded paid"
              value={sellerMoney(managed.summary.paidPaisa)}
              detail="Managed payouts whose recorded status is paid."
              icon={Banknote}
            />
          </div>
          {managed.summary.needsReconciliation ? (
            <output className="block rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
              The managed balance needs reconciliation. Payment eligibility is
              blocked for review.
            </output>
          ) : null}
          {!compact ? (
            <p className="text-sm leading-6 text-muted-foreground">
              Unpaid ledger balance: {sellerMoney(managed.summary.balancePaisa)}
              . Refund offsets: {sellerMoney(managed.summary.refundOffsetPaisa)}
              . These figures describe different positions and should not be
              added together. Managed payments are reviewed by Admin; the
              Registered Seller payout requests do not request a managed
              payment.
            </p>
          ) : null}
        </section>
      ) : null}
      {showRegistered ? (
        <section
          aria-labelledby="registered-earnings-title"
          className="flex flex-col gap-4"
        >
          <div>
            <h2
              id="registered-earnings-title"
              className="font-heading text-2xl"
            >
              Registered Seller earnings
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              From the existing Registered Seller ledger and payout records.
              Managed Maker amounts are excluded.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <SellerMetric
              label="Available for payout"
              value={sellerMoney(registered.availablePaisa)}
              detail="Net released entries, excluding amounts already allocated to payouts. Not yet paid."
              icon={HandCoins}
              href={compact ? '/seller/finance' : undefined}
            />
            <SellerMetric
              label="Awaiting release"
              value={sellerMoney(registered.pendingPaisa)}
              detail="Net unallocated entries with a future release date. Unscheduled holds remain in the ledger."
              icon={Clock3}
            />
            <SellerMetric
              label="Recorded paid"
              value={sellerMoney(registered.paidPaisa)}
              detail="Payouts whose recorded status is paid. A payout request does not transfer money."
              icon={Banknote}
            />
            <SellerMetric
              label="Recorded gross sales"
              value={sellerMoney(registered.grossSalesPaisa)}
              detail="Sale entries before commission and seller-liable refunds. This is not your payout balance."
              icon={ReceiptText}
            />
          </div>
          {commission ? <p className="text-sm leading-6">
            {commission.acceptedAt !== null ? 'Accepted fee supplement for new orders: ' : earnings.commissionAccepted === false ? 'Current rate offered for new orders: ' : 'Current saved commission for new orders: '}
            <strong>{commission.basisPoints / 100}% company / {(10000 - commission.basisPoints) / 100}% seller</strong>. Historical entries
            keep their recorded commission.
          </p> : null}
          {earnings.marketplaceFees ? <div className="space-y-2 rounded-xl border p-4">
            <h3 className="font-semibold">Original marketplace fees</h3>
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div><dt>Original standard fees</dt><dd>{sellerMoney(earnings.marketplaceFees.originalStandardPaisa)}</dd></div>
              <div><dt>Original fees waived</dt><dd>{sellerMoney(earnings.marketplaceFees.originalWaivedPaisa)}</dd></div>
              <div><dt>Original net fees</dt><dd>{sellerMoney(earnings.marketplaceFees.originalNetPaisa)}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">Includes original orders before cancellations and refunds. These are not remaining fees or payout balances. Open an order to see its recorded campaign.</p>
          </div> : null}
          {earnings.currentRateUnavailable ? <output className="block text-sm leading-6">Current commission terms are unavailable. New orders require configured, accepted terms. Recorded earnings below keep their original amounts.</output> : earnings.commissionAccepted === false && commission ? (
            <p className="text-sm leading-6 text-amber-800 dark:text-amber-200">
              {earnings.offeredCommissionBps !== undefined && earnings.offeredCommissionBps !== commission.basisPoints ? (
                <>Current base terms offered: <strong>{earnings.offeredCommissionBps / 100}% company / {(10000 - earnings.offeredCommissionBps) / 100}% seller</strong>.{' '}</>
              ) : null}
              Acceptance is required before new orders.{' '}
              <Link href="/seller" className="font-semibold underline">Review and accept the current seller terms</Link>.
            </p>
          ) : null}
          {!compact ? (
            <dl className="grid gap-4 rounded-2xl border bg-card p-5 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">
                  Recorded commission deductions
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {sellerMoney(registered.commissionPaisa)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Recorded commission reversals
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {sellerMoney(registered.commissionReversalPaisa)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">
                  Recorded seller-liable refunds
                </dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  {sellerMoney(registered.refundPaisa)}
                </dd>
              </div>
            </dl>
          ) : null}
        </section>
      ) : null}
      {compact ? (
        <Link
          href="/seller/finance"
          className="section-link min-h-11 self-start"
        >
          View earnings and payout history
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}
