'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ManagedTaxonomyRow } from '@/lib/db/repositories/catalog-admin';

export function CatalogManager({
  categories,
  occasions,
}: {
  categories: readonly ManagedTaxonomyRow[];
  occasions: readonly ManagedTaxonomyRow[];
}) {
  return (
    <div className="mt-8 grid gap-8 xl:grid-cols-2">
      <TaxonomySection kind="category" title="Categories" rows={categories} />
      <TaxonomySection
        kind="occasion"
        title="Gift occasions"
        rows={occasions}
      />
    </div>
  );
}

function TaxonomySection({
  kind,
  title,
  rows,
}: {
  kind: 'category' | 'occasion';
  title: string;
  rows: readonly ManagedTaxonomyRow[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<ManagedTaxonomyRow | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: {
    preventDefault(): void;
    currentTarget: HTMLFormElement;
  }) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const data = new FormData(event.currentTarget);
    const response = await fetch('/api/admin/catalog', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind,
        id: editing?.id,
        slug: data.get('slug'),
        nameEn: data.get('nameEn'),
        nameNe: data.get('nameEn'),
        sortOrder: Number(data.get('sortOrder')),
        isActive: data.get('isActive') === 'on',
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const result = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok)
      return setError(result.error || 'Entry could not be saved.');
    setEditing(null);
    setNewMode(false);
    router.refresh();
  }
  const active =
    editing ??
    (newMode
      ? {
          id: '',
          slug: '',
          nameEn: '',
          nameNe: '',
          isActive: 1,
          sortOrder: (rows.at(-1)?.sortOrder ?? 0) + 10,
          usageCount: 0,
        }
      : null);
  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-2xl">{title}</h2>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setNewMode(true);
          }}
        >
          Add
        </Button>
      </div>
      {active ? (
        <form
          key={active.id || 'new'}
          onSubmit={submit}
          className="mt-5 grid gap-3 rounded-xl bg-muted/35 p-4"
        >
          <Input
            name="nameEn"
            defaultValue={active.nameEn}
            placeholder="English name"
            required
          />
          <Input
            name="slug"
            defaultValue={active.slug}
            placeholder="url-slug"
            required
          />
          <Input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={active.sortOrder}
            required
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              name="isActive"
              type="checkbox"
              defaultChecked={Boolean(active.isActive)}
              className="size-4 accent-primary"
            />{' '}
            Active
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button size="sm" type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setEditing(null);
                setNewMode(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <div className="mt-5 divide-y">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              setEditing(row);
              setNewMode(false);
            }}
            className="flex w-full items-center justify-between gap-4 py-3 text-left"
          >
            <strong className="block text-sm">{row.nameEn}</strong>
            <span className="text-right text-xs text-muted-foreground">
              {row.usageCount} products
              <br />
              {row.isActive ? 'Active' : 'Inactive'}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
