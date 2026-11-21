'use client';
import { SellerDisclosure } from './seller-disclosure';
import { CustomerServiceFeeBreakdown } from './customer-service-fee-breakdown';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  ChevronLeft,
  Heart,
  Minus,
  Package,
  PackageOpen,
  Plus,
  ShieldCheck,
  TriangleAlert,
  Truck,
  Undo2,
  Wallet,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {notifyPublicCartStorage,usePublicCartStorage} from '@/hooks/use-public-cart-storage';
import { type PlatformServiceFeeSnapshot } from '@/lib/checkout/platform-service-fee';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HttpResponseError,sendJson } from '@/lib/http/client-request';
import type {CartSelectedOffer, OfferCartChoice} from '@/lib/cart/offer-cart';
import type { WishlistProductRow } from '@/lib/db/repositories/customers';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';
import { bagNeedsReview, groupCheckoutParcels } from '@/lib/checkout/parcel-display';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

interface CartItem {
  id: string;
  productId: string;
  sellerId?: string;
  preparationDays?: number;
  slug: string;
  nameEn: string;
  tradingName: string;
  makerName?: string | null;
  participationRoute?: string;
  storeName?: string | null;
  legalSellerName?: string | null;
  pricePaisa: number|null;
  offerId?:string;revision?:number;selectedOffer?:CartSelectedOffer;unavailableReason?:string|null;
  currentChoice?:{versionId:string;publicVersionId:string|null;pricePaisa:number;orderable:boolean}|null;
  quantity: number;
  inventoryQuantity: number;
  productStatus: string;
  primaryMediaId: string | null;
}

interface CartData {
  items: CartItem[];
  itemSubtotalPaisa: number;
  itemCount: number;
  hasUnavailableItems: boolean;
}

function money(paisa: number|null): string {
  if(paisa===null)return 'Price unavailable';
  return formatPaisaExact(paisa).replace(/\.00$/, '');
}

type PendingCartEdit={method:'PATCH'|'DELETE';body:Record<string,unknown>;label:string};
function readPendingCartEdit(raw:string|null|undefined):PendingCartEdit|null{
  try{const saved=JSON.parse(raw??'null') as PendingCartEdit|null;return saved&&['PATCH','DELETE'].includes(saved.method)&&typeof saved.body?.itemId==='string'&&typeof saved.label==='string'?saved:null;}catch{return null;}
}

type SavedBagProduct = Pick<WishlistProductRow, 'id' | 'slug' | 'nameEn' | 'pricePaisa' | 'tradingName' | 'primaryMediaId'> & {
  choice?: Omit<OfferCartChoice, 'requestId' | 'quantity' | 'productId'>;
  priceFrom?: boolean;
};

function readSavedMove(key: string, productId: string): OfferCartChoice | undefined {
  try {
    const move = JSON.parse(sessionStorage.getItem(key) ?? 'null') as OfferCartChoice | null;
    if (move?.productId === productId && typeof move.requestId === 'string' && move.quantity === 1 && typeof move.offerId === 'string'
      && typeof move.versionId === 'string' && (move.publicVersionId === null || typeof move.publicVersionId === 'string')
      && Number.isSafeInteger(move.pricePaisa)) return move;
  } catch { /* Use the in-memory attempt when session storage is unavailable. */ }
}

