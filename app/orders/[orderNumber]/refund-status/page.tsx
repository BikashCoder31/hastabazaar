import { env } from 'cloudflare:workers';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CustomerAuthorizationError, requireExistingCustomerApi } from '@/lib/auth/customer';
import { hostedSessionCookieName } from '@/lib/auth/hosted-session';
import { isLocalTestRequest, localTestCookieName } from '@/lib/auth/local-test-access';
import { RECEIPT_COOKIE, hashOpaqueToken, readCookieHeader } from '@/lib/cart/session';
import { requireDatabase } from '@/lib/db/d1';
import { readOrderRefundInquiry, type OrderRefundViewer } from '@/lib/payments/order-refund-inquiry';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Refund status', robots: { index: false, follow: false } };

const money = new Intl.NumberFormat('en-NP', { style: 'currency', currency: 'NPR' });

async function refundViewer(requestHeaders: Headers): Promise<OrderRefundViewer> {
  try {
    const customer = await requireExistingCustomerApi();
    return { kind: 'account', customerId: customer.userId };
  } catch (error) {
    if (!(error instanceof CustomerAuthorizationError)) throw error;
    if (error.status !== 401) notFound();
  }

  const cookie = requestHeaders.get('cookie');
  const hasCookie = (name: string) => cookie?.split(';').some(part => part.trimStart().startsWith(`${name}=`));
  if (hasCookie(hostedSessionCookieName) || isLocalTestRequest(requestHeaders) && hasCookie(localTestCookieName)) notFound();
  const token = readCookieHeader(cookie, RECEIPT_COOKIE);
  if (!token || token.length > 191) notFound();
  return { kind: 'guest', receiptTokenHash: await hashOpaqueToken(token) };
}

export default async function OrderRefundStatusPage({ params }: { params: Promise<{ orderNumber: string }> }) {
  const [{ orderNumber }, requestHeaders] = await Promise.all([params, headers()]);
  const viewer = await refundViewer(requestHeaders);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const inquiry = await readOrderRefundInquiry(database, orderNumber, viewer);
  if (!inquiry) notFound();
  const receipt = `/orders/${encodeURIComponent(orderNumber)}`;

  return (
    <main className="shell py-10" id="main-content" tabIndex={-1}>
      <article className="mx-auto max-w-2xl space-y-5 rounded-2xl border bg-card p-6 sm:p-8">
        <h1 className="font-heading text-3xl">Refund status</h1>
        <p className="text-sm text-muted-foreground">Order {orderNumber}</p>
        {inquiry.state === 'owed' ? (
          <>
            <dl><dt>Cash refund still owed</dt><dd className="mt-1 text-2xl font-semibold">{money.format(inquiry.amountPaisa / 100)}</dd></dl>
            <p>The refund stays open until Finance verifies it has reached you. If you need help receiving it, use the support options on this order.</p>
          </>
        ) : inquiry.state === 'needs_reconciliation' ? (
          <p>Finance needs to confirm the refund amount against the original payment and any returned transfers. Use the support options on this order to request a review.</p>
        ) : inquiry.state === 'settled' ? (
          <p>The recorded cash refund for this order has settled.</p>
        ) : (
          <p>There is no approved cash refund for this order.</p>
        )}
        <nav className="flex flex-wrap gap-4" aria-label="Refund help">
          <Link href={receipt} prefetch={false} className="font-semibold underline">Order receipt</Link>
          {inquiry.state === 'owed' || inquiry.state === 'needs_reconciliation' ? (
            <Link href={`${receipt}#aftercare-title`} prefetch={false} className="font-semibold underline">Get help with this order</Link>
          ) : null}
          {viewer.kind === 'account' && inquiry.state === 'owed' ? (
            <Link href="/account/refunds" prefetch={false} className="font-semibold underline">View private refund instructions</Link>
          ) : null}
        </nav>
      </article>
    </main>
  );
}
