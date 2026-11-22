import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { Eye, PackagePlus, Search } from 'lucide-react';
import { ApplicantSection } from '@/components/seller/applicant-section';
import { ProductCatalogue, type CatalogueRow } from '@/components/seller/product-catalogue';
import { SellerEmpty } from '@/components/seller/workspace-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { productClosureBlockers } from '@/lib/db/repositories/product-closure';
import { listSellerProducts, type SellerProductRow } from '@/lib/db/repositories/products';
import { loadQueryPresentationConfig, queryFieldPresentation } from '@/lib/catalog/shop-query';
import { publicCatalogueInventory } from '@/lib/products/public-catalogue-query';
import { detailText, type ProductDetailAnswers } from '@/lib/products/category-fields';

export const dynamic = 'force-dynamic';

const tabs = [
  ['all', 'All'],
  ['published', 'Live'],
  ['needs_changes', 'Needs changes'],
  ['pending', 'In review'],
  ['draft', 'Drafts'],
] as const;
const legacyFilters = ['rejected', 'out_of_stock', 'archived'];

function matchesStatus(product: CatalogueRow, status: string) {
  const state = product.displayStatus ?? product.status;
  if (status === 'all') return true;
  if (status === 'pending') return ['submitted', 'under_review', 'approved'].includes(state);
  if (status === 'out_of_stock') return product.status === 'published' && product.inventoryQuantity === 0;
  return state === status;
}

