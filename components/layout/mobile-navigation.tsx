'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Menu, Store } from 'lucide-react';

import { BrandWordmark } from '@/components/layout/brand-wordmark';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  customerNavigation,
  storefrontNavigation,
} from '@/lib/catalog/storefront-navigation';

export function MobileNavigation({ browseLinks = storefrontNavigation }: {
  browseLinks?: readonly { label: string; href: string }[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        id="mobile-navigation-trigger"
        className="header-action lg:hidden"
        aria-label="Open navigation menu"
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(24rem,calc(100%-1.5rem))]! overflow-y-auto overscroll-contain pb-6"
      >
        <SheetHeader className="border-b px-6 py-7">
          <SheetTitle>
            <BrandWordmark className="text-3xl" />
          </SheetTitle>
          <SheetDescription className="mt-2">
            Find a little something with heart.
          </SheetDescription>
        </SheetHeader>
        <div className="px-5">
          <nav aria-label="Mobile shopping navigation" className="space-y-1">
            {[{ label: 'Home', href: '/' }, ...browseLinks].map(
              (item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-11 items-center justify-between rounded-xl px-3 py-3 text-base font-semibold hover:bg-secondary"
                >
                  {item.label}
                  <ArrowUpRight className="size-4 text-muted-foreground" />
                </Link>
              ),
            )}
          </nav>
          <h2 className="mt-6 border-t px-3 pt-6 text-sm font-bold uppercase tracking-widest text-primary">
            Your account
          </h2>
          <nav
            aria-label="Mobile customer navigation"
            className="mt-3 space-y-1"
          >
            {customerNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block min-h-11 rounded-xl px-3 py-3 text-base hover:bg-secondary"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-6 rounded-2xl bg-secondary p-4">
            <p className="flex items-center gap-2 font-semibold">
              <Store className="size-5 text-primary" />
              For our makers
            </p>
            <Link
              href="/sell"
              onClick={() => setOpen(false)}
              className="mt-3 block rounded-md py-2 text-sm font-semibold text-primary"
            >
              Become a seller →
            </Link>
            <Link
              href="/seller"
              onClick={() => setOpen(false)}
              className="block rounded-md py-2 text-sm font-semibold text-primary"
            >
              Seller dashboard →
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
