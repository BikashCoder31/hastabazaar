'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { CategoryRow, OccasionRow } from '@/lib/db/repositories/products';

export function ProductClassificationForm({
  productId,
  categoryId,
  occasionIds,
  categories,
  occasions,
}: {
  productId: string;
  categoryId: string;
  occasionIds: readonly string[];
  categories: readonly CategoryRow[];
  occasions: readonly OccasionRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    const data = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/admin/products/${productId}/classification`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          categoryId: data.get('categoryId'),
          occasionIds: data.getAll('occasionIds'),
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    setMessage(
      response.ok
        ? 'Classification saved.'
        : result.error || 'Classification could not be saved.',
    );
    if (response.ok) router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <select
        name="categoryId"
        defaultValue={categoryId}
        className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
      >
        {categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.nameEn}
          </option>
        ))}
      </select>
      <fieldset>
        <legend className="text-sm font-semibold">Gift occasions (1–5)</legend>
        <div className="mt-2 grid gap-2">
          {occasions.map((item) => (
            <label key={item.id} className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="occasionIds"
                value={item.id}
                defaultChecked={occasionIds.includes(item.id)}
                className="mt-1 size-4 accent-primary"
              />
              <span>{item.nameEn}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="sm" disabled={busy}>
        {busy ? 'Saving…' : 'Save classification'}
      </Button>
      {message ? (
        <p className="text-sm text-muted-foreground">{message}</p>
      ) : null}
    </form>
  );
}
