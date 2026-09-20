import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Paperclip } from 'lucide-react';
import { SellerCaseResponseForm } from '@/components/seller/case-response-form';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerReturnDetail } from '@/lib/db/repositories/returns';

export const dynamic = 'force-dynamic';
export default async function SellerReturnCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/cases/returns/${id}`);
  const item = await getSellerReturnDetail(
    requireDatabase(env as unknown as { DB?: D1Database }),
    id,
    seller.sellerId,
  );
  if (!item) notFound();
  return (
    <div>
      <Link
        href="/seller/cases"
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
            Order {item.orderNumber} · {item.quantity} item(s)
          </p>
        </div>
        <Status value={item.status} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="font-heading text-2xl">Customer request</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="Reason">{item.reason.replaceAll('_', ' ')}</Detail>
              <Detail label="Requested resolution">
                {item.requestedResolution}
              </Detail>
              <Detail label="Eligibility">{item.eligibilityDecision}</Detail>
              <Detail label="Policy result">{item.eligibilityReasonEn}</Detail>
            </dl>
            <p className="mt-5 whitespace-pre-wrap rounded-xl bg-muted/35 p-4 text-sm leading-6">
              {item.detail}
            </p>
          </section>
          <section className="rounded-2xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-heading text-2xl">
              <Paperclip className="size-5 text-primary" />
              Evidence
            </h2>
            {item.evidence.length ? (
              <ul className="mt-4 space-y-2">
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
              <p className="mt-4 text-sm text-muted-foreground">
                No evidence file was supplied. This alone does not decide the
                claim.
              </p>
            )}
          </section>
        </div>
        <aside className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Your response</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Share only facts relevant to the item and fulfilment. HastaBazaar
            makes the final decision.
          </p>
          <div className="mt-5">
            {item.sellerResponse ? (
              <p className="mb-4 whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-base leading-7">
                <strong className="block">Your recorded response</strong>
                {item.sellerResponse}
              </p>
            ) : null}
            <SellerCaseResponseForm
              kind="return"
              id={item.id}
              disabled={
                Boolean(item.sellerResponse) || item.status !== 'requested'
              }
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
function Status({ value }: { value: string }) {
  return (
    <span className="h-fit rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold capitalize">
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
