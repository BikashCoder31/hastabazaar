import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, ListChecks } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import { FORM_CATALOG_CATEGORIES, formCatalogPresentation, isFormCatalogEditable } from '@/lib/forms/catalog-presentation';

export const dynamic = 'force-dynamic';
const dates = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' });

export default async function FormCatalogPage() {
  const staff = await requireStaffPage('/admin/forms', 'business_settings.manage');
  if (staff.role !== 'super_admin') redirect('/staff-access-denied');
  const db = requireDatabase(env as unknown as { DB?: D1Database });
  const result = await db.prepare(`SELECT form_id AS formId,
    MAX(CASE WHEN status = 'published' THEN version ELSE 0 END) AS publishedVersion,
    MAX(CASE WHEN status = 'draft' THEN version ELSE 0 END) AS draftVersion,
    MAX(updated_at) AS lastChangedAt
    FROM form_config_versions GROUP BY form_id`).all<{ formId: string; publishedVersion: number; draftVersion: number; lastChangedAt: number }>();
  const versions = new Map(result.results.map((row) => [row.formId, row]));
  const forms = Object.values(FORM_REGISTRY).filter(isFormCatalogEditable).map((form) => ({ form, presentation: formCatalogPresentation(form) }));
  return <div className="grid min-w-0 gap-6">
    <div><p className="eyebrow">Super Admin · Controls</p><h1 className="section-title">Form catalog</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Customize questions and requirements for your business forms.</p><div className="mt-3 flex flex-wrap gap-4"><Link href="/admin/form-submissions" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Restricted identity request history</Link><Link href="/admin/staff-form-history" className="text-sm font-medium text-primary underline-offset-4 hover:underline">Staff form history</Link></div></div>
    {FORM_CATALOG_CATEGORIES.map((category) => {
      const group = forms.filter(({ presentation }) => presentation.category === category).toSorted((a, b) => a.presentation.label.localeCompare(b.presentation.label));
      if (!group.length) return null;
      return <Card key={category} className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="size-4 shrink-0 text-primary" />{category}</CardTitle><CardDescription>{group.length} {group.length === 1 ? 'form' : 'forms'}</CardDescription></CardHeader>
        <CardContent className="min-w-0 overflow-x-auto px-0"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead className="pl-4">Form</TableHead><TableHead>Coverage</TableHead><TableHead>Published</TableHead><TableHead>Last change</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{group.map(({ form, presentation }) => {
          const version = versions.get(form.id);
          return <TableRow key={form.id}><TableCell className="pl-4"><Link href={`/admin/forms/${encodeURIComponent(form.id)}`} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">{presentation.label}</Link><p className="text-xs capitalize text-muted-foreground">{form.audience.replace('_', ' ')} form</p></TableCell><TableCell><Badge variant={form.adapterId.startsWith('pending:') ? 'secondary' : 'default'}>{form.adapterId.startsWith('pending:') ? 'Pending adapter' : 'Connected'}</Badge></TableCell><TableCell>{version?.publishedVersion ? `v${version.publishedVersion}` : 'None'}</TableCell><TableCell>{version?.lastChangedAt ? dates.format(new Date(version.lastChangedAt)) : '—'}</TableCell><TableCell><Link href={`/admin/forms/${encodeURIComponent(form.id)}`} aria-label={`Edit ${presentation.label}`} className="inline-flex rounded-md p-2 text-primary focus-visible:outline-2 focus-visible:outline-primary"><ArrowRight className="size-4" /></Link></TableCell></TableRow>;
        })}</TableBody></Table></CardContent></Card>;
    })}
  </div>;
}
