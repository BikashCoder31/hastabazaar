import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileCheck2, History, MapPin, ShieldCheck, UserRound } from 'lucide-react';

import { SellerReviewActions } from '@/components/admin/seller-review-actions';
import { StatusBadge } from '@/components/admin/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerApplicationForReview } from '@/lib/db/repositories/seller-applications';

export const dynamic = 'force-dynamic';

const dateTimeFormatter = new Intl.DateTimeFormat('en-NP', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kathmandu',
});

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm leading-6">{children || '—'}</dd>
    </div>
  );
}

export default async function SellerApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireStaffPage(`/admin/sellers/${id}`, 'seller.application.review');
  const application = await getSellerApplicationForReview(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
  );
  if (!application) notFound();

  return (
    <div className="space-y-7">
      <Link href="/admin/sellers" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Back to seller queue
      </Link>

      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <p className="eyebrow">{application.applicationReference}</p>
          <h1 className="mt-2 font-heading text-4xl tracking-tight">{application.tradingName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">Legal name: {application.legalName}</p>
        </div>
        <StatusBadge status={application.status} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,0.6fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Registration and tax</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Registration authority">{application.registrationAuthority}</Detail>
                <Detail label="Registration number">{application.registrationNumber}</Detail>
                <Detail label="Tax mode">{application.taxMode}</Detail>
                <Detail label="PAN / VAT number">{application.taxRegistrationNumber}</Detail>
                <Detail label="Agreement version">{application.sellerAgreementVersion}</Detail>
                <Detail label="Agreement accepted">{application.sellerAgreementAcceptedAt ? dateTimeFormatter.format(new Date(application.sellerAgreementAcceptedAt)) : '—'}</Detail>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-5 text-primary" /> Representative and business</CardTitle></CardHeader>
            <CardContent>
              <dl className="grid gap-5 sm:grid-cols-2">
                <Detail label="Representative">{application.representativeName}</Detail>
                <Detail label="Email">{application.supportEmail}</Detail>
                <Detail label="Phone">{application.supportPhone}</Detail>
                <Detail label="Product categories">{application.productCategories}</Detail>
                <div className="sm:col-span-2"><Detail label="Business description">{application.businessDescription}</Detail></div>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="size-5 text-primary" /> Operating address</CardTitle></CardHeader>
            <CardContent>
              <p className="text-sm leading-6">
                {application.locality}{application.ward ? `, Ward ${application.ward}` : ''}, {application.municipality}, {application.district}, {application.province}, Nepal
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><FileCheck2 className="size-5 text-primary" /> Evidence documents</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {application.documents.map((document) => (
                <div key={document.id} className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold capitalize">{document.kind.replaceAll('_', ' ')}</p>
                    <p className="truncate text-xs text-muted-foreground">{document.originalName} · {formatBytes(document.sizeBytes)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={document.status} />
                    <a href={`/api/admin/seller-documents/${document.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                      Open <ExternalLink className="size-4" />
                    </a>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle>Review decision</CardTitle></CardHeader>
            <CardContent><SellerReviewActions sellerId={application.id} status={application.status} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><History className="size-5 text-primary" /> Moderation history</CardTitle></CardHeader>
            <CardContent>
              {application.history.length === 0 ? (
                <p className="text-sm text-muted-foreground">No staff review action has been recorded yet.</p>
              ) : (
                <ol className="space-y-5">
                  {application.history.map((event) => (
                    <li key={event.id} className="border-l-2 border-primary/25 pl-4">
                      <div className="flex flex-wrap items-center gap-2"><StatusBadge status={event.toStatus} /><span className="text-xs text-muted-foreground">{dateTimeFormatter.format(new Date(event.createdAt))}</span></div>
                      <p className="mt-2 text-sm leading-6">{event.reason}</p>
                      <p className="mt-1 text-xs text-muted-foreground">By {event.actorName} · {event.actorEmail}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
