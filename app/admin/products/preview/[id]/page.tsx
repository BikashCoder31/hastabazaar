import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getAuthenticatedUser } from '@/app/auth';
import { StorefrontProductDetail } from '@/components/catalog/storefront-product-detail';
import { requireDatabase } from '@/lib/db/d1';
import { DeliveryRateConflictError, getDeliveryRates } from '@/lib/db/repositories/delivery-rates';
import { previewSource, readProductPreview } from './preview-data';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const metadata: Metadata = {
  title: 'Product preview',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
};

export default async function ProductPreviewPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query, actor] = await Promise.all([
    params, searchParams, getAuthenticatedUser({ readOnly: true }),
  ]);
  const source = previewSource(query.source);
  if (!actor || !source) notFound();

  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const preview = await readProductPreview(db, actor.userId, id, source);
  if (!preview) notFound();

  const rates = preview.preparationRecorded ? await getDeliveryRates(db).catch(error => {
    if (error instanceof DeliveryRateConflictError) return null;
    throw error;
  }) : null;
  const safeId = encodeURIComponent(id);
  const backPath = source === 'draft'
    ? `/seller/products/new?draftId=${safeId}`
    : `/admin/products/${source === 'publication' ? 'publications' : 'intakes'}?case=${safeId}#catalog-request-detail`;
  const mediaQuery = new URLSearchParams({ version: preview.versionId });
  if (source !== 'draft') mediaQuery.set('source', source);
  const product = {
    ...preview.product,
    media: preview.product.media.map(file => ({
      ...file, src: `/admin/products/preview/${safeId}/media/${encodeURIComponent(file.id)}?${mediaQuery}`,
    })),
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed inset-x-0 top-0 z-40 border-b border-[#14213D]/20 bg-[#14213D] text-white">
        <div className="shell flex min-h-[5.5rem] flex-col items-start justify-center gap-0.5 py-2 sm:min-h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="text-sm font-semibold">Preview — not live. Shoppers can&apos;t see this yet.</p>
          <a href={backPath} className="inline-flex min-h-11 items-center gap-2 rounded-md font-semibold underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2">
            <ArrowLeft className="size-4 shrink-0" aria-hidden="true" /> {source === 'draft' ? 'Back to product editor' : 'Back to Catalog'}
          </a>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className="shell pb-12 pt-24 [overflow-wrap:anywhere] sm:pt-20">
        <StorefrontProductDetail
          product={product}
          deliveryRates={rates}
          preview={{ offerId: typeof query.offer === 'string' ? query.offer : undefined, preparationRecorded: preview.preparationRecorded }}
        />
      </main>
    </div>
  );
}
