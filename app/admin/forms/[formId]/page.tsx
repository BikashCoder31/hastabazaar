import { AdminPageTitle } from '@/components/admin/page-help';
import { nativeFormDestination } from '@/lib/forms/native-destinations';
import { withAdminReturnTo } from '@/lib/admin/return-context';
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
  const destination = nativeFormDestination(formId);
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const result = await db.prepare(`SELECT id,version,revision,status,config_json AS configJson,
    reason,updated_at AS updatedAt,published_at AS publishedAt
    FROM form_config_versions WHERE form_id = ? ORDER BY version DESC,revision DESC`)
    .bind(formId).all<Omit<CatalogVersion, 'config'> & { configJson: string }>();
  const versions: CatalogVersion[] = result.results.map(({ configJson, ...row }) => ({ ...row, config: validateFormDraft(formId, JSON.parse(configJson) as unknown) }));
  const current = await requireStaffPage('/admin/forms', 'business_settings.manage');
  if(current.id!==staff.id||current.role!=='super_admin') redirect('/admin/forms/'+encodeURIComponent(formId));
  const retainedReview = Boolean(destination && versions.some(version=>version.status==='published'&&version.config.fields.length>0));
  return <div className="grid min-w-0 gap-6"><div><Link href="/admin/forms" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"><ArrowLeft className="size-4" /> Form Management</Link><AdminPageTitle><h1 className="section-title break-words">{presentation.label}</h1></AdminPageTitle><p className="mt-2 text-sm text-muted-foreground">Super Admin · {editable ? 'Form editor' : 'Form history'}</p><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{editable ? presentation.description : FORM_CATALOG_UNAVAILABLE_MESSAGE}</p>{editable ? <p className="mt-2 text-xs text-muted-foreground">{presentation.category} · Managed by Super Admin</p> : null}</div>
    {destination?<section className="rounded-xl border p-5"><h2 className="font-semibold">Managed by {destination.label}</h2><p className="mt-2 text-sm text-muted-foreground">Native controls stay with this feature. Published extra questions remain enforced and their original answers stay under source permissions. Review each retained question&apos;s purpose, responsible owner and actual consumer before changing it; these are not inferred from its publisher.</p><Link href={withAdminReturnTo(destination.href,'/admin/forms/'+encodeURIComponent(formId))} className="mt-3 inline-block underline">Open {destination.label}</Link>{versions.filter(version=>version.status==='published'&&version.config.fields.length>0).map(version=><div key={version.id} className="mt-4"><h3 className="font-medium">Retained questions · version {version.version}</h3><p className="break-words text-xs text-muted-foreground">Native consumer: {form.route}</p><ul className="mt-2 space-y-2">{version.config.fields.map(field=><li key={field.id} className="rounded border p-2"><p>{field.label} · {field.required?'Required':'Optional'} · {field.status}</p><p className="break-words text-xs text-muted-foreground">{field.key} · {field.type}</p></li>)}</ul></div>)}</section>:null}
    {editable || retainedReview ? <FormCatalogEditor key={staff.id+":"+formId} actorId={staff.id} retainedOnly={!editable} form={form} versions={versions} /> :
      <Card className="min-w-0"><CardHeader><CardTitle>Version history</CardTitle></CardHeader><CardContent>
        {versions.length ? <ul className="grid gap-3">{versions.map((version) => <li key={version.id} className="min-w-0 rounded-lg border p-3"><p className="font-medium">Version {version.version} · revision {version.revision} · {version.status}</p><p className="mt-1 break-words text-sm text-muted-foreground">{version.reason}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No saved versions.</p>}
      </CardContent></Card>}
  </div>;
}
