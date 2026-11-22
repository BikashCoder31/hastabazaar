import { coreFormReceiptId } from './core-receipts';
import type { PublishedFormConfig } from './types';
import type { FormId } from './types';
import { FORM_REGISTRY } from './registry';
import { FormRuntimeError, resolvePublishedForm } from './runtime';
import { FormValidationError, validateAnswersForDefinition, validateFormDraft } from './validation';
import { formChangeSummary } from './catalog-changes';
import { coreFormContract, coreFormVersionId, isCoreFormDefinition } from './core-contracts';
import { allowsPreviousFormVersion } from './compatibility';
import {canonicalKey} from './field-keys';
export {canonicalKey} from './field-keys';

export {readConfiguredSubmission,configuredJsonPayload,digestFormRequest,digestMultipartRequest,configuredMultipartAnswers,type ConfiguredSubmission} from './client-submission';

export class FormRequestConflictError extends Error {}

/** A rejected domain batch can expose a publication race after preflight validation. */
export async function isValidatedFormVersionStale(db: D1Database, formId: FormId,
  validatedVersionId: string | undefined): Promise<boolean> {
  if (!validatedVersionId) return false;
  const latest = await db.prepare(`SELECT id FROM form_config_versions WHERE form_id=?
    AND status='published' ORDER BY version DESC LIMIT 1`)
    .bind(formId).first<{ id: string }>();
  return Boolean(latest && latest.id !== validatedVersionId);
}

