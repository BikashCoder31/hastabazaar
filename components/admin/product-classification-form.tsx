'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
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
  const { send, pending, error } = useAdminMutation();
  const [message, setMessage] = useState('');
  const [validation, setValidation] = useState('');
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        setMessage('');
        setValidation('');
        const data = new FormData(event.currentTarget);
        const chosen = data.getAll('occasionIds');
        if (chosen.length < 1 || chosen.length > 5) {
          setValidation('Choose between 1 and 5 gift occasions.');
          return;
        }
        void send(
          '/api/admin/products/' +
            encodeURIComponent(productId) +
            '/classification',
          { categoryId: data.get('categoryId'), occasionIds: chosen },
          'idempotencyKey',
          'PUT',
        ).then((ok) => {
          if (ok) setMessage('Classification saved.');
        });
      }}
      className="space-y-4"
    >
<p className="text-xs text-muted-foreground">* Required field</p>

      <fieldset disabled={pending} className="space-y-4">
        <label className="grid gap-2 text-sm font-semibold">
          Category
           <span aria-hidden="true">*</span><select
            name="categoryId"
            defaultValue={
              categories.some((item) => item.id === categoryId)
                ? categoryId
                : ''
            }
            required
            className="w-full rounded-lg border bg-background px-3 py-2"
          >
            <option value="" disabled>
              Choose an active category
            </option>
            {categories.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nameEn}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">
            Gift occasions (choose 1–5)
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {occasions.map((item) => (
              <label
                key={item.id}
                className="flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  name="occasionIds"
                  value={item.id}
                  defaultChecked={occasionIds.includes(item.id)}
                  className="size-4 shrink-0 accent-primary"
                />
                <span>{item.nameEn}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save classification'}
        </Button>
      </fieldset>
      {validation || error ? (
        <p role="alert" className="text-sm text-destructive">
          {validation || error}
        </p>
      ) : null}
      {message ? (
        <output className="block text-sm text-muted-foreground">
          {message}
        </output>
      ) : null}
    </form>
  );
}
