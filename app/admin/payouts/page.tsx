import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ArrowRight, Banknote, ShieldCheck } from 'lucide-react';

import {
  AccrueEarningsButton,
  PreparePayoutButton,
} from '@/components/admin/payout-actions';
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
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import {
  listPayoutCandidates,
  listPayoutsForOperations,
  listPayoutRequests,
} from '@/lib/db/repositories/payouts';
import { PayoutRequestActions } from '@/components/admin/payout-request-actions';

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
const mask = (value: string) =>
  value.length <= 4 ? '••••' : `•••• ${value.slice(-4)}`;

export default async function PayoutsPage() {
  await requireStaffPage('/admin/payouts', 'payout.prepare');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [candidates, payouts, requests] = await Promise.all([
    listPayoutCandidates(database),
    listPayoutsForOperations(database),
    listPayoutRequests(database),
  ]);
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Seller settlements</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            Payout control
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            Admins prepare eligible balances. A different Super Admin approves
            them before any payment can be recorded.
          </p>
        </div>
        <AccrueEarningsButton />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Seller payout requests</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No seller payout requests.
            </p>
          ) : (
            requests.map((request) => (
              <div key={request.id} className="border-b py-3 text-sm">
                <div className="flex flex-wrap justify-between gap-3">
                  <span>
                    <strong>{request.tradingName}</strong> ·{' '}
                    {request.sellerNote}
                  </span>
                  <span className="capitalize">{request.status}</span>
                </div>
                {request.status === 'submitted' ? (
                  <PayoutRequestActions id={request.id} />
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Banknote className="size-5 text-primary" /> Eligible sellers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-4xl">{candidates.length}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Positive available balances with a verified payout destination
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" /> Pending
              independent approval
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-4xl">
              {
                payouts.filter(
                  (payout) =>
                    payout.status === 'prepared' ||
                    payout.status === 'scheduled',
                ).length
              }
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Among the loaded payout history · maker-checker separation
              enforced
            </p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Balances ready to prepare</CardTitle>
        </CardHeader>
        <CardContent>
          {candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No verified seller currently has a positive available payout balance.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seller</TableHead>
                  <TableHead>Ledger entries</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Available</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.map((candidate) => (
                  <TableRow key={candidate.sellerId}>
                    <TableCell className="font-semibold">
                      {candidate.tradingName}
                    </TableCell>
                    <TableCell>{candidate.entryCount}</TableCell>
                    <TableCell>
                      {mask(candidate.destinationReference)}
                    </TableCell>
                    <TableCell>{money(candidate.amountPaisa)}</TableCell>
                    <TableCell>
                      <PreparePayoutButton
                        sellerId={candidate.sellerId}
                        sellerName={candidate.tradingName}
                        amount={money(candidate.amountPaisa)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payout history</CardTitle>
        </CardHeader>
        <CardContent>
          {payouts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payouts have been prepared.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payout</TableHead>
                  <TableHead>Seller</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Prepared</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((payout) => (
                  <TableRow key={payout.id}>
                    <TableCell className="font-semibold">
                      {payout.payoutNumber}
                    </TableCell>
                    <TableCell>{payout.tradingName}</TableCell>
                    <TableCell>
                      <StatusBadge status={payout.status} />
                    </TableCell>
                    <TableCell>{money(payout.amountPaisa)}</TableCell>
                    <TableCell>{date(payout.createdAt)}</TableCell>
                    <TableCell>
                      <Link
                        href={`/admin/payouts/${payout.id}`}
                        className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                      >
                        Review <ArrowRight className="size-4" />
                      </Link>
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
