import { env } from 'cloudflare:workers';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Bell, ChevronRight, Clock3, Gift, Heart, Landmark, MapPin, Package, Undo2, UserRound, UsersRound, Wallet } from 'lucide-react';
import { AccountEmpty } from '@/components/account/account-ui';
import { accountAction, accountSurface } from '@/components/account/account-sections';
import { SavedProductGrid } from '@/components/account/saved-product-grid';
import { CustomerActingChip } from '@/components/storefront/customer-acting-chip';
import { CustomerYourTurnCard } from '@/components/storefront/customer-your-turn-card';
import { requireCustomerPage } from '@/lib/auth/customer';
import { requireDatabase } from '@/lib/db/d1';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { customerDate, customerDateTime } from '@/lib/orders/customer-parcel-state';
import { readAccountOverview } from './account-overview-data';

const orderPath = (number: string) => '/orders/' + encodeURIComponent(number);
const primary = 'inline-flex min-h-11 justify-center items-center rounded-lg bg-[#14213d] px-4 py-2 text-sm font-semibold text-white hover:bg-[#263957] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e]';
const urgent = primary.replace('bg-[#14213d]', 'bg-[#a8232e]');
const sectionLink = 'inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#a8232e] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2';
const yourTurnLimit = 6;

export default async function AccountPage() {
  const customer = await requireCustomerPage('/account');
  const overview = await readAccountOverview(requireDatabase(env as unknown as { DB?: D1Database }), customer);
  const { summary, addresses, wishlist, rewards, questions, banks, cases, onTheWay } = overview;
  const canCheckIn = rewards.state.status === 'active' && !rewards.claimedToday;
  const actions = [
    ...questions.map(question => ({
      key: question.id,
      title: `Does the new date from ${question.sellerName} work for you?`,
      description: `${question.orderNumber} · The seller needs until ${customerDate(question.proposedReadyAt)}.`,
      icon: <Clock3 className="size-5" />,
      href: '/account/order-responses/' + encodeURIComponent(question.id), label: 'Answer', className: urgent,
    })),
    ...banks.map(bank => ({
      key: bank.id,
      title: bank.claimState === 'needs_information' ? `Update your payment for ${bank.orderNumber}` : `Transfer ${formatPaisaExact(bank.remainingPaisa)} for ${bank.orderNumber}`,
      description: bank.claimState === 'needs_information' ? 'Hastabazaar asked for more information.' : `Pay by ${customerDateTime(bank.deadlineAt)}.`,
      icon: <Landmark className="size-5" />,
      href: '/account/payments/' + encodeURIComponent(bank.id), label: bank.claimState === 'needs_information' ? 'View request' : 'How to pay', className: primary,
    })),
    ...cases.map(request => ({
      key: request.reference,
      title: `Reply to help request ${request.reference}`,
      description: `${request.orderNumber} · Hastabazaar needs more information from you.`,
      icon: <Undo2 className="size-5" />,
      href: orderPath(request.orderNumber) + '#order-help', label: 'Reply', className: primary,
    })),
    ...(canCheckIn ? [{
      key: 'daily-check-in',
      title: 'Collect today’s reward points',
      description: 'One check-in adds points you can turn into shopping credit.',
      icon: <Gift className="size-5" />,
      href: '/account/rewards#daily-check-in', label: 'Check in', className: accountAction,
    }] : []),
  ];
  const shortcuts = [
    { label: 'My orders', detail: `${summary?.active ?? 0} active · ${summary?.delivered ?? 0} delivered`, href: '/account/orders', Icon: Package },
    { label: 'Returns & help', detail: cases.length ? 'Replies needed' : 'See requests and get help', href: '/account/refunds', Icon: Undo2 },
    { label: 'Wallet', detail: `${formatPaisaExact(rewards.walletBalancePaisa)} shopping credit`, href: '/account/wallet', Icon: Wallet },
    { label: 'Rewards', detail: `${rewards.balancePoints} points`, href: '/account/rewards', Icon: Gift },
    { label: 'Refer a friend', detail: 'Share your code', href: '/account/referrals', Icon: UsersRound },
    { label: 'Addresses', detail: addresses.length ? addresses.slice(0, 2).map(address => address.label).join(' · ') : 'Save a delivery address', href: '/account/addresses', Icon: MapPin },
    { label: 'Profile & sign-in', detail: 'Contact details and security', href: '/account/profile', Icon: UserRound },
    { label: 'Notifications', detail: summary?.unread ? `${summary.unread} unread` : 'You’re caught up', href: '/account/notifications', Icon: Bell },
  ];

  return (
    <div className="min-w-0 space-y-8 text-[#14213d]">
      <header>
        <h1 className="break-words font-heading text-4xl tracking-tight sm:text-5xl">Namaste, {customer.displayName.trim().split(/\s+/)[0] || 'shopper'}</h1>
        <p className="mt-2 text-base leading-6 text-[#465573]">Everything about your orders, money and settings, starting with what needs you.</p>
      </header>
      <section aria-labelledby="account-your-turn">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CustomerActingChip actor="you" yourTurn />
          <h2 id="account-your-turn" className="text-lg font-semibold">{actions.length ? `${actions.length} ${actions.length === 1 ? 'thing needs' : 'things need'} you` : 'You’re caught up'}</h2>
        </div>
        {actions.length ? <div className="space-y-2.5">{actions.slice(0, yourTurnLimit).map(action => (
          <CustomerYourTurnCard key={action.key} title={action.title} description={action.description} icon={action.icon}
            action={<Link href={action.href} className={action.className}>{action.label}</Link>} />
        ))}{actions.length > yourTurnLimit ? <Link href="/account/orders" className={sectionLink}>See orders that need you</Link> : null}</div> : null}
      </section>

      <section aria-labelledby="account-on-way">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="account-on-way" className="text-xl font-semibold">On the way</h2>
          <Link href="/account/orders" className={sectionLink}>All orders</Link>
        </div>
        {onTheWay.length ? <ul className={accountSurface + ' divide-y divide-[#e3d8c7] p-3 sm:px-5'}>{onTheWay.map(({ orderNumber, parcel, state }) => {
          const photo = parcel.items.find(item => item.mediaId)?.mediaId;
          return (
            <li key={orderNumber + ':' + parcel.sellerId}>
              <Link href={orderPath(orderNumber)} className="flex min-h-11 min-w-0 items-center gap-3 rounded-lg px-1 py-3 focus-visible:outline-2 focus-visible:outline-[#a8232e]">
                {photo ? <Image src={'/api/product-media/' + encodeURIComponent(photo)} alt="" width={50} height={50} data-media-mode="cover" className="size-12 shrink-0 rounded-lg object-cover" unoptimized /> : <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-[#f0e7d8]"><Package className="size-5" aria-hidden="true" /></span>}
                <span className="min-w-0 flex-1 break-words">
                  <span className="block text-sm font-semibold">{state.label} · {parcel.sellerName}</span>
                  <span className="block text-sm text-[#465573]">{orderNumber}{parcel.courierName ? ' · ' + parcel.courierName : ''}</span>
                  <span className="mt-1 block sm:hidden"><CustomerActingChip actor={state.actor} /></span>
                </span>
                <span className="hidden shrink-0 sm:block"><CustomerActingChip actor={state.actor} /></span>
                <ChevronRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
            </li>
          );
        })}</ul> : <p className={accountSurface + ' p-4 text-sm text-[#465573]'}>No parcels on the way.</p>}
      </section>

      <section aria-labelledby="account-shortcuts">
        <h2 id="account-shortcuts" className="mb-3 text-xl font-semibold">Your Hastabazaar</h2>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {shortcuts.map(({ label, detail, href, Icon }) => (
            <Link key={href} href={href} className={accountSurface + ' min-w-0 break-words p-3 hover:border-[#a8232e] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#a8232e] sm:p-4'}>
              <Icon className="mb-2 size-5 text-[#a8232e]" aria-hidden="true" />
              <span className="block text-sm font-semibold">{label}</span>
              <span className="mt-1 block text-sm text-[#465573]">{detail}</span>
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="account-saved">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 id="account-saved" className="text-xl font-semibold">Saved items · {wishlist.length}</h2>
          <Link href={wishlist.length ? '/account/wishlist' : '/shop'} className={sectionLink}>{wishlist.length ? 'See all saved items' : 'Find more'}</Link>
        </div>
        {wishlist.length ? <SavedProductGrid items={wishlist.slice(0, 4)} /> :
          <AccountEmpty icon={Heart} title="Keep a good find close." description="Tap the heart on a product to save it here for another day." href="/shop" action="Explore the shop" />}
      </section>
      <Link href="/form-submissions" className={sectionLink}>Sign-in form history<ArrowRight className="size-4" aria-hidden="true" /></Link>
    </div>
  );
}
