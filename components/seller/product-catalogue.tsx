'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Archive, ImageIcon } from 'lucide-react';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { ArchiveProductButton } from '@/components/seller/archive-product-button';
import { InventoryEditor } from '@/components/seller/inventory-editor';
import { Button } from '@/components/ui/button';
import { WhoseTurn, type WhoseTurnStatus } from '@/components/ui/whose-turn';
import { sendJson } from '@/lib/http/client-request';
import type { SellerProductRow } from '@/lib/db/repositories/products';
import { canEditSellerInventory, sellerDate, sellerMoney } from '@/lib/seller/presentation';

export type CatalogueRow = SellerProductRow & { workspace?: boolean; offerManaged?: boolean; displayStatus?: SellerProductRow['status']; sold: number; blockers: string[] };

const editable = new Set(['draft', 'needs_changes', 'rejected', 'approved', 'published']);
const grid = 'md:grid-cols-[44px_minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,0.65fr)_126px] xl:grid-cols-[44px_minmax(0,1.55fr)_minmax(0,0.75fr)_minmax(0,1.35fr)_minmax(0,0.65fr)_126px_minmax(0,0.6fr)]';

function productState(product: CatalogueRow): { status: string; tone: string; turn: WhoseTurnStatus; note: string; turnLabel?: string; action?: string } {
  switch (product.displayStatus ?? product.status) {
    case 'published':
      if (!product.inventoryQuantity) return { status: 'Sold out', tone: 'bg-[#F7E8C6] text-[#80520A]', turn: 'your-turn', note: 'Sold out. Add stock so customers can order.' };
      return { status: 'Live', tone: 'bg-[#DFECE4] text-[#236548]', turn: 'done', turnLabel: 'Customers can buy it', note: product.inventoryQuantity <= 5 ? 'Running low. Add stock if you can make more.' : 'Nothing to do.' };
    case 'needs_changes':
      return { status: 'Needs changes', tone: 'bg-[#F7DFDE] text-[#A8232E]', turn: 'your-turn', note: product.reviewNote || 'Open the product to see the requested changes.', action: 'Fix and send again' };
    case 'rejected':
      return { status: 'Rejected', tone: 'bg-[#F7DFDE] text-[#A8232E]', turn: 'your-turn', note: product.reviewNote || 'Open the product to review the decision.', action: 'Edit and send again' };
    case 'draft':
      return { status: 'Draft', tone: 'bg-[#EBE2D0] text-[#314364]', turn: 'your-turn', note: 'Add photos, price and details, then send for review.', action: 'Continue' };
    case 'archived':
      return { status: 'Archived', tone: 'bg-[#EBE2D0] text-[#314364]', turn: 'done', turnLabel: 'Archived listing', note: 'Customers can’t see or buy it.' };
    case 'approved':
      return { status: 'Approved', tone: 'bg-[#E3E9F4] text-[#264880]', turn: 'with-hastabazaar', note: 'Approved for publication. Hastabazaar will review when it can go live.' };
    default:
      return { status: 'In review', tone: 'bg-[#E3E9F4] text-[#264880]', turn: 'with-hastabazaar', note: 'We’ll notify you once Hastabazaar has reviewed it.' };
  }
}

