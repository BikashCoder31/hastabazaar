import Link from 'next/link';
export function MakerProductWorkspace({ products, canWrite, nextUrl }: {
  products: readonly { id: string; nameEn: string; status: string }[]; canWrite: boolean; nextUrl: string | null;
}) {
  return <section className="space-y-4 rounded-2xl border bg-card p-6" aria-label="Maker products">
    <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="font-heading text-2xl">Your products</h2>
      <p className="mt-2 text-sm text-muted-foreground">Prepare a private draft, submit it for review, and return here for corrections. Staff review publication separately.</p></div>
      {canWrite ? <Link className="section-link" href="/sell/application/products/new">Prepare a product draft</Link> : null}</div>
    {products.length ? <ul className="divide-y">{products.map(product => <li className="flex flex-wrap items-center gap-3 py-3" key={product.id}>
      <span>{product.nameEn} · {product.status.replaceAll('_', ' ')}</span>
      {canWrite && ['draft', 'needs_changes', 'rejected', 'approved', 'published'].includes(product.status)
        ? <Link className="section-link" href={`/sell/application/products/${encodeURIComponent(product.id)}/edit`}>
          {product.status === 'draft' ? 'Edit and submit' : 'Update product'}</Link> : null}
      <Link className="section-link" href={`/sell/application/products/${encodeURIComponent(product.id)}/answers`}>Answer history</Link>
    </li>)}</ul> : <p>No products yet.</p>}
    {nextUrl ? <Link className="section-link" href={nextUrl}>Older products</Link> : null}
  </section>;
}
