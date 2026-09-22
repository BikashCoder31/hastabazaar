import { productClosureBlockers } from '@/lib/db/repositories/product-closure';
import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { ImageIcon, PackagePlus, Search } from 'lucide-react';
import { StatusBadge } from '@/components/admin/status-badge';
import { ArchiveProductButton } from '@/components/seller/archive-product-button';
import { InventoryEditor } from '@/components/seller/inventory-editor';
import { SellerHeading, SellerEmpty } from '@/components/seller/workspace-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { requireSellerPage } from '@/lib/auth/seller';
import { requireDatabase } from '@/lib/db/d1';
import { listSellerProducts } from '@/lib/db/repositories/products';
import { mediaObjectClass, mediaSizes } from '@/lib/media/responsive-media';
import {
  canEditSellerInventory,
  sellerDate,
  sellerMoney,
} from '@/lib/seller/presentation';

export const dynamic = 'force-dynamic';

const filters = [
  ['all', 'All'],
  ['published', 'Published'],
  ['pending', 'Pending'],
  ['rejected', 'Rejected'],
  ['needs_changes', 'Needs changes'],
  ['draft', 'Draft'],
  ['out_of_stock', 'Out of stock'],
] as const;

const editableStatuses = new Set([
  'draft',
  'needs_changes',
  'rejected',
  'approved',
  'published',
]);

