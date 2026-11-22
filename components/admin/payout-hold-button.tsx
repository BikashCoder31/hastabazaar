'use client';

import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export function PayoutHoldButton({ bankChange }: { bankChange?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger type="button" className="admin-button">Hold…</DialogTrigger>
      <DialogContent className="border border-[#E3D8C7] bg-white p-5 text-[#14213D]" showCloseButton={false}>
        <DialogTitle className="text-xl">Leave this payout pending?</DialogTitle>
        <DialogDescription>
          {bankChange ? 'Wait for the bank change review to finish before approving. ' : ''}
          The payout will stay in the approval queue for review later. This choice does not record a separate hold.
        </DialogDescription>
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose type="button" className="min-h-11 rounded-lg border border-[#CDBFA9] px-3 font-semibold hover:bg-[#F0EBE1]">Cancel</DialogClose>
          <DialogClose type="button" className="min-h-11 rounded-lg bg-[#14213D] px-3 font-semibold text-white">Leave pending</DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
