import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from './registry';
import type { ConfiguredField, CustomFieldType, FormAnswerSnapshot, FormConfigDraft, FormDefinition, FormId, PublishedFormConfig } from './types';

export type FormValidationCode = 'unknown_form' | 'adapter_unavailable' | 'invalid_draft' | 'invalid_answer';

export class FormValidationError extends Error {
  constructor(readonly code: FormValidationCode, message: string, readonly fieldId?: string) {
    super(message);
    this.name = 'FormValidationError';
  }
}

const FIELD_TYPES: readonly CustomFieldType[] = ['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone'];
const FIELD_KEYS = new Set(['id', 'key', 'type', 'label', 'helpText', 'placeholder', 'required', 'order', 'choices', 'status', 'min', 'max', 'integerOnly']);
const MAX_FIELDS = 64;
const MAX_CONFIG_BYTES = 65536;
const MAX_ANSWER_BYTES = 131072;

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(code: FormValidationCode, message: string, fieldId?: string): never {
  throw new FormValidationError(code, message, fieldId);
}

function boundedString(value: unknown, max: number, optional = false): value is string {
  return typeof value === 'string' && (optional && value.length === 0 || value.trim().length > 0) && value.length <= max;
}

function canonicalName(value: string): string {
  return value.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

const SENSITIVE_PHRASES = [
  'password', 'passcode', 'credential', 'secret', 'token', 'otp', 'onetime', 'pin', 'pincode',
  'verificationcode', 'securitycode', 'recoverycode', 'backupcode', 'resetcode',
  'confirmationcode', 'authcode', 'accesscode', 'emailcode', 'smscode', 'mfacode', '2facode',
  'apikey', 'privatekey', 'bankaccount', 'bankacct', 'accountnumber', 'routingnumber',
  'iban', 'swift', 'creditcard', 'debitcard', 'cardnumber', 'cardexpiry', 'cardcvv',
  'cardcvc', 'cvv', 'cvc', 'payment', 'captcha', 'recaptcha', 'turnstile', 'honeypot', 'csrf',
];

// Joined identifiers have no lexical boundary to split on. Recognize them only
// as a complete sensitive phrase with explicit identifier qualifiers, never as
// an arbitrary substring (pin in shipping/spin, secret in secretariat).
const SENSITIVE_PREFIXES = ['user', 'admin', 'customer', 'account', 'login', 'session', 'access', 'refresh', 'new', 'old', 'current', 'confirm', 'confirmation', 'hashed', 'encrypted'];
const SENSITIVE_SUFFIXES = ['hash', 'digest', 'value', 'id', 'key', 'code', 'number', 'reference', 'response', 'challenge', 'answer', 'expiry', 'expiration', 'data', 'details', 'info', 'method', 'amount', 'status', 'field', 's'];
const SENSITIVE_IDENTIFIER = new RegExp(`^(?:${SENSITIVE_PREFIXES.join('|')})*(?:${SENSITIVE_PHRASES.join('|')})+(?:${SENSITIVE_SUFFIXES.join('|')})*[0-9]*$`);

function isUnsafeName(value: string): boolean {
  const tokens = value
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  for (let start = 0; start < tokens.length; start++) {
    let compound = '';
    for (let end = start; end < tokens.length; end++) {
      compound += tokens[end];
      if (SENSITIVE_IDENTIFIER.test(compound)) return true;
    }
  }
  return false;
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

function validChoice(value: unknown): value is { value: string; label: string } {
  return record(value) && hasOnlyKeys(value, new Set(['value', 'label'])) && boundedString(value.value, 100) && boundedString(value.label, 200);
}

function validNumberBound(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000;
}

function sameChoices(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function validField(value: unknown, definition: FormDefinition, adapterGrantsBuiltInEdits: boolean): value is ConfiguredField {
  if (!record(value) || !hasOnlyKeys(value, FIELD_KEYS)) return false;
  const { id, key, type, label, helpText, placeholder, required, order, choices, status, min, max, integerOnly } = value;
  if (!boundedString(id, 100) || !/^[a-z][a-z0-9_]*$/.test(id) || key !== id || isUnsafeName(id)) return false;
  if (!FIELD_TYPES.includes(type as CustomFieldType) || !definition.capabilities.customFieldTypes.includes(type as CustomFieldType)) return false;
  if (!boundedString(label, 200) || isUnsafeName(label) || (helpText !== undefined && !boundedString(helpText, 1000, true)) || (placeholder !== undefined && !boundedString(placeholder, 200, true))) return false;
  if (required !== true && required !== false || !Number.isSafeInteger(order) || (order as number) < 0 || (order as number) >= MAX_FIELDS) return false;
  if (status !== 'active' && status !== 'archived') return false;
  const base = definition.baseFields.find((item) => canonicalName(item.key) === canonicalName(id));
  if (base) {
    if (!adapterGrantsBuiltInEdits || base.capability === 'protected') return false;
    // An adapter alone grants no semantic edit. Legacy inventory definitions
    // have type "existing" and no baseline, so they remain uneditable.
    if (!FIELD_TYPES.includes(base.type as CustomFieldType) || typeof base.required !== 'boolean' || (base.status !== 'active' && base.status !== 'archived')) return false;
    const landmarkRequiredness = definition.id === 'account.address' && canonicalName(base.key) === 'landmark' && base.capability === 'configurable';
    if (type !== base.type || (!landmarkRequiredness && required !== base.required) || status !== base.status || !sameChoices(choices, base.choices) || min !== base.min || max !== base.max || integerOnly !== base.integerOnly) return false;
  }
  if (type === 'single_choice' || type === 'multiple_choice') {
    if (!Array.isArray(choices) || choices.length < 2 || choices.length > 100 || !choices.every(validChoice)) return false;
    if (new Set(choices.map((choice: { value: string }) => choice.value)).size !== choices.length) return false;
  } else if (choices !== undefined) return false;
  if (type === 'number') {
    if (min !== undefined && !validNumberBound(min) || max !== undefined && !validNumberBound(max) || integerOnly !== undefined && typeof integerOnly !== 'boolean') return false;
    if (min !== undefined && max !== undefined && (min as number) > (max as number)) return false;
    if (integerOnly === true && min !== undefined && max !== undefined && Math.ceil(min as number) > Math.floor(max as number)) return false;
  } else if (min !== undefined || max !== undefined || integerOnly !== undefined) return false;
  return true;
}

/** Validate a draft against an explicit definition; production callers use validateFormDraft. */
export function validateFormDraftForDefinition(definition: FormDefinition, candidate: unknown, adapterGrantsBuiltInEdits = false): FormConfigDraft {
  if (!record(candidate) || !hasOnlyKeys(candidate, new Set(['formId', 'fields'])) || candidate.formId !== definition.id || !Array.isArray(candidate.fields) || candidate.fields.length > MAX_FIELDS) {
    return fail('invalid_draft', 'Malformed form draft');
  }
  if (candidate.fields.some((item) => !validField(item, definition, adapterGrantsBuiltInEdits))) return fail('invalid_draft', 'Invalid form field');
  const fields = candidate.fields as ConfiguredField[];
  if (new Set(fields.map((item) => canonicalName(item.id))).size !== fields.length || new Set(fields.map((item) => canonicalName(item.key))).size !== fields.length) return fail('invalid_draft', 'Duplicate field');
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

function validEmail(value: string): boolean {
  if (value.length > 254 || /\s/.test(value)) return false;
  const parts = value.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  if (!local || local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..') || !/^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)) return false;
  const labels = domain.split('.');
  return labels.length >= 2 && labels.every((label) => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) && /^[A-Za-z]{2,63}$/.test(labels.at(-1) ?? '');
}

function validPhone(value: string): boolean {
  if (!/^\+?[0-9][0-9 ()-]{5,30}$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return false;
  let inside = false;
  let groupDigits = 0;
  for (const char of value) {
    if (char === '(') {
      if (inside) return false;
      inside = true;
      groupDigits = 0;
    } else if (char === ')') {
      if (!inside || groupDigits === 0) return false;
      inside = false;
    } else if (inside && /\d/.test(char)) groupDigits++;
  }
  return !inside;
}

function validAnswer(field: ConfiguredField, value: unknown): boolean {
  switch (field.type) {
    case 'short_text': return boundedString(value, 500);
    case 'long_text': return boundedString(value, 5000);
    case 'number': return validNumberBound(value) && (field.min === undefined || value >= field.min) && (field.max === undefined || value <= field.max) && (!field.integerOnly || Number.isInteger(value));
    case 'date': return typeof value === 'string' && validDate(value);
    case 'single_choice': return typeof value === 'string' && Boolean(field.choices?.some((choice) => choice.value === value));
    case 'multiple_choice': return Array.isArray(value) && value.length > 0 && value.length <= 100 && new Set(value).size === value.length && value.every((choice) => typeof choice === 'string' && field.choices?.some((item) => item.value === choice));
    case 'checkbox': return typeof value === 'boolean';
    case 'email': return typeof value === 'string' && validEmail(value);
    case 'phone': return typeof value === 'string' && validPhone(value);
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
      if (field.required) return fail('invalid_answer', 'Required answer missing', field.id);
      continue;
    }
    if (field.type === 'checkbox' && field.required && value === false) return fail('invalid_answer', 'Required answer missing', field.id);
    if (!validAnswer(field, value)) return fail('invalid_answer', 'Invalid answer value', field.id);
    // Built-in values belong to the domain record; only safe custom fields enter snapshots.
    if (definition.baseFields.some((base) => canonicalName(base.key) === canonicalName(field.key))) continue;
    if (isUnsafeName(field.id) || isUnsafeName(field.key) || isUnsafeName(field.label)) return fail('invalid_answer', 'Unsafe answer field');
    answers.push({ fieldId: field.id, label: field.label, type: field.type, value });
  }
  const snapshot = { formId: definition.id, version: config.version, answers };
  if (new TextEncoder().encode(JSON.stringify(snapshot)).length > MAX_ANSWER_BYTES) return fail('invalid_answer', 'Answer snapshot exceeds storage limit');
  return snapshot;
}
