'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
export function GiftCardForm({ issue = false }: { issue?: boolean }) {
  const router = useRouter(),
    request = useRef(crypto.randomUUID());
  const [value, setValue] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [result, setResult] = useState<{
      code: string | null;
      id: string;
      amountPaisa: number;
    } | null>(null);
  async function submit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        issue ? '/api/admin/gift-cards' : '/api/account/gift-cards',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: request.current,
            ...(issue ? { amount: value } : { code: value }),
          }),
        },
      );
      const data = (await response.json()) as {
        error?: string;
        code: string | null;
        id: string;
        amountPaisa: number;
      };
      if (!response.ok) {
        setError(data.error || 'The operation could not be completed.');
        return;
      }
      setResult(data);
      setValue('');
      router.refresh();
    } catch {
      setError(
        'Connection interrupted. Retry this same request to check its result.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="gift-cards" className="rounded-3xl border bg-card p-6">
      <h2 className="font-heading text-2xl">
        {issue ? 'Issue a gift card' : 'Redeem a gift card'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {issue
          ? 'Choose the shopping-credit value. Anyone with the code can redeem it once while signed in. There is no expiry.'
          : 'Add shopping-only credit to your wallet. Gift cards can be redeemed once and do not expire. Credit cannot be deposited or withdrawn.'}
      </p>
      {result ? (
        <output className="mt-4 block space-y-3">
          <p>
            {issue
              ? 'Gift card issued.'
              : 'Gift card redeemed. Shopping credit added.'}
          </p>
          {issue && result.code ? (
            <>
              <p className="font-semibold">
                Copy this code now. It will not be shown again after you leave
                this page.
              </p>
              <code className="block break-all rounded border p-3 select-all">
                {result.code}
              </code>
              <button
                type="button"
                className="underline"
                onClick={() => navigator.clipboard.writeText(result.code!)}
              >
                Copy code
              </button>
            </>
          ) : issue ? (
            <p>
              The issuance already completed. The secret code cannot be
              recovered. Review the safe issuance record.
            </p>
          ) : null}
          <p className="text-sm">Reference: {result.id}</p>
          <button
            type="button"
            className="rounded border px-4 py-2"
            onClick={() => {
              setResult(null);
              request.current = crypto.randomUUID();
            }}
          >
            {issue ? 'Issue another gift card' : 'Redeem another code'}
          </button>
        </output>
      ) : (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <label className="block text-sm font-medium">
            {issue ? 'Amount in NPR' : 'Gift card code'}<span aria-hidden="true"> *</span>
            <input
              required
              maxLength={issue ? 17 : 60}
              inputMode={issue ? 'decimal' : 'text'}
              autoComplete="off"
              spellCheck={false}
              type={issue ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="mt-2 block w-full rounded-lg border bg-background p-3"
            />
          </label>
          <button
            disabled={busy}
            className="rounded-lg bg-primary px-5 py-3 text-primary-foreground disabled:opacity-50"
          >
            {busy
              ? 'Saving…'
              : issue
                ? 'Issue gift card'
                : 'Redeem into wallet'}
          </button>
        </form>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  );
}
