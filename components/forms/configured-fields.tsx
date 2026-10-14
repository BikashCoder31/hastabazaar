import type { ConfiguredField, PublishedFormConfig } from '@/lib/forms/types';
import { useId } from 'react';
import { canonicalKey } from '@/lib/forms/submission';
import { builtInDisplayDefault } from '@/lib/forms/plain-language';

export interface FieldDisplay {
  label: string;
  helpText: string | undefined;
  placeholder: string | undefined;
  required: boolean;
}

/** Presentation only: existing domain controls keep their server-owned semantics. */
export function fieldDisplay(config: PublishedFormConfig | null, baseKey: string): FieldDisplay | null {
  const requested = canonicalKey(baseKey);
  const field = config?.fields.find((item) => canonicalKey(item.key) === requested && item.status === 'active');
  if (field) {
    const defaults = builtInDisplayDefault(config!.formId, baseKey);
    return { label: field.label === field.key && defaults ? defaults.label : field.label,
      helpText: field.helpText ?? defaults?.helpText, placeholder: field.placeholder, required: field.required };
  }
  const defaults = config && !config.fields.some(item => canonicalKey(item.key) === requested)
    ? builtInDisplayDefault(config.formId, baseKey) : null;
  return defaults ? { ...defaults, helpText: defaults.helpText, placeholder: defaults.placeholder } : null;
}

function ConfiguredFieldControl({ field, error, idPrefix }: { field: ConfiguredField; error?: string; idPrefix: string }) {
  const id = `${idPrefix}custom-${field.id}`;
  const name = `custom.${field.key}`;
  const helpId = field.helpText ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined;
  const common = { id, name, required: field.required, 'aria-required': field.required,
    'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined,
    className: 'min-w-0 w-full rounded-md border bg-background px-3 py-2' };
  let control;
  switch (field.type) {
    case 'long_text':
      control = <textarea {...common} placeholder={field.placeholder} rows={4} />;
      break;
    case 'single_choice':
      control = <select {...common} defaultValue="">
        <option value="" disabled>Choose an option</option>
        {field.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>;
      break;
    case 'multiple_choice':
      control = <select {...common} multiple size={Math.min(field.choices?.length ?? 2, 6)}>
        {field.choices?.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      </select>;
      break;
    case 'checkbox':
      control = <input id={id} name={name} type="checkbox" value="on" required={field.required} aria-required={field.required}
        aria-describedby={describedBy} aria-invalid={error ? true : undefined} />;
      break;
    default:
      control = <input {...common} type={field.type === 'short_text' ? 'text' : field.type === 'phone' ? 'tel' : field.type}
        placeholder={field.placeholder}
        min={field.integerOnly && field.min !== undefined ? Math.ceil(field.min) : field.min}
        max={field.integerOnly && field.max !== undefined ? Math.floor(field.max) : field.max}
        step={field.integerOnly ? 1 : 'any'} />;
  }
  return <div className="min-w-0 space-y-2 break-words" data-configured-field={field.id}>
    <label htmlFor={id} className="block min-w-0 break-words font-medium">{field.label}{field.required ? <span aria-hidden="true"> *</span> : <span className="font-normal text-muted-foreground"> (optional)</span>}</label>
    {control}
    {field.helpText ? <p id={helpId} className="min-w-0 break-words text-sm text-muted-foreground">{field.helpText}</p> : null}
    {error ? <p id={errorId} role="alert" className="min-w-0 break-words text-sm text-destructive">{error}</p> : null}
  </div>;
}

export function ConfiguredFields({ config, baseKeys, errors = {}, fieldIds, includeVersion = true }: {
  config: PublishedFormConfig; baseKeys: readonly string[]; errors?: Readonly<Record<string, string>>;
  fieldIds?: readonly string[]; includeVersion?: boolean;
}) {
  const idPrefix = `${useId()}-`;
  const builtIns = new Set(baseKeys.map(canonicalKey));
  const selected = fieldIds ? new Set(fieldIds) : null;
  const fields = config.fields.filter((field) => field.status === 'active' && !builtIns.has(canonicalKey(field.key)) && (!selected || selected.has(field.id)))
    .toSorted((left, right) => left.order - right.order);
  return <>
    {includeVersion ? <input type="hidden" name="formVersion" value={config.version} /> : null}
    <div className="grid min-w-0 gap-4 sm:grid-cols-2">
      {fields.map((field) => <ConfiguredFieldControl key={field.id} field={field} idPrefix={idPrefix}
        error={Object.hasOwn(errors, field.id) && typeof errors[field.id] === 'string' ? errors[field.id] : undefined} />)}
    </div>
  </>;
}

/** Focus the answer field within the form that reported a field-specific server error. */
export function focusConfiguredField(form: HTMLFormElement, fieldId: string): boolean {
  const wrapper = Array.from(form.querySelectorAll<HTMLElement>('[data-configured-field]'))
    .find((element) => element.dataset.configuredField === fieldId);
  const control = wrapper?.querySelector<HTMLElement>('input,select,textarea');
  control?.focus();
  return Boolean(control);
}
