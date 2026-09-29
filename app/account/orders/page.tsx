import { withFirstCodPresentation } from '@/lib/orders/first-cod-review';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { Package, ReceiptText } from 'lucide-react';
import { AccountEmpty, AccountHeading } from '@/components/account/account-ui';
import { CustomerOrderList } from '@/components/account/order-list';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import {
  listCustomerOrders,
  listCustomerReviewAnswerHistory,
} from '@/lib/db/repositories/customers';

export const dynamic = 'force-dynamic';

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ reviewAt?: string; reviewId?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/orders');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const orders = await listCustomerOrders(db, customer.userId);
  const displayedOrders = await withFirstCodPresentation(db, orders);
  const params = await searchParams;
  const at = params?.reviewAt ? Number(params.reviewAt) : NaN;
  const after =
    Number.isSafeInteger(at) &&
    at >= 0 &&
    params?.reviewId &&
    params.reviewId.length <= 191
      ? { createdAt: at, id: params.reviewId }
      : undefined;
  const reviewHistory = await listCustomerReviewAnswerHistory(
    db,
    customer.userId,
    after,
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
          <CustomerOrderList orders={displayedOrders} />
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
      {reviewHistory.entries.length ? (
        <section
          className="mt-7 space-y-4"
          aria-label="Your review answer history"
        >
          <h2 className="font-heading text-2xl">
            Your previous review answers
          </h2>
          {reviewHistory.entries.map(({ orderNumber, answer }) => (
            <div key={answer.id}>
              <p className="mb-2 text-sm font-semibold">Order {orderNumber}</p>
              <AnswerDetails answer={answer} />
            </div>
          ))}
          {reviewHistory.nextCursor ? (
            <a
              className="inline-flex rounded-lg border px-4 py-2 text-sm font-medium"
              href={`/account/orders?reviewAt=${reviewHistory.nextCursor.createdAt}&reviewId=${encodeURIComponent(reviewHistory.nextCursor.id)}`}
            >
              Next 50 review answers
            </a>
          ) : null}
        </section>
      ) : null}
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
