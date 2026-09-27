import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { FormCatalogEditor, type CatalogVersion } from '@/components/admin/form-catalog-editor';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { validateFormDraft } from '@/lib/forms/validation';

export const dynamic = 'force-dynamic';

export default async function FormCatalogDetailPage({ params }: { params: Promise<{ formId: string }> }) {
  const staff = await requireStaffPage('/admin/forms', 'business_settings.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const { formId } = await params;
  if (!Object.hasOwn(FORM_REGISTRY, formId)) notFound();
  const form = FORM_REGISTRY[formId];
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const result = await db.prepare(`SELECT id,version,revision,status,config_json AS configJson,
    reason,updated_at AS updatedAt,published_at AS publishedAt
    FROM form_config_versions WHERE form_id = ? ORDER BY version DESC,revision DESC`)
    .bind(formId).all<Omit<CatalogVersion, 'config'> & { configJson: string }>();
  const versions: CatalogVersion[] = result.results.map(({ configJson, ...row }) => ({ ...row, config: validateFormDraft(formId, JSON.parse(configJson) as unknown) }));
  return <div className="grid min-w-0 gap-6"><div><Link href="/admin/forms" className="inline-flex items-center gap-2 text-sm text-primary underline-offset-4 hover:underline"><ArrowLeft className="size-4" /> Form catalog</Link><p className="eyebrow mt-5">Super Admin · Form editor</p><h1 className="section-title break-words">{form.id}</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">{form.audience.replace('_', ' ')} · {form.mode} · {form.route}</p></div><FormCatalogEditor form={form} versions={versions} /></div>;
}
