'use client';
import { SellerDisclosure } from './seller-disclosure';
import { CustomerServiceFeeBreakdown } from './customer-service-fee-breakdown';

import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  Minus,
  PackageOpen,
  Plus,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {notifyPublicCartStorage,usePublicCartStorage} from '@/hooks/use-public-cart-storage';
import { type PlatformServiceFeeSnapshot } from '@/lib/checkout/platform-service-fee';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { HttpResponseError,sendJson } from '@/lib/http/client-request';
import type {CartSelectedOffer} from '@/lib/cart/offer-cart';
import {
  mediaFrameClass,
  mediaObjectClass,
  mediaSizes,
} from '@/lib/media/responsive-media';

interface CartItem {
  id: string;
  productId: string;
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
  return new Intl.NumberFormat('en-NP', {
    style: 'currency',
    currency: 'NPR',
  }).format(paisa / 100);
}

type PendingCartEdit={method:'PATCH'|'DELETE';body:Record<string,unknown>;label:string};
function readPendingCartEdit(raw:string|null|undefined):PendingCartEdit|null{
  try{const saved=JSON.parse(raw??'null') as PendingCartEdit|null;return saved&&['PATCH','DELETE'].includes(saved.method)&&typeof saved.body?.itemId==='string'&&typeof saved.label==='string'?saved:null;}catch{return null;}
}

