import { productDiscountLabel } from '@/lib/products/discount';
export function ProductDiscount({ pricePaisa, originalPaisa }: { pricePaisa: number; originalPaisa: number | null | undefined }) {
  const label = productDiscountLabel(pricePaisa, originalPaisa);
  if (!label || !originalPaisa) return null;
  return <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="text-muted-foreground line-through">NPR {new Intl.NumberFormat('en-NP').format(originalPaisa / 100)}</span><span className="font-semibold text-primary">{label}</span></span>;
}
