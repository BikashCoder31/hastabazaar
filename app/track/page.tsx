import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { OrderTracker } from '@/components/commerce/order-tracker';

export const metadata = {
  title: 'Track your order',
  robots: { index: false, follow: true },
};
export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const params = await searchParams;
  return (
    <>
      <SiteHeader />
      <main tabIndex={-1} id="main-content" className="shell max-w-3xl py-12 sm:py-16">
        <p className="eyebrow">From our makers to your door</p>
        <h1 className="mt-3 font-heading text-4xl sm:text-5xl">
          Where’s my order?
        </h1>
        <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
          Follow your order from confirmation to delivery. Have your order
          number and checkout email ready—no account needed.
        </p>
        <OrderTracker
          initialOrder={
            typeof params.order === 'string' ? params.order.slice(0, 80) : ''
          }
        />
      </main>
      <SiteFooter />
    </>
  );
}
