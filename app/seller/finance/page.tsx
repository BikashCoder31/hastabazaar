import { env } from 'cloudflare:workers';
import { Banknote, Clock3, HandCoins, ReceiptText } from 'lucide-react';
import Link from 'next/link';

import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import {
  getSellerFinanceSummary,
  listSellerLedger,
  listSellerPayouts,
  listPayoutRequests,
} from '@/lib/db/repositories/payouts';
import { PayoutRequestForm } from '@/components/seller/payout-request-form';
import { getCommissionSetting } from '@/lib/db/repositories/marketplace-settings';

export const dynamic = 'force-dynamic';
const money = (paisa: number) =>
  new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' }).format(
    paisa / 100,
  );
const date = (value: number) =>
  new Intl.DateTimeFormat('en-NP', {
    dateStyle: 'medium',
    timeZone: 'Asia/Kathmandu',
  }).format(new Date(value));

export default async function SellerFinancePage() {
  const seller = await requireSellerPage('/seller/finance');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [summary, ledger, payouts, requests, commissionSetting] =
    await Promise.all([
      getSellerFinanceSummary(database, seller.sellerId),
      listSellerLedger(database, seller.sellerId),
      listSellerPayouts(database, seller.sellerId),
      listPayoutRequests(database, seller.sellerId),
      getCommissionSetting(database),
    ]);
  const cards = [
    {
      label: 'Available for payout',
      value: summary.availablePaisa,
      icon: HandCoins,
    },
    { label: 'Pending release', value: summary.pendingPaisa, icon: Clock3 },
    { label: 'Paid to you', value: summary.paidPaisa, icon: Banknote },
    {
      label: 'Gross completed, paid sales',
      value: summary.grossSalesPaisa,
      icon: ReceiptText,
    },
  ];
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Seller finance</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Earnings and settlements
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
          Completed, paid sales become available after the policy hold.
          Commission, reserves, refunds, commission reversals, and every payout
          remain visible as immutable entries.
        </p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
          HastaBazaar charges a {commissionSetting.percent}% commission on the product selling value after
          seller-funded discounts, excluding separately stated product taxes and
          delivery charges. Discounts funded entirely by HastaBazaar do not
          reduce the seller&apos;s agreed product value. Taxes legally chargeable on
          the commission are itemised separately.{' '}
          <Link href="/seller-agreement" className="font-semibold text-primary underline">
            Seller Marketplace Agreement
          </Link>
        </p>
        <p className="mt-3"><Link className="section-link" href="/seller/form-history?kind=payout-request">Payout request answer history</Link></p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="grid grid-cols-[1fr_auto] items-center">
              <CardTitle className="font-sans text-sm text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="size-5 text-primary" />
            </CardHeader>
            <CardContent>
              <p className="break-words font-heading text-3xl tabular-nums">
                {money(value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
      <PayoutRequestForm
        sellerId={seller.sellerId}
        availablePaisa={summary.availablePaisa}
        hasOpenRequest={requests.some(
          (request) => request.status === 'submitted',
        )}
      />
      {requests.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Payout requests</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {requests.map((request) => (
              <div
                key={request.id}
                className="flex flex-wrap justify-between gap-3 border-b py-3 text-sm"
              >
                <span>
                  {date(request.createdAt)} · {request.sellerNote}
                  {request.processingNote ? (
                    <span className="mt-2 block text-muted-foreground">
                      Admin note: {request.processingNote}
                    </span>
                  ) : null}
                </span>
                <strong className="capitalize">{request.status}</strong>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Balance details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm sm:grid-cols-4">
          <div>
            <p className="text-muted-foreground">
              Commission (current rate {commissionSetting.percent}%)
            </p>
            <p className="mt-1 font-semibold">
              {money(Math.abs(summary.commissionPaisa))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Commission reversals</p>
            <p className="mt-1 font-semibold">
              {money(summary.commissionReversalPaisa)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Seller-liable refunds</p>
            <p className="mt-1 font-semibold">
              {money(Math.abs(summary.refundPaisa))}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Payout eligibility</p>
            <p className="mt-1 font-semibold">Any positive available balance</p>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Settlement history</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payout has been prepared yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Prepared</TableHead>
                  <TableHead>Reference</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="font-semibold">
                      {payout.payoutNumber}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={payout.status} />
                    </TableCell>
                    <TableCell>{money(payout.amountPaisa)}</TableCell>
                    <TableCell>{date(payout.createdAt)}</TableCell>
                    <TableCell>{payout.providerReference ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Earnings ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No delivered earnings have accrued yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Order / product</TableHead>
                  <TableHead>Availability</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{date(entry.createdAt)}</TableCell>
                    <TableCell className="capitalize">
                      {entry.type.replaceAll('_', ' ')}
                    </TableCell>
                    <TableCell>
                      <span className="block font-medium">
                        {entry.orderNumber ??
                          entry.payoutNumber ??
                          'Account entry'}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.productName ?? entry.description}
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.payoutNumber ? (
                        <StatusBadge
                          status={entry.payoutStatus ?? 'prepared'}
                        />
                      ) : entry.isAvailable ? (
                        'Available'
                      ) : entry.availableAt ? (
                        date(entry.availableAt)
                      ) : (
                        'Held'
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-semibold ${entry.amountPaisa < 0 ? 'text-destructive' : 'text-emerald-700'}`}
                    >
                      {money(entry.amountPaisa)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