export async function validateSellerFormSubmission(db: D1Database, formId: FormId,
  version: unknown, raw: unknown, replayRequestId?: string, builtInValues: Readonly<Record<string, unknown>> = {},
  options: { deferRegistrationDescription?: boolean; optionalRegistration?: boolean } = {}) {
  let config = await resolvePublishedForm(db, formId);
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
    throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
  let row = await db.prepare(`SELECT id FROM form_config_versions WHERE form_id=? AND version=? AND status='published' LIMIT 1`)
    .bind(formId, config.version).first<{ id: string }>();
  let retainedSnapshot = false;
  const core = coreFormContract(formId);
  const priorCore = core && replayRequestId && await db.prepare(`SELECT id FROM audit_logs WHERE id=? AND action='form.core_answers'`)
    .bind(coreFormReceiptId(formId, replayRequestId)).first();
  if (core && (priorCore || isCoreFormDefinition(config))) {
    config = core;
    row = { id: coreFormVersionId(formId) };
  }
  if (!priorCore && replayRequestId) {
    const receipt = await db.prepare(`SELECT v.id,v.version,v.config_json AS configJson,v.published_at AS publishedAt,f.answers_json AS answersJson
      FROM form_answer_sets f JOIN form_config_versions v ON v.id=f.config_version_id AND v.form_id=f.form_id
      WHERE f.form_id=? AND f.request_id=? AND v.status='published' LIMIT 1`)
      .bind(formId, replayRequestId).first<{id:string;version:number;configJson:string;publishedAt:number;answersJson:string}>();
    if (receipt) {
      try {
        const saved = JSON.parse(receipt.answersJson) as {version:number;presentedVersion?:number};
        if ((saved.presentedVersion ?? saved.version) !== version) throw new Error('Different displayed version');
        config = { ...validateFormDraft(formId, JSON.parse(receipt.configJson)), version: receipt.version, publishedAt: receipt.publishedAt };
        row = { id: receipt.id };
        retainedSnapshot = true;
      } catch { throw new FormRuntimeError('stale_version', 'The saved attempt used a different form. Retry its original answers or start a new attempt.'); }
    }
  }
  if (version !== config.version && !retainedSnapshot) {
    // A prior exact request remains replayable after a later publication, but
    // a new request may cross only cosmetic-compatible definitions.
    const previous = await db.prepare(`SELECT id,config_json AS configJson,published_at AS publishedAt
      FROM form_config_versions WHERE form_id=? AND version=? AND status='published' LIMIT 1`)
      .bind(formId, version).first<{ id: string; configJson: string; publishedAt: number }>();
    const priorAnswer = previous && replayRequestId && await db.prepare(`SELECT 1 AS valid FROM form_answer_sets
      WHERE form_id=? AND request_id=? AND config_version_id=? LIMIT 1`)
      .bind(formId, replayRequestId, previous.id).first<{ valid: number }>();
    if (!previous)
      throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    let previousConfig: PublishedFormConfig;
    try {
      if (new TextEncoder().encode(previous.configJson).length > 65536 ||
        !Number.isSafeInteger(previous.publishedAt) || previous.publishedAt < 0) throw new Error('Invalid history');
      previousConfig = { ...validateFormDraft(formId, JSON.parse(previous.configJson)),
        version, publishedAt: previous.publishedAt };
    } catch {
      throw new FormRuntimeError('config_unavailable', 'Historical form configuration is unavailable.');
    }
    if (priorAnswer) {
      config = previousConfig;
      row = { id: previous.id };
    } else if (!await allowsPreviousFormVersion(db, { formId, fromVersion: version, toVersion: config.version,
      before: previousConfig.fields, after: config.fields, now: Date.now() })) {
      const changes = formChangeSummary(previousConfig.fields, config.fields).slice(0, 4).join(' ');
      throw new FormRuntimeError('stale_version', `This form changed. ${changes} Review the updated questions; your entered answers are retained.`);
    }
    // A new cosmetic-compatible request is checked and recorded against CURRENT
    // config; the transaction-time answer guard still rejects another publication.
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
  // Registration no longer collects the product/work description. Preserve
  // historical published definitions and all custom-field validation; only
  // this explicitly moved built-in is omitted from the new intake contract.
  let validationConfig = formId === 'seller.application' && options.deferRegistrationDescription
    ? { ...config, fields: config.fields.filter(field => field.key !== 'businessDescription') } : config;
  if (formId === 'seller.application' && options.optionalRegistration)
    validationConfig = { ...validationConfig, fields: validationConfig.fields.map(field => ({ ...field, required: false })) };
  const answers = validateAnswersForDefinition(FORM_REGISTRY[formId], validationConfig,
    [...raw, ...builtInAnswers.filter(answer => validationConfig.fields.some(field => field.id === answer.fieldId))]);
  if (!row) throw new FormRuntimeError('config_unavailable', 'Published form version unavailable');
  return { versionId: row.id, answers: { ...answers, ...(version !== config.version ? { presentedVersion: version } : {}) }, config };
}

const applicationMultipartKeys = new Set([
  'formVersion', 'requestId', 'hasBusinessTaxRegistration', 'applicantType', 'legalName',
  'tradingName', 'registrationAuthority', 'registrationNumber', 'taxStatus', 'taxMode',
  'taxRegistrationNumber', 'representativeName', 'email', 'phone', 'phoneCountry', 'province', 'district',
  'municipality', 'ward', 'locality', 'publicCity', 'productCategories', 'businessDescription',
  'experienceCraft', 'experienceBand', 'profileImage', 'makerVideo', 'facebookUrl',
  'instagramUrl', 'linkedinUrl', 'tiktokUrl', 'xUrl', 'youtubeUrl', 'acceptedTerms',
  'sellerAgreementContext', 'applicationAcknowledgement', 'governmentIdType', 'governmentIdDescription', 'personalPan', 'managedAgreementAccepted', 'managedAgreementVersion', 'managedAgreementContext', 'personalPanCertificate', 'representativeIdentity', 'bankVerification',
  'businessRegistration', 'panCertificate', 'vatCertificate', 'website', 'participationRoute',
  'payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber', 'pickupAddress', 'returnAddress',
  'document',
]);
const applicationFileKeys = new Set(['personalPanCertificate', 'profileImage', 'makerVideo', 'representativeIdentity',
  'bankVerification', 'businessRegistration', 'panCertificate', 'vatCertificate', 'document']);
const productMultipartKeys = new Set([
  'formVersion', 'requestId', 'reviewRequestId', 'categoryId', 'nameEn', 'nameNe',
  'descriptionEn', 'descriptionNe', 'price', 'compareAtPrice', 'discountPercentage',
  'inventoryQuantity', 'preparationDays', 'occasionIds', 'madeToOrder', 'returnEligible',
  'materials', 'producer', 'sku', 'sellerSku', 'originStory', 'countryOfOrigin', 'originEvidenceReference', 'dimensions', 'size', 'colour', 'variations',
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
    const fileControl = fileKeys.has(key) || replacementImage;
    // Native multipart parsing represents an unselected filename="" file as
    // empty text. Accept that absence only for known file controls; domain
    // validators still enforce required uploads and selected-file contents.
    if (fileControl ? !(value instanceof File) && value !== '' : value instanceof File)
      throw new FormValidationError('invalid_answer', 'Unsupported form control value.');
  }
}

/** Replays only the same actor, operation, parent and payload; a reused key never authorizes a new write. */
export async function formRequestReplay(db: D1Database, input: {
  formId: string; requestId: string; actorId: string; action: string; digest: string; subjectId?: string;
}): Promise<string | null> {
  const coreId = coreFormContract(input.formId) ? coreFormReceiptId(input.formId, input.requestId) : '';
  const value = (db as D1Database & { dialect?: string }).dialect === 'mariadb' ? 'JSON_VALUE' : 'json_extract';
  // These two real profile adapters keep the seller parent on their answer
  // receipt and seller_profile on the domain audit. No other type is aliased.
  const coreSubject = input.formId === 'seller.profile' || input.formId === 'seller.maker-profile' ? "'seller'" : 'a.subject_type';
  const rows = await db.prepare(`SELECT a.actor_id AS actorId,a.action,a.subject_type AS subjectType,
      a.subject_id AS subjectId,a.next_json AS nextJson,COALESCE(f.form_id,${value}(cf.next_json,'$.formId')) AS formId
    FROM audit_logs a LEFT JOIN form_answer_sets f ON f.request_id=a.request_id AND f.form_id=?
    LEFT JOIN audit_logs cf ON cf.id=? AND cf.action='form.core_answers' AND cf.actor_id=a.actor_id
      AND cf.subject_type=${coreSubject} AND HEX(cf.subject_type)=HEX(${coreSubject})
      AND cf.subject_id=a.subject_id AND HEX(cf.subject_id)=HEX(a.subject_id)
      AND HEX(cf.actor_id)=HEX(a.actor_id)
    WHERE a.request_id=? LIMIT 2`).bind(input.formId, coreId, input.requestId).all<{
      actorId: string | null; action: string; subjectType: string; subjectId: string;
      nextJson: string | null; formId: string | null;
    }>();
  if (rows.results.length === 0) {
    const orphan = await db.prepare(`SELECT id FROM form_answer_sets WHERE form_id=? AND request_id=? LIMIT 1`)
      .bind(input.formId, input.requestId).first();
    if (orphan) throw new FormRequestConflictError('Request reference is already used.');
    if (coreId && await db.prepare("SELECT id FROM audit_logs WHERE id=? AND action='form.core_answers'").bind(coreId).first())
      throw new FormRequestConflictError('Request reference is already used.');
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
