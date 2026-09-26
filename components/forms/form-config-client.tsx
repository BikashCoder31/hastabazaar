'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ConfiguredField, CustomFieldType, PublishedFormConfig } from '@/lib/forms/types';

type FormConfigStatus = 'loading' | 'ready' | 'unavailable' | 'stale';
interface FormConfigState { config: PublishedFormConfig | null; status: FormConfigStatus; message: string; formId: string }
const types = new Set<CustomFieldType>(['short_text', 'long_text', 'number', 'date', 'single_choice', 'multiple_choice', 'checkbox', 'email', 'phone']);
const fieldKeys = new Set(['id', 'key', 'type', 'label', 'helpText', 'placeholder', 'required', 'order', 'choices', 'min', 'max', 'integerOnly', 'status']);
const configKeys = new Set(['formId', 'fields', 'version', 'publishedAt']);

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function boundedText(value: unknown, limit: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= limit;
}
function validField(value: unknown): value is ConfiguredField {
  if (!record(value) || Object.keys(value).some((key) => !fieldKeys.has(key))) return false;
  if (!boundedText(value.id, 100) || !/^[a-z][a-z0-9_]*$/.test(value.id) || value.key !== value.id ||
    !types.has(value.type as CustomFieldType) || !boundedText(value.label, 200) ||
    value.helpText !== undefined && (typeof value.helpText !== 'string' || value.helpText.length > 1000) ||
    value.placeholder !== undefined && (typeof value.placeholder !== 'string' || value.placeholder.length > 200) ||
    typeof value.required !== 'boolean' || !Number.isSafeInteger(value.order) || (value.order as number) < 0 || (value.order as number) >= 64 ||
    value.status !== 'active' && value.status !== 'archived') return false;
  if (value.type === 'single_choice' || value.type === 'multiple_choice') {
    if (!Array.isArray(value.choices) || value.choices.length < 2 || value.choices.length > 100 ||
      value.choices.some((choice) => !record(choice) || Object.keys(choice).some((key) => key !== 'value' && key !== 'label') ||
        !boundedText(choice.value, 100) || !boundedText(choice.label, 200)) ||
      new Set(value.choices.map((choice) => choice.value)).size !== value.choices.length) return false;
  } else if (value.choices !== undefined) return false;
  if (value.type === 'number') {
    if (value.min !== undefined && (typeof value.min !== 'number' || !Number.isFinite(value.min)) ||
      value.max !== undefined && (typeof value.max !== 'number' || !Number.isFinite(value.max)) ||
      value.integerOnly !== undefined && typeof value.integerOnly !== 'boolean') return false;
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
    !Array.isArray(value.fields) || value.fields.length > 64 || value.fields.some((field) => !validField(field))) return null;
  const ids = value.fields.map((field: ConfiguredField) => field.id);
  if (new Set(ids).size !== ids.length) return null;
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
        if (!controller.signal.aborted) setState(config
          ? { formId, config, status: 'ready', message: '' }
          : { formId, config: null, status: 'unavailable', message: 'Form configuration is unavailable. Please try again.' });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ formId, config: null, status: 'unavailable', message: 'Form configuration is unavailable. Please try again.' });
      });
    return () => controller.abort();
  }, [formId, refreshIndex]);
  const refresh = useCallback(() => {
    setState({ formId, config: null, status: 'loading', message: '' });
    setRefreshIndex((index) => index + 1);
  }, [formId]);
  const handleSubmissionResponse = useCallback((response: Response) => {
    if (response.status === 409) setState((current) => ({ ...current, status: 'stale', message: submissionFeedback(409).message }));
    return response.ok;
  }, []);
  const current = state.formId === formId ? state : { formId, config: null, status: 'loading' as const, message: '' };
  return { ...current, canSubmit: current.status === 'ready' && current.config !== null, refresh, handleSubmissionResponse };
}