export function CartView({ serviceFee, customerId, savedProducts = [], walletBalancePaisa = 0 }: {
  serviceFee?: PlatformServiceFeeSnapshot;
  customerId?: string;
  savedProducts?: readonly SavedBagProduct[];
  walletBalancePaisa?: number;
} = {}) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saved, setSaved] = useState(savedProducts);
  const [saving, setSaving] = useState<string | null>(null);
  const wishlistAction = useRef(false);
  const moveAttempts = useRef(new Map<string, OfferCartChoice>());
  const currentCustomer = useRef(customerId);
  const mounted = useRef(true);
  useEffect(() => {
    currentCustomer.current = customerId;
    mounted.current = true;
    const revoke = (event: Event) => {
      if ((event as CustomEvent<{ actorId?: string }>).detail?.actorId === customerId) currentCustomer.current = undefined;
    };
    window.addEventListener('hb:account-access-denied', revoke);
    return () => { mounted.current = false; window.removeEventListener('hb:account-access-denied', revoke); };
  }, [customerId]);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [pendingOverride,setPending]=useState<PendingCartEdit|null|undefined>(undefined);
  const pendingRaw=usePublicCartStorage('hb:cart-edit');
  const restored=useMemo(()=>readPendingCartEdit(pendingRaw),[pendingRaw]);
  const pending=pendingOverride===undefined?restored:pendingOverride;

  function remember(action:PendingCartEdit|null){setPending(action);try{if(action)sessionStorage.setItem('hb:cart-edit',JSON.stringify(action));else sessionStorage.removeItem('hb:cart-edit');notifyPublicCartStorage('hb:cart-edit');}catch{}}

  useEffect(() => {
    let active = true;
    void fetch('/api/cart', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Cart could not be loaded.');
        const result = (await response.json()) as CartData;
        if (active) setCart(result);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Cart could not be loaded.',
          );
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  async function run(action:PendingCartEdit){if(busy)return;setBusy(String(action.body.itemId));setError('');remember(action);
    try{const result=await sendJson<CartData>('/api/cart',action.method,action.body,'The cart response could not be confirmed. Retry the exact saved action.');setCart(result);remember(null);window.dispatchEvent(new Event('cart:updated'));return true;}
    catch(reason){if(reason instanceof HttpResponseError&&reason.status<500){remember(null);setLoadAttempt(value=>value+1);}setError(`${action.label}: ${reason instanceof Error?reason.message:'The response was interrupted.'}`);return false;}
    finally{setBusy(null);}
  }
  async function mutate(itemId:string,quantity?:number,refresh=false){if(busy||pending||pendingRaw===undefined)return;const item=cart?.items.find(row=>row.id===itemId);if(!item)return;
    const label=[item.nameEn,...(item.selectedOffer?.selection.map(choice=>`${choice.name}: ${choice.value}`)??[])].join(' · '),body:Record<string,unknown>=quantity===undefined?{itemId}:{itemId,quantity,...(item.offerId?{revision:item.revision,requestId:crypto.randomUUID(),...(refresh&&item.currentChoice?{refresh:{versionId:item.currentChoice.versionId,publicVersionId:item.currentChoice.publicVersionId,pricePaisa:item.currentChoice.pricePaisa}}:{})}:{})};
    await run({method:quantity===undefined?'DELETE':'PATCH',body,label:quantity===undefined?`Remove ${label}`:`${label}, requested quantity ${quantity}`});
  }

  async function saveForLater(item: CartItem) {
    if (!customerId || currentCustomer.current !== customerId || wishlistAction.current || busy || pending || pendingRaw === undefined) return;
    wishlistAction.current = true;
    setSaving(item.id);
    setError('');
    setMessage('');
    try {
      const result = await fetch('/api/account/wishlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: customerId },
        body: JSON.stringify({ productId: item.productId, saved: true }),
      });
      const body = await result.json().catch(() => null) as { saved?: unknown; error?: string } | null;
      if (!result.ok || body?.saved !== true) throw new Error(body?.error ?? 'This item could not be saved. Try again from your bag.');
      if (!mounted.current || currentCustomer.current !== customerId) return;
      setSaved(items => items.some(savedItem => savedItem.id === item.productId) ? items : [{
        id: item.productId, slug: item.slug, nameEn: item.nameEn, pricePaisa: item.pricePaisa, tradingName: item.tradingName, primaryMediaId: item.primaryMediaId,
      }, ...items]);
      const removed = await run({ method: 'DELETE', body: { itemId: item.id }, label: `Remove saved item ${item.nameEn}` });
      if (mounted.current && currentCustomer.current === customerId) setMessage(removed
        ? `${item.nameEn} moved to Saved for later.`
        : `${item.nameEn} is saved. If it still appears in your bag, retry removing it.`);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'This item could not be saved.');
    } finally {
      wishlistAction.current = false;
      if (mounted.current) setSaving(null);
    }
  }

  async function moveToBag(item: SavedBagProduct) {
    if (!item.choice || !customerId || currentCustomer.current !== customerId || wishlistAction.current || busy || pending) return;
    wishlistAction.current = true;
    setSaving(item.id);
    setError('');
    setMessage('');
    const key = `hb:move-saved-item:${customerId}:${item.id}`;
    const move = moveAttempts.current.get(key) ?? readSavedMove(key, item.id)
      ?? { productId: item.id, ...item.choice, quantity: 1, requestId: crypto.randomUUID() };
    moveAttempts.current.set(key, move);
    try { sessionStorage.setItem(key, JSON.stringify(move)); } catch { /* Keep the exact attempt in memory. */ }
    function clearMove() {
      moveAttempts.current.delete(key);
      try { sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
    }
    try {
      const identity = await fetch('/api/cart', { cache: 'no-store' });
      if (!identity.ok) throw new Error('We could not confirm your bag. Try again.');
      const result = await sendJson<CartData>('/api/cart', 'POST', { ...move }, 'We could not confirm the move. Retry the same item.');
      if (!mounted.current || currentCustomer.current !== customerId) return;
      setCart(result);
      window.dispatchEvent(new Event('cart:updated'));
      const unsaved = await fetch('/api/account/wishlist', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: customerId },
        body: JSON.stringify({ productId: item.id, saved: false }),
      });
      const removed = await unsaved.json().catch(() => null) as { saved?: unknown } | null;
      if (!unsaved.ok || removed?.saved !== false) throw new Error('This item is in your bag, but still saved. Retry to finish moving it.');
      if (!mounted.current || currentCustomer.current !== customerId) return;
      clearMove();
      setSaved(items => items.filter(savedItem => savedItem.id !== item.id));
      setMessage(`${item.nameEn} moved to your bag.`);
    } catch (reason) {
      if (reason instanceof HttpResponseError && reason.status < 500) clearMove();
      if (mounted.current) setError(reason instanceof Error ? reason.message : 'This item could not be moved.');
    } finally {
      wishlistAction.current = false;
      if (mounted.current) setSaving(null);
    }
  }

  if (!cart && !error) return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="space-y-4">
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-40 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
      <output className="sr-only">Loading your cart…</output>
    </div>
  );

  if (!cart) return (
    <div className="rounded-2xl border bg-card p-7">
      <p role="alert" className="text-destructive">{error}</p>
      <Button type="button" className="mt-5 min-h-11" onClick={() => { setError(''); setLoadAttempt(attempt => attempt + 1); }}>
        Try loading again
      </Button>
    </div>
  );

  const parcels = groupCheckoutParcels(cart.items);
  const unavailable = cart.hasUnavailableItems || cart.items.some(bagNeedsReview);
  const priceChanged = cart.items.some(item => item.currentChoice?.orderable && item.pricePaisa !== item.currentChoice.pricePaisa);
  const busyAny = busy !== null || saving !== null || Boolean(pending);
  const displaySubtotal = cart.items.some(item => item.pricePaisa === null) ? 'Review unpriced items' : money(cart.itemSubtotalPaisa);
  const returns = phaseOneMarketplacePolicy.value.returns;
  const checkoutBlocked = unavailable || busyAny;
  const card = 'rounded-2xl border border-[#e3d6c3] bg-[#fdfaf5]';
  const action = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#14213d] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#14213d]';

  return (
    <>
      <div className="mb-7 flex flex-wrap items-center justify-between gap-3 text-[#465573]">
        <p>{cart.itemCount} {cart.itemCount === 1 ? 'item' : 'items'} from {parcels.length} {parcels.length === 1 ? 'seller' : 'sellers'}. Each seller sends their own parcel.</p>
        <Link href="/shop" className={`${action} border border-[#d5c1a5]`}><ChevronLeft className="size-4" aria-hidden="true" /> Keep shopping</Link>
      </div>
      <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,31.65%)] lg:gap-10">
        <div className="min-w-0 space-y-5">
          {!cart.items.length ? (
            <div className={`${card} px-6 py-12 text-center`}>
              <PackageOpen className="mx-auto size-10 text-primary" aria-hidden="true" />
              <h2 className="mt-4 font-heading text-3xl">Your bag is empty</h2>
              <p className="mt-2 text-muted-foreground">Explore the collection to find something you love.</p>
              <Button nativeButton={false} render={<Link href="/shop" />} className="mt-5 min-h-11 rounded-lg">Explore the collection</Button>
            </div>
          ) : null}
          {parcels.map((parcel, index) => (
            <section key={parcel.sellerId} className={card} aria-labelledby={`bag-parcel-${index}`}>
              <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-[#e3d6c3] px-4 py-4 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f1e4c5] text-[#704d15]"><Package className="size-4" aria-hidden="true" /></span>
                  <div className="min-w-0 wrap-anywhere">
                    <h2 id={`bag-parcel-${index}`} className="font-semibold text-[#14213d]">Parcel {index + 1} · from {parcel.sellerName}</h2>
                    {parcel.preparationDays !== null ? <p className="text-sm text-[#655848]">{parcel.preparationDays > 0 ? 'Has made-to-order items' : 'Ready to dispatch'}</p> : null}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e3d6c3] bg-white px-2.5 py-1 text-xs font-semibold text-[#344766]"><Truck className="size-3.5" aria-hidden="true" /> Delivery worked out at checkout</span>
              </header>
              <div className="divide-y divide-[#e3d6c3]">
                {parcel.items.map(item => {
                  const options = item.selectedOffer?.selection.map(choice => `${choice.name}: ${choice.value}`) ?? [];
                  const itemLabel = [item.nameEn, ...options].join(' · ');
                  const needsReview = bagNeedsReview(item);
                  const current = item.currentChoice;
                  const itemHref = `/products/${item.slug}${item.offerId ? `?offer=${encodeURIComponent(item.offerId)}` : ''}`;
                  return (
                    <article key={item.id} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 px-4 py-5 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:px-5">
                      <Link href={itemHref} aria-label={`View ${item.nameEn}`} className={mediaFrameClass('cover', 'aspect-square rounded-xl border border-[#e3d6c3] bg-white')}>
                        {item.primaryMediaId ? (
                          <Image src={`/api/product-media/${item.primaryMediaId}`} alt="" width={240} height={240} unoptimized data-media-mode="cover" sizes={mediaSizes.cartThumbnail} className={mediaObjectClass('cover')} />
                        ) : <Package className="absolute left-1/2 top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
                      </Link>
                      <div className="min-w-0 space-y-2 wrap-anywhere">
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                          <div>
                            <Link href={itemHref} className="font-semibold text-[#14213d] hover:underline">{item.nameEn}</Link>
                            {item.selectedOffer ? (
                              <p className="text-sm text-[#655848]">{options.join(' · ') || 'Standard option'}
                                <span className="block text-xs">{item.selectedOffer.unitsPerOffer} {item.selectedOffer.baseUnit}{item.selectedOffer.unitsPerOffer === 1 ? '' : 's'} per sales unit · SKU {item.selectedOffer.sku}</span>
                              </p>
                            ) : null}
                            <SellerDisclosure managed={item.participationRoute === 'managed_maker'} supplierName={item.makerName ?? item.tradingName} legalSellerName={item.legalSellerName} />
                          </div>
                          <p className="shrink-0 font-bold text-[#14213d]">{money(item.pricePaisa === null ? null : item.pricePaisa * item.quantity)}</p>
                        </div>
                        {item.quantity > 1 && item.pricePaisa !== null ? <p className="text-sm text-[#655848]">{money(item.pricePaisa)} each</p> : null}
                        {needsReview && current?.orderable ? (
                          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#f5e7c4] p-3 text-sm text-[#614319]">
                            <div className="flex min-w-0 items-start gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                              <p>{item.pricePaisa !== current.pricePaisa ? <>The price changed from <s>{money(item.pricePaisa)}</s> to <strong>{money(current.pricePaisa)}</strong> since you added it.</> : 'The saved option changed. Review and confirm the current details.'}</p>
                            </div>
                            <Button type="button" className="min-h-11 shrink-0 rounded-lg bg-[#14213d] text-white" disabled={busyAny || item.quantity > item.inventoryQuantity} onClick={() => void mutate(item.id, item.quantity, true)}>
                              Confirm current option and price
                            </Button>
                          </div>
                        ) : null}
                        {needsReview && (!current?.orderable || item.quantity > item.inventoryQuantity) ? (
                          <p className="text-sm font-semibold text-destructive">{item.unavailableReason ?? 'Availability changed. Review this item before checkout.'}</p>
                        ) : null}
                        {needsReview ? <Link className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline" href={itemHref}>Review product options</Link> : null}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {typeof item.preparationDays === 'number' ? (
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${item.preparationDays > 0 ? 'bg-[#f1e4c5] text-[#704d15]' : 'bg-[#ddece3] text-[#205d42]'}`}>
                              {item.preparationDays > 0 ? `Made to order · about ${item.preparationDays} ${item.preparationDays === 1 ? 'day' : 'days'}` : 'Ready to dispatch'}
                            </span>
                          ) : null}
                          <div className="flex flex-wrap items-center gap-1">
                            <div className="inline-flex shrink-0 items-center rounded-lg border border-[#d5c1a5] bg-white">
                              <button type="button" className={`${action} min-w-11 px-2.5 disabled:opacity-45`} aria-label={`Decrease ${itemLabel} quantity`} disabled={busyAny || item.quantity <= 1} onClick={() => void mutate(item.id, item.quantity - 1)}>
                                <Minus className="size-4" aria-hidden="true" />
                              </button>
                              <span className="min-w-5 text-center text-sm font-bold" aria-label={`Quantity ${item.quantity}`}>{item.quantity}</span>
                              <button type="button" className={`${action} min-w-11 px-2.5 disabled:opacity-45`} aria-label={`Increase ${itemLabel} quantity`} disabled={busyAny || item.quantity >= Math.min(10, item.inventoryQuantity)} onClick={() => void mutate(item.id, item.quantity + 1)}>
                                <Plus className="size-4" aria-hidden="true" />
                              </button>
                            </div>
                            {customerId ? (
                              <button type="button" className={`${action} min-w-11 hover:bg-white disabled:opacity-45`} disabled={busyAny} onClick={() => void saveForLater(item)} aria-label={`Save ${itemLabel} for later`}>
                                <Heart className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Save for later</span>
                              </button>
                            ) : (
                              <Link href="/login?return_to=%2Fcart" className={`${action} min-w-11 hover:bg-white`} aria-label={`Sign in to save ${itemLabel} for later`}>
                                <Heart className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Save for later</span>
                              </Link>
                            )}
                            <button type="button" className={`${action} min-w-11 hover:bg-white disabled:opacity-45`} aria-label={`Remove ${itemLabel}`} disabled={busyAny} onClick={() => void mutate(item.id)}>
                              <X className="size-4" aria-hidden="true" /><span className="hidden sm:inline">Remove</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
          {pending ? <div className="rounded-xl border bg-secondary/30 p-4 text-sm"><output className="block">Saved action: {pending.label}. Confirm its result before making another change.</output><Button type="button" className="mt-3 min-h-11" disabled={busy !== null} onClick={() => void run(pending)}>Retry exact cart action</Button></div> : null}
          {message ? <output className="block rounded-xl border bg-white p-4 text-sm">{message}</output> : null}
          {error ? <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive">{error}</p> : null}
          {customerId && saved.length ? (
            <section className={`${card} p-4 sm:p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-x-3"><h2 className="font-semibold">Saved for later · {saved.length}</h2><Link href="/account/wishlist" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#a8232e] underline">All saved items</Link></div>
              <div className="grid gap-3 sm:grid-cols-2">
                {saved.slice(0, 4).map(item => (
                  <div key={item.id} className="flex min-w-0 flex-wrap items-center gap-3 rounded-xl border border-[#e3d6c3] bg-white p-3">
                    {item.primaryMediaId ? (
                      <Image src={`/api/product-media/${item.primaryMediaId}`} alt="" width={56} height={56} sizes="56px" unoptimized className="size-14 shrink-0 rounded-lg object-cover" />
                    ) : null}
                    <div className="min-w-24 flex-1 wrap-anywhere">
                      <Link href={`/products/${item.slug}`} className="text-sm font-semibold hover:underline">{item.nameEn}</Link>
                      <p className="text-sm text-[#655848]">{item.priceFrom ? 'From ' : ''}{money(item.pricePaisa)} · {item.tradingName}</p>
                    </div>
                    {item.choice ? (
                      <button type="button" className={`${action} border border-[#d5c1a5] disabled:opacity-45`} disabled={busyAny} onClick={() => void moveToBag(item)}>Move to bag</button>
                    ) : (
                      <Link href={`/products/${item.slug}`} className={`${action} border border-[#d5c1a5]`}>View options</Link>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        {cart.items.length ? (
          <div className="min-w-0 space-y-3">
            <aside className={`${card} p-5 sm:p-6`}>
              <h2 className="text-lg font-semibold">Order summary</h2>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex flex-wrap justify-between gap-x-3"><dt className="text-[#465573]">Items ({cart.itemCount})</dt><dd>{displaySubtotal}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-[#465573]">Delivery</dt><dd>At checkout</dd></div>
              </dl>
              {serviceFee ? (
                <CustomerServiceFeeBreakdown className="mt-3"
                  standardPaisa={'standardPaisa' in serviceFee ? serviceFee.standardPaisa : serviceFee.chargedPaisa}
                  waivedPaisa={'waivedPaisa' in serviceFee ? serviceFee.waivedPaisa : 0}
                  netPaisa={serviceFee.chargedPaisa}
                  campaignName={'campaign' in serviceFee ? serviceFee.campaign?.name ?? null : null}
                  source="estimate"
                />
              ) : null}
              <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-[#e3d6c3] pt-4 font-semibold">
                <span>Subtotal</span>
                <span className="text-2xl">{cart.items.some(item => item.pricePaisa === null) ? 'Review unpriced items' : money(cart.itemSubtotalPaisa + (serviceFee?.chargedPaisa ?? 0))}</span>
              </div>
              {unavailable ? <p className="mt-4 flex gap-2 rounded-lg bg-[#f5e7c4] p-3 text-sm text-[#614319]"><TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{priceChanged ? 'Confirm the current prices before checkout.' : 'Review unavailable items before checkout.'}</p> : null}
              <Button
                nativeButton={checkoutBlocked}
                render={checkoutBlocked ? undefined : <Link href="/checkout" />}
                disabled={checkoutBlocked}
                className="mt-4 min-h-12 w-full rounded-lg bg-[#a8232e] text-base text-white hover:bg-[#8d1b25]"
              >
                Go to checkout <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
              <ul className="mt-5 space-y-3 border-t border-[#e3d6c3] pt-4 text-sm text-[#344766]">
                <li className="flex items-start gap-2"><Banknote className="mt-0.5 size-4 shrink-0 text-[#205d42]" aria-hidden="true" /><span><strong>Pay when it arrives.</strong> Cash on delivery for each parcel, or bank transfer when available.</span></li>
                <li className="flex items-start gap-2"><Undo2 className="mt-0.5 size-4 shrink-0 text-[#205d42]" aria-hidden="true" /><span><strong>{returns.generalRequestWindowDays} days to ask for a return</strong> on eligible items, {returns.sealedGoodsWindowDays} for sealed goods.</span></li>
                <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#205d42]" aria-hidden="true" /><span><strong>Reviewed sellers.</strong> Each shop and listing is checked by Hastabazaar.</span></li>
              </ul>
            </aside>
            {customerId && walletBalancePaisa > 0 ? (
              <Link href="/account/wallet" className={`${card} flex min-h-11 items-center gap-3 p-4 focus-visible:outline-2 focus-visible:outline-[#14213d]`}>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#ddece3] text-[#205d42]"><Wallet className="size-4" aria-hidden="true" /></span>
                <span className="min-w-0"><strong className="block text-sm">{money(walletBalancePaisa)} shopping credit</strong><span className="text-sm text-[#655848]">You can use it at checkout.</span></span>
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
