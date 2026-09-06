import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ArrowRight, Inbox } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listSellerApplicationsForReview } from '@/lib/db/repositories/seller-applications';

export const dynamic = 'force-dynamic';

const dateFormatter = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kathmandu',
});

export default async function SellerReviewQueuePage() {
  await requireStaffPage('/admin/sellers', 'seller.application.review');
  const applications = await listSellerApplicationsForReview(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Seller controls</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">Application review queue</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Oldest applications appear first. Submitted applications must be placed under review before a decision.
        </p>
      </div>

      {applications.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Inbox className="size-9 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl">The queue is clear</h2>
            <p className="mt-2 text-sm text-muted-foreground">There are no seller applications waiting for action.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Business</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Tax</TableHead>
                <TableHead>Documents</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead><span className="sr-only">Open</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {applications.map((application) => (
                <TableRow key={application.id}>
                  <TableCell className="pl-4">
                    <p className="font-semibold">{application.tradingName}</p>
                    <p className="text-xs text-muted-foreground">{application.applicationReference}</p>
                  </TableCell>
                  <TableCell>{application.district}</TableCell>
                  <TableCell>{application.taxMode}</TableCell>
                  <TableCell>{application.documentCount}</TableCell>
                  <TableCell><StatusBadge status={application.status} /></TableCell>
                  <TableCell>{dateFormatter.format(new Date(application.createdAt))}</TableCell>
                  <TableCell className="pr-4 text-right">
                    <Link href={`/admin/sellers/${application.id}`} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                      Review <ArrowRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
