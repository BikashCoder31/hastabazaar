import { AdminPageTitle } from '@/components/admin/page-help';
import { NATIVE_TASK_FORM_IDS } from '@/lib/forms/catalog-policy';
import { nativeFormDestination } from '@/lib/forms/native-destinations';
import { withAdminReturnTo } from '@/lib/admin/return-context';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormCatalogList } from '@/components/admin/form-catalog-list';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { decodePublishedForm, FormRuntimeError } from '@/lib/forms/runtime';
import { formCatalogPresentation, isFormCatalogEditable } from '@/lib/forms/catalog-presentation';
import {readFormHealth,formHealthDatabaseScope} from '@/lib/operations/form-health';

export const dynamic = 'force-dynamic';

function isParkedDeliveryForm(id: string) {
  return id.startsWith('rider.') || id.startsWith('staff.rider-');
}

export default async function FormCatalogPage() {
  const staff = await requireStaffPage('/admin/forms', 'business_settings.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const health = (await readFormHealth(db, staff.id, formHealthDatabaseScope(db)))
    .filter(row => !isParkedDeliveryForm(row.formId));
  const result = await db.prepare(`SELECT v.form_id AS formId,
    MAX(CASE WHEN v.status = 'published' THEN v.version ELSE 0 END) AS publishedVersion,
    MAX(CASE WHEN v.status = 'draft' THEN v.version ELSE 0 END) AS draftVersion,
    (SELECT p.config_json FROM form_config_versions p WHERE p.form_id=v.form_id AND p.status='published' ORDER BY p.version DESC LIMIT 1) AS publishedConfigJson,
    (SELECT p.published_at FROM form_config_versions p WHERE p.form_id=v.form_id AND p.status='published' ORDER BY p.version DESC LIMIT 1) AS publishedAt,
    MAX(v.updated_at) AS lastChangedAt,
    (SELECT u.display_name FROM form_config_versions latest LEFT JOIN users u ON u.id = latest.updated_by
      WHERE latest.form_id = v.form_id ORDER BY latest.updated_at DESC, latest.version DESC LIMIT 1) AS lastEditor
    FROM form_config_versions v GROUP BY v.form_id`).all<{ formId: string; publishedVersion: number; draftVersion: number; lastChangedAt: number; lastEditor?: string; publishedConfigJson: string; publishedAt: number }>();
  const versions = new Map(result.results.map(row => [row.formId, row]));
  const nativeForms = [...NATIVE_TASK_FORM_IDS].filter(id => !isParkedDeliveryForm(id));
  const rows = Object.values(FORM_REGISTRY).filter(form => !isParkedDeliveryForm(form.id) && isFormCatalogEditable(form)).map(form => {
    const stored = versions.get(form.id);
    let availability: 'checked' | 'core' | 'unavailable';
    let availabilityReason: string | undefined;
    try {
      decodePublishedForm(form.id, stored?.publishedVersion ? { version: stored.publishedVersion,
        config_json: stored.publishedConfigJson, published_at: stored.publishedAt } : null);
      availability = stored?.publishedVersion ? 'checked' : 'core';
    } catch (error) { availability = 'unavailable'; availabilityReason = error instanceof FormRuntimeError ? error.message : 'Form definition could not be checked.'; }
    return { form: { id: form.id, audience: form.audience, adapterId: form.adapterId },
      presentation: formCatalogPresentation(form), publishedVersion: stored?.publishedVersion ?? 0,
      draftVersion: stored?.draftVersion ?? 0, lastChangedAt: stored?.lastChangedAt, lastEditor: stored?.lastEditor, availability, availabilityReason };
  });
  return <div className="grid min-w-0 gap-6">
    <div><AdminPageTitle><h1 className="section-title">Form Management</h1></AdminPageTitle>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Find a form, check what it asks, and make changes. Save a draft, preview it, then publish when it is ready.</p>
    </div>
    <FormCatalogList rows={rows} />
    <details className="rounded-xl border bg-card p-5"><summary className="min-h-11 content-center cursor-pointer font-semibold">Managed by their features · {nativeForms.length} native tasks</summary><p className="mt-3 text-sm text-muted-foreground">Use the owning workspace for native controls. Existing questions, answers and historical identifiers remain; no editorial publication is invented for a native task.</p><ul className="mt-4 grid gap-3 md:grid-cols-2">{nativeForms.map(id=>{const destination=nativeFormDestination(id),stored=versions.get(id);return <li key={id} className="min-w-0 rounded-lg border p-3"><h2 className="font-semibold">{formCatalogPresentation(FORM_REGISTRY[id]).label}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{id} · {stored?.publishedVersion?'Published question history retained':'Native contract; no editorial publication'}{stored?.draftVersion?' · Unpublished draft history retained':''}</p><div className="mt-2 flex flex-wrap gap-3 text-sm">{destination?<Link href={withAdminReturnTo(destination.href,'/admin/forms')} className="section-link underline">{destination.label}</Link>:null}<Link href={'/admin/forms/'+encodeURIComponent(id)} className="section-link underline">Task and question history</Link></div></li>;})}</ul></details>
    <section className="space-y-3 rounded-xl border p-5" aria-label="Observed form loading and saved submissions"><h2 className="text-xl font-semibold">Actual loading and saved submissions</h2><p>Definition compatibility above is a configuration check. Durable submissions below come from committed domain receipts for the recorded environment, release and version.</p>{health.length?health.map(row=><article key={row.formId} className="rounded border p-3"><h3>{row.formId} · {row.state.replaceAll('_',' ')}</h3><p>{row.lastLoad?'Last definition observation: '+row.lastLoad.outcome:'No loading observation'} · {row.lastSave?'Durable submission recorded':'No durable submission evidence for this release and version'}</p>{row.lastLoad?<p>Support reference: {row.lastLoad.supportReference}</p>:null}</article>):<p>Unknown — no matching runtime or durable-submission observations have been recorded.</p>}<Link href="/admin/system-health" className="section-link underline">Open System health and scoped records</Link></section>
    <details className="rounded-xl border bg-card p-5"><summary className="min-h-11 content-center w-fit cursor-pointer font-semibold text-primary">History and recorded answers</summary>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Form changes and submitted answers are separate records. Access to answers depends on your permissions.</p>
      <div className="mt-3 flex flex-wrap gap-4"><Link href="/admin/form-submissions" className="section-link underline">Sign-in and identity request history</Link><Link href="/admin/staff-form-history" className="section-link underline">Staff form history</Link></div>
    </details>
  </div>;
}
