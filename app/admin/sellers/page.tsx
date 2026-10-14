import { AdminQueueFields } from '@/components/admin/admin-queue-fields';
import { Button } from '@/components/ui/button';
import { loadQueryPresentationConfig } from '@/lib/catalog/shop-query';
import {
  normalizeQueueFilters,
  sellerQueueStatuses,
  queuePageHref,
} from '@/lib/admin/queue-filters';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Inbox } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status-badge';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
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
  getSellerRegistryCounts,
  listSellerRegistry,
} from '@/lib/db/repositories/seller-applications';

export const dynamic = 'force-dynamic';

const pageSize = 50;
const dateFormatter = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kathmandu',
});

function normalizedPage(value: string | undefined): number {
  const parsed = Number(value ?? '1');
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

export default async function SellerRegistryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; status?: string }>;
}) {
  await requireStaffPage('/admin/sellers', 'seller.application.review');
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const filters = normalizeQueueFilters(params, sellerQueueStatuses);
  const [counts, matchingCounts, presentation] = await Promise.all([
    getSellerRegistryCounts(database),
    getSellerRegistryCounts(database, filters),
    loadQueryPresentationConfig(database, 'staff.seller-registry-filter'),
  ]);
  const pageCount = Math.max(1, Math.ceil(matchingCounts.total / pageSize));
  const requestedPage = normalizedPage(params.page);
  const page = Math.min(requestedPage, pageCount);
  const sellers = await listSellerRegistry(database, page, pageSize, filters);

  const summaries = [
    { label: 'Total registered', value: counts.total },
    { label: 'Approved', value: counts.approved },
    {
      label: 'Awaiting review',
      value: counts.submitted + counts.underReview,
    },
    { label: 'Needs changes', value: counts.needsChanges },
    { label: 'Rejected', value: counts.rejected },
    { label: 'Suspended', value: counts.suspended },
    { label: 'Draft', value: counts.draft },
  ] as const;

  return (
    <div className="space-y-7">
      <div>
        <p className="eyebrow">Seller controls</p>
        <h1 className="mt-2 font-heading text-4xl tracking-tight">
          Registered sellers
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          Review every seller profile, including approved, rejected and
          suspended accounts. Open a seller to inspect registration, tax,
          contact, address, documents and moderation history.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Find a seller</CardTitle>
          <CardDescription>
            Search all registered sellers or focus on applications awaiting
            review.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            data-form-id="staff.seller-registry-filter"
            method="GET"
            action="/admin/sellers"
            className="flex flex-col gap-4"
          >
            <AdminQueueFields
              id="seller-registry"
              formId="staff.seller-registry-filter"
              filters={filters}
              statuses={sellerQueueStatuses}
              presentation={presentation.config}
              searchHelp="Seller name, application reference, owner email or phone."
            />
            <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
              {filters.q || filters.status ? (
                <Button
                  className="flex-1 sm:flex-none"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href="/admin/sellers" />}
                >
                  Clear filters
                </Button>
              ) : null}
              <Button type="submit" className="flex-1 sm:flex-none">
                Apply filters
              </Button>
            </div>
          </form>
          {presentation.unavailable ? (
            <output className="block mt-3 text-sm text-muted-foreground">
              Filter labels could not load. Standard filters remain available.
            </output>
          ) : null}
        </CardContent>
      </Card>

      <section
        aria-label="Seller registration totals"
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        {summaries.map((summary) => (
          <Card key={summary.label}>
            <CardContent className="py-5">
              <p className="text-sm text-muted-foreground">{summary.label}</p>
              <p className="mt-2 font-heading text-3xl tabular-nums">
                {summary.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
        <div>
          <h2 className="font-heading text-2xl">Seller registry</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Newest registrations appear first. Showing {sellers.length} of{' '}
            {matchingCounts.total} matching seller profiles.
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          Page {page} of {pageCount}
        </p>
      </div>

      {matchingCounts.total === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-14 text-center">
            <Inbox className="size-9 text-muted-foreground" />
            <h2 className="mt-4 font-heading text-xl">
              {counts.total === 0
                ? 'No seller profiles registered'
                : 'No matching sellers'}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {counts.total === 0
                ? 'New seller applications will appear here after submission.'
                : 'Try another name or status, or clear the filters.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Seller</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Registration</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Registered</TableHead>
                <TableHead>
                  <span className="sr-only">Open seller</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sellers.map((seller) => (
                <TableRow key={seller.id}>
                  <TableCell className="max-w-64 pl-4 whitespace-normal">
                    <p className="font-semibold">{seller.tradingName}</p>
                    <p className="text-xs text-muted-foreground">
                      {seller.legalName}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {seller.applicationReference}
                    </p>
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    <p>{seller.ownerName}</p>
                    <p className="text-xs text-muted-foreground">
                      {seller.ownerEmail}
                    </p>
                    {seller.accountStatus !== 'active' ? (
                      <p className="mt-1 text-xs font-semibold text-destructive">
                        Account: {seller.accountStatus}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    <p>{seller.supportEmail}</p>
                    <p className="text-xs text-muted-foreground">
                      {seller.supportPhone}
                    </p>
                  </TableCell>
                  <TableCell>{seller.district}</TableCell>
                  <TableCell>
                    <p className="capitalize">
                      {seller.applicantType ?? 'Legacy'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {seller.taxMode} · {seller.documentCount} documents
                    </p>
                  </TableCell>
                  <TableCell>
                    <p>{seller.productCount} products</p>
                    <p className="text-xs text-muted-foreground">
                      {seller.orderCount} orders
                    </p>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={seller.status} />
                  </TableCell>
                  <TableCell>
                    {dateFormatter.format(new Date(seller.createdAt))}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <Link
                      href={`/admin/sellers/${seller.id}`}
                      className="inline-flex min-h-11 items-center gap-1 font-semibold text-primary hover:underline"
                    >
                      <span className="sr-only">
                        Review {seller.tradingName}:{' '}
                      </span>
                      Details <ArrowRight className="size-4" />
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Seller registry pages"
          className="flex items-center justify-between gap-4"
        >
          {page > 1 ? (
            <Link
              href={queuePageHref('/admin/sellers', filters, page - 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-muted"
            >
              <ArrowLeft className="size-4" /> Previous
            </Link>
          ) : (
            <span />
          )}
          {page < pageCount ? (
            <Link
              href={queuePageHref('/admin/sellers', filters, page + 1)}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold hover:bg-muted"
            >
              Next <ArrowRight className="size-4" />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
