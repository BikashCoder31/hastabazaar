import { env } from 'cloudflare:workers';
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
  listSellerLedger,
  listSellerPayouts,
  listPayoutRequests,
} from '@/lib/db/repositories/payouts';
import { PayoutRequestForm } from '@/components/seller/payout-request-form';
import { getSellerEarnings } from '@/lib/seller/earnings';
import { SellerEarningsSummary } from '@/components/seller/seller-earnings-summary';

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
  const [earnings, ledger, payouts, requests] = await Promise.all([
    getSellerEarnings(database, seller.sellerId),
    listSellerLedger(database, seller.sellerId),
    listSellerPayouts(database, seller.sellerId),
    listPayoutRequests(database, seller.sellerId),
  ]);
  const summary = earnings.registered;
  const showRegistered =
    earnings.participationRoute !== 'managed_maker' ||
    earnings.hasRegisteredRecords;
  return (
    <div className="space-y-8">
      <div>
        <p className="eyebrow">Seller finance</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Earnings and settlements
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-muted-foreground">
          See what is available, what is waiting and what has been recorded as
          paid. All amounts come from existing financial records. Dates use
          Nepal time.
        </p>
        {showRegistered ? (
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
            Registered Seller commission is charged on the product selling value
            after seller-funded discounts, excluding separately stated product
            taxes and delivery charges. Discounts funded entirely by HastaBazaar
            do not reduce the seller&apos;s agreed product value. Taxes legally
            chargeable on the commission are itemised separately.{' '}
            <Link
              href="/seller-agreement"
              className="font-semibold text-primary underline"
            >
              Seller Marketplace Agreement
            </Link>
          </p>
        ) : null}
        <p className="mt-3">
          <Link
            className="section-link"
            href="/seller/form-history?kind=payout-request"
          >
            Payout request answer history
          </Link>
        </p>
      </div>
      <SellerEarningsSummary earnings={earnings} />
      {showRegistered ? (
        <PayoutRequestForm
          sellerId={seller.sellerId}
          availablePaisa={summary.availablePaisa}
          hasOpenRequest={requests.some(
            (request) => request.status === 'submitted',
          )}
        />
      ) : null}
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
      {showRegistered || payouts.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Registered Seller payout history</CardTitle>
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
      ) : null}
      {showRegistered || ledger.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Recorded ledger history</CardTitle>
          </CardHeader>
          <CardContent>
            {ledger.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No entries have accrued in this seller ledger. Managed Maker
                amounts are shown separately above.
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
      ) : null}
    </div>
  );
}