export function ProductCatalogue({ rows }: { rows: readonly CatalogueRow[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const picked = rows.filter(product => selected.has(product.id) && product.status === 'published');
  const blocked = picked.some(product => product.blockers.length > 0);

  function toggle(id: string) {
    setSelected(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function archiveSelected() {
    if (busy || blocked || !picked.length) return;
    setBusy(true);
    setError('');
    const archived: string[] = [];
    const failures: string[] = [];
    try {
      for (const product of picked) {
        try {
          await sendJson('/api/seller/products/' + encodeURIComponent(product.id) + '/archive', 'POST', {}, 'The product could not be archived.');
          archived.push(product.id);
        } catch (reason) {
          failures.push(`${product.nameEn}: ${reason instanceof Error ? reason.message : 'The product could not be archived.'}`);
        }
      }
      setSelected(previous => new Set([...previous].filter(id => !archived.includes(id))));
      setError(failures.join(' '));
      if (!failures.length) setConfirming(false);
      if (archived.length) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return <div className="min-w-0 space-y-3">
    {picked.length ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#14213D] px-4 py-2 text-sm text-white">
      <strong className="mr-auto">{picked.length} selected</strong>
      <Button variant="outline" className="min-h-11 border-white/45 bg-transparent text-white hover:bg-white/15 hover:text-white" disabled={blocked || busy} onClick={() => { setError(''); setConfirming(true); }}><Archive className="size-4" /> Archive</Button>
      <Button variant="outline" className="min-h-11 border-white/45 bg-transparent text-white hover:bg-white/15 hover:text-white" disabled={busy} onClick={() => setSelected(new Set())}>Clear</Button>
      {blocked ? <p className="basis-full">Clear selections with open archive requirements to continue.</p> : null}
    </div> : null}
    {error && !confirming ? <p role="alert" className="text-sm text-[#A8232E]">{error}</p> : null}
    <ConfirmOperation open={confirming} onOpenChange={setConfirming} pending={busy} error={error} onConfirm={archiveSelected}
      title={picked.length === 1 ? `Archive ${picked[0].nameEn}?` : `Archive ${picked.length} selected products?`}
      description="Archived products are removed from the storefront. Existing orders, reviews and product records are retained." />
    <table aria-label="Products" className="block w-full min-w-0 rounded-[0.9rem] border border-[#E4DACA] bg-white">
      <thead className="hidden md:block"><tr className={`hidden gap-x-3 rounded-t-[0.9rem] border-b border-[#E4DACA] bg-[#FAF7F1] px-3 py-2.5 text-sm font-semibold text-[#665B4C] md:grid ${grid}`}>
        <th scope="col"><span className="sr-only">Select</span></th>
        <th scope="col" className="text-left">Product</th><th scope="col" className="text-left">Status</th>
        <th scope="col" className="text-left">What happens next</th><th scope="col" className="text-right">Price</th>
        <th scope="col" className="text-right">Stock</th><th scope="col" className="hidden text-right xl:block">Sold · 30 days</th>
      </tr></thead>
      <tbody className="block">
      {rows.map(product => {
        const state = productState(product);
        const base = '/seller/products/' + encodeURIComponent(product.id);
        const edit = editable.has(product.status) || Boolean(state.action);
        const editHref = product.workspace ? '/seller/products/new?draftId=' + encodeURIComponent(product.id) : base + '/edit';
        return <tr key={product.id} id={`product-${product.id}`} className={`grid min-w-0 scroll-mt-28 grid-cols-[36px_minmax(0,1fr)_auto] items-start gap-x-2 gap-y-2 border-[#E4DACA] px-3 py-3 text-sm [&+&]:border-t md:items-center md:gap-x-3 ${grid}`}>
          <td className="-ml-1 flex items-center self-center">
            <label className="grid size-11 cursor-pointer place-items-center has-[:disabled]:cursor-default">
              <input type="checkbox" checked={selected.has(product.id)} disabled={busy || product.status !== 'published'} aria-label={'Select ' + product.nameEn} onChange={() => toggle(product.id)}
                className="size-5 accent-[#14213D] disabled:opacity-40" />
            </label>
          </td>
          <td className="flex min-w-0 items-start gap-2.5">
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-[#EEE5D5] bg-[#FAF7F1]">
              {product.primaryMediaId ? <Image src={`/api/product-media/${product.primaryMediaId}`} alt="" width={48} height={48} unoptimized className="size-12 object-contain" />
                : <ImageIcon className="size-5 text-[#46536F]" aria-label="No product image" />}
            </div>
            <div className="min-w-0">
              <Link href={edit ? editHref : base + '/answers'} className="block min-h-11 break-words font-bold leading-snug hover:underline">{product.nameEn}
                <span title={product.sellerSku ? 'Seller SKU · ' + product.sellerSku : 'Platform SKU'} className="mt-0.5 block break-words font-mono text-xs font-normal text-[#665B4C]">{product.sku || 'Private draft'}</span>
              </Link>
              {!product.workspace ? <details className="mt-0.5">
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-[#46536F]">Product actions</summary>
                <div className="space-y-1">
                  <Link className="section-link inline-flex min-h-11 items-center" href={base + '/answers'}>Answer history</Link>
                  {product.status === 'published' ? <Link className="section-link inline-flex min-h-11 items-center" href={'/products/' + product.slug}>View product</Link> : null}
                  {product.status === 'archived' ? <ArchiveProductButton blocked={product.blockers.length > 0} productId={product.id} productName={product.nameEn} deleting /> : null}
                  {product.blockers.length ? <p className="break-words text-xs text-[#665B4C]">{product.blockers.join(' ')}</p> : null}
                  <p className="break-words text-xs text-[#665B4C]">{product.categoryName} · Updated {sellerDate(product.updatedAt)}</p>
                </div>
              </details> : null}
            </div>
          </td>
          <td className="col-span-full row-start-2 md:col-span-1 md:row-start-auto"><span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold leading-tight ${state.tone}`}><span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />{state.status}</span></td>
          <td className="col-span-full min-w-0 space-y-1 md:col-span-1">
            <WhoseTurn status={state.turn} label={state.turnLabel} />
            <p className="whitespace-pre-wrap break-words text-[0.8125rem] leading-relaxed text-[#46536F]">{state.note}</p>
            {state.action ? <Link className="inline-flex min-h-11 items-center text-[0.8125rem] font-semibold text-[#A8232E] underline underline-offset-4" href={editHref}>{state.action}</Link> : null}
          </td>
          <td className="col-start-3 row-start-1 self-start pt-2 text-right font-bold tabular-nums md:col-start-auto md:row-start-auto md:self-center md:pt-0">{product.pricePaisa > 0 ? sellerMoney(product.pricePaisa) : '—'}</td>
          <td className="col-span-full min-w-0 justify-self-end text-right md:col-span-1">
            {product.workspace ? <span aria-label="Draft stock">—</span> : product.offerManaged ? <div className="text-sm">
              <p className="font-bold tabular-nums">{product.inventoryQuantity}</p>
              <Link className="section-link inline-flex min-h-11 items-center" href={base + '/availability'}>Manage stock</Link>
            </div> : <InventoryEditor key={`${product.id}:${product.inventoryQuantity}`} productId={product.id} quantity={product.inventoryQuantity} productName={product.nameEn} disabled={!canEditSellerInventory(product.status)} compact />}
          </td>
          <td className="hidden min-w-0 text-right tabular-nums text-[#46536F] xl:block">{product.sold || '—'}</td>
        </tr>;
      })}
      </tbody>
    </table>
  </div>;
}
