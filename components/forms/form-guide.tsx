import { formGuide } from '@/lib/forms/plain-language';

export function FormGuide({ formId }: { formId: string }) {
  const guide = formGuide(formId);
  return <aside aria-label="Help with this form" className="col-span-full my-3 w-full min-w-0 rounded-xl border bg-secondary/40 p-4 text-sm leading-6">
    <p className="font-medium">{guide.purpose}</p>
    <details className="mt-1">
      <summary className="w-fit cursor-pointer rounded font-medium text-primary focus-visible:outline-2 focus-visible:outline-primary max-md:in-[.admin-shell]:min-h-11 max-md:in-[.admin-shell]:content-center">Before you start</summary>
      <p className="mt-2 text-muted-foreground">{guide.preparation}</p>
      <p className="mt-1 text-muted-foreground">Fields marked * are required. You can leave optional fields blank. Check your answers before sending.</p>
    </details>
  </aside>;
}
