import { ConfiguredFields, fieldDisplay } from '@/components/forms/configured-fields';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FormDefinition, PublishedFormConfig } from '@/lib/forms/types';
import { useId } from 'react';
import { baseFieldCopy, formGuide, isAutomaticFormField } from '@/lib/forms/plain-language';
import { FormGuide } from '@/components/forms/form-guide';

export function FormCatalogPreview({ form, config, mode }: {
  form: FormDefinition; config: PublishedFormConfig; mode: 'phone' | 'desktop';
}) {
  const baseKeys = form.baseFields.map((field) => field.key);
  const prefix = useId();
  const guide = formGuide(form.id);
  const questions = form.baseFields.filter(field => !isAutomaticFormField(field.key, form.id));
  const previewQuestions = questions.filter(field => field.type !== 'existing');
  const otherQuestions = questions.filter(field => field.type === 'existing');
  return <div data-preview-mode={mode} className={`min-w-0 rounded-xl border bg-muted/40 p-3 sm:p-5 ${mode === 'phone' ? 'mx-auto w-full max-w-[390px]' : 'w-full'}`}>
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{guide.title}</CardTitle>
        <CardDescription>This is a sample of the questions. The live form may show different questions based on your answers.</CardDescription>
      </CardHeader>
      <CardContent>
        <div aria-label={`${form.id} preview`} className="grid min-w-0 gap-4">
          <FormGuide formId={form.id} />
          {previewQuestions.map((field) => {
            const override = config.fields.find((item) => item.key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase() === field.key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase());
            if (override?.status === 'archived') return null;
            const copy = baseFieldCopy(form.id, field.key);
            const display = fieldDisplay(config, field.key);
            const label = display?.label ?? (field.label === field.key ? copy.label : field.label);
            const helpText = display?.helpText ?? copy.helpText;
            const id = `${prefix}-preview-base-${field.key}`;
            const helpId = helpText ? `${id}-help` : undefined;
            const common = { id, 'aria-describedby': helpId, className: 'w-full min-w-0 rounded-md border bg-background px-3 py-2', placeholder: override?.placeholder, readOnly: true, 'aria-required': field.required };
            return <div key={field.key} className="grid min-w-0 gap-2">
              <label htmlFor={id} className="min-w-0 break-words font-medium">{label}{field.required ? ' *' : field.required === false ? ' (optional)' : ''}</label>
              {field.type === 'long_text' ? <textarea {...common} rows={3} /> : field.choices ? <select id={id} aria-describedby={helpId} disabled className={common.className}><option>Choose an option</option>{field.choices.map(choice => <option value={choice.value} key={choice.value}>{choice.label}</option>)}</select> : <input {...common} />}
              {helpText ? <p id={helpId} className="text-sm text-muted-foreground">{helpText}</p> : null}
            </div>;
          })}
          {otherQuestions.length ? <details className="rounded-lg border p-3 text-sm"><summary className="cursor-pointer font-medium">Other questions in the live form ({otherQuestions.length})</summary><p className="mt-2 leading-6 text-muted-foreground">These questions follow the rules of this task. The live form shows the right input and any requirements based on your answers.</p><ul className="mt-2 list-disc space-y-1 pl-5">{otherQuestions.map(field => <li key={field.key}>{field.label}</li>)}</ul></details> : null}
          {/* The renderer's viewport breakpoint must not create columns in a phone-sized preview. */}
          <div className={mode === 'phone' ? '[&>div]:grid-cols-1' : undefined}>
            <ConfiguredFields config={config} baseKeys={baseKeys} />
          </div>
          <Badge variant="outline">Preview only</Badge>
        </div>
      </CardContent>
    </Card>
  </div>;
}
