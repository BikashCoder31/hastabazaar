'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
import { Button } from '@/components/ui/button';
import { ConfirmOperation } from './confirm-operation';
export function BusinessEmailProcessor() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function process() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    setError('');
    try {
      const r = await sendJson<{
        accepted: number;
        failed: number;
        cancelled: number;
      }>('/api/admin/business-emails', 'POST', {}, 'Processing failed.');
      setMessage(
        `${r.accepted} successfully processed; ${r.failed} failed attempts; ${r.cancelled} no longer needed. See delivery history for provider acceptance or local capture.`,
      );
      setConfirm(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Processing failed.');
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
      <Button
        type="button"
        variant="workspace-primary"
        size="workspace"
        disabled={busy}
        onClick={() => { setError(''); setConfirm(true); }}
      >
        {busy ? 'Processing…' : 'Attempt up to 6 business emails'}
      </Button>
      <output aria-live="polite" className="block text-sm">{message}</output>
      {error && !confirm ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      <ConfirmOperation
        workspace
        open={confirm}
        onOpenChange={setConfirm}
        title="Send eligible business emails?"
        description="This attempts up to six eligible business emails and can contact recipients immediately. Check delivery history before trying again if the result is unclear."
        pending={busy}
        onConfirm={() => void process()}
        confirmLabel="Confirm sending"
        error={error}
      />
    </div>
  );
}
