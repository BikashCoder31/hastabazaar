'use client';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminMutation } from '@/components/admin/use-admin-mutation';
import type { ManagedTaxonomyRow } from '@/lib/db/repositories/catalog-admin';

export function CatalogManager({
  categories,
  occasions,
}: {
  categories: readonly ManagedTaxonomyRow[];
  occasions: readonly ManagedTaxonomyRow[];
}) {
  return (
    <Tabs defaultValue="categories" className="mt-7 gap-5">
      <TabsList className="min-h-12" aria-label="Catalogue taxonomy">
        <TabsTrigger value="categories" className="px-4">
          Categories ({categories.length})
        </TabsTrigger>
        <TabsTrigger value="occasions" className="px-4">
          Gift occasions ({occasions.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent value="categories">
        <TaxonomySection kind="category" title="Categories" rows={categories} />
      </TabsContent>
      <TabsContent value="occasions">
        <TaxonomySection
          kind="occasion"
          title="Gift occasions"
          rows={occasions}
        />
      </TabsContent>
    </Tabs>
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
  const { send, pending, error } = useAdminMutation();
  const fieldId = useId();
  const [editing, setEditing] = useState<ManagedTaxonomyRow | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [message, setMessage] = useState('');
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
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-2xl">{title}</h2>
        <Button
          disabled={pending}
          onClick={() => {
            setEditing(null);
            setNewMode(true);
            setMessage('');
          }}
        >
          Add {kind}
        </Button>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Control discovery labels, ordering, and visibility. Inactive entries are
        retained with their existing product associations.
      </p>
      {message ? (
        <output className="block mt-3 text-sm">{message}</output>
      ) : null}
      {active ? (
        <form
          key={active.id || 'new'}
          onSubmit={(event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            void send(
              '/api/admin/catalog',
              {
                kind,
                id: editing?.id,
                slug: data.get('slug'),
                nameEn: data.get('nameEn'),
                nameNe: editing?.nameNe || data.get('nameEn'),
                sortOrder: Number(data.get('sortOrder')),
                isActive: data.get('isActive') === 'on',
              },
              'idempotencyKey',
            ).then((ok) => {
              if (ok) {
                setEditing(null);
                setNewMode(false);
                setMessage('Catalogue entry saved.');
              }
            });
          }}
          className="mt-5 rounded-xl border bg-muted/35 p-4"
        >
<p className="text-xs text-muted-foreground">* Required field</p>

          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-4 font-semibold">
              {editing ? 'Edit ' + editing.nameEn : 'New ' + kind}
            </legend>
            <label
              htmlFor={fieldId + '-nameEn'}
              className="grid gap-2 text-sm font-medium"
            >
              Display name
               <span aria-hidden="true">*</span><Input
                id={fieldId + '-nameEn'}
                name="nameEn"
                defaultValue={active.nameEn}
                required
                minLength={2}
                maxLength={100}
              />
            </label>
            <label
              htmlFor={fieldId + '-slug'}
              className="grid gap-2 text-sm font-medium"
            >
              URL slug <span aria-hidden="true">*</span>
              <Input
                id={fieldId + '-slug'}
                name="slug"
                defaultValue={active.slug}
                required
                maxLength={80}
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                placeholder="lowercase-with-hyphens"
              />
            </label>
            <label
              htmlFor={fieldId + '-sortOrder'}
              className="grid gap-2 text-sm font-medium"
            >
              Display order
               <span aria-hidden="true">*</span><Input
                id={fieldId + '-sortOrder'}
                name="sortOrder"
                type="number"
                min={0}
                max={100000}
                step={1}
                defaultValue={active.sortOrder}
                required
              />
            </label>
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input
                name="isActive"
                type="checkbox"
                defaultChecked={Boolean(active.isActive)}
                className="size-4 accent-primary"
              />
              Active in discovery
            </label>
            {error ? (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {error}
              </p>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={pending}>
                {pending ? 'Saving…' : 'Save entry'}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditing(null);
                  setNewMode(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
        </form>
      ) : null}
      <div className="mt-5 divide-y">
        {rows.length ? (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(row);
                setNewMode(false);
                setMessage('');
              }}
              aria-label={'Edit ' + row.nameEn}
              className="flex w-full flex-wrap items-center justify-between gap-4 rounded-lg px-2 py-4 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50"
            >
              <span>
                <strong className="block text-sm">{row.nameEn}</strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  /{row.slug} · order {row.sortOrder}
                </span>
              </span>
              <span className="text-right text-sm text-muted-foreground">
                {row.usageCount} products ·{' '}
                {row.isActive ? 'Active' : 'Inactive'}
                <span className="ml-3 font-semibold text-primary">Edit</span>
              </span>
            </button>
          ))
        ) : (
          <p className="py-5 text-sm text-muted-foreground">
            No entries yet. Add the first {kind} above.
          </p>
        )}
      </div>
    </section>
  );
}
