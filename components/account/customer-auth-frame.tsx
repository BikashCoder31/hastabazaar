import type { ReactNode } from 'react';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';

export function CustomerAuthFrame({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#f4eee2]"><SiteHeader />{children}<SiteFooter compact /></div>;
}
