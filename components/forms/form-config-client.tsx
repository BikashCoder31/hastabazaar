'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConfiguredField, CustomFieldType, PublishedFormConfig } from '@/lib/forms/types';
import { canonicalKey } from '@/lib/forms/submission';

type FormConfigStatus = 'loading' | 'ready' | 'unavailable' | 'stale';
interface FormConfigState { config: PublishedFormConfig | null; status: FormConfigStatus; message: string; formId: string }
const types = new Set<CustomFieldType>(['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone']);
const fieldKeys = new Set(['id', 'key', 'type', 'label', 'helpText', 'placeholder', 'required', 'order', 'choices', 'min', 'max', 'integerOnly', 'status']);
const configKeys = new Set(['formId', 'fields', 'version', 'publishedAt']);
// Keep this identifier policy aligned with Task 3 without importing its
// server registry into public client bundles.
const camelCaseDisplayFields = new Map<string, ReadonlyMap<string, { type: CustomFieldType; required: boolean }>>([
  ['commerce.order-tracking', new Map([['orderNumber', { type: 'short_text', required: true }],
    ['email', { type: 'email', required: true }]])],
  ['seller.application', new Map([['tradingName', { type: 'short_text', required: true }],
    ['businessDescription', { type: 'long_text', required: true }]])],
  ['seller.maker-profile', new Map([['publicName', { type: 'short_text', required: true }],
    ['publicCity', { type: 'short_text', required: true }]])],
  ['seller.profile', new Map([['tradingName', { type: 'short_text', required: true }],
    ['businessDescription', { type: 'long_text', required: false }]])],
  ['seller.product-submission', new Map([['nameEn', { type: 'short_text', required: true }],
    ['descriptionEn', { type: 'long_text', required: true }]])],
]);
const sensitivePhrases = [
  'password', 'passcode', 'credential', 'secret', 'token', 'otp', 'onetime', 'pin', 'pincode',
  'verificationcode', 'securitycode', 'recoverycode', 'backupcode', 'resetcode',
  'confirmationcode', 'authcode', 'accesscode', 'emailcode', 'smscode', 'mfacode', '2facode',
  'apikey', 'privatekey', 'bankaccount', 'bankacct', 'accountnumber', 'routingnumber',
  'iban', 'swift', 'creditcard', 'debitcard', 'cardnumber', 'cardexpiry', 'cardcvv',
  'cardcvc', 'cvv', 'cvc', 'payment', 'captcha', 'recaptcha', 'turnstile', 'honeypot', 'csrf',
];
const sensitivePrefixes = ['user', 'admin', 'customer', 'account', 'login', 'session', 'access', 'refresh', 'new', 'old', 'current', 'confirm', 'confirmation', 'hashed', 'encrypted'];
const sensitiveSuffixes = ['hash', 'digest', 'value', 'id', 'key', 'code', 'number', 'reference', 'response', 'challenge', 'answer', 'expiry', 'expiration', 'data', 'details', 'info', 'method', 'amount', 'status', 'field', 's'];
const sensitiveIdentifier = new RegExp(`^(?:${sensitivePrefixes.join('|')})*(?:${sensitivePhrases.join('|')})+(?:${sensitiveSuffixes.join('|')})*[0-9]*$`);

function unsafeName(value: string): boolean {
  const tokens = value.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (let start = 0; start < tokens.length; start++) {
    let compound = '';
    for (let end = start; end < tokens.length; end++) {
      compound += tokens[end];
      if (sensitiveIdentifier.test(compound)) return true;
    }
  }
  return false;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function boundedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}
