import Image from 'next/image';
import Link from 'next/link';
import { Check, House, Landmark, Package, ReceiptText, Store, TriangleAlert, Truck, Undo2, Upload } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { CustomerParcelCash } from '@/components/storefront/customer-parcel-cash';
import { formatParcelEstimate } from '@/lib/checkout/parcel-display';
import { COD_CONFIRMATION_NOTICE } from '@/lib/commerce/order-presentation';
import type { OrderReceipt } from '@/lib/db/repositories/orders';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { readCustomerOrderParcels } from '@/lib/orders/customer-parcels';
import { CompanyAccountError, getCompanyPaymentInstruction } from '@/lib/payments/company-accounts';
import { parseReturnPolicySnapshot } from '@/lib/returns/validation';

const panel = 'rounded-2xl border border-[#e3d6c3] bg-[#fdfaf5]';
const action = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-center text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213d]';
const primary = `${action} bg-[#14213d] text-white hover:bg-[#24436c]`;
const money = (amount: number) => formatPaisaExact(amount).replace(/\.00$/, '');
const deadlineDate = new Intl.DateTimeFormat('en-NP', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kathmandu' });

async function issuedBankInstruction(database: D1Database, orderId: string, customerId: string) {
  try {
    const [instruction, current] = await Promise.all([
      getCompanyPaymentInstruction(database, orderId, customerId),
      database.prepare(`SELECT 1 FROM manual_payment_cutoffs w
        JOIN manual_payment_balances b ON b.order_id=w.order_id
        JOIN orders o ON o.id=w.order_id AND o.customer_id=?
        WHERE w.order_id=? AND w.paid_at IS NULL AND w.closed_at IS NULL AND w.deadline_at>?
          AND b.received_paisa=0
          AND NOT EXISTS (SELECT 1 FROM manual_payment_claims c WHERE c.order_id=w.order_id)
          AND NOT EXISTS (SELECT 1 FROM manual_payment_exceptions e WHERE e.order_id=w.order_id AND e.state<>'resolved')`)
        .bind(customerId, orderId, Date.now()).first(),
    ]);
    return current && !instruction.requiresAccountReview ? instruction : null;
  }
  catch (error) {
    if (error instanceof CompanyAccountError && [403, 404].includes(error.status)) return null;
    throw error;
  }
}

/** Rendered only after the existing route has authorized this order's receipt. */
export async function CustomerOrderPlaced({ database, receipt, orderId, customerId, customerDisplayName, awaitingCodConfirmation }: {
  database: D1Database;
  receipt: OrderReceipt;
  orderId: string;
  customerId: string | null;
  customerDisplayName: string | null;
  awaitingCodConfirmation: boolean;
}) {
  const bank = receipt.paymentMode === 'prepaid';
  const waitingForTransfer = bank && receipt.paymentStatus === 'unpaid';
  const [orders, bankDetails, originalPolicy] = await Promise.all([
    readCustomerOrderParcels(database, [orderId]),
    waitingForTransfer && customerId ? issuedBankInstruction(database, orderId, customerId) : null,
    database.prepare('SELECT return_policy_snapshot_json AS policy FROM orders WHERE id=?').bind(orderId).first<{ policy: string | null }>(),
  ]);
  const parcels = orders.get(orderId) ?? [];
  const firstName = customerDisplayName?.trim().split(/\s+/)[0];
  const orderHref = '/orders/' + encodeURIComponent(receipt.orderNumber);
  const paymentHref = customerId ? '/account/payments/' + encodeURIComponent(orderId) : undefined;
  const document = receipt.documents.find(item => item.kind === 'payment_receipt' && item.status === 'issued')
    ?? receipt.documents.find(item => item.kind === 'order_statement' && item.status === 'issued');
  const itemCount = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  let returnDays: number | undefined;
  if (originalPolicy?.policy) {
    try { returnDays = parseReturnPolicySnapshot(originalPolicy.policy).generalRequestWindowDays; }
    catch { /* Earlier incomplete records can still direct customers to help. */ }
  }
  const nextSteps = [
    ...(waitingForTransfer ? [{ icon: Landmark, title: bankDetails ? 'You transfer the money' : 'Check your bank payment', detail: bankDetails ? `Use ${receipt.orderNumber} as the bank reference.` : 'Open the bank transfer page for the current payment status.' }] : []),
    { icon: Store, title: 'Sellers prepare your items', detail: waitingForTransfer ? 'Each seller starts after Hastabazaar verifies your transfer.' : awaitingCodConfirmation ? 'Each seller starts after we confirm the order with you.' : 'Each seller packs their own parcel.' },
    ...(!waitingForTransfer ? [{ icon: Truck, title: 'Courier picks up each parcel', detail: 'You can track each parcel after it ships.' }] : []),
    { icon: House, title: 'Delivered to your door', detail: bank ? 'There is no cash to pay the courier for a bank-transfer order.' : 'Pay the courier the cash shown for each parcel.' },
    { icon: Undo2, title: returnDays ? `${returnDays} days to request an eligible return` : 'Ask for help with an item', detail: 'Use Get help on the item in My orders.' },
  ];

  return (
    <div className="min-h-screen bg-[#f5efe3] text-[#14213d]">
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[1120px] px-4 pb-16 pt-8 md:px-12 md:pb-20 md:pt-12">
        <header className="mb-7 flex items-start gap-5 sm:mb-8">
          <span className="hidden size-16 shrink-0 place-items-center rounded-full bg-[#ddece3] text-[#205d42] sm:grid"><Check className="size-7" aria-hidden="true" /></span>
          <div className="min-w-0">
            <h1 className="font-heading text-[2rem] leading-tight tracking-tight sm:text-[2.65rem]">
              {firstName ? `Thank you, ${firstName}.` : 'Thank you.'} Your order is placed.
            </h1>
            <p className="mt-2 max-w-2xl wrap-anywhere text-[#465573]">
              Order <strong className="text-[#14213d]">{receipt.orderNumber}</strong> · {itemCount} {itemCount === 1 ? 'item' : 'items'} · {waitingForTransfer ? 'Waiting for your bank transfer' : bank ? 'Bank transfer' : 'Cash on delivery'}.
            </p>
          </div>
        </header>
        {waitingForTransfer && paymentHref ? (
          <section className={`${panel} mb-5 space-y-4 border-2 border-[#14213d] p-5 sm:p-6`} aria-labelledby="order-placed-bank">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#14213d] text-white"><Landmark className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0">
                <h2 id="order-placed-bank" className="text-lg font-semibold">{bankDetails ? `Your turn: transfer ${money(bankDetails.amountPaisa)} by ${deadlineDate.format(bankDetails.deadlineAt)} Nepal time` : 'Bank transfer status'}</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#465573]">Sellers start preparing once Hastabazaar verifies your transfer.</p>
              </div>
            </div>
            <div className="grid items-start gap-3 md:grid-cols-2">
              {bankDetails ? (
                <dl className="divide-y divide-[#e3d6c3] rounded-xl border border-[#e3d6c3] bg-white px-4 text-sm">
                  <div className="flex flex-wrap justify-between gap-x-4 py-2.5"><dt>Account name</dt><dd className="font-semibold">{bankDetails.account.holder}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-4 py-2.5"><dt>Bank and account</dt><dd className="wrap-anywhere font-semibold">{bankDetails.account.bank} · {bankDetails.account.accountNumber}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-4 py-2.5"><dt>Amount</dt><dd className="font-semibold">{money(bankDetails.amountPaisa)}</dd></div>
                  <div className="flex flex-wrap justify-between gap-x-4 py-2.5"><dt>Reference</dt><dd className="font-semibold">{bankDetails.reference}</dd></div>
                </dl>
              ) : null}
              <div className="space-y-3">
                {bankDetails ? <p className="flex items-start gap-2.5 rounded-xl bg-[#e0e7f3] p-3.5 text-sm text-[#344766]"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>Use <strong>{receipt.orderNumber}</strong> in the transfer remarks so we can match it.</span></p> : null}
                <Link href={paymentHref} className={`${primary} flex`}><Upload className="size-4" aria-hidden="true" /> Bank transfer instructions and payment report</Link>
              </div>
            </div>
          </section>
        ) : null}
        {awaitingCodConfirmation ? (
          <p className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#e3d6c3] bg-[#f1e4c5] p-4 text-sm"><CustomerActingChip actor="hastabazaar" />{COD_CONFIRMATION_NOTICE}</p>
        ) : null}
        <section className={`${panel} mb-5 p-5 sm:p-6`} aria-labelledby="order-placed-next">
          <h2 id="order-placed-next" className="text-xl font-semibold">What happens next</h2>
          <ol className="mt-5 grid gap-5 sm:grid-cols-4">
            {nextSteps.map(({ icon: Icon, title, detail }, index) => (
              <li key={title} className="relative flex gap-3 sm:block">
                <span className={`relative z-10 grid size-9 shrink-0 place-items-center rounded-full border ${index === 0 ? 'border-[#14213d] bg-[#14213d] text-white' : 'border-[#d5c1a5] bg-white text-[#14213d]'}`}><Icon className="size-4" aria-hidden="true" /></span>
                {index < nextSteps.length - 1 ? <span className="absolute bottom-[-1.25rem] left-[17px] top-8 border-l border-[#d5c1a5] sm:bottom-auto sm:left-8 sm:top-[17px] sm:h-px sm:w-full sm:border-l-0 sm:border-t" aria-hidden="true" /> : null}
                <div className="min-w-0 sm:mt-2.5"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-relaxed text-[#465573]">{detail}</p></div>
              </li>
            ))}
          </ol>
        </section>
        <div className="grid gap-4 sm:grid-cols-2 lg:gap-5">
          {parcels.map((parcel, index) => {
            const estimate = parcel.estimatedMinDays !== null && parcel.estimatedMaxDays !== null
              ? waitingForTransfer
                ? `${parcel.estimatedMinDays}–${parcel.estimatedMaxDays} days after payment is verified`
                : formatParcelEstimate(parcel.stageTimes.placed ?? receipt.placedAt, parcel.estimatedMinDays, parcel.estimatedMaxDays)
              : null;
            return (
              <article className={`${panel} min-w-0 p-5`} key={parcel.sellerId}>
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <h2 className="font-semibold wrap-anywhere">Parcel {index + 1} · {parcel.sellerName}</h2>
                  <CustomerActingChip actor={waitingForTransfer ? 'you' : awaitingCodConfirmation ? 'hastabazaar' : 'seller'} />
                </div>
                {estimate ? <p className="mt-2 text-sm font-semibold text-[#205d42]">Estimated arrival: {estimate}</p> : null}
                <ul className="my-4 flex flex-wrap gap-2" aria-label={`Items in parcel ${index + 1}`}>
                  {parcel.items.map(item => (
                    <li key={item.id}>
                      {item.mediaId ? <Image src={'/api/product-media/' + item.mediaId} alt={item.name} width={56} height={56} data-media-mode="cover" sizes="56px" unoptimized className="size-14 rounded-lg border border-[#e3d6c3] bg-white object-cover" />
                        : <span className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#e3d6c3] bg-white px-2 text-sm"><Package className="size-4" aria-hidden="true" />{item.name}</span>}
                    </li>
                  ))}
                </ul>
                {!bank && parcel.codPaisa !== null ? <CustomerParcelCash amountPaisa={parcel.codPaisa} /> : null}
                {bank ? <p className="border-t border-[#e3d6c3] pt-3 text-sm text-[#465573]">{waitingForTransfer ? 'Included in your bank transfer total' : 'No cash due on delivery'}</p> : null}
              </article>
            );
          })}
        </div>
        <nav aria-label="Order next actions" className="mt-6 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Link href={orderHref} className={primary}><Package className="size-4" aria-hidden="true" /> Track this order</Link>
          <Link href="/shop" className={`${action} border border-[#d5c1a5]`}>Keep shopping</Link>
          {document ? <Link href={`${orderHref}/documents/${encodeURIComponent(document.id)}`} className={action}><ReceiptText className="size-4" aria-hidden="true" /> View {document.kind === 'payment_receipt' ? 'receipt' : 'order statement'}</Link> : null}
        </nav>
      </main>
      <SiteFooter compact />
    </div>
  );
}
