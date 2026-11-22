import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AdminPageTitle } from '@/components/admin/page-help';
import { SellerDesk } from '@/components/admin/seller-desk';
import { SellerDeskDecision } from '@/components/admin/seller-desk-decision';
import { deskFilter, visibleDeskItems } from '@/components/admin/seller-desk-navigation';
import { safeAdminReturnTo } from '@/lib/admin/return-context';
import { readSellerDesk, readSellerDeskContext, type SellerDeskItem } from '@/lib/admin/seller-desk';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { checklistDate } from '@/lib/sellers/shop-checklist-evidence';

export const dynamic = 'force-dynamic';

async function SellerContext({ db, item, actorId, now }: {db: D1Database; item: SellerDeskItem; actorId: string; now: number}) {
  const checklist = await readSellerDeskContext(db,actorId,item,now).catch(() => null);
  const status = (value: boolean|null|undefined, yes: string, no: string, unknown: string) =>
    <span className={'rounded-full px-2 py-1 text-xs font-semibold ' + (value ? 'bg-green-100 text-green-900' : 'bg-secondary text-foreground')}>{value == null ? unknown : value ? yes : no}</span>;
  return <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl bg-muted/70 px-3 py-2 text-sm">
    <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{item.sellerName.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()}</span>
    <strong>{item.sellerName}</strong>
    {status(checklist?.canSell,'Can sell','Can’t sell yet','Selling status unavailable')}
    {status(checklist?.canPay,'Can be paid' + (checklist?.payoutsUntil ? ' until ' + checklistDate(checklist.payoutsUntil) : ''),'Can’t be paid yet','Payout status unavailable')}
    <span className="text-xs text-muted-foreground">{[checklist?.district, checklist?.publicProductCount != null ? checklist.publicProductCount + (checklist.publicProductCount === 1 ? ' live product' : ' live products') : null].filter(Boolean).join(' · ')}</span>
    <Link href={'/admin/sellers/' + encodeURIComponent(item.sellerId)} className="inline-flex min-h-11 items-center font-semibold text-primary sm:ml-auto">Open seller</Link>
  </div>;
}

export default async function SellerDeskPage({searchParams}: {searchParams: Promise<{item?:string;filter?:string;returnTo?:string}>}) {
  const staff = await requireStaffPage('/admin/sellers/desk','seller.application.review',{readOnly:true});
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as {DB?: D1Database});
  const now = new Date().getTime();
  const [query, desk] = await Promise.all([searchParams,readSellerDesk(db,staff.id,now)]);
  const filter = deskFilter(query.filter);
  const visible = visibleDeskItems(desk.items,filter);
  const requestedId = query.item && (desk.aliases[query.item] ?? query.item);
  const requested = visible.find(row => row.id === requestedId);
  const selected = query.item ? requested : visible[0];
  const returnTo = query.returnTo ? safeAdminReturnTo(query.returnTo) : undefined;
  return <div className="min-w-0 space-y-5">
    <AdminPageTitle><h1 className="font-heading text-3xl tracking-tight">Seller desk</h1></AdminPageTitle>
    {returnTo && <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary" href={returnTo}>Back to previous workspace</Link>}
    {query.item && !requested && <output className="block rounded-xl border bg-card p-3 text-sm">That item is no longer waiting in this queue.</output>}
    <SellerDesk items={desk.items} doneToday={desk.doneToday} now={now} filter={filter} selectedId={selected?.id} showDetail={Boolean(requested)} returnTo={returnTo}>
      {selected && <div key={selected.id} className="space-y-4">
        <SellerContext db={db} item={selected} actorId={staff.id} now={now}/>
        <SellerDeskDecision item={selected} actorId={staff.id}/>
      </div>}
    </SellerDesk>
  </div>;
}
