'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function SellerCaseResponseForm({ kind, id, disabled }: { kind: 'return' | 'complaint'; id: string; disabled: boolean }) {
  const router = useRouter();
  const [response, setResponse] = useState('');
  const [recommendation, setRecommendation] = useState('accept');
  const [locale, setLocale] = useState<'en-NP' | 'ne-NP'>('en-NP');
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  if (disabled) return <p className="text-sm leading-6 text-muted-foreground">Your response is recorded. Hathkriti operations owns the final decision.</p>;
  async function submit() {
    setPending(true); setError('');
    try {
      const endpoint = kind === 'return' ? `/api/seller/returns/${encodeURIComponent(id)}/response` : `/api/seller/complaints/${encodeURIComponent(id)}/response`;
      const resultBody = { response, idempotencyKey: requestId, ...(kind === 'return' ? { recommendation, locale } : {}) };
      const request = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(resultBody) });
      const result = (await request.json()) as { error?: string };
      if (!request.ok) throw new Error(result.error || 'Response could not be saved.');
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Response could not be saved.'); }
    finally { setPending(false); }
  }
  return <div className="space-y-4">
    {kind === 'return' ? <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Recommendation</Label><select value={recommendation} onChange={(event) => setRecommendation(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="accept">Accept</option><option value="contest">Contest with evidence</option><option value="request_information">Request information</option></select></div><div className="space-y-2"><Label>Response language</Label><select value={locale} onChange={(event) => setLocale(event.target.value as 'en-NP' | 'ne-NP')} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="en-NP">English</option><option value="ne-NP">नेपाली</option></select></div></div> : null}
    <div className="space-y-2"><Label>Response for the investigation</Label><Textarea value={response} onChange={(event) => setResponse(event.target.value)} minLength={20} maxLength={2000} placeholder="Provide factual item, packing, and fulfilment details. Do not include unrelated customer data." /></div>
    {error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : null}
    <Button onClick={() => void submit()} disabled={pending || response.trim().length < 20}>{pending ? 'Saving…' : 'Submit response'}</Button>
  </div>;
}