export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const seller = await requireSellerCenterPage('/seller/products');
  if (!seller.approvedSeller || !seller.sellerId) return <ApplicantSection viewer={seller} section="products" />;
  const sellerId = seller.sellerId;
  const { status = 'all', q } = await searchParams;
  const activeStatus = tabs.some(([value]) => value === status) || legacyFilters.includes(status) ? status : 'all';
  const search = (q ?? '').trim().slice(0, 160);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const now = new Date().getTime();
  const { stock } = publicCatalogueInventory(database);
  const [listings, presentation, publicShop, sales, workspaces, inventory] = await Promise.all([
    listSellerProducts(database, sellerId, { search }),
    loadQueryPresentationConfig(database, 'seller.product-filter'),
    getPublicMakerProfile(database, sellerId),
    database.prepare(`SELECT i.product_id AS id, SUM(i.quantity) AS quantity
      FROM order_items i JOIN orders o ON o.id=i.order_id
      WHERE i.seller_id=? AND i.fulfillment_status='delivered' AND o.status='delivered'
        AND o.delivered_at BETWEEN ? AND ? GROUP BY i.product_id`)
      .bind(sellerId, now - 30 * 86_400_000, now).all<{ id: string; quantity: number }>(),
    database.prepare(`SELECT d.id, d.answers_json AS answers, d.updated_at AS updatedAt, l.product_id AS productId,
      c.state, e.detail_json AS detail
      FROM product_intake_drafts d LEFT JOIN product_publication_links l ON l.draft_id=d.id
      LEFT JOIN product_intake_cases c ON c.draft_id=d.id
        AND c.cycle_number=(SELECT MAX(latest.cycle_number) FROM product_intake_cases latest WHERE latest.draft_id=d.id)
      LEFT JOIN product_intake_events e ON e.id=c.last_event_id
      WHERE d.owner_id=? AND d.seller_id=?`)
      .bind(seller.userId, sellerId).all<{ id: string; answers: string; updatedAt: number; productId: string | null; state: string | null; detail: string | null }>(),
    database.prepare(`SELECT products.id, (${stock()}) AS quantity,
      (EXISTS(SELECT 1 FROM product_publication_links l WHERE l.product_id=products.id) OR
       EXISTS(SELECT 1 FROM product_offer_heads h WHERE h.product_id=products.id AND h.inventory_mapped=1)) AS offerManaged
      FROM products WHERE products.seller_id=?`).bind(sellerId).all<{ id: string; quantity: number; offerManaged: number }>(),
  ]);
  const searchField = queryFieldPresentation('seller.product-filter', presentation.config, 'q', {
    label: 'Search products', placeholder: 'Search by name or code',
  });
  const quantities = new Map(sales.results.map(row => [row.id, row.quantity]));
  const availableStock = new Map(inventory.results.map(row => [row.id, row]));
  const linked = new Map(workspaces.results.filter(row => row.productId).map(row => [row.productId, row]));
  const displayStatus = (state: string | null | undefined): SellerProductRow['status'] | undefined => {
    if (state === 'waiting_seller') return 'needs_changes';
    if (state === 'ready_for_decision') return 'approved';
    if (state === 'submitted' || state === 'in_review') return 'under_review';
    return undefined;
  };
  const reviewNote = (detail: string | null | undefined) => {
    if (!detail) return null;
    const event = JSON.parse(detail) as Record<string, unknown>;
    for (const key of ['sellerMessage', 'nextAction']) {
      if (typeof event[key] === 'string') return event[key];
    }
    return null;
  };
  const products: CatalogueRow[] = listings.map(product => {
    const draft = linked.get(product.id);
    const state = product.status === 'archived' ? undefined : displayStatus(draft?.state);
    return {
      ...product,
      displayStatus: state,
      offerManaged: Boolean(availableStock.get(product.id)?.offerManaged),
      inventoryQuantity: availableStock.get(product.id)?.quantity ?? product.inventoryQuantity,
      reviewNote: state === 'needs_changes' ? reviewNote(draft?.detail) ?? product.reviewNote : product.reviewNote,
      sold: quantities.get(product.id) ?? 0,
      blockers: [],
    };
  });
  const term = search.toLocaleLowerCase();
  for (const draft of workspaces.results) {
    if (draft.productId) continue;
    const nameEn = detailText(JSON.parse(draft.answers) as ProductDetailAnswers, 'nameEn') || 'Untitled draft';
    if (term && !nameEn.toLocaleLowerCase().includes(term)) continue;
    products.push({
      id: draft.id, workspace: true, nameEn, nameNe: null, slug: '', sku: '', status: 'draft',
      displayStatus: displayStatus(draft.state), reviewNote: reviewNote(draft.detail), categoryName: '',
      pricePaisa: 0, inventoryQuantity: 0, createdAt: draft.updatedAt, updatedAt: draft.updatedAt,
      primaryMediaId: null, sold: 0, blockers: [],
    });
  }
  products.sort((a, b) => b.updatedAt - a.updatedAt);
  const rows = await Promise.all(products.filter(product => matchesStatus(product, activeStatus)).map(async product => ({
    ...product,
    blockers: ['published', 'archived'].includes(product.status)
      ? (await productClosureBlockers(database, product.id, sellerId)).map(blocker => blocker.message)
      : [],
  })));
  const hrefFor = (value: string) => {
    const params = new URLSearchParams();
    if (value !== 'all') params.set('status', value);
    if (search) params.set('q', search);
    return '/seller/products' + (params.size ? '?' + params : '');
  };

  return (
    <div className="min-w-0 space-y-4 text-[#14213D]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4DACA] pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[1.75rem] font-semibold leading-tight">Products</h1>
          <span className="text-sm text-[#46536F]">{products.length} {products.length === 1 ? 'product' : 'products'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/seller/analytics" className="section-link">Sales &amp; inventory</Link>
          {publicShop ? <Link className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-[#EBE2D0]" href={`/makers/${publicShop.id}`}><Eye className="size-4" /> View shop</Link> : null}
          <Button nativeButton={false} className="hidden min-h-11 bg-[#A8232E] text-white hover:bg-[#8D1D27] md:inline-flex" render={<Link href="/seller/products/new" />}><PackagePlus /> Add product</Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <nav aria-label="Filter products by status" className="flex max-w-full flex-wrap items-center gap-0.5 rounded-xl bg-[#EBE2D0] p-1">
          {tabs.map(([value, label]) => (
            <Link key={value} href={hrefFor(value)} aria-current={activeStatus === value ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-1 rounded-[0.625rem] px-2.5 text-sm md:px-3 ${activeStatus === value ? 'bg-white font-bold text-[#14213D] shadow-sm' : value === 'needs_changes' ? 'text-[#A8232E]' : 'text-[#46536F]'}`}>
              {label} <span className="tabular-nums opacity-75">{products.filter(product => matchesStatus(product, value)).length}</span>
            </Link>
          ))}
        </nav>
        <form key={search} data-form-id="seller.product-filter" action="/seller/products" className="ml-auto flex w-full max-w-[22rem] items-center gap-1">
          {activeStatus !== 'all' ? <input type="hidden" name="status" value={activeStatus} /> : null}
          <label htmlFor="seller-product-search" className="relative min-w-0 flex-1">
            <span className="sr-only">{searchField.label}</span>
            <Input id="seller-product-search" name="q" type="search" defaultValue={search} maxLength={160}
              placeholder={searchField.placeholder} aria-describedby={searchField.helpText ? 'seller-product-search-help' : undefined}
              className="min-h-11 rounded-xl border-[#D7C4A9] bg-white pr-2 pl-3" />
          </label>
          <Button type="submit" variant="outline" size="icon" aria-label="Search products" className="size-11 rounded-xl border-[#D7C4A9] bg-white"><Search className="size-4" /></Button>
        </form>
      </div>
      {searchField.helpText ? <p id="seller-product-search-help" className="text-sm text-muted-foreground">{searchField.helpText}</p> : null}
      {presentation.unavailable ? <output className="block text-sm text-muted-foreground">Search presentation is unavailable. Standard search remains available.</output> : null}
      {rows.length ? <ProductCatalogue key={JSON.stringify([activeStatus, search])} rows={rows} /> : (
        <SellerEmpty icon={PackagePlus}
          title={search || activeStatus !== 'all' ? 'No products match this view' : 'Add your first product'}
          description={search || activeStatus !== 'all' ? 'Change the search or status filter to see other listings.' : 'Add photos, price and details, then send your product for review.'}
          href="/seller/products/new" action="Add product" />
      )}
      <div className="flex flex-wrap items-center gap-x-5">
        <Link href="/seller/products/intakes" className="section-link inline-flex min-h-11 items-center">Saved product workspaces</Link>
        <Link href={hrefFor('archived')} className="section-link inline-flex min-h-11 items-center">Archived products</Link>
        <Link href={hrefFor('rejected')} className="section-link inline-flex min-h-11 items-center">Rejected products</Link>
        {activeStatus !== 'out_of_stock' ? <Link href={hrefFor('out_of_stock')} className="section-link inline-flex min-h-11 items-center">Sold out products</Link> : null}
      </div>
    </div>
  );
}
