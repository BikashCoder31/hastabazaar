import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { CalendarDays, Check, Package } from 'lucide-react';
import { InventoryEditor } from '@/components/seller/inventory-editor';
import { SellerAgreementAcceptance } from '@/components/seller/seller-agreement-acceptance';
import { SellerManagedProgramWorkspace } from '@/components/seller/managed-program-workspace';
import { SellerGettingStarted } from '@/components/seller/seller-getting-started';
import { SellerPayoutFixes } from '@/components/seller/seller-payout-fixes';
import { SellerProgramDetails } from '@/components/seller/seller-program-details';
import { SellerReadinessSummary } from '@/components/seller/readiness-summary';
import { SellerRegistrationApplicationOverview } from '@/components/seller/registration-application-overview';
import { SellerActionOverview, type TodayTask } from '@/components/seller/seller-action-overview';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { SELLER_AGREEMENT_VERSION } from '@/lib/content/legal-policies';
import { requireDatabase } from '@/lib/db/d1';
import { CommissionRateUnavailableError, getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { getPublicMakerProfile } from '@/lib/db/repositories/customers';
import { getRegisteredSellerTerms, sellerAcceptedCommissionVersion } from '@/lib/db/repositories/marketplace-settings';
import { listPayoutRequests, listSellerPayouts } from '@/lib/db/repositories/payouts';
import { listSellerProducts } from '@/lib/db/repositories/products';
import { getManagedProgramWorkspace } from '@/lib/managed-commerce/program-workspace';
import { publicCatalogueInventory } from '@/lib/products/public-catalogue-query';
import { getSellerEarnings } from '@/lib/seller/earnings';
import { sellerMoney } from '@/lib/seller/presentation';
import { assertSellerWorkspaceViewer, readSellerWorkspaceTasks, type SellerWorkspaceTask } from '@/lib/seller/workspace-tasks';
import { getSellerChecklist, sellerChecklistView } from '@/lib/sellers/shop-checklist';
import { getSellerReadiness } from '@/lib/sellers/readiness';
import { isSellerOrderTurn, readSellerOrderQueue, type SellerQueueOrder } from './orders/order-queue';

export const dynamic = 'force-dynamic';

const sellerDashboardObservedAt = () => Date.now();
const localDay = new Intl.DateTimeFormat('en-NP', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'Asia/Kathmandu' });
const localTime = new Intl.DateTimeFormat('en-NP', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kathmandu' });
const choices = { order: 'Open order', return: 'Reply', complaint: 'Reply', product: 'Fix product', review: 'Open review',
  payout: 'Open payout', recovery: 'Open statement', cancellation: 'Open order' };

function todayTask(task: SellerWorkspaceTask, order?: SellerQueueOrder): TodayTask {
  const key = task.key;
  const { family, severity, dueAt, href } = task;
  const status = task.status.replaceAll('_', ' ');
  const reference = task.reference === task.sourceId ? '' : task.reference;
  if (order && family === 'order') {
    const names = order.items.map(item => item.name).filter((name, index, all) => all.indexOf(name) === index);
    const customer = [order.address.recipientName, order.address.locality].filter(Boolean).join(', ');
    const actionTitle = task.status === 'packing' ? `Mark ${order.orderNumber} ready for pickup` : `Start preparing ${order.orderNumber}`;
    return {
      key, family, severity, dueAt, href,
      title: task.sellerActionRequired ? actionTitle : `Preparation update for ${order.orderNumber}`,
      detail: [names.join(', '), customer || null].filter(Boolean).join(' · '), action: 'Open order',
      readyDateHref: task.sellerActionRequired ? `/seller/order-responses/${encodeURIComponent(order.id)}` : undefined,
    };
  }
  return { key, family, severity, dueAt, href, action: choices[family],
    title: family === 'return' && task.sellerActionRequired && reference ? `Reply to return ${reference}` : task.title,
    detail: [reference, family === 'return' && task.sellerActionRequired ? task.title.replace(/^Return: /, '') : status].filter(Boolean).join(' · '),
  };
}

function readLowStock(db: D1Database, sellerId: string) {
  const { stock } = publicCatalogueInventory(db);
  return db.prepare(`SELECT products.id,
    (${stock()}) AS quantity,
    (EXISTS(SELECT 1 FROM product_publication_links l WHERE l.product_id=products.id) OR
      EXISTS(SELECT 1 FROM product_offer_heads h WHERE h.product_id=products.id AND h.inventory_mapped=1)) AS offerManaged
    FROM products WHERE products.seller_id=? AND products.status='published'
    AND NOT EXISTS(SELECT 1 FROM product_deletions WHERE product_id=products.id)
    AND (${stock()})<=5 ORDER BY quantity, products.updated_at DESC LIMIT 4`)
    .bind(sellerId).all<{ id: string; quantity: number; offerManaged: number }>();
}

export default async function SellerDashboardPage() {
  const seller = await requireSellerCenterPage('/seller');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  if (!seller.approvedSeller || !seller.sellerId) return <SellerRegistrationApplicationOverview db={db} viewer={seller} />;
  const now = sellerDashboardObservedAt();
  const [readiness, commission, program] = await Promise.all([
    getSellerReadiness(db, seller.sellerId, now).catch(() => null),
    getRegisteredSellerTerms(db, now).catch(error => { if (error instanceof CommissionRateUnavailableError) return null; throw error; }),
    getManagedProgramWorkspace(db, seller.sellerId),
  ]);
  const [commissionAccepted, publicCount, checklist] = await Promise.all([
    commission ? sellerAcceptedCommissionVersion(db, seller.sellerId, commission, now) : false,
    readiness?.publicProductCount ?? getPublicMakerProfile(db, seller.sellerId)
      .then(shop => shop?.productCount ?? 0).catch(() => null),
    getSellerChecklist(db, seller.sellerId, { ownerId: seller.userId, audience: 'seller', now, readiness }),
  ]);
  const { payoutFixes } = sellerChecklistView(checklist);
  const isManaged = program.participationRoute === 'managed_maker';
  const termsAccepted = isManaged ? readiness?.checks.some(check => check.id === 'terms' && check.status === 'ready') :
    seller.sellerAgreementVersion === SELLER_AGREEMENT_VERSION && commissionAccepted;
  const termsHref = isManaged ? '/sell/application#selling-fee-terms' : '/seller/registration';
  const termsForm = !isManaged && commission && !termsAccepted ? <SellerAgreementAcceptance termsContext={commission.context} /> : null;
  const hasProgramHistory = isManaged || program.supplies.length > 0 || program.transitions.length > 0;
  const shopDetails = <>
    <details id="seller-readiness" className="scroll-mt-28 rounded-xl border bg-card px-4">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Shop readiness</summary>
      <div className="pb-4"><SellerReadinessSummary readiness={readiness} /></div>
    </details>
    <section id="managed-program" aria-labelledby="program-details-title" className="scroll-mt-28">
      <SellerProgramDetails>
        {hasProgramHistory ? <>
          <SellerManagedProgramWorkspace workspace={program} sellerId={seller.sellerId} />
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="section-link min-h-11" href="/seller/form-history?kind=managed-supply">Managed supply answer history</Link>
            <Link className="section-link min-h-11" href="/seller/form-history?kind=managed-transition">Managed route answer history</Link>
          </div>
        </> : null}
        <Link className="section-link min-h-11" href="/seller-agreement">Seller Marketplace Agreement</Link>
        <Link className="section-link min-h-11" href="/seller/form-history?kind=payout-request">Payout request answer history</Link>
      </SellerProgramDetails>
    </section>
  </>;
  if (publicCount === 0) {
    const onboarding = checklist.onboarding;
    await assertSellerWorkspaceViewer(db, seller.userId, seller.sellerId, seller.authSubject);
    return <div className="space-y-6">
      <SellerGettingStarted model={onboarding} bankStatus={readiness?.bankStatus ?? null} payoutFixes={payoutFixes} canSell={checklist.canSell}
        date={localDay.format(now)} tradingName={seller.tradingName} agreement={termsForm ?? <>
          {termsAccepted ? <p className="flex items-start gap-2 text-sm text-[#465573]">
            <Check className="mt-0.5 size-4 shrink-0 text-[#236548]" aria-hidden="true" />
            <span>Seller agreement accepted. Selling fee terms come from your agreement.</span>
          </p> : <p className="text-sm text-[#465573]">Review the current terms for your selling route.</p>}
          <Link className="section-link min-h-11 text-sm text-[#A8232E] underline" href={termsHref}>View agreement and fee terms</Link>
        </>} />
      {shopDetails}
    </div>;
  }

  const [work, products, stock, earnings, orders, payouts, payoutRequests, holdSetting, weekday, cutoff, zone] = await Promise.all([
    readSellerWorkspaceTasks(db, seller.userId, { now, limit: 60 }).catch(() => null),
    listSellerProducts(db, seller.sellerId).catch(() => null),
    readLowStock(db, seller.sellerId).catch(() => null),
    getSellerEarnings(db, seller.sellerId, now),
    readSellerOrderQueue(db, seller.sellerId),
    listSellerPayouts(db, seller.sellerId),
    listPayoutRequests(db, seller.sellerId, { status: 'submitted', limit: 1 }),
    getEffectiveBusinessSetting(db, 'seller_delivery_hold_days', now).catch(() => null),
    getEffectiveBusinessSetting(db, 'payout_processing_weekday', now).catch(() => null),
    getEffectiveBusinessSetting(db, 'payout_cutoff_local_time', now).catch(() => null),
    getEffectiveBusinessSetting(db, 'payout_timezone', now).catch(() => null),
  ]);
  await assertSellerWorkspaceViewer(db, seller.userId, seller.sellerId, seller.authSubject);

  const orderByNumber = new Map(orders.map(order => [order.orderNumber, order]));
  const required = (work?.tasks ?? []).filter(task => {
    if (task.group !== 'required') return false;
    const order = orderByNumber.get(task.reference);
    return task.family !== 'order' || !order || isSellerOrderTurn(order, 'packing') || isSellerOrderTurn(order, 'confirmed');
  });
  const waiting = (work?.tasks ?? []).filter(task => task.group === 'waiting')
    .filter(task => task.family !== 'order' || !orderByNumber.get(task.reference)?.items.some(item => item.status === 'ready_for_pickup'))
    .map(task => {
      const product = task.family === 'review' ? products?.find(product => product.id === task.sourceId) : undefined;
      const view = todayTask(task, orderByNumber.get(task.reference));
      return product ? { ...view, title: product.nameEn, detail: 'Product review or publication' } : view;
    });
  for (const order of orders) {
    if (order.items.some(item => item.status === 'ready_for_pickup')) {
      waiting.push({ key: `pickup:${order.id}`, title: `Pickup for ${order.orderNumber}`, detail: 'See the courier arrangements on the order.',
        family: 'order', severity: 'normal', dueAt: null, href: `/seller/orders?status=ready_for_pickup&order=${encodeURIComponent(order.id)}#order-details`,
        action: 'Open order', courierPickup: true });
    }
    if (work?.tasks.some(task => task.family === 'order' && task.reference === order.orderNumber)) continue;
    const step = (['packing', 'confirmed'] as const).find(stage => isSellerOrderTurn(order, stage));
    if (step) required.push({ key: `order:${order.id}`, family: 'order', sourceId: order.id, reference: order.orderNumber,
      title: 'Order preparation', status: step, nextActor: 'You', sellerActionRequired: true, group: 'required', severity: 'normal',
      startedAt: order.placedAt, updatedAt: order.placedAt, dueAt: null, nextUpdateAt: null, href: `/seller/orders/${encodeURIComponent(order.id)}` });
  }
  required.sort((a, b) => (a.dueAt ?? Infinity) - (b.dueAt ?? Infinity) || a.startedAt - b.startedAt);
  const priority = { urgent: 0, overdue: 1, normal: 2 };
  const primary = required.reduce<SellerWorkspaceTask | undefined>((first, task) =>
    !first || priority[task.severity] < priority[first.severity] ? task : first, undefined);
  const first = primary ? todayTask(primary, orderByNumber.get(primary.reference)) : undefined;
  const remaining = required.filter(task => task.key !== primary?.key).map(task => todayTask(task, orderByNumber.get(task.reference)));
  const hour = Number(localTime.format(now));
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const pendingPayout = payouts.find(row => ['prepared', 'scheduled', 'approved', 'processing', 'failed'].includes(row.status));
  const pendingRequest = !pendingPayout ? payoutRequests[0] : undefined;
  const managed = earnings.participationRoute === 'managed_maker' && earnings.managed?.recordKind === 'live' ? earnings.managed.summary : null;
  const undelivered = orders.map(order => order.items.filter(item => !item.companyHandled && !['delivered', 'cancelled'].includes(item.status)))
    .filter(items => items.length > 0);
  const expectedSales = undelivered.flat().reduce((total, item) => total + item.amountPaisa - item.commissionPaisa, 0);
  const [cutoffHour, cutoffMinute] = cutoff?.value.split(':').map(Number) ?? [];
  const cutoffLabel = cutoffHour === undefined ? null : `${cutoffHour % 12 || 12}${cutoffMinute ? ':' + String(cutoffMinute).padStart(2, '0') : ''} ${cutoffHour < 12 ? 'am' : 'pm'}`;
  const lowStock = stock?.results.flatMap(row => {
    const product = products?.find(product => product.id === row.id);
    return product ? [{ ...row, product }] : [];
  });

  const bankStatus = readiness?.bankStatus;
  return <div className="space-y-5 text-[#14213D]">
    <SellerPayoutFixes fixes={payoutFixes} place="today" canSell={checklist.canSell} />
    {!payoutFixes.length && bankStatus && bankStatus !== 'verified' ? <section aria-labelledby="seller-finish-bank"
      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted-foreground">Finish setting up</p>
        <h2 id="seller-finish-bank" className="mt-1 text-sm font-semibold">{bankStatus === 'missing' ? 'Add your bank account' : 'Verify your bank account'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{bankStatus === 'missing' ? 'Add bank details for your first payout.' : 'Hastabazaar needs to verify your saved details before a payout.'}</p>
      </div>
      <Link href="/seller/finance#bank-details" className="section-link min-h-11">
        {bankStatus === 'missing' ? 'Add bank details' : 'View bank details'}
      </Link>
    </section> : null}
    <header>
      <h1 className="break-words font-heading text-3xl md:text-4xl">{greeting}, {seller.tradingName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{localDay.format(now)} · <strong className="text-[#14213D]">{required.length} {required.length === 1 ? 'thing needs' : 'things need'} you</strong> · {waiting.length} {waiting.length === 1 ? 'is' : 'are'} with Hastabazaar</p>
    </header>
    <SellerActionOverview first={first} remaining={remaining} waiting={waiting} unavailable={!work || work.unavailableFamilies.length > 0} />
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <section aria-labelledby="seller-today-money" className="min-w-0 rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="seller-today-money" className="font-semibold">Your money</h2>
          <Link href="/seller/finance" className="section-link min-h-11">Earnings</Link>
        </div>
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">{pendingPayout ? `Payout ${pendingPayout.payoutNumber}` : pendingRequest ? 'Payout requested' : 'Available for payout'}</dt>
            <dd className="mt-1 break-words font-heading text-xl">{sellerMoney(pendingPayout?.amountPaisa ?? pendingRequest?.availableAmountSnapshotPaisa ?? managed?.payablePaisa ?? earnings.registered.availablePaisa)}</dd>
            {pendingPayout || pendingRequest ? <WhoseTurn className="mt-1" status="with-hastabazaar" label={pendingPayout?.status === 'processing' ? 'Being sent to your bank' : pendingPayout?.status === 'approved' || pendingPayout?.status === 'scheduled' ? 'Approved' : 'With Hastabazaar'} /> : null}
          </div>
          <div className="min-w-0 sm:border-l sm:pl-3 lg:border-0 lg:pl-0 xl:border-l xl:pl-3"><dt className="text-xs text-muted-foreground">Held or pending earnings</dt>
            <dd className="mt-1 break-words font-heading text-xl">{sellerMoney(managed?.blockedPaisa ?? earnings.registered.pendingPaisa)}</dd>
            {!managed && holdSetting ? <p className="mt-1 text-xs text-muted-foreground">Current delivery hold · {holdSetting.value} days</p> : null}
          </div>
          <div className="min-w-0 sm:border-l sm:pl-3 lg:border-0 lg:pl-0 xl:border-l xl:pl-3"><dt className="text-xs text-muted-foreground">Orders not delivered yet</dt>
            <dd className="mt-1 break-words font-heading text-xl">{sellerMoney(expectedSales)}</dd><p className="mt-1 text-xs text-muted-foreground">{undelivered.length} {undelivered.length === 1 ? 'order' : 'orders'}{orders.length >= 100 ? ' among the latest 100' : ''}</p>
          </div>
        </dl>
        {weekday && cutoffLabel ? <p className="mt-4 flex items-start gap-2 rounded-xl bg-[#E3E9F4] p-3 text-sm text-[#264880]">
          <CalendarDays className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>Payouts are scheduled for <strong className="capitalize">{weekday.value}s</strong>. The cutoff is {cutoffLabel}{zone?.value === 'Asia/Kathmandu' ? ' Nepal time' : ''}.</span>
        </p> : null}
      </section>
      <section aria-labelledby="seller-today-stock" className="min-w-0 rounded-2xl border bg-card p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="seller-today-stock" className="font-semibold">Running low</h2>
          <Link href="/seller/products" className="section-link min-h-11">All products</Link>
        </div>
        {lowStock?.length ? <ul className="divide-y">{lowStock.map(({ product, quantity, offerManaged }) => <li key={product.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {product.primaryMediaId ? <Image data-media-mode="contain" src={`/api/product-media/${encodeURIComponent(product.primaryMediaId)}`} alt="" width={38} height={38} unoptimized className="size-9 shrink-0 rounded-md border object-contain" /> : <Package className="size-8 shrink-0 rounded-md bg-muted p-1.5" aria-hidden="true" />}
            <div className="min-w-0"><p className="break-words text-sm font-semibold">{product.nameEn}</p>
              <p className="mt-0.5 text-xs text-[#78551F]">{quantity === 0 ? 'Out of stock' : quantity === 1 ? 'Last one' : `${quantity} left`}</p></div>
          </div>
          {offerManaged ? <Link className="section-link min-h-11" href={`/seller/products/${encodeURIComponent(product.id)}/availability`}>Update stock</Link> :
            <InventoryEditor productId={product.id} productName={product.nameEn} quantity={quantity} compact />}
        </li>)}</ul> : <p className="text-sm text-muted-foreground">{stock && products ? 'No products are running low.' : 'Stock could not be loaded. Open Products for your saved listings.'}</p>}
      </section>
    </div>
    <section id="selling-fee-terms" className="scroll-mt-28">
      {termsForm ?? <Link href={termsHref} className="section-link min-h-11">Review agreements and selling terms</Link>}
    </section>
    {shopDetails}
  </div>;
}
