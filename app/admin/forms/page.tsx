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
import type { FormAudience } from '@/lib/forms/types';

export const dynamic = 'force-dynamic';
const audiences: readonly FormAudience[] = ['public', 'customer', 'seller', 'rider', 'staff', 'super_admin'];
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
  const forms = Object.values(FORM_REGISTRY);
  return <div className="grid min-w-0 gap-6">
    <div><p className="eyebrow">Super Admin · Controls</p><h1 className="section-title">Form catalog</h1><p className="mt-3 max-w-3xl text-sm leading-7 text-muted-foreground">Review fields and capabilities for every registered form. Connected adapters can accept safe draft changes; protected fields keep their server rules.</p><Link href="/admin/form-submissions" className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline">Restricted identity request history</Link></div>
    {audiences.map((audience) => {
      const group = forms.filter((form) => form.audience === audience);
      if (!group.length) return null;
      return <Card key={audience} className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2 capitalize"><ListChecks className="size-4 text-primary" />{audience.replace('_', ' ')} forms</CardTitle><CardDescription>{group.length} registered {group.length === 1 ? 'form' : 'forms'}</CardDescription></CardHeader>
        <CardContent className="min-w-0 overflow-x-auto px-0"><Table className="min-w-[620px]"><TableHeader><TableRow><TableHead className="pl-4">Form</TableHead><TableHead>Coverage</TableHead><TableHead>Published</TableHead><TableHead>Last change</TableHead><TableHead><span className="sr-only">Open</span></TableHead></TableRow></TableHeader><TableBody>{group.map((form) => {
          const version = versions.get(form.id);
          return <TableRow key={form.id}><TableCell className="pl-4"><Link href={`/admin/forms/${encodeURIComponent(form.id)}`} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">{form.id}</Link><p className="text-xs text-muted-foreground">{form.route}</p></TableCell><TableCell><Badge variant={form.adapterId.startsWith('pending:') ? 'secondary' : 'default'}>{form.adapterId.startsWith('pending:') ? 'Pending adapter' : 'Connected'}</Badge></TableCell><TableCell>{version?.publishedVersion ? `v${version.publishedVersion}` : 'None'}</TableCell><TableCell>{version?.lastChangedAt ? dates.format(new Date(version.lastChangedAt)) : '—'}</TableCell><TableCell><Link href={`/admin/forms/${encodeURIComponent(form.id)}`} aria-label={`Edit ${form.id}`} className="inline-flex rounded-md p-2 text-primary focus-visible:outline-2 focus-visible:outline-primary"><ArrowRight className="size-4" /></Link></TableCell></TableRow>;
        })}</TableBody></Table></CardContent></Card>;
    })}
  </div>;
}
