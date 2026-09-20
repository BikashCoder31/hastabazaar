import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { SellerCaseResponseForm } from '@/components/seller/case-response-form';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { getSellerComplaintDetail } from '@/lib/db/repositories/complaints';

export const dynamic = 'force-dynamic';
export default async function SellerComplaintCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const seller = await requireSellerPage(`/seller/cases/complaints/${id}`);
  const item = await getSellerComplaintDetail(
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
          <h1 className="mt-2 font-heading text-4xl">{item.subject}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {item.productName || 'Shop-related case'} · {item.category}
          </p>
        </div>
        <span className="h-fit rounded-full bg-secondary px-3 py-1.5 text-sm font-semibold capitalize">
          {item.status.replaceAll('_', ' ')}
        </span>
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Complaint details</h2>
          <p className="mt-4 whitespace-pre-wrap text-base leading-7">
            {item.detail}
          </p>
          <p className="mt-5 text-sm text-muted-foreground">
            Customer contact details and exact address are hidden from this
            view.
          </p>
        </section>
        <aside className="rounded-2xl border bg-card p-6">
          <h2 className="font-heading text-2xl">Your response</h2>
          <div className="mt-5">
            {item.sellerResponse ? (
              <p className="mb-4 whitespace-pre-wrap rounded-xl bg-secondary/60 p-4 text-base leading-7">
                <strong className="block">Your recorded response</strong>
                {item.sellerResponse}
              </p>
            ) : null}
            <SellerCaseResponseForm
              kind="complaint"
              id={item.id}
              disabled={
                Boolean(item.sellerResponse) ||
                ['resolved', 'closed'].includes(item.status)
              }
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
