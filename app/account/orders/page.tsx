import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { Package, ReceiptText } from 'lucide-react';
import { AccountEmpty, AccountHeading } from '@/components/account/account-ui';
import { CustomerOrderList } from '@/components/account/order-list';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerOrders } from '@/lib/db/repositories/customers';

export default async function CustomerOrdersPage() {
  const customer = await requireCustomerPage('/account/orders');
  const orders = await listCustomerOrders(
    requireDatabase(env as unknown as { DB?: D1Database }),
    customer.userId,
  );
  return (
    <div>
      <AccountHeading
        eyebrow="From maker to doorstep"
        title="Your orders."
        description="Follow each delivery, open your receipt, or get help with an item."
      />
      {orders.length ? (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Showing your{' '}
            {orders.length === 100 ? '100 most recent' : orders.length}{' '}
            {orders.length === 1 ? 'order' : 'orders'}.
          </p>
          <CustomerOrderList orders={orders} />
        </>
      ) : (
        <AccountEmpty
          icon={Package}
          title="A new story starts with a find."
          description="Your orders will appear here when you check out while signed in."
          href="/shop"
          action="Discover the collection"
        />
      )}
      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-secondary p-5">
        <ReceiptText className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <p className="font-semibold">Bought something as a guest?</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Use the private receipt link you received after checkout to view
            that order.
          </p>
          <Link href="/help#tracking" className="section-link mt-1">
            Help finding a guest order →
          </Link>
        </div>
      </div>
    </div>
  );
}
