'use client';

import type { ReactNode } from 'react';
import { Search } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export function MobileProductSearch({ children }: { children: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger
        className="header-action sm:hidden"
        aria-label="Open product search"
      >
        <Search className="size-5" aria-hidden="true" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader className="pr-8">
          <DialogTitle>Search products</DialogTitle>
          <DialogDescription>Find gifts, crafts and makers.</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
