'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
import { Button } from '@/components/ui/button';
export function BusinessEmailProcessor() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const router = useRouter();
  async function process() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const r = await sendJson<{
        accepted: number;
        failed: number;
        cancelled: number;
      }>('/api/admin/business-emails', 'POST', {}, 'Processing failed.');
      setMessage(
        `${r.accepted} successfully processed; ${r.failed} failed attempts; ${r.cancelled} no longer needed. See delivery history for provider acceptance or local capture.`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Processing failed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3">
      <p className="text-sm">
        This button can contact the affected people immediately. It attempts up
        to six eligible business emails. Order-status emails have their own
        queue.
      </p>
      <Button disabled={busy} onClick={process}>
        {busy ? 'Processing…' : 'Attempt up to 6 business emails'}
      </Button>
      <output aria-live="polite" className="block text-sm">{message}</output>
    </div>
  );
}
