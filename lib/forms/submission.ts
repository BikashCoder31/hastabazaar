import type { PublishedFormConfig } from './types';
import type { FormId } from './types';
import { FORM_REGISTRY } from './registry';
import { FormRuntimeError, resolvePublishedForm } from './runtime';
import { FormValidationError, validateAnswersForDefinition, validateFormDraft } from './validation';

export interface ConfiguredSubmission {
  version: number;
  answers: Record<string, unknown>;
}

/** Reads only namespaced, currently active controls. Domain fields remain with their owning parser. */
export function readConfiguredSubmission(form: HTMLFormElement, config: PublishedFormConfig, baseKeys: readonly string[]): ConfiguredSubmission {
  const data = new FormData(form);
  const versions = data.getAll('formVersion');
  const rawVersion = versions[0];
  const version = typeof rawVersion === 'string' && /^[1-9]\d*$/.test(rawVersion) ? Number(rawVersion) : NaN;
  if (versions.length !== 1 || !Number.isSafeInteger(version) || version !== config.version) {
    throw new Error('Form version changed. Refresh and try again.');
  }
  const answers: Record<string, unknown> = {};
  const builtIns = new Set(baseKeys.map(canonicalKey));
  for (const field of config.fields) {
    if (field.status !== 'active' || builtIns.has(canonicalKey(field.key))) continue;
    const values = data.getAll(`custom.${field.key}`);
    if (values.some((value) => typeof value !== 'string')) throw new Error('Unsupported form answer.');
    if (field.type === 'multiple_choice') {
      if (field.required && !values.length) throw new Error('Required choice missing.');
      if (values.length) answers[field.id] = values;
    } else if (field.type === 'checkbox') {
      answers[field.id] = values.length > 0;
    } else if (values.length > 1) {
      throw new Error('Duplicate form answer.');
    } else if (values.length && values[0] !== '') {
      if (field.type === 'number') {
        const number = Number(values[0]);
        if (!Number.isFinite(number)) throw new Error('Invalid numeric answer.');
        answers[field.id] = number;
      } else answers[field.id] = values[0];
    }
  }
  return { version, answers };
}

/** The server validator accepts fieldId/value entries, preserving published field order. */
export function canonicalKey(key: string): string { return key.replace(/[^a-z0-9]/gi, '').toLowerCase(); }

export function configuredJsonPayload(config: PublishedFormConfig, answers: Record<string, unknown>, baseKeys: readonly string[]) {
  const builtIns = new Set(baseKeys.map(canonicalKey));
  return {
    formVersion: config.version,
    customAnswers: config.fields.filter((field) => field.status === 'active' && !builtIns.has(canonicalKey(field.key)) && Object.hasOwn(answers, field.id))
      .map((field) => ({ fieldId: field.id, value: answers[field.id] })),
  };
}

export async function digestFormRequest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** File bytes, not just filenames, bind a multipart retry to its original upload. */
export async function digestMultipartRequest(form: FormData): Promise<string> {
  const entries: unknown[] = [];
  for (const [key, value] of form) {
    if (key === 'requestId') continue;
    entries.push([key, value instanceof File ? {
      name: value.name, type: value.type, size: value.size,
      digest: await digestFormBytes(await value.arrayBuffer()),
    } : value]);
  }
  return digestFormRequest(entries);
}

async function digestFormBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class FormRequestConflictError extends Error {}

