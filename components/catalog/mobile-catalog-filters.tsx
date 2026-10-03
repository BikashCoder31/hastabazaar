'use client';

import { SlidersHorizontal } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

export function MobileCatalogFilters({
  children,
  activeCount,
}: {
  children: React.ReactNode;
  activeCount: number;
}) {
  return (
    <div className="lg:hidden">
      <Sheet>
        <SheetTrigger className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-3 text-base font-semibold shadow-sm">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-5 text-primary" />
            Filter & sort
          </span>
          {activeCount > 0 ? (
            <span className="rounded-full bg-secondary px-3 py-1 text-sm text-primary">
              {activeCount} active
            </span>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">
              Find your gift
            </span>
          )}
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-[min(26rem,calc(100%-1rem))]! h-dvh! gap-0 overflow-hidden"
        >
          <SheetHeader className="shrink-0 border-b px-5 pb-4 pr-12 pt-6">
            <SheetTitle className="font-heading text-2xl">
              Make it your collection
            </SheetTitle>
            <SheetDescription>
              Choose a craft or occasion, then show your matches.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
