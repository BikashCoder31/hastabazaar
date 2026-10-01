import { can } from '@/lib/marketplace/permissions';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, History, Paperclip } from 'lucide-react';
import { ReturnCaseActions } from '@/components/admin/return-case-actions';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { getOperationsReturnDetail } from '@/lib/db/repositories/returns';

export const dynamic = 'force-dynamic';
export default async function AdminReturnCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const staff = await requireStaffPage(
    `/admin/cases/returns/${id}`,
    'refund.approve.standard',
  );
  const item = await getOperationsReturnDetail(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
  );
  if (!item) notFound();
  return (
    <div>
      <Link
        href="/admin/cases"
        className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Back to cases
      </Link>
      <div className="mt-6 flex flex-wrap justify-between gap-4">
        <div>
          <p className="eyebrow">{item.referenceNumber}</p>
          <h1 className="mt-2 font-heading text-4xl">{item.productName}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Order {item.orderNumber} · sold by {item.sellerName}
          </p>
        </div>
        <Status value={item.status} />
      </div>
      <div className="mt-8 grid gap-6 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Request and eligibility</h2>
            <dl className="mt-5 grid gap-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Reason">{item.reason.replaceAll('_', ' ')}</Detail>
              <Detail label="Resolution requested">
                {item.requestedResolution}
              </Detail>
              <Detail label="Quantity">
                {item.quantity} of {item.itemQuantity}
              </Detail>
              <Detail label="Automated eligibility">
                {item.eligibilityDecision}
              </Detail>
              <Detail label="Original seal reported intact">
                {item.originalSealIntact ? 'Yes — verify during review' : 'No'}
              </Detail>
              <Detail label="Item value">
                {money(item.lineTotalPaisa || 0)}
              </Detail>
              <Detail label="Delivery paid">
                {money(item.deliveryChargePaisa || 0)}
              </Detail>
            </dl>
            <p className="mt-5 rounded-xl bg-muted/35 p-4 text-sm leading-6">
              {item.eligibilityReasonEn}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-7">
              {item.detail}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Parties and evidence</h2>
            <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Customer contact">
                <span className="normal-case">
                  {item.customerEmail}
                  <br />
                  {item.customerPhone}
                </span>
              </Detail>
              <Detail label="Seller response">
                <span className="normal-case">
                  {item.sellerResponse || 'Awaiting response or not required'}
                </span>
              </Detail>
            </div>
            <h3 className="mt-6 flex items-center gap-2 font-semibold">
              <Paperclip className="size-4 text-primary" />
              Private evidence
            </h3>
            {item.evidence.length ? (
              <ul className="mt-3 space-y-2">
                {item.evidence.map((file) => (
                  <li key={file.id}>
                    <a
                      className="text-sm font-semibold text-primary hover:underline"
                      href={`/api/return-evidence/${file.id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {file.originalName} · {Math.ceil(file.sizeBytes / 1024)}{' '}
                      KB
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                No files supplied; do not reject a statutory claim on this fact
                alone.
              </p>
            )}
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-heading text-2xl">
              <History className="size-5 text-primary" />
              Case history
            </h2>
            <ol className="mt-5 space-y-4">
              {item.events.map((event) => (
                <li
                  key={event.id}
                  className="border-l-2 border-primary/30 pl-4"
                >
                  <div className="flex flex-wrap gap-2">
                    <Status value={event.toStatus} />
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.createdAt).toLocaleString('en-NP')} ·{' '}
                      {event.actorType.replaceAll('_', ' ')}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">{event.publicMessageEn}</p>
                </li>
              ))}
            </ol>
          </section>
        </div>
        <aside className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Decision and operations</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Amounts are entered in NPR and stored as integer paisa. Refunds at
              or above NPR 10,000 require a different Super Admin.
            </p>
            <div className="mt-5">
              <ReturnCaseActions
                id={item.id}
                status={item.status}
                outcome={item.resolutionOutcome}
                refundStatus={item.refundStatus}
                role={staff.role}
                canApproveStandard={can(staff, 'refund.approve.standard')}
                quantity={item.quantity}
              />
            </div>
          </section>
          {item.refundId ? (
            <section className="rounded-2xl border bg-card p-6">
              <h2 className="font-heading text-2xl">Refund record</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt>Cash to refund</dt>
                  <dd>{money((item.refundAmountPaisa || 0) - (item.refundWalletPaisa || 0) - (item.refundDiscountPaisa || 0))}</dd>
                </div>
                <div className="flex justify-between"><dt>Shopping credit to restore</dt><dd>{money(item.refundWalletPaisa || 0)}</dd></div>
                <div className="flex justify-between"><dt>Referral discount (not refundable)</dt><dd>{money(item.refundDiscountPaisa || 0)}</dd></div>
                <p className="text-xs leading-5 text-muted-foreground">Refund only the cash amount shown. Shopping credit is restored automatically when this refund is completed. For a credit-only refund, use an internal completion reference.</p>
                <div className="flex justify-between">
                  <dt>Status</dt>
                  <dd className="capitalize">
                    {item.refundStatus?.replaceAll('_', ' ')}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt>High value</dt>
                  <dd>{item.isHighValue ? 'Yes' : 'No'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>Reference</dt>
                  <dd>{item.refundProviderReference || '—'}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
function money(paisa: number) {
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}
function Status({ value }: { value: string }) {
  return (
    <span className="h-fit rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold capitalize">
      {value.replaceAll('_', ' ')}
    </span>
  );
}
function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 capitalize">{children}</dd>
    </div>
  );
}