export async function validateSellerFormSubmission(db: D1Database, formId: FormId,
  version: unknown, raw: unknown, replayRequestId?: string, builtInValues: Readonly<Record<string, unknown>> = {}) {
  let config = await resolvePublishedForm(db, formId);
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
  let row = await db.prepare(`SELECT id FROM form_config_versions WHERE form_id=? AND version=? AND status='published' LIMIT 1`)
    .bind(formId, config.version).first<{ id: string }>();
  if (version !== config.version) {
    // A prior exact request remains replayable after a later publication, but
    // a new request may never submit against an obsolete field definition.
    const previous = replayRequestId && await db.prepare(`SELECT id,config_json AS configJson,published_at AS publishedAt
      FROM form_config_versions WHERE form_id=? AND version=? AND status='published' LIMIT 1`)
      .bind(formId, version).first<{ id: string; configJson: string; publishedAt: number }>();
    const priorAnswer = previous && await db.prepare(`SELECT 1 AS valid FROM form_answer_sets
      WHERE form_id=? AND request_id=? AND config_version_id=? LIMIT 1`)
      .bind(formId, replayRequestId, previous.id).first<{ valid: number }>();
    if (!previous || !priorAnswer)
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    try {
      if (new TextEncoder().encode(previous.configJson).length > 65536 ||
        !Number.isSafeInteger(previous.publishedAt) || previous.publishedAt < 0) throw new Error('Invalid history');
      config = { ...validateFormDraft(formId, JSON.parse(previous.configJson)),
        version, publishedAt: previous.publishedAt };
    } catch {
      throw new FormRuntimeError('config_unavailable', 'Historical form configuration is unavailable.');
    }
    row = { id: previous.id };
  }
  if (!Array.isArray(raw)) throw new FormValidationError('invalid_answer', 'Malformed answer payload');
  const base = new Set(FORM_REGISTRY[formId].baseFields.map((field) => canonicalKey(field.key)));
  for (const item of raw) {
    if (item && typeof item === 'object' && !Array.isArray(item) && 'fieldId' in item && typeof item.fieldId === 'string') {
      const configured = config.fields.find((field) => field.id === item.fieldId);
      if (configured && base.has(canonicalKey(configured.key)))
        throw new FormValidationError('invalid_answer', 'Built-in values cannot be submitted as custom answers.');
    }
  }
  // Domain controls are validated by their existing parser/repository. Include
  // only registered safe built-ins here so catalog requiredness is checked;
  // validateAnswersForDefinition deliberately excludes them from snapshots.
  const builtInAnswers = config.fields.filter((field) => field.status === 'active' &&
    FORM_REGISTRY[formId].baseFields.some((baseField) => baseField.key === field.key && baseField.capability !== 'protected') &&
    Object.hasOwn(builtInValues, field.key))
    .map((field) => ({ fieldId: field.id, value: builtInValues[field.key] }));
  const answers = validateAnswersForDefinition(FORM_REGISTRY[formId], config, [...raw, ...builtInAnswers]);
  if (!row) throw new FormRuntimeError('config_unavailable', 'Published form version unavailable');
  return { versionId: row.id, answers, config };
}

export function configuredMultipartAnswers(form: FormData, config: PublishedFormConfig): {
  version: number; requestId: string; customAnswers: { fieldId: string; value: unknown }[];
} {
  const versions = form.getAll('formVersion');
  const requests = form.getAll('requestId');
  const version = versions[0];
  const requestId = requests[0];
  if (versions.length !== 1 || typeof version !== 'string' || !/^[1-9]\d*$/.test(version) ||
    requests.length !== 1 || typeof requestId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))
    throw new FormValidationError('invalid_answer', 'Form version and request reference are required.');
  if (Number(version) !== config.version)
    throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
  const active = new Map(config.fields.filter((field) => field.status === 'active').map((field) => [field.key, field]));
  const base = new Set(FORM_REGISTRY[config.formId].baseFields.map((field) => canonicalKey(field.key)));
  const seen = new Set<string>();
  for (const [key, value] of form) {
    if (!key.startsWith('custom.')) continue;
    const field = active.get(key.slice('custom.'.length));
    if (!field || base.has(canonicalKey(field.key)) || value instanceof File) throw new FormValidationError('invalid_answer', 'Unknown or unsupported form answer.');
    if (seen.has(key) && field.type !== 'multiple_choice') throw new FormValidationError('invalid_answer', 'Duplicate form answer.');
    seen.add(key);
  }
  const customAnswers: { fieldId: string; value: unknown }[] = [];
  for (const field of config.fields) {
    if (field.status !== 'active' || base.has(canonicalKey(field.key))) continue;
    const values = form.getAll(`custom.${field.key}`);
    if (field.type === 'checkbox') {
      customAnswers.push({ fieldId: field.id, value: values.length > 0 });
    } else if (field.type === 'multiple_choice') {
      if (values.length) customAnswers.push({ fieldId: field.id, value: values });
    } else if (values.length && values[0] !== '') {
      const value = values[0];
      if (typeof value !== 'string') throw new FormValidationError('invalid_answer', 'Unsupported form answer.');
      if (field.type === 'number') {
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim()))
          throw new FormValidationError('invalid_answer', 'Invalid numeric answer.', field.id);
        customAnswers.push({ fieldId: field.id, value: Number(value) });
      } else customAnswers.push({ fieldId: field.id, value });
    }
  }
  return { version: Number(version), requestId, customAnswers };
}

const applicationMultipartKeys = new Set([
  'formVersion', 'requestId', 'hasBusinessTaxRegistration', 'applicantType', 'legalName',
  'tradingName', 'registrationAuthority', 'registrationNumber', 'taxStatus', 'taxMode',
  'taxRegistrationNumber', 'representativeName', 'email', 'phone', 'province', 'district',
  'municipality', 'ward', 'locality', 'publicCity', 'productCategories', 'businessDescription',
  'experienceCraft', 'experienceBand', 'profileImage', 'makerVideo', 'facebookUrl',
  'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl', 'acceptedTerms',
  'applicationAcknowledgement', 'representativeIdentity', 'bankVerification',
  'businessRegistration', 'panCertificate', 'vatCertificate', 'website', 'participationRoute',
  'document',
]);
const applicationFileKeys = new Set(['profileImage', 'makerVideo', 'representativeIdentity',
  'bankVerification', 'businessRegistration', 'panCertificate', 'vatCertificate', 'document']);
