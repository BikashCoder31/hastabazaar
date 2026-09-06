'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export function PrivacyActions({ id, canDecide }: { id: string; canDecide: boolean }) {
  const router = useRouter(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function act(formData: FormData) { setBusy(true); setError(''); const response = await fetch(`/api/admin/privacy/${id}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: formData.get('action'), note: formData.get('note'), requestId: crypto.randomUUID() }) }); const body = await response.json().catch(() => ({})) as { error?: string }; setBusy(false); if (!response.ok) return setError(body.error ?? 'Action failed.'); router.refresh(); }
  return <form action={act} className="mt-3 flex flex-wrap gap-2"><select name="action" className="rounded-lg border bg-background px-3 py-2 text-sm"><option value="assign">Assign</option><option value="request_information">Request information</option>{canDecide ? <><option value="approve">Approve</option><option value="reject">Reject</option><option value="complete">Complete</option></> : null}</select><input name="note" minLength={8} required placeholder="Decision note" className="min-w-52 flex-1 rounded-lg border bg-background px-3 py-2 text-sm"/><button disabled={busy} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">Apply</button>{error ? <p className="w-full text-sm text-destructive">{error}</p> : null}</form>;
}
