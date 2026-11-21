'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function StartSellerRegistration({ label = 'Start seller registration', className }: { label?: string; className?: string } = {}) {
  const router=useRouter();
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  async function start() {
    setPending(true);setError('');
    try {
      const response=await fetch('/api/seller-applications/start',{method:'POST'});
      if (response.status===401) { router.push('/login?return_to=%2Fsell'); return; }
      if (!response.ok) throw new Error('Seller registration could not be started. Please try again.');
      router.push('/sell/apply');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Please try again.'); setPending(false); }
  }
  return <div className="flex flex-col items-start gap-3">
    <Button type="button" className={className} onClick={start} disabled={pending}>{pending?'Starting…':label}</Button>
    {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}
