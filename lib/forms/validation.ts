import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from './registry';
import type { ConfiguredField, CustomFieldType, FormAnswerSnapshot, FormConfigDraft, FormDefinition, FormId, PublishedFormConfig } from './types';

export type FormValidationCode = 'unknown_form' | 'adapter_unavailable' | 'invalid_draft' | 'invalid_answer';

export class FormValidationError extends Error {
  constructor(readonly code: FormValidationCode, message: string) {
    super(message);
    this.name = 'FormValidationError';
  }
}

const FIELD_TYPES: readonly CustomFieldType[] = ['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'];
const FIELD_KEYS = new Set(['id', 'key', 'type', 'label', 'helpText', 'placeholder', 'required', 'order', 'choices', 'status']);
const MAX_FIELDS = 64;
const MAX_CONFIG_BYTES = 65536;
const MAX_ANSWER_BYTES = 131072;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code: FormValidationCode, message: string): never {
  throw new FormValidationError(code, message);
}

function boundedString(value: unknown, max: number, optional = false): value is string {
  return typeof value === 'string' && (optional && value.length === 0 || value.trim().length > 0) && value.length <= max;
}

function isUnsafeName(value: string): boolean {
  const name = value.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return /password|passcode|credential|secret|token|otp|onetime|verificationcode|authcode|apikey|privatekey|cardnumber|cardcvv|cardcvc|cvv|cvc|payment|captcha|recaptcha|turnstile|honeypot|csrf/.test(name);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validChoice(value: unknown): value is { value: string; label: string } {
  return record(value) && hasOnlyKeys(value, new Set(['value', 'label'])) && boundedString(value.value, 100) && boundedString(value.label, 200);
}

function validField(value: unknown, definition: FormDefinition, adapterGrantsBuiltInEdits: boolean): value is ConfiguredField {
  if (!record(value) || !hasOnlyKeys(value, FIELD_KEYS)) return false;
  const { id, key, type, label, helpText, placeholder, required, order, choices, status } = value;
  if (!boundedString(id, 100) || !/^[a-z][a-z0-9_]*$/.test(id) || key !== id || isUnsafeName(id)) return false;
  if (!FIELD_TYPES.includes(type as CustomFieldType) || !definition.capabilities.customFieldTypes.includes(type as CustomFieldType)) return false;
  if (!boundedString(label, 200) || isUnsafeName(label) || (helpText !== undefined && !boundedString(helpText, 1000, true)) || (placeholder !== undefined && !boundedString(placeholder, 200, true))) return false;
  if (required !== true && required !== false || !Number.isSafeInteger(order) || (order as number) < 0 || (order as number) >= MAX_FIELDS) return false;
  if (status !== 'active' && status !== 'archived') return false;
  const base = definition.baseFields.find((item) => item.key.toLowerCase() === id.toLowerCase());
  if (base && (!adapterGrantsBuiltInEdits || base.capability === 'protected')) return false;
  if (type === 'single_choice' || type === 'multiple_choice') {
    if (!Array.isArray(choices) || choices.length < 2 || choices.length > 100 || !choices.every(validChoice)) return false;
    if (new Set(choices.map((choice: { value: string }) => choice.value)).size !== choices.length) return false;
  } else if (choices !== undefined) return false;
  return true;
}

/** Validate a draft against an explicit definition; production callers use validateFormDraft. */
export function validateFormDraftForDefinition(definition: FormDefinition, candidate: unknown, adapterGrantsBuiltInEdits = false): FormConfigDraft {
  if (!record(candidate) || !hasOnlyKeys(candidate, new Set(['formId', 'fields'])) || candidate.formId !== definition.id || !Array.isArray(candidate.fields) || candidate.fields.length > MAX_FIELDS) {
    return fail('invalid_draft', 'Malformed form draft');
  }
  if (candidate.fields.some((item) => !validField(item, definition, adapterGrantsBuiltInEdits))) return fail('invalid_draft', 'Invalid form field');
  const fields = candidate.fields as ConfiguredField[];
  if (new Set(fields.map((item) => item.id)).size !== fields.length || new Set(fields.map((item) => item.key.toLowerCase())).size !== fields.length) return fail('invalid_draft', 'Duplicate field');
  const encoded = JSON.stringify(candidate);
  if (new TextEncoder().encode(encoded).length > MAX_CONFIG_BYTES) return fail('invalid_draft', 'Form draft exceeds storage limit');
  return { formId: definition.id, fields: fields.map((item) => ({ ...item, ...(item.choices ? { choices: item.choices.map((choice) => ({ ...choice })) } : {}) })) };
}

export function validateFormDraft(formId: FormId, candidate: unknown): FormConfigDraft {
  const definition = FORM_REGISTRY[formId];
  if (!definition) return fail('unknown_form', 'Unknown form');
  const adapter = IMPLEMENTED_FORM_ADAPTERS[formId];
  const implemented = adapter?.formId === formId && adapter.route === definition.route && adapter.mode === definition.mode && adapter.formId === definition.id && !definition.adapterId.startsWith('pending:');
  if (record(candidate) && Array.isArray(candidate.fields) && candidate.fields.length > 0 && !implemented) return fail('adapter_unavailable', 'Form adapter unavailable');
  const result = validateFormDraftForDefinition(definition, candidate, Boolean(implemented));
  return result;
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validAnswer(field: ConfiguredField, value: unknown): boolean {
  switch (field.type) {
    case 'short_text': return boundedString(value, 500);
    case 'long_text': return boundedString(value, 5000);
    case 'number': return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
    case 'date': return typeof value === 'string' && validDate(value);
    case 'single_choice': return typeof value === 'string' && Boolean(field.choices?.some((choice) => choice.value === value));
    case 'multiple_choice': return Array.isArray(value) && value.length > 0 && value.length <= 100 && new Set(value).size === value.length && value.every((choice) => typeof choice === 'string' && field.choices?.some((item) => item.value === choice));
    case 'checkbox': return typeof value === 'boolean';
    case 'email': return typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    case 'phone': return typeof value === 'string' && /^\+?[0-9][0-9 ()-]{5,24}$/.test(value);
  }
}

/** Validate raw answers against a previously validated published configuration. */
export function validateAnswersForDefinition(definition: FormDefinition, config: PublishedFormConfig, raw: unknown): FormAnswerSnapshot {
  if (!Array.isArray(raw) || raw.length > MAX_FIELDS) return fail('invalid_answer', 'Malformed answer payload');
  const fields = new Map(config.fields.filter((field) => field.status === 'active').map((field) => [field.id, field]));
  const values = new Map<string, unknown>();
  for (const entry of raw) {
    if (!record(entry) || !hasOnlyKeys(entry, new Set(['fieldId', 'value'])) || typeof entry.fieldId !== 'string' || !fields.has(entry.fieldId) || values.has(entry.fieldId)) return fail('invalid_answer', 'Unknown or duplicate answer');
    values.set(entry.fieldId, entry.value);
  }
  const answers: FormAnswerSnapshot['answers'][number][] = [];
  for (const field of config.fields) {
    if (field.status !== 'active') continue;
    const value = values.get(field.id);
    const empty = value === undefined || value === null || value === '' || Array.isArray(value) && value.length === 0;
    if (empty) {
      if (field.required) return fail('invalid_answer', 'Required answer missing');
      continue;
    }
    if (!validAnswer(field, value)) return fail('invalid_answer', 'Invalid answer value');
    // Built-in values belong to the domain record; only safe custom fields enter snapshots.
    if (definition.baseFields.some((base) => base.key.toLowerCase() === field.key.toLowerCase())) continue;
    if (isUnsafeName(field.id) || isUnsafeName(field.key)) return fail('invalid_answer', 'Unsafe answer field');
    answers.push({ fieldId: field.id, label: field.label, type: field.type, value });
  }
  const snapshot = { formId: definition.id, version: config.version, answers };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_ANSWER_BYTES) return fail('invalid_answer', 'Answer snapshot exceeds storage limit');
  return snapshot;
}
