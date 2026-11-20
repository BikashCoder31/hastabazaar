import type { PublishedFormConfig } from './types';
import { canonicalKey } from './field-keys';
import { FORM_REGISTRY } from './registry';
import { FormRuntimeError } from './runtime-error';
import { FormValidationError } from './validation';
import { compatibilityAwareSellerForms } from './catalog-changes';

// Browser-safe parsing and deterministic hashes only; authoritative validation and receipts remain on the server.
export interface ConfiguredSubmission {
  version: number;
  answers: Record<string, unknown>;
}

/** Reads only namespaced, currently active controls. Domain fields remain with their owning parser. */
export function readConfiguredSubmission(
  form: HTMLFormElement,
  config: PublishedFormConfig,
  baseKeys: readonly string[],
): ConfiguredSubmission {
  const data = new FormData(form);
  const versions = data.getAll('formVersion');
  const rawVersion = versions[0];
  const version =
    typeof rawVersion === 'string' && /^[1-9]\d*$/.test(rawVersion)
      ? Number(rawVersion)
      : NaN;
  if (
    versions.length !== 1 ||
    !Number.isSafeInteger(version) ||
    version !== config.version
  ) {
    throw new Error('Form version changed. Refresh and try again.');
  }
  const answers: Record<string, unknown> = {};
  const builtIns = new Set(baseKeys.map(canonicalKey));
  for (const field of config.fields) {
    if (field.status !== 'active' || builtIns.has(canonicalKey(field.key)))
      continue;
    const values = data.getAll(`custom.${field.key}`);
    if (values.some((value) => typeof value !== 'string'))
      throw new Error('Unsupported form answer.');
    if (field.type === 'multiple_choice') {
      if (field.required && !values.length)
        throw new Error('Required choice missing.');
      if (values.length) answers[field.id] = values;
    } else if (field.type === 'checkbox') {
      answers[field.id] = values.length > 0;
    } else if (values.length > 1) {
      throw new Error('Duplicate form answer.');
    } else if (values.length && values[0] !== '') {
      if (field.type === 'number') {
        const number = Number(values[0]);
        if (!Number.isFinite(number))
          throw new Error('Invalid numeric answer.');
        answers[field.id] = number;
      } else answers[field.id] = values[0];
    }
  }
  return { version, answers };
}

/** The server validator accepts fieldId/value entries, preserving published field order. */

export function configuredJsonPayload(
  config: PublishedFormConfig,
  answers: Record<string, unknown>,
  baseKeys: readonly string[],
) {
  const builtIns = new Set(baseKeys.map(canonicalKey));
  return {
    formVersion: config.version,
    customAnswers: config.fields
      .filter(
        (field) =>
          field.status === 'active' &&
          !builtIns.has(canonicalKey(field.key)) &&
          Object.hasOwn(answers, field.id),
      )
      .map((field) => ({ fieldId: field.id, value: answers[field.id] })),
  };
}

export async function digestFormRequest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

/** File bytes, not just filenames, bind a multipart retry to its original upload. */
export async function digestMultipartRequest(form: FormData): Promise<string> {
  const entries: unknown[] = [];
  for (const [key, value] of form) {
    if (key === 'requestId') continue;
    entries.push([
      key,
      value instanceof File
        ? {
            name: value.name,
            type: value.type,
            size: value.size,
            digest: await digestFormBytes(await value.arrayBuffer()),
          }
        : value,
    ]);
  }
  return digestFormRequest(entries);
}

async function digestFormBytes(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export function configuredMultipartAnswers(
  form: FormData,
  config: PublishedFormConfig,
): {
  version: number;
  requestId: string;
  customAnswers: { fieldId: string; value: unknown }[];
} {
  const versions = form.getAll('formVersion');
  const requests = form.getAll('requestId');
  const version = versions[0];
  const requestId = requests[0];
  if (
    versions.length !== 1 ||
    typeof version !== 'string' ||
    !/^[1-9]\d*$/.test(version) ||
    requests.length !== 1 ||
    typeof requestId !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(requestId)
  )
    throw new FormValidationError(
      'invalid_answer',
      'Form version and request reference are required.',
    );
  if (
    Number(version) !== config.version &&
    !compatibilityAwareSellerForms.has(config.formId)
  )
    throw new FormRuntimeError(
      'stale_version',
      'This form changed. Refresh it and review your answers.',
    );
  const active = new Map(
    config.fields
      .filter((field) => field.status === 'active')
      .map((field) => [field.key, field]),
  );
  const base = new Set(
    FORM_REGISTRY[config.formId].baseFields.map((field) =>
      canonicalKey(field.key),
    ),
  );
  const seen = new Set<string>();
  for (const [key, value] of form) {
    if (!key.startsWith('custom.')) continue;
    const field = active.get(key.slice('custom.'.length));
    if (!field && Number(version) !== config.version)
      throw new FormRuntimeError(
        'stale_version',
        'A question from your saved form changed or was archived. Review the updated questions; keep your entered answers for reference.',
      );
    if (!field || base.has(canonicalKey(field.key)) || value instanceof File)
      throw new FormValidationError(
        'invalid_answer',
        'Unknown or unsupported form answer.',
      );
    if (seen.has(key) && field.type !== 'multiple_choice')
      throw new FormValidationError('invalid_answer', 'Duplicate form answer.');
    seen.add(key);
  }
  const customAnswers: { fieldId: string; value: unknown }[] = [];
  for (const field of config.fields) {
    if (field.status !== 'active' || base.has(canonicalKey(field.key)))
      continue;
    const values = form.getAll(`custom.${field.key}`);
    if (field.type === 'checkbox') {
      customAnswers.push({ fieldId: field.id, value: values.length > 0 });
    } else if (field.type === 'multiple_choice') {
      if (values.length)
        customAnswers.push({ fieldId: field.id, value: values });
    } else if (values.length && values[0] !== '') {
      const value = values[0];
      if (typeof value !== 'string')
        throw new FormValidationError(
          'invalid_answer',
          'Unsupported form answer.',
        );
      if (field.type === 'number') {
        if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.trim()))
          throw new FormValidationError(
            'invalid_answer',
            'Invalid numeric answer.',
            field.id,
          );
        customAnswers.push({ fieldId: field.id, value: Number(value) });
      } else customAnswers.push({ fieldId: field.id, value });
    }
  }
  return { version: Number(version), requestId, customAnswers };
}
