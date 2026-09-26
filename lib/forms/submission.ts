import type { PublishedFormConfig } from './types';

export interface ConfiguredSubmission {
  version: number;
  answers: Record<string, unknown>;
}

/** Reads only namespaced, currently active controls. Domain fields remain with their owning parser. */
export function readConfiguredSubmission(form: HTMLFormElement, config: PublishedFormConfig): ConfiguredSubmission {
  const data = new FormData(form);
  const rawVersion = data.get('formVersion');
  const version = typeof rawVersion === 'string' ? Number(rawVersion) : NaN;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('Form version is unavailable. Refresh and try again.');
  const answers: Record<string, unknown> = {};
  for (const field of config.fields) {
    if (field.status !== 'active') continue;
    const values = data.getAll(`custom.${field.key}`);
    if (values.some((value) => typeof value !== 'string')) throw new Error('Unsupported form answer.');
    if (field.type === 'multiple_choice') {
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
export function configuredJsonPayload(config: PublishedFormConfig, answers: Record<string, unknown>) {
  return {
    formVersion: config.version,
    customAnswers: config.fields.filter((field) => field.status === 'active' && Object.hasOwn(answers, field.id))
      .map((field) => ({ fieldId: field.id, value: answers[field.id] })),
  };
}
