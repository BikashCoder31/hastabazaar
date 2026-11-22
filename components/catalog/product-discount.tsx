import { productSavings } from '@/lib/products/discount';
export function ProductDiscount({ pricePaisa, originalPaisa }: { pricePaisa: number | null; originalPaisa: number | null | undefined }) {
  if(pricePaisa===null)return null;
  const savings = productSavings(pricePaisa, originalPaisa);
  if (!savings || !originalPaisa) return null;
  const money=new Intl.NumberFormat('en-NP',{minimumFractionDigits:0,maximumFractionDigits:2});
  return <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm"><span className="text-muted-foreground line-through">NPR {money.format(originalPaisa / 100)}</span><span className="font-semibold text-primary">{savings.label}</span><span className="text-muted-foreground">Save NPR {money.format(savings.savedPaisa/100)}</span></span>;
}
