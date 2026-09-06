'use client';

import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

export function WishlistButton({ productId, initialSaved, signInPath, compact = false }: { productId: string; initialSaved: boolean; signInPath?: string; compact?: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  async function toggle() {
    if (signInPath) { window.location.assign(signInPath); return; }
    setBusy(true);
    const response = await fetch('/api/account/wishlist', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ productId, saved: !saved }) });
    if (response.ok) { setSaved(!saved); router.refresh(); }
    setBusy(false);
  }
  return <Button type="button" variant={saved ? 'secondary' : 'outline'} size={compact ? 'sm' : 'default'} disabled={busy} onClick={() => void toggle()} aria-pressed={saved}><Heart className={saved ? 'fill-current' : ''} /> {saved ? 'Saved' : 'Save to wishlist'}</Button>;
}