export function CartView({serviceFee}:{serviceFee?:PlatformServiceFeeSnapshot} = {}) {
  const [cart, setCart] = useState<CartData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
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
    try{const result=await sendJson<CartData>('/api/cart',action.method,action.body,'The cart response could not be confirmed. Retry the exact saved action.');setCart(result);remember(null);window.dispatchEvent(new Event('cart:updated'));}
    catch(reason){if(reason instanceof HttpResponseError&&reason.status<500){remember(null);setLoadAttempt(value=>value+1);}setError(`${action.label}: ${reason instanceof Error?reason.message:'The response was interrupted.'}`);}
    finally{setBusy(null);}
  }
  async function mutate(itemId:string,quantity?:number,refresh=false){if(busy||pending||pendingRaw===undefined)return;const item=cart?.items.find(row=>row.id===itemId);if(!item)return;
    const label=[item.nameEn,...(item.selectedOffer?.selection.map(choice=>`${choice.name}: ${choice.value}`)??[])].join(' · '),body:Record<string,unknown>=quantity===undefined?{itemId}:{itemId,quantity,...(item.offerId?{revision:item.revision,requestId:crypto.randomUUID(),...(refresh&&item.currentChoice?{refresh:{versionId:item.currentChoice.versionId,publicVersionId:item.currentChoice.publicVersionId,pricePaisa:item.currentChoice.pricePaisa}}:{})}:{})};
    await run({method:quantity===undefined?'DELETE':'PATCH',body,label:quantity===undefined?`Remove ${label}`:`${label}, requested quantity ${quantity}`});
  }

  if (!cart && !error)
    return (
      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-4">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <Skeleton className="h-64 rounded-2xl" />
        <output className="sr-only">Loading your cart…</output>
      </div>
    );
  if (!cart)
    return (
      <div className="rounded-2xl border bg-card p-7">
        <p role="alert" className="text-destructive">
          {error}
        </p>
        <Button
          className="mt-5 rounded-full"
          onClick={() => {
            setError('');
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Try loading again
        </Button>
      </div>
    );
  if (cart.items.length === 0) {
    return (
      <div className="rounded-3xl border bg-card px-6 py-16 text-center">
        <PackageOpen className="mx-auto size-10 text-primary" />
        <h2 className="mt-5 font-heading text-3xl">Your cart is empty</h2>
        <p className="mt-3 text-muted-foreground">
          Explore products and seller details in the collection.
        </p>
        <Button nativeButton={false} render={<Link href="/shop" />} className="mt-7 rounded-full">
          Explore the collection
        </Button>
      </div>
    );
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        {cart.items.map((item) => {
          const itemLabel=[item.nameEn,...(item.selectedOffer?.selection.map(choice=>`${choice.name}: ${choice.value}`)??[])].join(' · ');
          const available =
            item.productStatus === 'published' &&
            item.inventoryQuantity >= item.quantity;
          return (
            <article
              key={item.id}
              className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 rounded-2xl border bg-card p-4 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
            >
              <Link
                href={`/products/${item.slug}${item.offerId?`?offer=${encodeURIComponent(item.offerId)}`:''}`}
                aria-label={`View ${item.nameEn}`}
                className={mediaFrameClass(
                  'cover',
                  'aspect-[4/5] rounded-xl bg-muted',
                )}
              >
                {item.primaryMediaId ? (
                  <Image
                    src={`/api/product-media/${item.primaryMediaId}`}
                    alt=""
                    width={240}
                    height={300}
                    unoptimized
                    data-media-mode="cover"
                    sizes={mediaSizes.cartThumbnail}
                    className={mediaObjectClass('cover')}
                  />
                ) : null}
              </Link>
              <div>
                <p className="text-sm font-semibold text-primary">
                  {item.tradingName}
                  <SellerDisclosure managed={item.participationRoute === 'managed_maker'} supplierName={item.makerName ?? item.tradingName} legalSellerName={item.legalSellerName} />
                </p>
                <Link
                  href={`/products/${item.slug}${item.offerId?`?offer=${encodeURIComponent(item.offerId)}`:''}`}
                  className="mt-1 block text-base font-semibold hover:underline"
                >
                  {item.nameEn}
                </Link>
                {item.selectedOffer?<p className="mt-2 text-sm">{item.selectedOffer.selection.map(choice=>`${choice.name}: ${choice.value}`).join(' · ')||'Standard option'}<span className="mt-1 block text-muted-foreground">{item.selectedOffer.unitsPerOffer} {item.selectedOffer.baseUnit}{item.selectedOffer.unitsPerOffer===1?'':'s'} per sales unit · SKU {item.selectedOffer.sku}</span></p>:null}
                <p className="mt-2 text-lg font-semibold">
                  {money(item.pricePaisa===null?null:item.pricePaisa * item.quantity)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {money(item.pricePaisa)} each
                </p>
                {!available ? (
                  <p className="mt-2 text-sm font-semibold text-destructive">
                    {item.unavailableReason??'Availability changed. Review this item before checkout.'}
                  </p>
                ) : null}
                {!available&&item.currentChoice?.orderable?<div className="mt-3 space-y-2 text-sm"><p>Current price: {money(item.currentChoice.pricePaisa)} per sales unit.</p><Button variant="outline" disabled={busy!==null||Boolean(pending)||item.quantity>item.inventoryQuantity} onClick={()=>void mutate(item.id,item.quantity,true)}>Confirm current option and price</Button></div>:null}
                {!available?<Link className="mt-3 inline-block text-sm font-semibold text-primary underline" href={`/products/${item.slug}${item.offerId?`?offer=${encodeURIComponent(item.offerId)}`:''}`}>Review product options</Link>:null}
              </div>
              <div className="col-span-2 col-start-1 flex flex-wrap items-center gap-2 self-end sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:self-center">
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Decrease ${itemLabel} quantity`}
                  disabled={busy !== null || Boolean(pending) || item.quantity <= 1}
                  onClick={() => void mutate(item.id, item.quantity - 1)}
                >
                  <Minus />
                </Button>
                <span
                  className="min-w-7 text-center font-semibold"
                  aria-label={`Quantity ${item.quantity}`}
                >
                  {item.quantity}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={`Increase ${itemLabel} quantity`}
                  disabled={
                    busy !== null || Boolean(pending) ||
                    item.quantity >= Math.min(10, item.inventoryQuantity)
                  }
                  onClick={() => void mutate(item.id, item.quantity + 1)}
                >
                  <Plus />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Remove ${itemLabel}`}
                  disabled={busy !== null||Boolean(pending)}
                  onClick={() => void mutate(item.id)}
                >
                  <Trash2 />
                </Button>
              </div>
            </article>
          );
        })}
        {pending?<div className="rounded-xl border bg-secondary/30 p-4 text-sm"><output className="block">Saved action: {pending.label}. Confirm its result before making another change.</output><Button className="mt-3" disabled={busy!==null} onClick={()=>void run(pending)}>Retry exact cart action</Button></div>:null}
        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-destructive/10 p-4 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Link href="/shop" className="section-link">
          Continue discovering <ArrowRight className="size-4" />
        </Link>
      </div>
      <aside className="h-fit rounded-2xl border bg-card p-6 lg:sticky lg:top-40">
        <h2 className="font-heading text-2xl">Order summary</h2>
        <div className="mt-6 flex justify-between text-sm">
          <span className="text-muted-foreground">
            Items ({cart.itemCount})
          </span>
          <strong>{cart.items.some(item=>item.pricePaisa===null)?'Review unpriced items':money(cart.itemSubtotalPaisa)}</strong>
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <span className="text-muted-foreground">Delivery</span>
          <span>At checkout</span>
        </div>
        {serviceFee ? (
          <CustomerServiceFeeBreakdown
            className="mt-3"
            standardPaisa={'standardPaisa' in serviceFee ? serviceFee.standardPaisa : serviceFee.chargedPaisa}
            waivedPaisa={'waivedPaisa' in serviceFee ? serviceFee.waivedPaisa : 0}
            netPaisa={serviceFee.chargedPaisa}
            campaignName={'campaign' in serviceFee ? serviceFee.campaign?.name ?? null : null}
            source="estimate"
          />
        ) : null}
        <div className="mt-5 flex justify-between gap-3 border-t pt-5 font-semibold">
          <span>Subtotal before delivery</span>
          <span>{cart.items.some(item=>item.pricePaisa===null)?'Review unpriced items':money(cart.itemSubtotalPaisa+(serviceFee?.chargedPaisa??0))}</span>
        </div>
        <p className="mt-4 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
          <Banknote className="mt-1 size-5 shrink-0 text-primary" />
          Pay on delivery. Your final total includes delivery, calculated at
          checkout.
        </p>
        <Button
          nativeButton={cart.hasUnavailableItems || busy !== null || Boolean(pending)}
          render={
            !cart.hasUnavailableItems && busy === null && !pending ? (
              <Link href="/checkout" />
            ) : undefined
          }
          disabled={cart.hasUnavailableItems || busy !== null || Boolean(pending)}
          className="mt-6 h-12 w-full rounded-full text-base"
        >
          Continue to checkout <ArrowRight className="size-4" />
        </Button>
        {cart.hasUnavailableItems ? (
          <p className="mt-3 text-sm text-destructive">
            Resolve unavailable items before checkout.
          </p>
        ) : null}
      </aside>
    </div>
  );
}
