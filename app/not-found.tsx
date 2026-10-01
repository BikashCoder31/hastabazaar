import Link from 'next/link';
import { Search } from 'lucide-react';

export default function NotFound() {
  return (
    <main tabIndex={-1} id="main-content" className="shell flex min-h-[75vh] items-center justify-center py-16">
      <div className="max-w-xl text-center">
        <p className="eyebrow">HastaBazaar · Page not found</p>
        <Search className="mx-auto mt-7 size-10 text-primary" />
        <h1 className="mt-5 font-heading text-4xl tracking-tight">
          This page isn’t available.
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          The link may have changed, or you may need to sign in to the account
          that owns this order.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="storefront-button">
            Explore the collection
          </Link>
          <Link
            href="/account/orders"
            className="inline-flex min-h-12 items-center rounded-full border px-6 font-semibold"
          >
            My orders
          </Link>
        </div>
      </div>
    </main>
  );
}
