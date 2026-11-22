import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { SellerOrderList } from '@/components/seller/seller-order-list';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { orderSteps, readSellerOrderQueue } from './order-queue';
import { SellerOrderDetail } from './order-detail';
import { SellerOrdersSearch } from './order-search';

export const dynamic = 'force-dynamic';

export default async function SellerOrdersPage({ searchParams }: {
  searchParams: Promise<{ status?: string; q?: string; order?: string }>;
}) {
  const [seller, query] = await Promise.all([requireSellerCenterPage('/seller/orders'), searchParams]);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const orders = seller.sellerId ? await readSellerOrderQueue(db, seller.sellerId) : [];
  const search = typeof query.q === 'string' ? query.q.trim().slice(0, 100) : '';
  const active = orderSteps.find(step => step.id === query.status) ?? orderSteps[0];
  const filtered = orders.filter(order => {
    if (!search) return true;
    const text = [order.orderNumber, order.address.recipientName, ...order.items.map(item => item.name)].filter(Boolean).join(' ');
    return text.toLocaleLowerCase().includes(search.toLocaleLowerCase());
  });
  const rows = filtered.filter(order => order.items.some(item => item.status === active.id));
  const selectedInStage = rows.find(order => order.id === query.order);
  const selected = selectedInStage ?? orders.find(order => order.id === query.order) ?? rows[0];
  const selectedStage = selected?.items.some(item => item.status === active.id) ? active.id : undefined;

  return <div className="space-y-5 text-[#14213D]">
    <h1 className="font-heading text-3xl md:text-4xl">Orders</h1>
    <nav aria-label="Order stages" className="flex flex-wrap gap-x-2 border-b lg:gap-x-3">
      {orderSteps.map(step => {
        const params = new URLSearchParams({ status: step.id });
        if (search) params.set('q', search);
        return <Link key={step.id} href={`/seller/orders?${params}`} aria-current={active.id === step.id ? 'page' : undefined}
          className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-2 text-sm font-semibold ${active.id === step.id ? 'border-[#A8232E] text-[#14213D]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
          {step.label}
          <span className={`rounded-full px-1.5 py-0.5 text-xs ${active.id === step.id ? 'bg-[#14213D] text-white' : 'bg-[#EEE5D5]'}`}>
            {filtered.filter(order => order.items.some(item => item.status === step.id)).length}
          </span>
        </Link>;
      })}
    </nav>
    <div className={selected ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.7fr)]" : undefined}>
      <section className="min-w-0 space-y-3" aria-label={active.label}>
        <SellerOrdersSearch key={active.id + ':' + search} status={active.id} initialQuery={search} />
        <p className="text-sm text-muted-foreground">{active.hint}</p>
        <SellerOrderList orders={rows} stage={active.id} selectedId={selected?.id} search={search} />
        {orders.length >= 100 ? <p className="text-sm text-muted-foreground">Showing the 100 most recent orders.</p> : null}
      </section>
      {selected ? <SellerOrderDetail id={selected.id} seller={seller} db={db} stage={selectedStage} embedded /> : null}
    </div>
  </div>;
}
