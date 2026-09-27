import { ConfiguredFields } from '@/components/forms/configured-fields';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FormDefinition, PublishedFormConfig } from '@/lib/forms/types';

export function FormCatalogPreview({ form, config, mode }: {
  form: FormDefinition; config: PublishedFormConfig; mode: 'phone' | 'desktop';
}) {
  const baseKeys = form.baseFields.map((field) => field.key);
  return <div data-preview-mode={mode} className={`min-w-0 rounded-xl border bg-muted/40 p-3 sm:p-5 ${mode === 'phone' ? 'mx-auto w-full max-w-[390px]' : 'w-full'}`}>
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{form.id.replaceAll(/[._-]/g, ' ')}</CardTitle>
        <CardDescription>{form.capabilities.explanation}</CardDescription>
      </CardHeader>
      <CardContent>
        <div aria-label={`${form.id} preview`} className="grid min-w-0 gap-4">
          {form.baseFields.map((field) => {
            const override = config.fields.find((item) => item.key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase() === field.key.replaceAll(/[^a-z0-9]/gi, '').toLowerCase());
            if (override?.status === 'archived') return null;
            const label = override?.label ?? field.label;
            return <div key={field.key} className="grid min-w-0 gap-2">
              <label htmlFor={`preview-base-${field.key}`} className="min-w-0 break-words font-medium">{label}{field.required ? ' *' : ''}</label>
              <input id={`preview-base-${field.key}`} className="w-full min-w-0 rounded-md border bg-background px-3 py-2" placeholder={override?.placeholder} readOnly aria-required={field.required} />
              {override?.helpText ? <p className="text-sm text-muted-foreground">{override.helpText}</p> : null}
            </div>;
          })}
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
