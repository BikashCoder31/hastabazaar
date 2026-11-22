import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { MessageSquareWarning, RotateCcw } from 'lucide-react';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listReturnsForSeller } from '@/lib/db/repositories/returns';
import { listComplaintsForSeller } from '@/lib/db/repositories/complaints';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { sellerDate } from '@/lib/seller/presentation';
import { sellerTaskTimestamp } from '@/lib/seller/task-presentation';
import { SellerReturnDetail, returnTurn } from './return-detail';

export const dynamic = 'force-dynamic';

export default async function SellerCasesPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const [seller, query] = await Promise.all([requireSellerPage('/seller/cases'), searchParams]);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const [returns, complaints, returnFollowups] = await Promise.all([
    listReturnsForSeller(db, seller.sellerId),
    listComplaintsForSeller(db, seller.sellerId),
    db.prepare(`SELECT h.case_id AS id, h.waiting_for AS waitingFor, h.clarification_due_at AS dueAt
      FROM return_handling h JOIN return_requests r ON r.id=h.case_id JOIN order_items i ON i.id=r.order_item_id
      WHERE i.seller_id=? AND r.status NOT IN ('resolved','rejected')`).bind(seller.sellerId).all<{ id: string; waitingFor: string; dueAt: number | null }>(),
  ]);
  const followups = new Map(returnFollowups.results.map(row => [row.id, row]));
  const ordered = returns.toSorted((a, b) => Number(returnTurn(b, followups.get(b.id)?.waitingFor) === 'your-turn') -
    Number(returnTurn(a, followups.get(a.id)?.waitingFor) === 'your-turn'));
  const selected = ordered.find(item => item.id === query.case) ?? ordered[0];

  return <div className="space-y-5 text-[#14213D]">
    <h1 className="font-heading text-3xl md:text-4xl">Returns</h1>
    <div className={selected ? "grid items-start gap-6 lg:grid-cols-[minmax(13rem,0.4fr)_minmax(0,1fr)]" : undefined}>
      <section aria-label="Return requests" className="min-w-0 space-y-3">
        {ordered.length ? <ul className="space-y-2">{ordered.map(item => {
          const followup = followups.get(item.id);
          const turn = returnTurn(item, followup?.waitingFor);
          return <li key={item.id}>
            <Link href={`/seller/cases?case=${encodeURIComponent(item.id)}#return-details`} aria-current={selected?.id === item.id ? 'true' : undefined}
              className={`block min-h-11 min-w-0 rounded-xl border bg-card p-3 hover:border-[#14213D] ${selected?.id === item.id ? 'ring-1 ring-inset ring-[#14213D]' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-words font-mono text-xs font-semibold text-muted-foreground">{item.referenceNumber}</span>
                <WhoseTurn status={turn} label={turn === 'done' ? 'Closed' : undefined} />
              </div>
              <h2 className="mt-2 break-words text-sm font-semibold capitalize">{item.reason.replaceAll('_', ' ')}</h2>
              <p className="mt-1 break-words text-xs text-muted-foreground">{item.productName}
                {turn === 'your-turn' && followup?.dueAt ? ` · Reply by ${sellerTaskTimestamp(followup.dueAt)}` : ` · Asked ${sellerDate(item.requestedAt)}`}
              </p>
            </Link>
          </li>;
        })}</ul> : <div className="rounded-xl border border-dashed bg-card p-5">
          <RotateCcw className="mb-2 size-5 text-primary" aria-hidden="true" />
          <p className="font-semibold">No returns yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Return requests for your items will appear here.</p>
        </div>}
        <p className="text-xs leading-relaxed text-muted-foreground">Eligible change-of-mind returns can be requested within {phaseOneMarketplacePolicy.value.returns.generalRequestWindowDays} days of delivery.</p>
      </section>
      {selected ? <SellerReturnDetail id={selected.id} seller={seller} db={db} embedded /> : null}
    </div>
    <section aria-labelledby="seller-complaints-title" className="space-y-3 rounded-2xl border bg-card p-4 md:p-5">
      <h2 id="seller-complaints-title" className="flex items-center gap-2 font-heading text-xl"><MessageSquareWarning className="size-5 text-primary" aria-hidden="true" />Complaints</h2>
      {complaints.length ? <ul className="divide-y">{complaints.map(item => <li key={item.id}>
        <Link href={`/seller/cases/complaints/${encodeURIComponent(item.id)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <span className="break-words font-mono text-xs text-muted-foreground">{item.referenceNumber}</span>
            <p className="break-words font-semibold hover:underline">{item.subject}</p>
            {item.productName ? <p className="break-words text-xs text-muted-foreground">{item.productName}</p> : null}
          </div>
          <WhoseTurn status={['resolved', 'closed'].includes(item.status) ? 'done' : item.sellerResponse ? 'with-hastabazaar' : 'your-turn'} />
        </Link>
      </li>)}</ul> : <p className="text-sm text-muted-foreground">No item complaints for your shop.</p>}
    </section>
  </div>;
}
