import { Check, TriangleAlert } from 'lucide-react';
import { evaluateCategoryReadiness, type CategoryDetailModel, type ReadinessIssue } from '@/lib/products/category-fields';
import type { IntakeSnapshot } from '@/lib/products/intake-workspace';
import { validateOfferMatrix } from '@/lib/products/offer-contracts';
import type { ProductWorkspace } from './use-product-intake';

const groups = [
  { label: 'At least one photo', fields: ['coverImage'] },
  { label: 'Name and category', fields: ['nameEn', 'categoryId', 'condition'] },
  { label: 'Description', fields: ['descriptionEn'] },
  { label: 'Price and stock', fields: ['price', 'inventoryQuantity', 'offers', 'compareAtPrice', 'sellerSku'] },
  { label: 'Materials and size', fields: ['materials', 'size', 'dimensions', 'sizeGuide'], categorySpecific: true },
  { label: 'Country of origin', fields: ['countryOfOrigin'], categorySpecific: true },
  { label: 'What customers receive', fields: ['unitContents', 'packQuantity'] },
  { label: 'Return terms and category details', fields: [], categorySpecific: true },
] as const;
const groupedFields = new Set<string>(groups.flatMap(group => group.fields));

export function readinessChecks(snapshot: IntakeSnapshot, category: CategoryDetailModel, saved: ProductWorkspace | null, unchanged: boolean) {
  const first = snapshot.offers.offers.find(row => row.included);
  const photos = new Set(saved?.uploads.filter(file => file.state === 'ready' && file.mimeType.startsWith('image/')).map(file => file.id));
  const coverImage = snapshot.mediaIds.find(id => photos.has(id)) ?? '';
  const savedGuidance = unchanged && saved?.guidance.categoryVersionId === category.versionId ? saved?.guidance : null;
  const issues: ReadinessIssue[] = savedGuidance
    ? savedGuidance.publication.filter(issue => issue.code !== 'eligibility')
    : evaluateCategoryReadiness(category, { ...snapshot.answers, ...(first ? { price: first.price } : {}), coverImage })
      .publication.filter(issue => issue.code !== 'eligibility');
  const currentIssues = [...issues];
  if (saved?.publication?.needsRebase && !currentIssues.some(issue => issue.field === 'publicBase')) {
    currentIssues.push({ field: 'publicBase', reason: 'Review the changes to the current public listing.', code: 'policy' });
  }
  if (!savedGuidance) {
    const matrix = validateOfferMatrix(snapshot.offers);
    for (const reason of matrix.issues) currentIssues.push({ field: 'offers', reason, code: 'invalid' });
    if (matrix.matrix.offers.some(row => row.included && row.mediaId && (!snapshot.mediaIds.includes(row.mediaId) || !photos.has(row.mediaId)))) {
      currentIssues.push({ field: 'offers', reason: 'Choose an attached photo for this offer.', code: 'invalid' });
    }
  }
  const unknownCategory: ReadinessIssue = {
    field: 'categoryId', reason: 'Choose a reviewed category to see which details it requires.', code: 'policy',
  };
  return groups.map(group => ({
    label: group.label,
    issue: currentIssues.find(issue => group.fields.length
      ? group.fields.some(field => field === issue.field)
      : !groupedFields.has(issue.field)) ??
      ('categorySpecific' in group && category.status !== 'available' ? unknownCategory : undefined),
  }));
}

export function ProductReviewReadiness({ checks, busy, onFocus, onReview }: {
  checks: ReturnType<typeof readinessChecks>;
  busy: boolean;
  onFocus: (field: string) => void;
  onReview: () => void;
}) {
  const complete = checks.filter(check => !check.issue).length;
  const remaining = checks.length - complete;
  return <section className="min-w-0 space-y-3 rounded-[0.9rem] border border-[#E4DACA] bg-white p-5" aria-labelledby="product-ready-heading">
    <div className="flex items-center justify-between gap-3">
      <h2 id="product-ready-heading" className="font-bold">Ready to send?</h2>
      <span aria-live="polite" className="text-sm font-bold tabular-nums">{complete} / {checks.length}</span>
    </div>
    <progress className="block h-1.5 w-full overflow-hidden rounded-full [&::-webkit-progress-bar]:bg-[#EBE2D0] [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-[#236548] [&::-moz-progress-bar]:bg-[#236548]" max={checks.length} value={complete} aria-labelledby="product-ready-heading" />
    <ul className="text-sm">
      {checks.map(({ label, issue }) => <li key={label}>
        {issue ? <button type="button" onClick={() => onFocus(issue.field)} className="flex min-h-11 w-full items-center gap-2 rounded-md text-left font-semibold text-[#A8232E] hover:underline">
          <TriangleAlert className="size-4 shrink-0" aria-hidden="true" /><span>{label}<span className="sr-only"> · {issue.reason}</span></span>
        </button> : <span className="flex min-h-8 items-center gap-2"><Check className="size-4 shrink-0 text-[#236548]" aria-label="Complete" />{label}</span>}
      </li>)}
    </ul>
    <button type="button" disabled={busy || remaining > 0} onClick={onReview} className="min-h-11 w-full rounded-[0.625rem] bg-[#A8232E] px-4 py-2 text-sm font-bold text-white hover:bg-[#8D1D27] disabled:bg-[#D99DA0]">Send for review</button>
    {remaining ? <p className="text-center text-sm text-[#46536F]">{remaining} {remaining === 1 ? 'check' : 'checks'} left. Open a check to find the field.</p> : null}
  </section>;
}
