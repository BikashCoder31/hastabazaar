import Link from 'next/link';
import {env} from 'cloudflare:workers';
import {requireStaffPage} from '@/lib/auth/staff';
import {requireDatabase} from '@/lib/db/d1';
import {formHealthRuntimeScope} from '@/lib/operations/form-health';
import {searchSystemRecords} from '@/lib/operations/system-records';
import {safeAdminReturnTo,withAdminReturnTo} from '@/lib/admin/return-context';
export const dynamic='force-dynamic';
export default async function RecordsPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const actor=await requireStaffPage('/admin/system-health/records','system.health.view'),params=await searchParams,scope=formHealthRuntimeScope(env as unknown as Record<string,string|undefined>);
 const fields=['reference','type','actor','from','to','status','action'];
 const filters=Object.fromEntries(fields.map(key=>[key,typeof params[key]==='string'?params[key] as string:undefined]));
 const returnTo=safeAdminReturnTo(params.returnTo,'/admin/system-health'),query=new URLSearchParams();
 for(const [key,value]of Object.entries(filters))if(value!==undefined)query.set(key,value);
 const currentHref=withAdminReturnTo('/admin/system-health/records?'+query.toString(),returnTo);
 let result:Awaited<ReturnType<typeof searchSystemRecords>>|null=null;
 try{result=await searchSystemRecords(requireDatabase(env as unknown as {DB?:D1Database}),actor.id,{...filters,environment:scope.environment});}catch{/* Error view contains no protected record metadata. */}
 return <section className="space-y-5"><Link className="text-sm underline" href={returnTo}>Back to results</Link><h1 className="section-title">Records &amp; audit</h1>
  <p>Environment: {scope.environment} · Release: {scope.releaseId}. Only currently authorized record metadata appears here.</p><Link href={withAdminReturnTo('/admin/system-health',returnTo)}>System health overview</Link>
  <form data-form-id="staff.system-records-filter" className="grid gap-3 sm:grid-cols-2" method="get"><input type="hidden" name="returnTo" value={returnTo}/>{fields.map(key=><label key={key}>{key==='actor'?'Recorded actor ID':key==='type'?'Record family':key}<input className="block w-full rounded border p-2" name={key} maxLength={200} defaultValue={filters[key]} type={key==='from'||key==='to'?'date':'text'}/></label>)}<p>Families: form, file, incident, delivery, review, action. Delivery and full action history require separate current authority.</p><button>Find scoped records</button></form>
  {!result?<p role="alert">These records could not be read. Review the filters and your current source access.</p>:<><ol>{result.records.map(record=><li key={record.type+record.reference} className="rounded border p-3">{record.reference} · {record.record} · {record.action} · {record.status} · {new Date(record.createdAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'})}{record.actorId?<p>Recorded actor: {record.actorId}</p>:null}{record.changes?.map(change=><p key={change.field}>{change.field}: {change.before??'Not recorded'} → {change.after??'Not recorded'}</p>)}{record.href?<Link className="underline" href={withAdminReturnTo(record.href,currentHref)}>Open authorized source</Link>:null}</li>)}</ol>{!result.records.length?<p>No authorized records appear in this bounded source window.</p>:null}<p>{result.coverage}</p><p>{result.retention}</p></>}
  <Link href={withAdminReturnTo('/admin/activity',currentHref)}>Open protected business action history</Link>
 </section>;
}
