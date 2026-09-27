'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { productDiscountLabel } from '@/lib/products/discount';
import Link from 'next/link';
import {
  CheckCircle2,
  ImagePlus,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Video,
} from 'lucide-react';

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
import {
  NativeSelect,
  NativeSelectOption,
} from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { usePublishedFormConfig } from '@/components/forms/form-config-client';
import type {
  CategoryRow,
  OccasionRow,
  SellerProductRevision,
} from '@/lib/db/repositories/products';
import {
  mediaFrameClass,
  mediaObjectClass,
} from '@/lib/media/responsive-media';

type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'error'; message: string }
  | { status: 'success' };

const catalogBaseKeys = ['nameEn', 'descriptionEn', 'sku', 'price', 'pricePaisa', 'inventoryQuantity',
  'image', 'video', 'reviewRequestId', 'categoryId', 'occasionIds', 'sellerId', 'producer', 'materials',
  'requestId', 'formVersion', 'customAnswers'];

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

function setFormValue(
  form: HTMLFormElement,
  name: string,
  value: string,
): void {
  const field = form.elements.namedItem(name);
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function dateInputValue(value: number | null | undefined): string {
  return value ? new Date(value).toISOString().slice(0, 10) : '';
}

function discountPercentage(price: string, originalPrice: string): string {
  const current = Number(price);
  const original = Number(originalPrice);
  if (
    !Number.isFinite(current) ||
    !Number.isFinite(original) ||
    original <= current ||
    current < 0
  ) {
    return '';
  }
  return (((original - current) / original) * 100)
    .toFixed(2)
    .replace(/\.00$/, '')
    .replace(/(\.\d)0$/, '$1');
}

function useFilePreview(file: File | null): string | null {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);
  return url;
}

function MaterialsEditor({initial,suggestions}:{initial:string; suggestions:readonly string[]}){
  const [materials,setMaterials]=useState(()=>initial.split(',').map(value=>value.trim()).filter(Boolean));
  const [candidate,setCandidate]=useState('');
  const listId='product-material-suggestions';
  function add(){const value=candidate.trim().replace(/\s+/g,' ');if(!value||value.length>80)return;setMaterials(current=>current.some(item=>item.toLocaleLowerCase('en')===value.toLocaleLowerCase('en'))?current:[...current,value]);setCandidate('');}
  return <Field><FieldLabel htmlFor="material-entry">Materials used — optional</FieldLabel><FieldDescription>Add only materials used in this product. Suggestions do not create sustainability or verification claims.</FieldDescription><div className="flex gap-2"><Input id="material-entry" list={listId} value={candidate} maxLength={80} placeholder="Search or add a material" onChange={event=>setCandidate(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();add();}}}/><Button type="button" variant="outline" onClick={add}><Plus/>Add</Button></div><datalist id={listId}>{suggestions.map(value=><option key={value} value={value}>{value}</option>)}</datalist>{materials.length?<ul className="flex flex-wrap gap-2" aria-label="Selected materials">{materials.map(value=><li className="inline-flex items-center gap-1 rounded-full border bg-muted px-3 py-1 text-sm" key={value.toLocaleLowerCase('en')}><input type="hidden" name="materials" value={value} aria-label={`${value} material`}/>{value}<button type="button" className="rounded p-1" aria-label={`Remove ${value}`} onClick={()=>setMaterials(current=>current.filter(item=>item!==value))}><Trash2 className="size-3"/></button></li>)}</ul>:<p className="text-sm text-muted-foreground">No materials added. This does not block submission.</p>}</Field>;
}

