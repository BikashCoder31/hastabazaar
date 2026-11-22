import type {OrderOfferSnapshot} from '@/lib/products/offer-order-contract';

export function OrderOfferDetails({offer}:{offer?:OrderOfferSnapshot|null}) {
 if(!offer)return null;
 return <span className="block text-xs text-muted-foreground">
  {offer.legacySelectionUnknown ? 'Original option details were not recorded. ' : <>{offer.selection.map(option=>`${option.name}: ${option.value}`).join(' / ')}{offer.selection.length ? ' · ' : ''}{offer.unitsPerOffer} {offer.baseUnit} per offer · </>}
  SKU {offer.sku}
 </span>;
}
