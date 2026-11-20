import type { FormId, PublishedFormConfig } from './types';
import { NATIVE_TASK_FORM_IDS, PUBLIC_NATIVE_FORM_IDS } from './catalog-policy';

// These features own their actual controls and domain validation. No editable
// extra fields are invented when their optional catalogue has no publication.
export const LEGACY_CORE_FORM_IDS: ReadonlySet<string> = new Set<FormId>(['seller.application', 'seller.product-submission', 'seller.profile', 'seller.maker-profile', 'seller.inventory']);
const nativeDefinitions = new WeakSet<PublishedFormConfig>();
export function isCoreFormDefinition(config: PublishedFormConfig): boolean { return nativeDefinitions.has(config); }
export function coreFormContract(formId: FormId): PublishedFormConfig | null {
  if (!LEGACY_CORE_FORM_IDS.has(formId) && !NATIVE_TASK_FORM_IDS.has(formId) && !PUBLIC_NATIVE_FORM_IDS.has(formId)) return null;
  const config: PublishedFormConfig = { formId, version: 1, publishedAt: 0, fields: [] };
  nativeDefinitions.add(config);
  return config;
}
export function coreFormVersionId(formId: FormId): string { return `core:${formId}:1`; }
export function coreFormReceiptId(formId: string, requestId: string): string {
  if (!LEGACY_CORE_FORM_IDS.has(formId) || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)) throw new Error('Invalid core form request.');
  return `core-form:${formId}:${requestId}`;
}
