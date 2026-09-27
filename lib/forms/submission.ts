import type { PublishedFormConfig } from './types';

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
function canonicalKey(key: string): string { return key.replace(/[^a-z0-9]/gi, '').toLowerCase(); }

export function configuredJsonPayload(config: PublishedFormConfig, answers: Record<string, unknown>, baseKeys: readonly string[]) {
  const builtIns = new Set(baseKeys.map(canonicalKey));
  return {
    formVersion: config.version,
    customAnswers: config.fields.filter((field) => field.status === 'active' && !builtIns.has(canonicalKey(field.key)) && Object.hasOwn(answers, field.id))
      .map((field) => ({ fieldId: field.id, value: answers[field.id] })),
  };
}
