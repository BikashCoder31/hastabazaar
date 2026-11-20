import { AdminPageTitle } from '@/components/admin/page-help';
import {RecordedDateRangeFields} from '@/components/admin/recorded-date-range-fields';
import {RecordedTime} from '@/components/admin/recorded-time';
import {dateCalendar} from '@/lib/dates/nepal-calendar';
import {Field,FieldLabel,FieldDescription} from '@/components/ui/field';
import {Input} from '@/components/ui/input';
import {Button} from '@/components/ui/button';
import {RecordedProgressSection} from '@/components/admin/recorded-progress';
import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listBusinessActivity, auditDestination, type BusinessActivity } from '@/lib/db/repositories/business-activity';
import { getAdminWorkSummary } from '@/lib/db/repositories/admin-workspace';
import { loadQueryPresentationConfig, queryFieldPresentation } from '@/lib/catalog/shop-query';
export const dynamic='force-dynamic';
export default async function BusinessActivityPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
 const staff=await requireStaffPage('/admin/activity','audit_log.view');if(staff.role!=='super_admin')notFound();
 const db=requireDatabase(env as unknown as {DB?:D1Database});const params=await searchParams;const filters=Object.fromEntries(['action','actor','type','from','to','calendar'].map(k=>[k,typeof params[k]==='string'?params[k]:undefined]));
 const presentationPromise=loadQueryPresentationConfig(db,'staff.activity-filter');
 let events:BusinessActivity[]=[];let error='';try{events=await listBusinessActivity(db,staff,filters);}catch(e){error=e instanceof Error&&/date|Filters/.test(e.message)?e.message:'Business activity is unavailable. Refresh and try again.';}
 const work=await getAdminWorkSummary(db,staff.role);
 const presentation=await presentationPromise;
 const queues=[['Seller applications awaiting review',work.sellers,'/admin/sellers'],['Products awaiting review',work.products,'/admin/products'],['Orders with items ready for pickup',work.readyOrders,'/admin/orders'],['Active returns',work.returns,'/admin/cases'],['Active complaints',work.complaints,'/admin/cases'],['Seller payout requests awaiting preparation',work.payoutRequests,'/admin/payouts'],['Payouts awaiting Super Admin decision',work.approvals?.payouts??0,'/admin/payouts'],['Returns awaiting high-value decision',work.approvals?.highValueRefunds??0,'/admin/cases']] as const;
 return <div className="space-y-6"><header><AdminPageTitle><h1 className="font-heading text-4xl">Business activity</h1></AdminPageTitle><p className="mt-3 text-muted-foreground">Current work and recorded business actions. Counts below describe records in their current state; they are not counts of completed approvals or staff performance.</p></header>
 <section aria-label="Current work" className="grid gap-3 sm:grid-cols-2">{queues.map(([label,count,href])=><Link key={label} href={href} className="rounded-xl border p-4"><strong className="text-2xl">{count}</strong><span className="block mt-2">{label}</span><span className="mt-2 block text-sm underline">Open review queue</span></Link>)}</section>
 <RecordedProgressSection db={db} staff={staff} filters={filters}/>
 <section className="rounded-xl border p-4"><h2 className="font-semibold">Recorded actions</h2><p className="mt-2 text-sm text-muted-foreground">Latest 100 matching audit records. Older actions appear only if the application recorded them at the time. Parcel history recorded before audit coverage remains in its original event records. An audit action records a business event, not proof that every related obligation is complete. Private notes and raw before/after data are excluded.</p>
 <form key={JSON.stringify(filters)} data-form-id="staff.activity-filter" className="mt-4 space-y-4" action="/admin/activity" method="get">
  <RecordedDateRangeFields from={filters.from??''} to={filters.to??''} initialCalendar={dateCalendar(filters.calendar)}
    fromField={queryFieldPresentation('staff.activity-filter',presentation.config,'from',{label:'From date'})}
    toField={queryFieldPresentation('staff.activity-filter',presentation.config,'to',{label:'Through date'})}
    emptyDateHelp="No date selected; this side of the action-history range is unrestricted.">
    {(['action','actor','type'] as const).map(key=>{const field=queryFieldPresentation('staff.activity-filter',presentation.config,key,{label:({action:'Exact action',actor:'Exact actor ID',type:'Exact record type'})[key]});return <Field className="min-w-0" key={key}><FieldLabel htmlFor={'activity-'+key}>{field.label}</FieldLabel><Input id={'activity-'+key} type="text" name={key} maxLength={160} defaultValue={filters[key]??''} placeholder={field.placeholder} aria-describedby={field.helpText?'activity-'+key+'-help':undefined}/>{field.helpText?<FieldDescription id={'activity-'+key+'-help'}>{field.helpText}</FieldDescription>:null}</Field>;})}
  </RecordedDateRangeFields>
  <div className="flex flex-wrap items-center gap-3"><Button variant="workspace-primary" size="workspace" type="submit">Filter recorded actions</Button><Link href="/admin/activity" className="section-link underline">Clear filters</Link></div>
 </form>{presentation.unavailable?<output className="mt-2 block text-sm text-muted-foreground">Filter presentation is unavailable. Standard filters remain available.</output>:null}
 {error?<p role="alert" className="mt-4">{error}</p>:<div className="mt-4 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Date (AD / BS) · Nepal time','Actor','Recorded action','Record'].map(h=><th className="p-3" key={h}>{h}</th>)}</tr></thead><tbody>{events.map(event=>{const href=auditDestination(event.subjectType,event.subjectId);return <tr className="border-t" key={event.id}><td className="p-3"><RecordedTime timestamp={event.createdAt}/></td><td className="p-3">{event.actorName??'Unattributed'}<span className="block text-xs">{event.actorId??'No actor ID recorded'}</span></td><td className="p-3">{event.action}</td><td className="p-3">{href?<Link className="section-link underline" href={href} prefetch={false}>{event.subjectType}: {event.subjectId}</Link>:event.subjectType}</td></tr>})}</tbody></table>{!events.length?<p className="p-3">No recorded actions match these filters.</p>:null}</div>}</section></div>;
}