export default async function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const seller = await requireSellerPage('/seller/products');
  const params = await searchParams;
  const activeStatus = filters.some(([value]) => value === params.status)
    ? params.status!
    : 'all';
  const search = (params.q ?? '').trim().slice(0, 160);
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const products = await listSellerProducts(database, seller.sellerId, {
    status: activeStatus === 'all' ? undefined : activeStatus,
    search,
  });
  const closure = new Map(
    await Promise.all(
      products
        .filter(
          (product) =>
            product.status === 'published' || product.status === 'archived',
        )
        .map(
          async (product) =>
            [
              product.id,
              await productClosureBlockers(
                database,
                product.id,
                seller.sellerId,
              ),
            ] as const,
        ),
    ),
  );

  return (
    <div className="space-y-7">
      <SellerHeading
        eyebrow="Catalogue"
        title="My products"
        description="Search every listing, filter by status, update stock, and respond to review decisions from one place."
      >
        <Button
          nativeButton={false}
          render={<Link href="/seller/products/new" />}
        >
          <PackagePlus /> Add product
        </Button>
      </SellerHeading>

      <section className="space-y-4 rounded-2xl border bg-card p-4 sm:p-5">
        <nav
          aria-label="Filter products by status"
          className="flex flex-wrap gap-2"
        >
          {filters.map(([value, label]) => {
            const href =
              value === 'all'
                ? '/seller/products'
                : `/seller/products?status=${value}`;
            return (
              <Link
                key={value}
                href={
                  search
                    ? `${href}${href.includes('?') ? '&' : '?'}q=${encodeURIComponent(search)}`
                    : href
                }
                aria-current={activeStatus === value ? 'page' : undefined}
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${activeStatus === value ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-secondary'}`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          action="/seller/products"
        >
          {activeStatus !== 'all' ? (
            <input type="hidden" name="status" value={activeStatus} />
          ) : null}
          <label
            htmlFor="seller-product-search"
            className="relative min-w-0 flex-1"
          >
            <span className="sr-only">Search products</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="seller-product-search"
              name="q"
              type="search"
              defaultValue={search}
              maxLength={160}
              placeholder="Search products by name or SKU"
              className="pl-9"
            />
          </label>
          <Button type="submit" variant="outline">
            Search products
          </Button>
        </form>
      </section>

      {products.length ? (
        <div className="relative overflow-x-auto rounded-2xl border bg-card">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">Last updated</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.map((product) => (
                <ProductRow
                  key={product.id}
                  product={product}
                  blockers={closure.get(product.id) ?? []}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <SellerEmpty
          icon={PackagePlus}
          title={
            search || activeStatus !== 'all'
              ? 'No products match this view'
              : 'Add your first product'
          }
          description={
            search || activeStatus !== 'all'
              ? 'Change the search or status filter to see other listings.'
              : 'Upload your own photos, set your price, and submit the listing for review.'
          }
          href="/seller/products/new"
          action="Create a listing"
        />
      )}
    </div>
  );
}

function ProductRow({
  product,
  blockers,
}: {
  product: Awaited<ReturnType<typeof listSellerProducts>>[number];
  blockers: Awaited<ReturnType<typeof productClosureBlockers>>;
}) {
  const reasonVisible =
    product.status === 'rejected' || product.status === 'needs_changes';
  return (
    <>
      <tr id={`product-${product.id}`} className="align-top">
        <td aria-label={`${product.nameEn} product details`} className="px-4 py-4">
          <div className="flex min-w-64 items-start gap-3">
            <div
              data-media-frame="cover"
              className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted"
            >
              {product.primaryMediaId ? (
                <Image
                  data-media-mode="cover"
                  src={`/api/product-media/${product.primaryMediaId}`}
                  alt={product.nameEn}
                  width={64}
                  height={64}
                  sizes={mediaSizes.adminThumbnail}
                  unoptimized
                  className={mediaObjectClass('cover')}
                />
              ) : (
                <ImageIcon
                  aria-label="No product image"
                  className="size-6 text-muted-foreground"
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="font-semibold">{product.nameEn}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {product.categoryName}
              </p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                SKU {product.sku}
              </p>
            </div>
          </div>
        </td>
        <td className="px-4 py-4 text-right font-semibold tabular-nums">
          {sellerMoney(product.pricePaisa)}
        </td>
        <td className="px-4 py-4">
          <InventoryEditor
            key={`${product.id}:${product.inventoryQuantity}`}
            productId={product.id}
            quantity={product.inventoryQuantity}
            productName={product.nameEn}
            disabled={!canEditSellerInventory(product.status)}
          />
        </td>
        <td className="px-4 py-4">
          <StatusBadge
            status={
              product.status === 'published' && product.inventoryQuantity === 0
                ? 'out_of_stock'
                : product.status
            }
          />
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          {sellerDate(product.createdAt)}
        </td>
        <td className="px-4 py-4 whitespace-nowrap">
          {sellerDate(product.updatedAt)}
        </td>
        <td className="px-4 py-4">
          <div className="flex min-w-44 flex-col items-start gap-2">
            {product.status === 'published' ? (
              <Link className="section-link" href={`/products/${product.slug}`}>
                View product
              </Link>
            ) : null}
            {editableStatuses.has(product.status) ? (
              <Link
                className="section-link"
                href={`/seller/products/${product.id}/edit`}
              >
                {reasonVisible ? 'Edit and resubmit' : 'Edit product'}
              </Link>
            ) : null}
            {product.status === 'archived' ? (
              <ArchiveProductButton
                blocked={blockers.length > 0}
                productId={product.id}
                productName={product.nameEn}
                deleting
              />
            ) : null}
            {product.status === 'published' ? (
              <ArchiveProductButton
                blocked={blockers.length > 0}
                productId={product.id}
                productName={product.nameEn}
              />
            ) : null}
          </div>
        </td>
      </tr>
      {reasonVisible ? (
        <tr>
          <td
            colSpan={7}
            className="bg-amber-50 px-4 py-4 text-sm text-amber-950"
          >
            <strong>
              {product.status === 'rejected'
                ? 'Reason for rejection:'
                : 'Changes requested:'}
            </strong>{' '}
            {product.reviewNote ||
              'Open the product to review and correct the requested information.'}
            <Link
              href={`/seller/products/${product.id}/edit`}
              className="ml-3 font-semibold underline underline-offset-4"
            >
              {product.status === 'rejected'
                ? 'Edit product and resubmit'
                : 'Revise and resubmit'}
            </Link>
          </td>
        </tr>
      ) : null}
      {blockers.length ? (
        <tr>
          <td colSpan={7} className="bg-muted/40 px-4 py-4 text-sm">
            <strong>Archive and delete are waiting on related work.</strong>{' '}
            {blockers.map((blocker) => blocker.message).join(' ')}
          </td>
        </tr>
      ) : null}
    </>
  );
}
