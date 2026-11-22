import type { ReadinessIssue } from './category-fields';

export const productSteps = ['Photos', 'About it', 'Price & stock', 'Details & delivery', 'Check & send'] as const;

const aboutFields = new Set(['nameEn', 'nameNe', 'descriptionEn', 'descriptionNe', 'category', 'categoryId', 'condition', 'occasionIds']);
const offerFields = new Set(['price', 'compareAtPrice', 'inventoryQuantity', 'sellerSku', 'offers']);

export function stepForProductField(field: string) {
  if (field === 'coverImage') return 0;
  if (aboutFields.has(field)) return 1;
  if (offerFields.has(field)) return 2;
  return 3;
}

export function groupProductStepIssues(publication: readonly ReadinessIssue[], photoCount: number, stock: string) {
  const groups: ReadinessIssue[][] = [[], [], [], []];
  if (photoCount < 3 || photoCount > 8) groups[0].push({
    field: 'coverImage',
    reason: photoCount < 3 ? 'Add at least 3 photos of the actual product.' : 'Keep up to 8 product photos.',
    code: photoCount < 3 ? 'missing' : 'invalid',
  });
  for (const issue of publication) {
    if (issue.field === 'coverImage' || issue.code === 'eligibility') continue;
    groups[stepForProductField(issue.field)].push(issue);
  }
  if (!/^\d+$/.test(stock) || !Number.isSafeInteger(Number(stock))) groups[2].push({
    field: 'inventoryQuantity', reason: 'Enter the number you can sell, including 0 if none are ready.', code: 'invalid',
  });
  return groups;
}

export function firstProductStep(issues: readonly (readonly ReadinessIssue[])[]) {
  const next = issues.findIndex(rows => rows.length > 0);
  return next === -1 ? productSteps.length - 1 : next;
}
