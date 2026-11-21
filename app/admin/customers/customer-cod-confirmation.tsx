'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ACTOR_INTENT_HEADER } from '@/lib/http/actor-intent';

export function CustomerCodConfirmationChip({ enabled }: { enabled: boolean }) {
  return <span className="inline-flex w-fit rounded-full border border-[#D3C5AD] px-2.5 py-1 text-xs font-semibold text-[#46536F]">
    Call to confirm: {enabled ? 'On' : 'Off'}
  </span>;
}

export function CustomerCodConfirmation({ actorId, customerId, enabled, suggested = false }: {
  actorId?: string;
  customerId: string;
  enabled: boolean;
  suggested?: boolean;
}) {
  const router = useRouter();
  const inputId = useId();
  const attempt = useRef<{ requestId: string; reason: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const label = enabled ? 'Turn off call to confirm' : 'Turn on call to confirm';

  async function save() {
    if (!actorId || busy || reason.trim().length < 8) return;
    attempt.current ??= { requestId: crypto.randomUUID(), reason: reason.trim() };
    setLocked(true);
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/customers/' + encodeURIComponent(customerId) + '/cod-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ACTOR_INTENT_HEADER]: actorId },
        body: JSON.stringify({ ...attempt.current, enabled: !enabled }),
      });
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
      if (!response.ok || result?.ok !== true) {
        if (response.status < 500) {
          attempt.current = null;
          setLocked(false);
        }
        throw new Error(result?.error || 'The change could not be confirmed. Retry the same request.');
      }
      attempt.current = null;
      setLocked(false);
      setOpen(false);
      setReason('');
      router.refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'The change could not be confirmed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="customer-cod-confirmation" className="min-w-0 scroll-mt-24 space-y-2 rounded-xl border border-[#E4DACA] p-3">
      <h3 className="font-semibold">Call to confirm cash-on-delivery orders</h3>
      <div className="flex flex-wrap items-center gap-2">
        <CustomerCodConfirmationChip enabled={enabled} />
        {actorId ? (
          <Dialog open={open} onOpenChange={next => { if (!busy) setOpen(next); }}>
            <DialogTrigger render={<Button variant={suggested ? 'default' : 'outline'} className="min-h-11 whitespace-normal" />}>{label}</DialogTrigger>
            <DialogContent showCloseButton={false}>
              <DialogTitle>{label}?</DialogTitle>
              <DialogDescription>This changes how future cash-on-delivery orders are handled.</DialogDescription>
              <div className="space-y-2">
                <Label htmlFor={inputId}>Reason for this change</Label>
                <Textarea id={inputId} value={reason} required minLength={8} maxLength={300}
                  disabled={locked} onChange={event => setReason(event.target.value)} />
              </div>
              {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
              <DialogFooter>
                <Button variant="outline" type="button" disabled={busy} className="min-h-11" onClick={() => setOpen(false)}>Go back</Button>
                <Button type="button" disabled={busy || reason.trim().length < 8} className="min-h-11" onClick={() => void save()}>
                  {busy ? 'Saving…' : locked ? 'Retry saving' : 'Save setting'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </div>
    </div>
  );
}
