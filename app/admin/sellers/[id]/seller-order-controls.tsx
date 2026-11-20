'use client';

import { SellerGovernanceActions } from '@/components/admin/seller-governance-actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import type { SellerRestrictionRow } from '@/lib/db/repositories/seller-governance';

export function SellerOrderControls({
  sellerId, sellerName, restriction, restricted,
}: {
  sellerId: string;
  sellerName: string;
  restriction: Pick<SellerRestrictionRow, 'mode' | 'obligationMode' | 'reasonCode' | 'suspendedUntil' | 'version'> | null;
  restricted: boolean;
}) {
  return (
    <Dialog>
      <DialogTrigger
        id="seller-order-controls"
        className="min-h-11 scroll-mt-28 rounded-lg px-3 text-sm font-semibold text-[#A8232E] hover:bg-[#A8232E]/5 focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {restricted ? 'Manage order restrictions…' : 'Pause new orders…'}
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] w-[calc(100%-2rem)] gap-3 overflow-y-auto p-5 sm:max-w-xl [&_button]:min-h-11 [&_input]:min-h-11 [&_select]:min-h-11">
        <DialogTitle className="break-words">
          {restricted ? 'Manage order restrictions for ' : 'Pause new orders for '}{sellerName}?
        </DialogTitle>
        <DialogDescription>
          Choose a seller state and how to handle existing orders. Review the decision before recording it.
        </DialogDescription>
        <SellerGovernanceActions sellerId={sellerId} current={restriction} />
        <DialogClose render={<Button type="button" variant="outline" className="min-h-11 w-fit" />}>Close</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
