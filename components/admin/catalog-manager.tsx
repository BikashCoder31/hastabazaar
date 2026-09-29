'use client';
import Link from 'next/link';
import { CategoryImageEditor } from '@/components/admin/category-image-editor';
import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  clearSessionAttempt,
  getOrCreateSessionAttempt,
  hasSessionAttempt,
  sessionAttemptKey,
} from '@/lib/forms/client-attempt';
import type { ManagedTaxonomyRow } from '@/lib/db/repositories/catalog-admin';
import { ConfiguredFields } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import {
  configuredJsonPayload,
  readConfiguredSubmission,
} from '@/lib/forms/submission';

const catalogBaseKeys = [
  'kind',
  'id',
  'slug',
  'nameEn',
  'nameNe',
  'sortOrder',
  'isActive',
  'idempotencyKey',
  'imageId',
  'expectedImageId',
];

export function CatalogManager({
  categories,
  occasions,
}: {
  categories: readonly ManagedTaxonomyRow[];
  occasions: readonly ManagedTaxonomyRow[];
}) {
  return (
    <Tabs defaultValue="categories" className="mt-7 gap-5">
      <TabsList
        className="h-auto min-h-12 max-w-full flex-wrap"
        aria-label="Catalogue taxonomy"
      >
        <TabsTrigger
          value="categories"
          className="min-w-0 whitespace-normal px-4"
        >
          Categories ({categories.length})
        </TabsTrigger>
        <TabsTrigger
          value="occasions"
          className="min-w-0 whitespace-normal px-4"
        >
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
  const router = useRouter();
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [retryPending, setRetryPending] = useState(false);
  const catalog = usePublishedFormConfig('staff.catalog');
  const fieldId = useId();
  const [editing, setEditing] = useState<ManagedTaxonomyRow | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [message, setMessage] = useState('');
  const [imageDraft, setImageDraft] = useState<string | null | undefined>(
    undefined,
  );
  const [imageBusy, setImageBusy] = useState(false);
  const [savedRows, setSavedRows] = useState<
    readonly ManagedTaxonomyRow[] | null
  >(null);
  const refreshing = savedRows === rows;
  const attemptKey = sessionAttemptKey(
    'staff.catalog',
    `${kind}:${editing?.id ?? 'new'}`,
  );
  useEffect(() => {
    const timer = window.setTimeout(
      () => setRetryPending(hasSessionAttempt(attemptKey)),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [attemptKey]);
  async function save(body: Record<string, unknown>) {
    if (pending || imageBusy || refreshing) return;
    setPending(true);
    setError('');
    try {
      const idempotencyKey = getOrCreateSessionAttempt(attemptKey);
      setRetryPending(true);
      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, idempotencyKey }),
      });
      const result = (await response.json().catch(() => null)) as {
        error?: string;
        code?: string;
        id?: unknown;
      } | null;
      if (!response.ok) {
        if (response.status === 409 && result?.code === 'stale_version')
          catalog.handleSubmissionResponse(response, result.code);
        throw new Error(result?.error || 'Catalogue entry could not be saved.');
      }
      if (typeof result?.id !== 'string' || !result.id)
        throw new Error(
          'The response could not be verified. Retry with the same request.',
        );
      setSavedRows(rows);
      clearSessionAttempt(attemptKey);
      setRetryPending(false);
      setImageDraft(undefined);
      setEditing(null);
      setNewMode(false);
      setMessage('Catalogue entry saved.');
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Catalogue entry could not be saved.',
      );
    } finally {
      setPending(false);
    }
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
    <section className="rounded-2xl border bg-card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="font-heading text-2xl">{title}</h2>
        <Link
          className="text-sm underline"
          href={`/admin/staff-form-history?kind=catalog-${kind}`}
        >
          View form history
        </Link>
        <Button
          disabled={pending || imageBusy || refreshing}
          onClick={() => {
            setImageDraft(undefined);
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
        <output className="block mt-3 text-sm">
          {refreshing
            ? 'Catalogue entry saved. Refreshing entries...'
            : message}
        </output>
      ) : null}
      {active ? (
        <form
          data-form-id="staff.catalog"
          key={active.id || 'new'}
          onSubmit={(event) => {
            event.preventDefault();
            if (pending || imageBusy || refreshing) return;
            if (!catalog.config || !catalog.canSubmit) {
              setMessage(
                catalog.message || 'Form configuration is unavailable.',
              );
              return;
            }
            const data = new FormData(event.currentTarget);
            let configured: ReturnType<typeof configuredJsonPayload>;
            try {
              const submission = readConfiguredSubmission(
                event.currentTarget,
                catalog.config,
                catalogBaseKeys,
              );
              configured = configuredJsonPayload(
                catalog.config,
                submission.answers,
                catalogBaseKeys,
              );
            } catch (cause) {
              setMessage(
                cause instanceof Error
                  ? cause.message
                  : 'Review the configured fields.',
              );
              return;
            }
            void save({
              kind,
              id: editing?.id,
              slug: data.get('slug'),
              nameEn: data.get('nameEn'),
              nameNe: editing?.nameNe || data.get('nameEn'),
              sortOrder: Number(data.get('sortOrder')),
              isActive: data.get('isActive') === 'on',
              ...(kind === 'category' && imageDraft !== undefined
                ? {
                    imageId: imageDraft,
                    expectedImageId: editing?.imageId ?? null,
                  }
                : {}),
              ...configured,
            });
          }}
          className="mt-5 rounded-xl border bg-muted/35 p-4"
        >
          <p className="text-xs text-muted-foreground">* Required field</p>

          <fieldset
            disabled={pending || !catalog.canSubmit}
            className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <legend className="mb-4 font-semibold">
              {editing ? 'Edit ' + editing.nameEn : 'New ' + kind}
            </legend>
            <label
              htmlFor={fieldId + '-nameEn'}
              className="grid gap-2 text-sm font-medium"
            >
              Display name
              <span aria-hidden="true">*</span>
              <Input
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
              <span aria-hidden="true">*</span>
              <Input
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
            {kind === 'category' ? (
              <CategoryImageEditor
                value={
                  imageDraft === undefined
                    ? (editing?.imageId ?? null)
                    : imageDraft
                }
                onChange={setImageDraft}
                onBusyChange={setImageBusy}
                disabled={pending || retryPending || !catalog.canSubmit}
              />
            ) : null}
            {catalog.config ? (
              <div className="sm:col-span-2">
                <ConfiguredFields
                  config={catalog.config}
                  baseKeys={catalogBaseKeys}
                />
              </div>
            ) : null}
            {error ? (
              <p
                role="alert"
                className="text-sm text-destructive sm:col-span-2"
              >
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button
                type="submit"
                disabled={pending || imageBusy || refreshing}
              >
                {pending ? 'Saving…' : 'Save entry'}
              </Button>
              <Button
                variant="outline"
                type="button"
                disabled={pending || imageBusy || refreshing}
                onClick={() => {
                  setImageDraft(undefined);
                  setEditing(null);
                  setNewMode(false);
                }}
              >
                Cancel
              </Button>
            </div>
          </fieldset>
          {!catalog.canSubmit ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {catalog.message || 'Loading form configuration…'}
            </p>
          ) : null}
          {retryPending ? (
            <div className="mt-3 space-y-2 text-sm">
              <p>
                A previous save may have succeeded. Check the catalogue before
                another attempt.
              </p>
              <Button
                type="button"
                variant="outline"
                disabled={pending || imageBusy || refreshing}
                onClick={() => {
                  if (
                    !window.confirm(
                      'Starting a new attempt may duplicate a prior successful action. Check the catalogue entry first. Continue?',
                    )
                  )
                    return;
                  clearSessionAttempt(attemptKey);
                  setRetryPending(false);
                  setError('');
                  if (catalog.status === 'stale') catalog.refresh();
                }}
              >
                Start a new attempt
              </Button>
            </div>
          ) : null}
        </form>
      ) : null}
      <div className="mt-5 divide-y">
        {rows.length ? (
          rows.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={pending || imageBusy || refreshing}
              onClick={() => {
                setImageDraft(undefined);
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
