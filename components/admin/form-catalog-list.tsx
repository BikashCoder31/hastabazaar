'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ListChecks, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FORM_CATALOG_CATEGORIES, catalogNeedsAttention, filterFormCatalog, hasUnpublishedDraft, type CatalogStatusFilter, type FormCatalogRow } from '@/lib/forms/catalog-presentation';

const audiences: Readonly<Record<string, string>> = { public: 'Anyone', customer: 'Customers', seller: 'Sellers', rider: 'Delivery riders', staff: 'Staff', super_admin: 'Super Admin' };
const date = new Intl.DateTimeFormat('en-NP', { dateStyle: 'medium', timeZone: 'Asia/Kathmandu' });
const selectClass = 'min-h-11 w-full rounded-lg border bg-background px-3 text-sm';

export function FormCatalogList({ rows }: { rows: readonly FormCatalogRow[] }) {
  const [query, setQuery] = useState('');
  const [audience, setAudience] = useState('all');
  const [category, setCategory] = useState('all');
  const [status, setStatus] = useState<CatalogStatusFilter>('all');
  const filtered = filterFormCatalog(rows, { query, audience, category, status });
  function reset() { setQuery(''); setAudience('all'); setCategory('all'); setStatus('all'); }
  return <div className="grid min-w-0 gap-5">
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Catalog overview">
      {[['all', 'All forms', rows.length], ['draft', 'Draft changes', rows.filter(hasUnpublishedDraft).length], ['attention', 'Needs attention', rows.filter(catalogNeedsAttention).length]].map(([value, label, count]) =>
        <button key={value} type="button" onClick={() => setStatus(value as CatalogStatusFilter)} aria-pressed={status === value} className={`min-h-20 rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-primary ${status === value ? 'border-primary bg-primary/5' : 'bg-card hover:bg-secondary/50'}`}>
          <span className="block text-sm text-muted-foreground">{label}</span><span className="mt-1 block text-2xl font-semibold">{count}</span>
        </button>)}
    </div>
    <section aria-label="Find a form" className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]">
        <div><label htmlFor="catalog-search" className="mb-1.5 block text-sm font-medium">Search forms</label><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" /><Input id="catalog-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try stock, delivery, or application" className="min-h-11 pl-9" /></div></div>
        <div><label htmlFor="catalog-audience" className="mb-1.5 block text-sm font-medium">Who fills it in</label><select id="catalog-audience" value={audience} onChange={event => setAudience(event.target.value)} className={selectClass}><option value="all">Everyone</option>{Object.entries(audiences).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
        <div><label htmlFor="catalog-category" className="mb-1.5 block text-sm font-medium">Category</label><select id="catalog-category" value={category} onChange={event => setCategory(event.target.value)} className={selectClass}><option value="all">All categories</option>{FORM_CATALOG_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></div>
        <div><label htmlFor="catalog-status" className="mb-1.5 block text-sm font-medium">Status</label><select id="catalog-status" value={status} onChange={event => setStatus(event.target.value as CatalogStatusFilter)} className={selectClass}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft changes</option><option value="unpublished">Not published</option><option value="attention">Needs attention</option></select></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2"><output aria-live="polite" className="text-sm text-muted-foreground">Showing {filtered.length} of {rows.length} forms</output><Button type="button" variant="ghost" size="sm" onClick={reset}>Clear filters</Button></div>
      {status === 'attention' ? <p className="text-sm text-muted-foreground">These forms have draft changes, have not been published, or need setup before they can be used.</p> : null}
    </section>
    {!filtered.length ? <div className="rounded-2xl border bg-card p-8 text-center"><h2 className="text-lg font-semibold">No forms match your search</h2><p className="mt-2 text-sm text-muted-foreground">Try a different word or clear the filters.</p><Button type="button" variant="outline" className="mt-4" onClick={reset}>Show all forms</Button></div> : null}
    {FORM_CATALOG_CATEGORIES.map(group => {
      const forms = filtered.filter(row => row.presentation.category === group).toSorted((a, b) => a.presentation.label.localeCompare(b.presentation.label));
      if (!forms.length) return null;
      return <Card key={group} className="min-w-0"><CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="size-4 shrink-0 text-primary" /><h2>{group}</h2></CardTitle><CardDescription>{forms.length} {forms.length === 1 ? 'form' : 'forms'}</CardDescription></CardHeader>
        <CardContent className="min-w-0 px-0"><div className="hidden grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] gap-4 border-b px-5 pb-3 text-sm font-semibold xl:grid" aria-hidden="true"><span>Form</span><span>Who fills it in</span><span>Status</span><span>Last updated</span><span>Actions</span></div><ul>{forms.map(row => {
          const href = `/admin/forms/${encodeURIComponent(row.form.id)}`;
          return <li key={row.form.id} className="grid min-w-0 gap-3 border-b p-5 last:border-0 xl:grid-cols-[minmax(0,2fr)_minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1fr)] xl:gap-4" data-catalog-form={row.form.id}>
            <div className="min-w-0"><Link href={href} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:underline">{row.presentation.label}</Link><p className="mt-1 text-sm leading-6 text-muted-foreground">{row.presentation.description}</p></div>
            <p className="text-sm"><span className="sr-only">Who fills it in: </span>{audiences[row.form.audience]}</p>
            <div className="flex flex-wrap items-start gap-1.5"><Badge variant={row.publishedVersion ? 'default' : 'secondary'}>{row.publishedVersion ? `Published · v${row.publishedVersion}` : 'Not published'}</Badge>{hasUnpublishedDraft(row) ? <Badge variant="outline">Draft changes</Badge> : null}{row.form.adapterId.startsWith('pending:') ? <Badge variant="secondary">Needs setup</Badge> : null}</div>
            <div className="text-sm text-muted-foreground"><span className="sr-only">Last updated: </span>{row.lastChangedAt ? date.format(new Date(row.lastChangedAt)) : 'No changes yet'}{row.lastEditor ? <p className="mt-1 break-words text-xs">by {row.lastEditor}</p> : null}</div>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1 text-sm font-medium text-primary"><Link href={`${href}#form-preview`} className="inline-flex min-h-8 items-center hover:underline" aria-label={`Preview ${row.presentation.label}`}>Preview</Link><Link href={href} className="inline-flex min-h-8 items-center hover:underline" aria-label={`Edit ${row.presentation.label}`}>Edit</Link><Link href={`${href}#version-history`} className="inline-flex min-h-8 items-center hover:underline" aria-label={`View changes to ${row.presentation.label}`}>Changes</Link></div>
          </li>;
        })}</ul></CardContent></Card>;
    })}
  </div>;
}
