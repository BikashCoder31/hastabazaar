'use client';

import { Grid2X2, Heart, House, ShoppingBag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './customer-phone-tabs.module.css';

const tabs = [
  { label: 'Home', href: '/', icon: House },
  { label: 'Shop', href: '/shop', icon: Grid2X2 },
  { label: 'Saved', href: '/account/wishlist', icon: Heart },
  { label: 'Bag', href: '/cart', icon: ShoppingBag },
  { label: 'You', href: '/account', icon: UserRound },
] as const;

function activeTab(path: string) {
  if (path === '/') return '/';
  if (path === '/cart') return '/cart';
  if (path.startsWith('/account/wishlist')) return '/account/wishlist';
  if (/^\/(account|orders|login|register|security)(?:\/|$)/.test(path)) return '/account';
  if (/^\/(shop|products|categories|occasions|makers)(?:\/|$)/.test(path)) return '/shop';
  return undefined;
}

export function CustomerPhoneTabs({ savedHref, accountHref }: { savedHref: string; accountHref: string }) {
  const pathname = usePathname() ?? '';
  const checkout = /^\/checkout(?:\/|$)/.test(pathname);
  const active = activeTab(pathname);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (checkout) return;
    const phone = window.matchMedia('(width < 768px)');
    let request: AbortController | undefined;

    async function refresh() {
      request?.abort();
      if (!phone.matches) return;
      const controller = new AbortController();
      request = controller;
      try {
        const response = await fetch('/api/cart', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json() as { itemCount?: unknown };
        const itemCount = data.itemCount;
        if (!controller.signal.aborted && typeof itemCount === 'number' && Number.isSafeInteger(itemCount) && itemCount >= 0) {
          setCount(itemCount);
        }
      } catch {
        // The bag stays reachable if the live count is unavailable.
      }
    }

    void refresh();
    window.addEventListener('cart:updated', refresh);
    window.addEventListener('focus', refresh);
    phone.addEventListener('change', refresh);
    return () => {
      request?.abort();
      window.removeEventListener('cart:updated', refresh);
      window.removeEventListener('focus', refresh);
      phone.removeEventListener('change', refresh);
    };
  }, [checkout, pathname]);

  if (checkout) return null;

  return (
    <nav aria-label="Shop tabs" data-storefront-phone-tabs className={styles.bar}>
      {tabs.map(({ label, href, icon: Icon }) => {
        const isBag = href === '/cart';
        const destination = href === '/account/wishlist' ? savedHref : href === '/account' ? accountHref : href;
        return (
          <Link key={href} href={destination} aria-current={active === href ? 'page' : undefined}
            aria-label={isBag && count > 0 ? `Bag, ${count} ${count === 1 ? 'item' : 'items'}` : undefined} className={styles.tab}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={21} strokeWidth={1.8} />
              {isBag && count > 0 ? <span className={styles.count}>{count > 99 ? '99+' : count}</span> : null}
            </span>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
