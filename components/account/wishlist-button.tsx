'use client';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { sendJson } from '@/lib/http/client-request';

export function WishlistButton({
  productId,
  initialSaved,
  signInPath,
  compact = false,
  iconOnly = false,
}: {
  productId: string;
  initialSaved: boolean;
  signInPath?: string;
  compact?: boolean;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function toggle() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await sendJson(
        '/api/account/wishlist',
        'PUT',
        { productId, saved: !saved },
        'Your wishlist could not be updated.',
      );
      setSaved(!saved);
      router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : 'Your wishlist could not be updated.',
      );
    } finally {
      setBusy(false);
    }
  }
  if (signInPath)
    return (
      <a
        href={signInPath}
        target="_top"
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border px-5 py-2 text-sm font-semibold hover:bg-secondary"
      >
        <Heart className="size-4" />
        Save to wishlist
      </a>
    );
  return (
    <div>
      <Button
        type="button"
        variant={saved ? 'secondary' : 'outline'}
        size={compact ? 'sm' : 'default'}
        disabled={busy}
        onClick={() => void toggle()}
        aria-pressed={saved}
        aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
        className={iconOnly ? "size-11 min-h-11 rounded-full border border-[#e3d8c7] bg-[#fdfbf7] p-0 text-[#a8232e] hover:bg-[#ebe1d1]" : "min-h-11 rounded-full px-4"}
      >
        <Heart aria-hidden="true" className={saved ? 'fill-current' : ''} />
        {iconOnly ? null : busy ? 'Updating…' : saved ? 'Saved · Remove' : 'Save to wishlist'}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
