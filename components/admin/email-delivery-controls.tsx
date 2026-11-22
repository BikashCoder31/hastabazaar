'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Upload } from 'lucide-react';
import { ConfirmOperation } from './confirm-operation';
import { Button } from '@/components/ui/button';
import { sendJson } from '@/lib/http/client-request';

const time = (date: number) => new Intl.DateTimeFormat('en-NP', { timeZone: 'Asia/Kathmandu', timeStyle: 'short' }).format(date);

export function ResendEmail({ id, kind }: { id: string; kind: 'order' | 'business' }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ message: string; error?: boolean } | null>(null);
  const router = useRouter();
  async function resend() {
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const reply = await sendJson<{ state: string; nextAt?: number }>(
        '/api/admin/email-delivery/resend', 'POST', { id, kind }, 'Resend is unavailable.',
      );
      const message = reply.state === 'scheduled' && reply.nextAt != null ? 'Already waiting to retry at ' + time(reply.nextAt) + '.'
        : reply.state === 'processed' ? 'Email processed. Check its new status.'
        : reply.state === 'failed' ? 'The email still could not be sent. Check its new status.'
        : 'The email status changed. Check the record before trying again.';
      setResult({ message });
      router.refresh();
    } catch (error) {
      setResult({ message: error instanceof Error ? error.message : 'Resend is unavailable.', error: true });
    } finally {
      setBusy(false);
    }
  }
  return <div className="grid justify-items-start gap-1">
    <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => void resend()}>
      {busy ? 'Resending…' : 'Resend'}
    </Button>
    {result && (result.error
      ? <p role="alert" className="text-xs text-destructive">{result.message}</p>
      : <output className="text-xs">{result.message}</output>)}
  </div>;
}

export function SendWaitingEmails() {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const router = useRouter();
  async function send() {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      // Both legacy actions retain their existing permission and processing limits.
      const order = await sendJson<{ sent: number; failed: number; pending?: boolean }>(
        '/api/admin/order-emails/retry', 'POST', {}, 'Order email sending is unavailable.',
      ).catch(() => null);
      const business = await sendJson<{ accepted: number; failed: number }>(
        '/api/admin/business-emails', 'POST', {}, 'Business email sending is unavailable.',
      ).catch(() => null);
      const processed = (order?.sent ?? 0) + (business?.accepted ?? 0);
      const failed = (order?.failed ?? 0) + (business?.failed ?? 0);
      const unavailable = !order || order.pending || !business;
      setMessage(processed + ' processed · ' + failed + ' failed.' +
        (unavailable ? ' Some email sending was unavailable. Check the queue.' : ''));
      setConfirm(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return <div className="grid justify-items-start gap-1">
    <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => setConfirm(true)}>
      <Upload aria-hidden="true" className="size-4" /> Send waiting emails now
    </Button>
    {message && <output className="text-sm">{message}</output>}
    <ConfirmOperation workspace open={confirm} onOpenChange={setConfirm} pending={busy}
      title="Send waiting emails now?" description="Try the next eligible messages in both queues. This can contact recipients immediately."
      confirmLabel="Send waiting emails" onConfirm={() => void send()} />
  </div>;
}