const productMultipartKeys = new Set([
  'formVersion', 'requestId', 'reviewRequestId', 'categoryId', 'nameEn', 'nameNe',
  'descriptionEn', 'descriptionNe', 'price', 'compareAtPrice', 'discountPercentage',
  'inventoryQuantity', 'preparationDays', 'occasionIds', 'madeToOrder', 'returnEligible',
  'materials', 'producer', 'sku', 'originStory', 'dimensions', 'size', 'colour', 'variations',
  'specifications', 'careInstructions', 'safetyInformation', 'returnConditions',
  'warrantyOffered', 'warranty', 'warrantyYears', 'warrantyMonths', 'manufacturedAt',
  'expiresAt', 'licenceReference', 'image1', 'image2', 'image3', 'image4', 'image5',
  'images', 'video', 'replacementVideo', 'removeMediaId',
]);
const productFileKeys = new Set(['image1', 'image2', 'image3', 'image4', 'image5',
  'images', 'video', 'replacementVideo']);
const productRepeatedKeys = new Set(['occasionIds', 'materials', 'images', 'removeMediaId']);

/** Reject unknown domain controls and duplicate scalars before replay or parser access. */
export function validateSellerMultipartStructure(form: FormData,
  formId: 'seller.application' | 'seller.product-submission'): void {
  const allowed = formId === 'seller.application' ? applicationMultipartKeys : productMultipartKeys;
  const fileKeys = formId === 'seller.application' ? applicationFileKeys : productFileKeys;
  const seen = new Set<string>();
  for (const [key, value] of form) {
    if (key.startsWith('custom.')) continue; // Publication-specific validation follows.
    const replacementImage = formId === 'seller.product-submission' && /^replaceImage:[a-zA-Z0-9_-]{1,100}$/.test(key);
    if (!allowed.has(key) && !replacementImage)
      throw new FormValidationError('invalid_answer', 'Unknown form control.');
    if (seen.has(key) && (formId === 'seller.application' || !productRepeatedKeys.has(key)))
      throw new FormValidationError('invalid_answer', 'Duplicate form control.');
    seen.add(key);
    if ((fileKeys.has(key) || replacementImage) !== (value instanceof File))
      throw new FormValidationError('invalid_answer', 'Unsupported form control value.');
  }
}

/** Replays only the same actor, operation, parent and payload; a reused key never authorizes a new write. */
export async function formRequestReplay(db: D1Database, input: {
  formId: string; requestId: string; actorId: string; action: string; digest: string; subjectId?: string;
}): Promise<string | null> {
  const rows = await db.prepare(`SELECT a.actor_id AS actorId,a.action,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.next_json AS nextJson,f.form_id AS formId
    FROM audit_logs a LEFT JOIN form_answer_sets f ON f.request_id=a.request_id AND f.form_id=?
    WHERE a.request_id=? LIMIT 2`).bind(input.formId, input.requestId).all<{
      actorId: string | null; action: string; subjectType: string; subjectId: string;
      nextJson: string | null; formId: string | null;
    }>();
  if (rows.results.length === 0) {
    const orphan = await db.prepare(`SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1`)
      .bind(input.formId, input.requestId).first();
    if (orphan) throw new FormRequestConflictError('Request reference is already used.');
    return null;
  }
  if (rows.results.length !== 1) throw new FormRequestConflictError('Request reference is already used.');
  const row = rows.results[0];
  let recorded: unknown;
  try { recorded = row.nextJson && JSON.parse(row.nextJson); } catch { /* Invalid persisted audit is a conflict. */ }
  if (row.actorId !== input.actorId || row.action !== input.action || row.formId !== input.formId ||
    row.subjectType !== (input.formId === 'seller.maker-profile' || input.formId === 'seller.profile' ? 'seller_profile'
      : input.formId.startsWith('seller.product') || input.formId === 'seller.inventory' ? 'product'
      : input.formId === 'seller.shipping-request' ? 'shipping_job'
      : input.formId === 'seller.shipping-action' ? 'shipping_job_event'
      : input.formId === 'shipping.console-request' ? 'shipping_job'
      : input.formId === 'shipping.console-action-seller' || input.formId === 'shipping.console-action-staff' ? 'shipping_job_event'
      : input.formId === 'seller.payout-request' ? 'payout_request'
      : input.formId === 'seller.review-reply' ? 'review_reply'
      : input.formId === 'seller.managed-supply-proposal' ? 'managed_supply'
      : input.formId === 'seller.managed-transition-request' ? 'seller_route_transition' : 'seller') ||
    input.subjectId && row.subjectId !== input.subjectId ||
    !recorded || typeof recorded !== 'object' || !('catalogDigest' in recorded) ||
    recorded.catalogDigest !== input.digest) throw new FormRequestConflictError('Request reference is already used for different content.');
  return row.subjectId;
}
