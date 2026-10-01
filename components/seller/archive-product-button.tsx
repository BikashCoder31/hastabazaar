'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Archive } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmOperation } from '@/components/admin/confirm-operation';
import { sendJson } from '@/lib/http/client-request';

export function ArchiveProductButton({productId, productName, deleting = false, blocked = false}: {productId: string; productName: string; deleting?: boolean; blocked?: boolean}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function archive() {
    if (pending) return;
    setPending(true); setError('');
    try {
      await sendJson('/api/seller/products/' + encodeURIComponent(productId) + (deleting ? '/delete' : '/archive'), 'POST', {}, 'The product could not be updated.');
      setOpen(false); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The product could not be updated. Please try again.');
    } finally { setPending(false); }
  }
  return <div className="mt-4">
    <Button disabled={blocked} variant="outline" className="min-h-11" onClick={() => {setError(''); setOpen(true);}}><Archive />{deleting ? 'Delete product' : 'Archive product'}</Button>
    {error && !open ? <p role="alert" className="mt-2 text-sm text-destructive">{error}</p> : null}
    <ConfirmOperation open={open} onOpenChange={setOpen} pending={pending} error={error} onConfirm={archive}
      title={(deleting ? 'Delete ' : 'Archive ') + productName + '?'}
      description={deleting ? "This removes the archived product from your product list. Orders, reviews and product records are retained. You cannot undo this from your dashboard." : "This removes the product from the storefront and prevents new purchases. Existing orders, reviews and product records are kept. This listing will remain in your products with Archived status."} />
  </div>;
}