function optionalText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && (value.length === 0 || value.trim().length > 0) && value.length <= limit;
}
function validField(value: unknown, formId: string): value is ConfiguredField {
  if (!record(value) || Object.keys(value).some((key) => !fieldKeys.has(key))) return false;
  const registeredDisplay = typeof value.id === 'string' ? camelCaseDisplayFields.get(formId)?.get(value.id) : undefined;
  if (formId === 'commerce.order-tracking' && !registeredDisplay) return false;
  if (!boundedText(value.id, 100) ||
    !(/^[a-z][a-z0-9_]*$/.test(value.id) || registeredDisplay) ||
    value.key !== value.id || unsafeName(value.id) ||
    !types.has(value.type as CustomFieldType) || !boundedText(value.label, 200) || unsafeName(value.label) ||
    value.helpText !== undefined && !optionalText(value.helpText, 1000) ||
    value.placeholder !== undefined && !optionalText(value.placeholder, 200) ||
    typeof value.required !== 'boolean' || !Number.isSafeInteger(value.order) || (value.order as number) < 0 || (value.order as number) >= 64 ||
    value.status !== 'active' && value.status !== 'archived') return false;
  if (registeredDisplay && (value.type !== registeredDisplay.type || value.required !== registeredDisplay.required || value.status !== 'active')) return false;
  if (value.type === 'single_choice' || value.type === 'multiple_choice') {
    if (!Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 100 ||
      value.choices.some((choice) => !record(choice) || Object.keys(choice).some((key) => key !== 'value' && key !== 'label') ||
        !boundedText(choice.value, 100) || !boundedText(choice.label, 200)) ||
      new Set(value.choices.map((choice) => choice.value)).size !== value.choices.length) return false;
  } else if (value.choices !== undefined) return false;
  if (value.type === 'number') {
    if (value.min !== undefined && (typeof value.min !== 'number' || !Number.isFinite(value.min) || Math.abs(value.min) > 1_000_000_000_000) ||
      value.max !== undefined && (typeof value.max !== 'number' || !Number.isFinite(value.max) || Math.abs(value.max) > 1_000_000_000_000) ||
      value.integerOnly !== undefined && typeof value.integerOnly !== 'boolean') return false;
    if (typeof value.min === 'number' && typeof value.max === 'number' &&
      (value.min > value.max || value.integerOnly === true && Math.ceil(value.min) > Math.floor(value.max))) return false;
  } else if (value.min !== undefined || value.max !== undefined || value.integerOnly !== undefined) return false;
  return true;
}

/** The public endpoint is an authorization boundary; still validate its JSON before rendering. */
export function parsePublishedFormConfig(formId: string, payload: unknown): PublishedFormConfig | null {
  if (!record(payload) || !record(payload.config)) return null;
  const value = payload.config;
  if (Object.keys(value).some((key) => !configKeys.has(key)) || value.formId !== formId ||
    !Number.isSafeInteger(value.version) || (value.version as number) < 1 ||
    !Number.isSafeInteger(value.publishedAt) || (value.publishedAt as number) < 0 ||
    !Array.isArray(value.fields) || value.fields.length > 64 || value.fields.some((field) => !validField(field, formId))) return null;
  const ids = value.fields.map((field: ConfiguredField) => canonicalKey(field.id));
  if (new Set(ids).size !== ids.length) return null;
  try {
    const draftBytes = new TextEncoder().encode(JSON.stringify({ formId: value.formId, fields: value.fields })).length;
    if (draftBytes > 65536) return null;
  } catch { return null; }
  return value as unknown as PublishedFormConfig;
}

export function submissionFeedback(status: number): { stale: boolean; message: string } {
  return status === 409
    ? { stale: true, message: 'This form changed while you were filling it out. Refresh the form and review your answers before submitting again.' }
    : { stale: false, message: 'The form could not be submitted. Please try again.' };
}

export function usePublishedFormConfig(formId: string) {
  const [state, setState] = useState<FormConfigState>({ formId, config: null, status: 'loading', message: '' });
  const [refreshIndex, setRefreshIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/forms/${encodeURIComponent(formId)}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => response.ok ? parsePublishedFormConfig(formId, await response.json()) : null)
      .then((config) => {
        if (!controller.signal.aborted) setState((current) => config
          ? { formId, config, status: 'ready', message: '' }
          : { formId, config: current.formId === formId ? current.config : null,
            status: 'unavailable', message: 'Form configuration is unavailable. Please try again.' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState((current) => ({ formId,
          config: current.formId === formId ? current.config : null,
          status: 'unavailable', message: 'Form configuration is unavailable. Please try again.' }));
      });
    return () => controller.abort();
  }, [formId, refreshIndex]);
  const refresh = useCallback(() => {
    setState((current) => ({ formId, config: current.formId === formId ? current.config : null,
      status: 'loading', message: '' }));
    setRefreshIndex((index) => index + 1);
  }, [formId]);
  const handleSubmissionResponse = useCallback((response: Response, code?: string) => {
    if (response.status === 409 && code !== 'request_id_conflict') setState((current) => current.formId === formId
      ? { ...current, status: 'stale', message: submissionFeedback(409).message } : current);
    return response.ok;
  }, [formId]);
  const current = state.formId === formId ? state : { formId, config: null, status: 'loading' as const, message: '' };
  return { ...current, canSubmit: current.status === 'ready' && current.config !== null, refresh, handleSubmissionResponse };
}