function ImageUploadSlot({
  slot,
  required,
  removable,
  onRemove,
}: {
  slot: number;
  required: boolean;
  removable: boolean;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const preview = useFilePreview(file);
  return (
    <div className="rounded-xl border p-4">
      <div
        data-media-frame="cover"
        className={mediaFrameClass(
          'cover',
          'aspect-[4/3] overflow-hidden rounded-lg bg-muted',
        )}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- browser object URLs cannot use the Next image optimizer.
          <img
            data-media-mode="cover"
            src={preview}
            alt="Selected product preview"
            title="Selected product preview"
            className={mediaObjectClass('cover')}
          />
        ) : (
          <div className="grid size-full place-items-center text-sm text-muted-foreground">
            <ImagePlus className="mb-2 size-7" />
            Image {slot}
            {required ? ' *' : ''}
          </div>
        )}
      </div>
      <Input
        ref={inputRef}
        className="mt-3 h-11 py-2"
        name={required && slot <= 4 ? `image${slot}` : 'images'}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
        onChange={(event) => setFile(event.currentTarget.files?.[0] ?? null)}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        {file ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = '';
              setFile(null);
            }}
          >
            <Trash2 /> Remove image
          </Button>
        ) : null}
        {removable ? (
          <Button type="button" size="sm" variant="ghost" onClick={onRemove}>
            Remove slot
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function ExistingImageEditor({
  media,
  removed,
  onToggleRemoved,
}: {
  media: SellerProductRevision['media'][number];
  removed: boolean;
  onToggleRemoved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [replacement, setReplacement] = useState<File | null>(null);
  const preview = useFilePreview(replacement);
  return (
    <div className={`rounded-xl border p-4 ${removed ? 'opacity-60' : ''}`}>
      <div
        data-media-frame="cover"
        className={mediaFrameClass(
          'cover',
          'aspect-[4/3] overflow-hidden rounded-lg bg-muted',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- browser object URLs and authenticated media routes cannot use the Next image optimizer. */}
        <img
          data-media-mode="cover"
          src={preview ?? `/api/product-media/${media.id}`}
          alt={
            preview
              ? 'Replacement product preview'
              : `Saved product image: ${media.originalName}`
          }
          title={preview ? 'Replacement image preview' : media.originalName}
          className={mediaObjectClass('cover')}
        />
      </div>
      <p className="mt-2 truncate text-xs text-muted-foreground">
        {media.originalName}
      </p>
      {removed ? (
        <input type="hidden" name="removeMediaId" value={media.id} />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!removed ? (
          <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium">
            <RefreshCw className="size-4" /> Replace image
            <input
              ref={inputRef}
              className="sr-only"
              name={`replaceImage:${media.id}`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setReplacement(event.currentTarget.files?.[0] ?? null)
              }
            />
          </label>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant={removed ? 'outline' : 'ghost'}
          onClick={() => {
            if (!removed && inputRef.current) inputRef.current.value = '';
            if (!removed) setReplacement(null);
            onToggleRemoved();
          }}
        >
          {removed ? (
            'Undo remove'
          ) : (
            <>
              <Trash2 /> Remove image
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function VideoUploadControl({
  existing,
}: {
  existing?: SellerProductRevision['media'][number];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [removed, setRemoved] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const preview = useFilePreview(file);
  const source =
    preview ??
    (existing && !removed ? `/api/product-media/${existing.id}` : null);
  return (
    <div className="rounded-xl border p-4">
      {source ? (
        <div
          data-media-frame="contain"
          className={mediaFrameClass(
            'contain',
            'aspect-video max-h-80 rounded-lg bg-black',
          )}
        >
          <video
            data-media-mode="contain"
            controls
            muted
            preload="metadata"
            src={source}
            className={mediaObjectClass('contain')}
          />
        </div>
      ) : (
        <div className="grid min-h-40 place-items-center rounded-lg bg-muted text-sm text-muted-foreground">
          <Video className="mb-2 size-8" /> No video uploaded
        </div>
      )}
      {removed && existing ? (
        <input type="hidden" name="removeMediaId" value={existing.id} />
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm font-medium">
          <RefreshCw className="size-4" />{' '}
          {source ? 'Replace video' : 'Upload video'}
          <input
            ref={inputRef}
            className="sr-only"
            name={existing ? 'replacementVideo' : 'video'}
            type="file"
            accept="video/mp4"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setRemoved(false);
            }}
          />
        </label>
        {source ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              if (inputRef.current) inputRef.current.value = '';
              setFile(null);
              setRemoved(Boolean(existing));
            }}
          >
            <Trash2 /> Remove video
          </Button>
        ) : null}
        {removed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setRemoved(false)}
          >
            Restore video
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ProductSubmissionForm({
  categories,
  occasions,
  initial,
  mode = 'submit',
  materialSuggestions = [],
}: {
  categories: readonly CategoryRow[];
  occasions: readonly OccasionRow[];
  initial?: SellerProductRevision;
  mode?: 'submit' | 'draft';
  materialSuggestions?: readonly string[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const attemptId = useRef('');
  const catalog = usePublishedFormConfig('seller.product-submission');
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });
  const [price, setPrice] = useState(
    initial ? String(initial.pricePaisa / 100) : '',
  );
  const [originalPrice, setOriginalPrice] = useState(
    initial?.compareAtPricePaisa
      ? String(initial.compareAtPricePaisa / 100)
      : '',
  );
  const [discountPercent, setDiscountPercent] = useState(() =>
    discountPercentage(
      initial ? String(initial.pricePaisa / 100) : '',
      initial?.compareAtPricePaisa
        ? String(initial.compareAtPricePaisa / 100)
        : '',
    ),
  );
  const discount = productDiscountLabel(
    Math.round(Number(price) * 100),
    Math.round(Number(originalPrice) * 100),
  );
  const isRevision = Boolean(initial);
  const [warrantyChoice, setWarrantyChoice] = useState(
    initial?.warranty ? 'preserve' : 'no',
  );
  const [returnEligible, setReturnEligible] = useState(
    initial ? Boolean(initial.returnEligible) : true,
  );
  const [imageSlots, setImageSlots] = useState(() =>
    initial ? ([] as number[]) : [1, 2, 3, 4],
  );
  const [nextImageSlot, setNextImageSlot] = useState(5);
  const [removedMedia, setRemovedMedia] = useState<Set<string>>(
    () => new Set(),
  );

  useEffect(() => {
    const modelContext = (
      document as Document & { modelContext?: ModelContext }
    ).modelContext;
    if (!modelContext?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        modelContext.registerTool(
          {
            name: 'prepare_product_submission',
            title: 'Prepare product submission',
            description:
              'Fill the main text and pricing fields for a HastaBazaar product listing. The seller must review the form, choose a category, attach real product photos, and submit it.',
            inputSchema: {
              type: 'object',
              properties: {
                nameEn: { type: 'string' },
                descriptionEn: { type: 'string' },
                price: { type: 'string' },
                inventoryQuantity: { type: 'string' },
                dimensions: { type: 'string' },
                careInstructions: { type: 'string' },
              },
              required: ['nameEn', 'descriptionEn', 'price'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              const form = formRef.current;
              if (!form || !input || typeof input !== 'object') {
                throw new Error('The product form is not available.');
              }
              for (const [name, value] of Object.entries(
                input as Record<string, unknown>,
              )) {
                if (typeof value === 'string') setFormValue(form, name, value);
              }
              form.scrollIntoView({ behavior: 'smooth', block: 'start' });
              form
                .querySelector<HTMLInputElement>('input[name="nameEn"]')
                ?.focus();
              return {
                status: 'prepared',
                next: 'Select a category and gift occasions, review the details, and attach product photos.',
              };
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

  async function submit(
    event: React.SyntheticEvent<HTMLFormElement, SubmitEvent>,
  ) {
    event.preventDefault();
    if (state.status === 'submitting' || !catalog.canSubmit || !catalog.config) return;
    setState({ status: 'submitting' });
    const form = event.currentTarget;
    try {
      const payload = new FormData(form);
      attemptId.current ||= crypto.randomUUID();
      payload.set('requestId', attemptId.current);
      const response = await fetch(
        initial
          ? `/api/seller/products/${encodeURIComponent(initial.id)}`
          : mode === 'draft' ? '/api/seller/products?intent=draft' : '/api/seller/products',
        {
          method: initial ? 'PATCH' : 'POST',
          body: payload,
          headers: { Accept: 'application/json' },
        },
      );
      const result = (await response.json()) as { error?: string; code?: string };
      catalog.handleSubmissionResponse(response, result.code);
      if (!response.ok)
        throw new Error(result.error || 'Product submission failed.');
      attemptId.current = '';
      form.reset();
      setPrice(initial ? String(initial.pricePaisa / 100) : '');
      setOriginalPrice(
        initial?.compareAtPricePaisa
          ? String(initial.compareAtPricePaisa / 100)
          : '',
      );
      setDiscountPercent(
        discountPercentage(
          initial ? String(initial.pricePaisa / 100) : '',
          initial?.compareAtPricePaisa
            ? String(initial.compareAtPricePaisa / 100)
            : '',
        ),
      );
      setWarrantyChoice(initial?.warranty ? 'preserve' : 'no');
      setReturnEligible(initial ? Boolean(initial.returnEligible) : true);
      setState({ status: 'success' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      setState({
        status: 'error',
        message:
          error instanceof Error ? error.message : 'Product submission failed.',
      });
    }
  }

  if (state.status === 'success') {
    return (
      <div className="rounded-2xl border bg-card p-8 shadow-sm">
        <CheckCircle2 className="size-10 text-primary" />
        <h2 className="mt-5 font-heading text-3xl">
          {initial?.status === 'published' || initial?.status === 'approved'
            ? 'Product updated successfully'
            : isRevision
              ? 'Product revised and resubmitted'
              : mode === 'draft' ? 'Private product draft saved' : 'Product sent for review'}
        </h2>
        <p className="mt-3 max-w-xl leading-7 text-muted-foreground">
          {mode === 'draft'
            ? 'This draft is available only to you and authorised reviewers. It cannot be published or ordered while activation requirements remain outstanding.'
            : 'HastaBazaar will verify the listing before it can appear in the public shop.'}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={mode === 'draft' ? '/sell/application' : '/seller/products'}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            {mode === 'draft' ? 'Back to application' : 'View my products'}
          </Link>
          <Button
            variant="outline"
            render={<Link href={mode === 'draft' ? '/sell/application/products/new' : '/seller/products/new'} />}
            onClick={() => {
              if (!isRevision) setState({ status: 'idle' });
            }}
          >
            Add another product
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className="seller-form space-y-9 rounded-2xl border bg-card p-6 shadow-sm sm:p-8"
    >
      {initial ? (
        <input
          type="hidden"
          name="reviewRequestId"
          value={initial.reviewRequestId ?? ''}
        />
      ) : null}
      <p className="text-sm text-muted-foreground">
        * Required field. Conditional requirements are shown beside the field.
      </p>
      <FieldSet>
        <FieldLegend>Listing identity</FieldLegend>
        <FieldDescription>
          Each new product receives a unique SKU automatically. Existing SKUs
          are retained.
        </FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="categoryId">Category *</FieldLabel>
            <NativeSelect
              id="categoryId"
              name="categoryId"
              required
              className="w-full"
              defaultValue={initial?.categoryId}
            >
              <NativeSelectOption value="">Select category</NativeSelectOption>
              {categories.map((category) => (
                <NativeSelectOption key={category.id} value={category.id}>
                  {category.nameEn}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          {initial ? <p className="text-sm">SKU: {initial.sku}</p> : null}
          <Field>
            <FieldLabel htmlFor="nameEn">{fieldDisplay(catalog.config, 'nameEn')?.label ?? 'Product name — English'} *</FieldLabel>
            <Input
              id="nameEn"
              name="nameEn"
              required
              maxLength={160}
              defaultValue={initial?.nameEn}
              placeholder={fieldDisplay(catalog.config, 'nameEn')?.placeholder}
              aria-describedby={fieldDisplay(catalog.config, 'nameEn')?.helpText ? 'nameEn-catalog-help' : undefined}
            />
            {fieldDisplay(catalog.config, 'nameEn')?.helpText ? <FieldDescription id="nameEn-catalog-help">{fieldDisplay(catalog.config, 'nameEn')?.helpText}</FieldDescription> : null}
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Gift occasions *</FieldLegend>
        <FieldDescription>
          Select 1–5 occasions where this product is a good fit. These choices
          power customer discovery and are checked during moderation.
        </FieldDescription>
        <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {occasions.map((occasion) => (
            <Field
              key={occasion.id}
              orientation="horizontal"
              className="rounded-xl border p-3"
            >
              <Checkbox
                id={`occasion-${occasion.id}`}
                name="occasionIds"
                value={occasion.id}
                defaultChecked={initial?.occasionIds.includes(occasion.id)}
              />
              <FieldLabel
                htmlFor={`occasion-${occasion.id}`}
                className="font-normal"
              >
                <span>{occasion.nameEn}</span>
              </FieldLabel>
            </Field>
          ))}
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Product description</FieldLegend>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="descriptionEn">
              {fieldDisplay(catalog.config, 'descriptionEn')?.label ?? 'Description — English'} *
            </FieldLabel>
            <Textarea
              id="descriptionEn"
              name="descriptionEn"
              required
              maxLength={4000}
              rows={6}
              placeholder={fieldDisplay(catalog.config, 'descriptionEn')?.placeholder ?? 'Describe the craft, process, use, and what makes this item distinct.'}
              defaultValue={initial?.descriptionEn}
              aria-describedby={fieldDisplay(catalog.config, 'descriptionEn')?.helpText ? 'descriptionEn-catalog-help' : undefined}
            />
            {fieldDisplay(catalog.config, 'descriptionEn')?.helpText ? <FieldDescription id="descriptionEn-catalog-help">{fieldDisplay(catalog.config, 'descriptionEn')?.helpText}</FieldDescription> : null}
          </Field>
          <MaterialsEditor initial={initial?.materials ?? ''} suggestions={materialSuggestions}/>
          <Field>
            <FieldLabel htmlFor="originStory">The story behind this product — optional</FieldLabel>
            <FieldDescription>Share what inspired this particular product. Keep your general maker biography in the maker profile.</FieldDescription>
            <Textarea id="originStory" name="originStory" maxLength={2000} rows={5} placeholder="A short, genuine product-specific story" defaultValue={initial?.originStory ?? ''}/>
          </Field>
          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="dimensions">Dimensions</FieldLabel>
              <Input
                id="dimensions"
                name="dimensions"
                maxLength={500}
                placeholder="For example, 28 × 20 × 8 cm"
                defaultValue={initial?.dimensions ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="licenceReference">
                Licence reference, if required
              </FieldLabel>
              <Input
                id="licenceReference"
                name="licenceReference"
                maxLength={160}
                defaultValue={initial?.licenceReference ?? ''}
              />
            </Field>
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="size">Size</FieldLabel>
              <Input
                id="size"
                name="size"
                maxLength={300}
                placeholder="For example, Medium or 30 cm"
                defaultValue={initial?.size ?? ''}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="colour">Colour</FieldLabel>
              <Input
                id="colour"
                name="colour"
                maxLength={300}
                placeholder="For example, Natural brown"
                defaultValue={initial?.colour ?? ''}
              />
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="variations">Available variations</FieldLabel>
            <Textarea
              id="variations"
              name="variations"
              maxLength={1500}
              rows={3}
              placeholder="List the selectable sizes, colours, or other variants."
              defaultValue={initial?.variations ?? ''}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="specifications">
              Basic product specifications
            </FieldLabel>
            <Textarea
              id="specifications"
              name="specifications"
              maxLength={2000}
              rows={4}
              placeholder="Record other verified product specifications."
              defaultValue={initial?.specifications ?? ''}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="careInstructions">
              Care instructions
            </FieldLabel>
            <Textarea
              id="careInstructions"
              name="careInstructions"
              maxLength={1500}
              rows={3}
              defaultValue={initial?.careInstructions ?? ''}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="safetyInformation">
              Safe use and safety information
            </FieldLabel>
            <Textarea
              id="safetyInformation"
              name="safetyInformation"
              maxLength={1500}
              rows={3}
              defaultValue={initial?.safetyInformation ?? ''}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="warrantyOffered">
              Warranty or guarantee *
            </FieldLabel>
            {initial?.warranty ? (
              <p className="text-sm text-muted-foreground">
                Existing terms: {initial.warranty}. Keep these unless you intend
                to replace them.
              </p>
            ) : null}
            <NativeSelect
              id="warrantyOffered"
              name={
                warrantyChoice === 'preserve' ? undefined : 'warrantyOffered'
              }
              value={warrantyChoice}
              onChange={(event) => setWarrantyChoice(event.target.value)}
              required
            >
              {initial?.warranty ? (
                <NativeSelectOption value="preserve">
                  Keep existing terms
                </NativeSelectOption>
              ) : null}
              <NativeSelectOption value="no">No</NativeSelectOption>
              <NativeSelectOption value="yes">Yes</NativeSelectOption>
            </NativeSelect>
            {warrantyChoice === 'yes' ? (
              <div>
                <p className="text-sm text-muted-foreground">
                  Duration * — enter at least one positive unit; leave other
                  units blank.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  {['Years', 'Months', 'Days'].map((unit) => (
                    <Field key={unit}>
                      <FieldLabel htmlFor={'warranty' + unit}>
                        {unit}
                      </FieldLabel>
                      <Input
                        id={'warranty' + unit}
                        name={'warranty' + unit}
                        type="number"
                        min={0}
                        max={999999}
                        step={1}
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ) : null}
          </Field>
          <Field>
            <FieldLabel htmlFor="returnConditions">
              Return conditions {returnEligible ? '*' : '(optional)'}
            </FieldLabel>
            <Textarea
              id="returnConditions"
              name="returnConditions"
              required={returnEligible}
              maxLength={1500}
              minLength={10}
              rows={3}
              placeholder="State the condition, packaging, and exclusions that apply. Statutory rights still override listing terms."
              defaultValue={initial?.returnConditions ?? ''}
            />
          </Field>
          <div className="grid gap-5 md:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="preparationDays">
                Time needed to prepare the product (days) *
              </FieldLabel>
              <Input
                id="preparationDays"
                name="preparationDays"
                type="number"
                required
                min={0}
                max={180}
                step={1}
                defaultValue={initial?.preparationDays ?? 2}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="manufacturedAt">
                Manufacture date, if applicable
              </FieldLabel>
              <Input
                id="manufacturedAt"
                name="manufacturedAt"
                type="date"
                defaultValue={dateInputValue(initial?.manufacturedAt)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="expiresAt">
                Expiry date, if applicable
              </FieldLabel>
              <Input
                id="expiresAt"
                name="expiresAt"
                type="date"
                defaultValue={dateInputValue(initial?.expiresAt)}
              />
            </Field>
          </div>
          <Field orientation="horizontal">
            <Checkbox
              id="madeToOrder"
              name="madeToOrder"
              value="yes"
              defaultChecked={Boolean(initial?.madeToOrder)}
            />
            <FieldLabel htmlFor="madeToOrder" className="font-normal">
              Made to order
            </FieldLabel>
          </Field>
        </FieldGroup>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Price and stock</FieldLegend>
        <output
          aria-live="polite"
          className="text-sm font-semibold text-primary"
        >
          {discount ? `Customer price discount: ${discount}` : ''}
        </output>
        <FieldDescription>
          Enter Nepalese rupees. HastaBazaar stores money precisely in paisa.
        </FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          <Field>
            <FieldLabel htmlFor="compareAtPrice">
              Original price (NPR)
            </FieldLabel>
            <Input
              id="compareAtPrice"
              name="compareAtPrice"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setOriginalPrice(value);
                setDiscountPercent(discountPercentage(price, value));
              }}
              inputMode="decimal"
              placeholder="2000.00"
              value={originalPrice}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="discountPercentage">
              Discount percentage
            </FieldLabel>
            <Input
              id="discountPercentage"
              name="discountPercentage"
              type="number"
              min={0}
              max={99.99}
              step="0.01"
              placeholder="20"
              value={discountPercent}
              onChange={(event) => {
                const value = event.currentTarget.value;
                setDiscountPercent(value);
                const percent = Number(value);
                const original = Number(originalPrice);
                if (
                  Number.isFinite(percent) &&
                  percent >= 0 &&
                  percent < 100 &&
                  original > 0
                ) {
                  setPrice((original * (1 - percent / 100)).toFixed(2));
                }
              }}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="price">
              Current / selling price (NPR) *
            </FieldLabel>
            <Input
              id="price"
              name="price"
              onChange={(event) => {
                const value = event.currentTarget.value;
                setPrice(value);
                setDiscountPercent(discountPercentage(value, originalPrice));
              }}
              required
              inputMode="decimal"
              placeholder="1600.00"
              value={price}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="inventoryQuantity">
              Available quantity *
            </FieldLabel>
            <Input
              id="inventoryQuantity"
              name="inventoryQuantity"
              type="number"
              required
              min={0}
              max={1000000}
              step={1}
              defaultValue={initial?.inventoryQuantity ?? 1}
            />
          </Field>
        </FieldGroup>
        <Field orientation="horizontal">
          <Checkbox
            id="returnEligible"
            name="returnEligible"
            value="yes"
            checked={returnEligible}
            onCheckedChange={(checked) => setReturnEligible(Boolean(checked))}
          />
          <FieldLabel htmlFor="returnEligible" className="font-normal">
            Eligible for the standard HastaBazaar return policy
          </FieldLabel>
        </Field>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Product photos</FieldLegend>
        <FieldDescription>
          {isRevision
            ? `Manage the ${initial?.mediaCount ?? 0} saved photo(s), replace any image, or add more. At least four images must remain when you save.`
            : 'Attach at least four useful photos from different angles. Add as many additional images as the product needs. JPG, PNG, or WebP; maximum 5 MB each.'}
        </FieldDescription>
        <FieldGroup className="grid gap-5 md:grid-cols-2">
          {initial?.media
            .filter((media) => media.mimeType.startsWith('image/'))
            .map((media) => (
              <ExistingImageEditor
                key={media.id}
                media={media}
                removed={removedMedia.has(media.id)}
                onToggleRemoved={() =>
                  setRemovedMedia((current) => {
                    const next = new Set(current);
                    if (next.has(media.id)) next.delete(media.id);
                    else next.add(media.id);
                    return next;
                  })
                }
              />
            ))}
          {imageSlots.map((slot, index) => (
            <ImageUploadSlot
              key={slot}
              slot={index + 1 + (initial?.mediaCount ?? 0)}
              required={!isRevision && index < 4}
              removable={isRevision || index >= 4}
              onRemove={() =>
                setImageSlots((current) =>
                  current.filter((value) => value !== slot),
                )
              }
            />
          ))}
        </FieldGroup>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setImageSlots((current) => [...current, nextImageSlot]);
            setNextImageSlot((current) => current + 1);
          }}
        >
          <Plus /> Add Image
        </Button>
      </FieldSet>

      <FieldSet>
        <FieldLegend>Product video (optional)</FieldLegend>
        <FieldDescription>
          A short product demonstration: MP4, up to 20 MB and 60 seconds.
          Preview, replace, or remove it at any time.
        </FieldDescription>
        <VideoUploadControl
          existing={initial?.media.find(
            (media) => media.mimeType === 'video/mp4',
          )}
        />
      </FieldSet>

      {state.status === 'error' ? (
        <Alert variant="destructive">
          <AlertTitle>Product not submitted</AlertTitle>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      ) : null}

      {catalog.config ? <ConfiguredFields config={catalog.config} baseKeys={catalogBaseKeys} /> : null}
      {catalog.status !== 'ready' ? <p role="alert" className="text-sm text-destructive">{catalog.message || 'Form configuration is unavailable. Please try again.'}</p> : null}
      <div className="flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
        <p className="flex max-w-xl items-start gap-2 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />
          Submission starts review. It does not publish the listing
          automatically.
        </p>
        <Button
          type="submit"
          size="lg"
          className="h-11 px-6"
          disabled={state.status === 'submitting' || !catalog.canSubmit}
        >
          {state.status === 'submitting' ? (
            <>
              <LoaderCircle className="animate-spin" /> Submitting…
            </>
          ) : isRevision ? (
            initial?.status === 'rejected' ||
            initial?.status === 'needs_changes' ? (
              'Resubmit for approval'
            ) : (
              'Save changes'
            )
          ) : (
            mode === 'draft' ? 'Save private product draft' : 'Submit product for review'
          )}
        </Button>
      </div>
    </form>
  );
}
