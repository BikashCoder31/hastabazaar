'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sendJson } from '@/lib/http/client-request';
export function OrderEmailRetry() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const router = useRouter();
  async function retry() {
    setBusy(true);
    setMessage('');
    try {
      const r = await sendJson<{
        sent: number;
        failed: number;
        pending?: boolean;
      }>('/api/admin/order-emails/retry', 'POST', {}, 'Email retry failed.');
      setMessage(
        r.pending
          ? 'Email sending is unavailable. Ask the site administrator to check email settings and queue readiness.'
          : `${r.sent} accepted by the mail server; ${r.failed} email attempts failed and will be eligible for retry after five minutes. Any other pending updates stay in the queue.`,
      );
      router.refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground">This button attempts to send up to six eligible queued or retry emails, including emails with expired sending locks. It can contact customers immediately. It skips emails already recorded as accepted by the mail server. If a send was interrupted after acceptance but before that result was recorded, a retry can send the email again.</p>
      <button
        disabled={busy}
        onClick={retry}
        className="rounded-full bg-primary px-6 py-3 font-semibold text-primary-foreground disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Attempt up to 6 eligible emails'}
      </button>
      <output className="block mt-3 text-sm">
        {message}
      </output>
    </div>
  );
}
