import { env } from 'cloudflare:workers';
import { Package, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { accountAction, accountSurface, touchTargets } from '@/components/account/account-sections';
import { ReviewForm } from '@/components/account/review-form';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { readCustomerOrderParcels } from '@/lib/orders/customer-parcels';
import { customerDate } from '@/lib/orders/customer-parcel-state';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rate items', robots: { index: false, follow: false } };

export default async function RateOrderItems({ params }: { params: Promise<{ orderNumber: string }> }) {
  const { orderNumber } = await params;
  if (!orderNumber || orderNumber.length > 100) notFound();
  const customer = await requireCustomerPage('/account/reviews/' + encodeURIComponent(orderNumber));
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const order = await database.prepare(`SELECT id,status,delivered_at AS deliveredAt FROM orders
    WHERE order_number=? AND HEX(customer_id)=HEX(?)`).bind(orderNumber, customer.userId).first<{id:string; status:string; deliveredAt:number|null}>();
  if (!order || order.status !== 'delivered') notFound();
  const packages = (await readCustomerOrderParcels(database, [order.id], { withCash: false })).get(order.id) ?? [];
  const items = packages.flatMap(parcel => parcel.items.map(item => ({ ...item, seller: parcel.sellerName })))
    .flatMap(item => item.reviewable && item.productId ? [{ ...item, productId: item.productId }] : []);
  const help = '/orders/' + encodeURIComponent(orderNumber) + '#order-help';
  return (
    <div className={touchTargets + " mx-auto min-w-0 max-w-[800px] space-y-4 text-[#14213d]"}>
      <p className="flex flex-wrap items-center gap-2 text-sm text-[#675c4b]">
        <Link href="/account/orders" className="inline-flex min-h-11 items-center hover:underline">My orders</Link><span aria-hidden="true">/</span> Rate {orderNumber}
      </p>
      <h1 className="font-heading text-4xl leading-tight tracking-tight sm:text-5xl">How were your items?</h1>
      <p className="text-sm text-[#465573]">Honest reviews help other shoppers and tell makers what to keep doing.</p>
      {items.length ? items.map(item => (
        <article key={item.id} className={accountSurface + ' grid min-w-0 gap-4 p-4 sm:grid-cols-[7rem_minmax(0,1fr)] sm:p-5'}>
          {item.mediaId ? <Image src={`/api/product-media/${encodeURIComponent(item.mediaId)}`} alt="" width={112} height={112} unoptimized className="size-28 rounded-xl border border-[#e3d8c7] bg-white object-contain" /> :
            <span className="grid size-28 place-items-center rounded-xl border bg-white"><Package className="size-6" aria-hidden="true" /></span>}
          <div className="min-w-0">
            <h2 className="text-base font-semibold">{item.name}</h2>
            <p className="text-sm text-[#465573]">{item.seller}{order.deliveredAt ? ' · delivered ' + customerDate(order.deliveredAt) : ''}</p>
            <ReviewForm orderItemId={item.id} orderNumber={orderNumber} productId={item.productId} actorId={customer.userId} />
          </div>
        </article>
      )) : <section className={accountSurface + ' space-y-2 p-4'}>
        <h2 className="font-semibold">No items are waiting for a review</h2>
        <p className="text-sm text-[#465573]">You can check submitted reviews in My orders.</p>
        <Link href="/account/orders" className={accountAction}>Open My orders</Link>
      </section>}
      <div className="flex items-start gap-2 rounded-xl bg-[#ebe1d1] p-3 text-sm">
        <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <p>Problem with an item? <Link href={help} className="inline-flex min-h-11 items-center font-semibold text-[#a8232e] underline">Get help</Link> to reach our support team.</p>
      </div>
    </div>
  );
}
