'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

export function TrafficBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname) return;
    const product = /^\/products\/([A-Za-z0-9_-]+)$/.exec(pathname);
    const eventType = product
      ? 'product_view'
      : pathname === '/checkout'
        ? 'checkout_started'
        : 'page_view';
    const body = JSON.stringify({
      eventType,
      path: pathname,
      entityKey: product?.[1] ?? null,
    });
    void fetch('/api/analytics/event', {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
