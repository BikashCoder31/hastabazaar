import { env } from 'cloudflare:workers';
import Image from 'next/image';
import { notFound } from 'next/navigation';

import { ManualPaymentClaim } from '@/components/commerce/manual-payment-claim';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { getOrderReceipt, type OrderReceipt } from '@/lib/db/repositories/orders';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { getCustomerManualPayment, ManualPaymentError } from '@/lib/payments/manual-receipts';
import { readStagingBankTransferQrs } from '@/lib/payments/staging-bank-transfer-qr';
import './payment-page.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bank payment' };

function PaymentOrderSummary({ receipt }: { receipt: OrderReceipt }) {
  return (
    <section aria-label="Order items and delivery" className="account-surface min-w-0 rounded-2xl border border-[#E3D6C3] bg-[#FDFAF5] p-5">
      <ul className="divide-y divide-[#E9DECE]">
        {receipt.items.map(item => (
          <li key={item.id} className="flex min-w-0 items-center gap-3 py-3 first:pt-0 last:pb-0">
            {item.offerSnapshot?.mediaId ? (
              <Image
                src={`/api/product-media/${encodeURIComponent(item.offerSnapshot.mediaId)}`}
                alt=""
                data-media-mode="cover"
                width={56}
                height={56}
                unoptimized
                className="size-14 shrink-0 rounded-xl border border-[#E9DECE] object-cover"
              />
            ) : null}
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="text-sm font-bold">{item.productName}</p>
              <p className="text-sm leading-relaxed text-[#465573]">{item.sellerName} · {formatPaisaExact(item.lineTotalPaisa)}{item.quantity > 1 ? ` · Qty ${item.quantity}` : ''}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-[#E9DECE] pt-3 text-sm text-[#465573]">Delivery {formatPaisaExact(receipt.deliveryChargePaisa)}</p>
    </section>
  );
}

export default async function PaymentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const viewer = await requireCustomerPage('/account/payments/' + encodeURIComponent(orderId));
  const bindings = env as unknown as { DB?: D1Database; MEDIA?: R2Bucket; APP_ORIGIN?: string };
  const database = requireDatabase(bindings);
  let payment;
  try {
    payment = await getCustomerManualPayment(database, viewer.userId, orderId);
  } catch (error) {
    if (error instanceof ManualPaymentError && [403, 404].includes(error.status)) notFound();
    throw error;
  }
  if (!payment) notFound();
  const [receipt, transferQrs] = await Promise.all([
    getOrderReceipt(database, payment.orderNumber, null, viewer.userId),
    readStagingBankTransferQrs(bindings.APP_ORIGIN, bindings.MEDIA, payment),
  ]);
  return (
    <div data-bank-payment-page>
      <ManualPaymentClaim
        payment={payment}
        actorId={viewer.userId}
        transferQrs={transferQrs}
        orderSummary={receipt ? <PaymentOrderSummary receipt={receipt} /> : undefined}
      />
    </div>
  );
}
