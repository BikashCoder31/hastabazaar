import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormCatalogList } from '@/components/admin/form-catalog-list';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { formCatalogPresentation, isFormCatalogEditable } from '@/lib/forms/catalog-presentation';

export const dynamic = 'force-dynamic';

export default async function FormCatalogPage() {
  const staff = await requireStaffPage('/admin/forms', 'business_settings.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const result = await db.prepare(`SELECT v.form_id AS formId,
    MAX(CASE WHEN v.status = 'published' THEN v.version ELSE 0 END) AS publishedVersion,
    MAX(CASE WHEN v.status = 'draft' THEN v.version ELSE 0 END) AS draftVersion,
    MAX(v.updated_at) AS lastChangedAt,
    (SELECT u.display_name FROM form_config_versions latest LEFT JOIN users u ON u.id = latest.updated_by
      WHERE latest.form_id = v.form_id ORDER BY latest.updated_at DESC, latest.version DESC LIMIT 1) AS lastEditor
    FROM form_config_versions v GROUP BY v.form_id`).all<{ formId: string; publishedVersion: number; draftVersion: number; lastChangedAt: number; lastEditor?: string }>();
  const versions = new Map(result.results.map(row => [row.formId, row]));
  const rows = Object.values(FORM_REGISTRY).filter(isFormCatalogEditable).map(form => ({
    form: { id: form.id, audience: form.audience, adapterId: form.adapterId },
    presentation: formCatalogPresentation(form), publishedVersion: 0, draftVersion: 0, ...versions.get(form.id),
  }));
  return <div className="grid min-w-0 gap-6">
    <div><p className="eyebrow">Super Admin · Controls</p><h1 className="section-title">Form catalog</h1>
      <p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Find a form, check what it asks, and make changes. Save a draft, preview it, then publish when it is ready.</p>
    </div>
    <FormCatalogList rows={rows} />
    <details className="rounded-xl border bg-card p-5"><summary className="w-fit cursor-pointer font-semibold text-primary">History and recorded answers</summary>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">Form changes and submitted answers are separate records. Access to answers depends on your permissions.</p>
      <div className="mt-3 flex flex-wrap gap-4"><Link href="/admin/form-submissions" className="text-sm font-medium text-primary hover:underline">Sign-in and identity request history</Link><Link href="/admin/staff-form-history" className="text-sm font-medium text-primary hover:underline">Staff form history</Link></div>
    </details>
  </div>;
}
