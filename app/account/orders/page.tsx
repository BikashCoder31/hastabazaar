import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ReceiptText } from 'lucide-react';
import { CustomerOrderList } from '@/components/account/order-list';
import { AnswerDetails } from '@/components/forms/answer-details';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { listCustomerReviewAnswerHistory } from '@/lib/db/repositories/customers';
import { customerOrderTabs, readCustomerOrderList } from '@/lib/orders/customer-order-list';

export const dynamic = 'force-dynamic';

export default async function CustomerOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ reviewAt?: string; reviewId?: string; tab?: string; q?: string }>;
} = {}) {
  const customer = await requireCustomerPage('/account/orders');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const params = await searchParams;
  const tab = customerOrderTabs.find(([key]) => key === params?.tab)?.[0] ?? 'active';
  const query = typeof params?.q === 'string' ? params.q.slice(0, 100).trim() : '';
  const at = params?.reviewAt ? Number(params.reviewAt) : NaN;
  const after =
    Number.isSafeInteger(at) &&
    at >= 0 &&
    params?.reviewId &&
    params.reviewId.length <= 191
      ? { createdAt: at, id: params.reviewId }
      : undefined;
  const [orders, reviewHistory] = await Promise.all([
    readCustomerOrderList(db, { id: customer.userId, authSubject: customer.authSubject }),
    listCustomerReviewAnswerHistory(db, customer.userId, after),
  ]);
  return (
    <div className="min-w-0">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm text-[#465573]">
        <Link href="/account" className="inline-flex min-h-11 items-center hover:underline">Your account</Link>
        <span aria-hidden="true">/</span><span aria-current="page">My orders</span>
      </nav>
      <h1 className="mb-6 font-heading text-4xl tracking-tight sm:text-5xl">My orders</h1>
      <CustomerOrderList orders={orders} tab={tab} query={query} />
      {orders.length === 100 ? <p className="mt-3 text-sm text-[#465573]">Showing your 100 most recent orders.</p> : null}
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
              className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-medium"
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
          <Link href="/help#tracking" className="section-link mt-1 min-h-11">
            Help finding a guest order →
          </Link>
        </div>
      </div>
    </div>
  );
}
