import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FormCatalogEditor, type CatalogVersion } from '@/components/admin/form-catalog-editor';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { FORM_CATALOG_UNAVAILABLE_MESSAGE, formCatalogPresentation, isFormCatalogEditable } from '@/lib/forms/catalog-presentation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { validateFormDraft } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export default async function FormCatalogDetailPage({ params }: { params: Promise<{ formId: string }> }) {
  const staff = await requireStaffPage('/admin/forms', 'business_settings.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const { formId } = await params;
  if (!Object.hasOwn(FORM_REGISTRY, formId)) notFound();
  const form = FORM_REGISTRY[formId];
  const editable = isFormCatalogEditable(form);
  const presentation = formCatalogPresentation(form);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const result = await db.prepare(`SELECT id,version,revision,status,config_json AS configJson,
    reason,updated_at AS updatedAt,published_at AS publishedAt
    FROM form_config_versions WHERE form_id = ? ORDER BY version DESC,revision DESC`)
    .bind(formId).all<Omit<CatalogVersion, 'config'> & { configJson: string }>();
  const versions: CatalogVersion[] = result.results.map(({ configJson, ...row }) => ({ ...row, config: validateFormDraft(formId, JSON.parse(configJson) as unknown) }));
  return <div className="grid min-w-0 gap-6"><div><Link href="/admin/forms" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"><ArrowLeft className="size-4" /> Form catalog</Link><p className="eyebrow mt-5">Super Admin · {editable ? 'Form editor' : 'Form history'}</p><h1 className="section-title break-words">{presentation.label}</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{editable ? presentation.description : FORM_CATALOG_UNAVAILABLE_MESSAGE}</p>{editable ? <p className="mt-2 text-xs text-muted-foreground">{presentation.category} · Managed by Super Admin</p> : null}</div>
    {editable ? <FormCatalogEditor form={form} versions={versions} /> :
      <Card className="min-w-0"><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent>
        {versions.length ? <ul className="grid gap-3">{versions.map((version) => <li key={version.id} className="min-w-0 rounded-lg border p-3"><p className="font-medium">Version {version.version} · revision {version.revision} · {version.status}</p><p className="mt-1 break-words text-sm text-muted-foreground">{version.reason}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No saved versions.</p>}
      </CardContent></Card>}
  </div>;
}
