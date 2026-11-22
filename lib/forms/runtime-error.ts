export type FormRuntimeCode =
  | 'unknown_form'
  | 'config_unavailable'
  | 'stale_version';

export class FormRuntimeError extends Error {
  readonly retryable: boolean;
  constructor(
    readonly code: FormRuntimeCode,
    message: string,
    readonly supportReference?: string,
    readonly category?:
      | 'definition_unavailable'
      | 'definition_invalid'
      | 'read_unavailable',
  ) {
    super(
      supportReference
        ? message + ' Support reference: ' + supportReference + '.'
        : message,
    );
    this.name = 'FormRuntimeError';
    this.retryable = code === 'config_unavailable';
  }
}
