import { env } from 'cloudflare:workers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
import {readPayoutRequestFinanceScope} from '@/lib/admin/finance-work-items';
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

export default async function PayoutsPage({searchParams}:{searchParams?:Promise<{sellerId?:string;request?:string;returnTo?:string}>}={}) {
  const staff = await requireStaffPage('/admin/payouts', 'payout.prepare');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const query=await searchParams??{};if(query.sellerId!==undefined&&typeof query.sellerId!=='string')notFound();
  const sellerId=query.sellerId?.slice(0,100),returnTo=safeAdminReturnTo(query.returnTo);
  if(query.request!==undefined){
    const request=await readPayoutRequestFinanceScope(database,staff.id,query.request);if(!request||sellerId&&request.sellerId!==sellerId)notFound();
    return <div id={'payout-request-'+request.id} className="space-y-5"><Link className="underline" href={returnTo}>Back to previous view</Link><h1 className="font-heading text-4xl">Original seller payout request</h1><p>{request.tradingName} · {request.status}</p><p>Originally submitted {date(request.createdAt)}{request.firstFinanceDueAt!==null?' · Original Finance review target '+date(request.firstFinanceDueAt):' · Original target needs reconciliation'}</p>{request.sellerNote?<p>Submitted request note: {request.sellerNote}</p>:null}{request.processingNote?<p>Recorded decision note: {request.processingNote}</p>:null}{request.status==='submitted'?<PayoutRequestActions id={request.id} actorId={staff.id} role={staff.role}/>:null}{request.payoutId?<Link className="underline" href={withAdminReturnTo('/admin/payments/payouts?model=registered&payout='+encodeURIComponent(request.payoutId),'/admin/payouts?request='+encodeURIComponent(request.id))}>Open exact original payout instruction</Link>:null}</div>;
  }
  const [candidates, payouts, requests] = await Promise.all([
    listPayoutCandidates(database,undefined,sellerId),
    listPayoutsForOperations(database,sellerId),
    listPayoutRequests(database,sellerId),
  ]);
  return (
    <div className="space-y-8">
      <Link className="underline" href={returnTo}>Back to previous view</Link>
      {sellerId?<p>Showing records for seller {sellerId}. <Link className="underline" href="/admin/payouts">All sellers</Link></p>:null}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">Seller settlements</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">
            Payout control
          </h1>
          <Link className="mt-3 block underline" href="/admin/payments/payouts">Verified funding and actual payout transfers</Link>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
            {staff.role==='super_admin'?'Your eligible payout is approved when saved. Payment processing and recording remain separate actions.':'Admins prepare eligible balances. A Super Admin approves them before any payment can be recorded.'}
          </p>
        </div>
        <AccrueEarningsButton />
      </div>
      <Card><CardHeader><CardTitle>How a payout moves forward</CardTitle></CardHeader><CardContent>
        <ol className="grid list-decimal gap-4 pl-5 text-sm leading-6 md:grid-cols-3">
          <li><strong>Check eligibility.</strong> Earnings become payable only after the sale is paid, delivered and eligible under its recorded hold, reserve and adjustment rules.</li>
          <li><strong>Review and prepare.</strong> Check the verified receiving account and available balance. {staff.role === 'super_admin' ? 'Your eligible payout is approved when saved.' : 'Super Admin reviews a prepared payout.'}</li>
          <li><strong>Process, then record.</strong> An approval does not send money. Process the payment separately and record the actual payment reference or failure.</li>
        </ol>
      </CardContent></Card>
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
                <p className="mt-1 text-muted-foreground">Purpose: {request.purpose==='seller_earnings_payout'?'Seller earnings payout':'Historical request'}{request.firstFinanceDueAt!==null?' · Original Finance review target '+new Date(request.firstFinanceDueAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'}):' · Original target needs reconciliation'}</p>
                {request.status === 'submitted' ? (
                  <PayoutRequestActions id={request.id} actorId={staff.id} role={staff.role} />
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
              payout decisions
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
              Among the loaded history · existing prepared payouts awaiting a decision
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
                        role={staff.role}
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
