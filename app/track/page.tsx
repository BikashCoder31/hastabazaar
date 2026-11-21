import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OrderTracker } from '@/components/commerce/order-tracker';
import { env } from 'cloudflare:workers';
import { loadQueryPresentationConfig } from '@/lib/catalog/shop-query';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Track your order',
  robots: { index: false, follow: true },
};
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const [params, presentation] = await Promise.all([
    searchParams,
    loadQueryPresentationConfig(
      (env as unknown as { DB?: D1Database }).DB,
      'commerce.order-tracking',
    ),
  ]);
  return (
    <>
      <SiteHeader />
      <main
        tabIndex={-1}
        id="main-content"
        className="shell max-w-3xl py-8 sm:py-12"
      >
        <h1 className="font-heading text-4xl tracking-tight sm:text-5xl">
          Track an order
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
          See where each parcel is using your order number and checkout email.
        </p>
        <OrderTracker
          presentationConfig={presentation.config}
          presentationUnavailable={presentation.unavailable}
          initialOrder={
            typeof params.order === 'string' ? params.order.slice(0, 80) : ''
          }
        />
      </main>
      <SiteFooter compact />
    </>
  );
}
