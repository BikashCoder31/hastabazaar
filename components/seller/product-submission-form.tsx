'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import type {
  CategoryRow,
  OccasionRow,
  SellerProductRevision,
} from '@/lib/db/repositories/products';

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; message: string }
  | { status: 'success' };

interface ModelContext {
  registerTool(
    tool: {
      name: string;
      title: string;
      description: string;
      inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute(input: unknown): unknown;
    },
    options?: { signal?: AbortSignal },
  ): void | Promise<void>;
}

function setFormValue(form: HTMLFormElement, name: string, value: string): void {
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

export function ProductSubmissionForm({
  categories,
  occasions,
  initial,
}: {
  categories: readonly CategoryRow[];
  occasions: readonly OccasionRow[];
  initial?: SellerProductRevision;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const isRevision = Boolean(initial);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        modelContext.registerTool(
          {
            name: 'prepare_product_submission',
            title: 'Prepare product submission',
            description:
              'Fill the main text and pricing fields for a Hathkriti product listing. The seller must review the form, choose a category, attach real product photos, and submit it.',
            inputSchema: {
              type: 'object',
              properties: {
                sku: { type: 'string' },
                nameEn: { type: 'string' },
                nameNe: { type: 'string' },
                descriptionEn: { type: 'string' },
                descriptionNe: { type: 'string' },
                price: { type: 'string' },
                inventoryQuantity: { type: 'string' },
                producer: { type: 'string' },
                materials: { type: 'string' },
                dimensions: { type: 'string' },
                careInstructions: { type: 'string' },
              },
              required: ['sku', 'nameEn', 'descriptionEn', 'price', 'producer', 'materials'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              const form = formRef.current;
              if (!form || !input || typeof input !== 'object') {
                throw new Error('The product form is not available.');
              }
              for (const [name, value] of Object.entries(input as Record<string, unknown>)) {
                if (typeof value === 'string') setFormValue(form, name, value);
              }
              form.scrollIntoView({ behavior: 'smooth', block: 'start' });
              form.querySelector<HTMLInputElement>('input[name="sku"]')?.focus();
              return { status: 'prepared', next: 'Select a category and gift occasions, review the details, and attach product photos.' };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => undefined);
    } catch {
      // WebMCP is an optional progressive enhancement.
    }
    return () => lifecycle.abort();
  }, []);

  async function submit(event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    setState({ status: 'submitting' });
    const form = event.currentTarget;
    try {
      const response = await fetch(
        initial ? `/api/seller/products/${encodeURIComponent(initial.id)}` : '/api/seller/products',
        {
        method: initial ? 'PATCH' : 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' },
        },
      );
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Product submission failed.');
      form.reset();
      setState({ status: 'success' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setState({
        status: 'error',
        message: error instanceof Error ? error.message : 'Product submission failed.',
      });
    }
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <CheckCircle2 className="size-10 text-primary" />
        <h2 className="mt-5 font-heading text-3xl">{isRevision ? 'Product revised and resubmitted' : 'Product sent for review'}</h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          Hathkriti will verify the listing before it can appear in the public shop.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/seller/products" className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">View my products</Link>
          <Button variant="outline" onClick={() => setState({ status: 'idle' })}>Add another product</Button>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-9 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
      <FieldSet>
        <FieldLegend>Listing identity</FieldLegend>
        <FieldDescription>Use a unique SKU from your own stock records.</FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="categoryId">Category</FieldLabel>
            <NativeSelect id="categoryId" name="categoryId" required className="w-full" defaultValue={initial?.categoryId}>
              <NativeSelectOption value="">Select category</NativeSelectOption>
              {categories.map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {category.nameEn}{category.nameNe ? ` · ${category.nameNe}` : ''}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field>
            <FieldLabel htmlFor="sku">SKU</FieldLabel>
            <Input id="sku" name="sku" required minLength={3} maxLength={40} placeholder="HK-BAG-001" defaultValue={initial?.sku} />
          </Field>
          <Field>
            <FieldLabel htmlFor="nameEn">Product name — English</FieldLabel>
            <Input id="nameEn" name="nameEn" required maxLength={160} defaultValue={initial?.nameEn} />
          </Field>
          <Field>
            <FieldLabel htmlFor="nameNe">Product name — Nepali</FieldLabel>
            <Input id="nameNe" name="nameNe" maxLength={160} lang="ne" defaultValue={initial?.nameNe ?? ''} />
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Gift occasions</FieldLegend>
        <FieldDescription>
          Select 1–5 occasions where this product is a good fit. These choices power customer discovery and are checked during moderation.
        </FieldDescription>
        <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {occasions.map((occasion) => (
            <Field key={occasion.id} orientation="horizontal" className="rounded-xl border p-3">
              <Checkbox
                id={`occasion-${occasion.id}`}
                name="occasionIds"
                value={occasion.id}
                defaultChecked={initial?.occasionIds.includes(occasion.id)}
              />
              <FieldLabel htmlFor={`occasion-${occasion.id}`} className="font-normal">
                <span>{occasion.nameEn}</span>
                {occasion.nameNe ? <span className="block text-xs text-muted-foreground" lang="ne">{occasion.nameNe}</span> : null}
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Story and details</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="descriptionEn">Description — English</FieldLabel>
            <Textarea id="descriptionEn" name="descriptionEn" required maxLength={4000} rows={6} placeholder="Describe the craft, process, use, and what makes this item distinct." defaultValue={initial?.descriptionEn} />
          </Field>
          <Field>
            <FieldLabel htmlFor="descriptionNe">Description — Nepali</FieldLabel>
            <Textarea id="descriptionNe" name="descriptionNe" maxLength={4000} rows={5} lang="ne" defaultValue={initial?.descriptionNe ?? ''} />
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field><FieldLabel htmlFor="producer">Producer or maker</FieldLabel><Input id="producer" name="producer" required maxLength={180} defaultValue={initial?.producer} /></Field>
            <Field><FieldLabel htmlFor="materials">Materials</FieldLabel><Input id="materials" name="materials" required maxLength={1000} defaultValue={initial?.materials} /></Field>
            <Field><FieldLabel htmlFor="dimensions">Dimensions</FieldLabel><Input id="dimensions" name="dimensions" maxLength={500} placeholder="For example, 28 × 20 × 8 cm" defaultValue={initial?.dimensions ?? ''} /></Field>
            <Field><FieldLabel htmlFor="licenceReference">Licence reference, if required</FieldLabel><Input id="licenceReference" name="licenceReference" maxLength={160} defaultValue={initial?.licenceReference ?? ''} /></Field>
          </div>
          <Field><FieldLabel htmlFor="careInstructions">Care instructions</FieldLabel><Textarea id="careInstructions" name="careInstructions" maxLength={1500} rows={3} defaultValue={initial?.careInstructions ?? ''} /></Field>
          <Field><FieldLabel htmlFor="safetyInformation">Safety information</FieldLabel><Textarea id="safetyInformation" name="safetyInformation" maxLength={1500} rows={3} defaultValue={initial?.safetyInformation ?? ''} /></Field>
          <Field><FieldLabel htmlFor="warranty">Warranty or guarantee</FieldLabel><Input id="warranty" name="warranty" maxLength={500} defaultValue={initial?.warranty ?? ''} /></Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Price and stock</FieldLegend>
        <FieldDescription>Enter Nepalese rupees. Hathkriti stores money precisely in paisa.</FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-3">
          <Field><FieldLabel htmlFor="price">Selling price (NPR)</FieldLabel><Input id="price" name="price" required inputMode="decimal" placeholder="1500.00" defaultValue={initial ? (initial.pricePaisa / 100).toFixed(2) : undefined} /></Field>
          <Field><FieldLabel htmlFor="compareAtPrice">Original price (optional)</FieldLabel><Input id="compareAtPrice" name="compareAtPrice" inputMode="decimal" placeholder="1800.00" defaultValue={initial?.compareAtPricePaisa ? (initial.compareAtPricePaisa / 100).toFixed(2) : ''} /></Field>
          <Field><FieldLabel htmlFor="inventoryQuantity">Available quantity</FieldLabel><Input id="inventoryQuantity" name="inventoryQuantity" type="number" required min={0} max={1000000} step={1} defaultValue={initial?.inventoryQuantity ?? 1} /></Field>
        </FieldGroup>
        <Field orientation="horizontal">
          <Checkbox id="returnEligible" name="returnEligible" value="yes" defaultChecked={initial ? Boolean(initial.returnEligible) : true} />
          <FieldLabel htmlFor="returnEligible" className="font-normal">Eligible for the standard Hathkriti return policy</FieldLabel>
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Product photos</FieldLegend>
        <FieldDescription>{isRevision ? `You already have ${initial?.mediaCount ?? 0} photo(s). Add replacements or extra angles only if the total will remain at 5 or fewer.` : 'Attach 1–5 clear photos. JPG, PNG, or WebP; maximum 5 MB each.'}</FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {[1, 2, 3, 4, 5].map((number) => (
            <Field key={number}>
              <FieldLabel htmlFor={`image${number}`} className="flex items-center gap-2"><ImagePlus className="size-4" /> Additional photo {number}{number === 1 && !isRevision ? ' (required)' : ''}</FieldLabel>
              <Input id={`image${number}`} name={`image${number}`} type="file" accept="image/jpeg,image/png,image/webp" required={number === 1 && !isRevision} className="h-11 py-2" />
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      {state.status === 'error' ? (
        <Alert variant="destructive"><AlertTitle>Product not submitted</AlertTitle><AlertDescription>{state.message}</AlertDescription></Alert>
      ) : null}

      <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-xl items-start gap-2 text-sm leading-6 text-muted-foreground"><ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />Submission starts review. It does not publish the listing automatically.</p>
        <Button type="submit" size="lg" className="h-11 px-6" disabled={state.status === 'submitting'}>
          {state.status === 'submitting' ? <><LoaderCircle className="animate-spin" /> Submitting…</> : isRevision ? 'Resubmit product' : 'Submit product for review'}
        </Button>
      </div>
    </form>
  );
}
