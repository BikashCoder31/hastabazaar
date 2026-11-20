import type { ConfiguredField } from './types';

// Only these feature adapters validate the retained values against current domain rules.
export const compatibilityAwareSellerForms = new Set([
  'seller.application', 'seller.product-submission', 'seller.profile', 'seller.maker-profile',
]);

/** Presentation-only edits retain stable answer meaning and never waive a requirement. */
export function formAnswerContractsMatch(before: readonly ConfiguredField[], after: readonly ConfiguredField[], reviewedWording = false): boolean {
  const wording = (value?: string) => (value ?? '').trim().replace(/\s+/g, ' ');
  const contract = (fields: readonly ConfiguredField[]) => fields.map(field => ({
    id: field.id, key: field.key, type: field.type, required: field.required, status: field.status,
    min: field.min ?? null, max: field.max ?? null, integerOnly: field.integerOnly ?? false,
    // Wording can change meaning. Automatic compatibility covers whitespace
    // and ordering only; arbitrary edits require an explicit reviewed policy.
    label: reviewedWording ? null : wording(field.label), helpText: reviewedWording ? null : wording(field.helpText), placeholder: reviewedWording ? null : wording(field.placeholder),
    choices: field.choices?.map(choice => ({ value: choice.value, label: reviewedWording ? null : wording(choice.label) })).sort((a, b) => a.value.localeCompare(b.value)) ?? null,
  })).sort((left, right) => left.id.localeCompare(right.id));
  return JSON.stringify(contract(before)) === JSON.stringify(contract(after));
}

export function formChangeSummary(before: readonly ConfiguredField[], after: readonly ConfiguredField[]): string[] {
  const previous = new Map(before.map(field => [field.id, field]));
  const changes: string[] = [];
  for (const field of after) {
    const old = previous.get(field.id);
    if (!old) { if (field.status === 'active') changes.push(`Add “${field.label}”${field.required ? ' as a required question' : ''}.`); continue; }
    if (old.status !== field.status) changes.push(`${field.status === 'archived' ? 'Hide' : 'Show'} “${field.label}” on new submissions.`);
    if (old.required !== field.required) changes.push(`Make “${field.label}” ${field.required ? 'required' : 'optional'}.`);
    if (old.label !== field.label || old.helpText !== field.helpText || old.placeholder !== field.placeholder) changes.push(`Update the wording for “${field.label}”.`);
    if (JSON.stringify(old.choices) !== JSON.stringify(field.choices)) changes.push(`Change the answer choices for “${field.label}”.`);
    if (old.min !== field.min || old.max !== field.max || old.integerOnly !== field.integerOnly) changes.push(`Change the allowed numbers for “${field.label}”.`);
    if (old.order !== field.order) changes.push(`Move “${field.label}” to a different position.`);
  }
  const currentIds = new Set(after.map(field => field.id));
  for (const field of before) if (!currentIds.has(field.id)) changes.push(`Remove the saved settings for “${field.label}”.`);
  return changes;
}
