import Link from 'next/link';
import type {SystemHealthOverview} from '@/lib/operations/system-health-workspace';
import {withAdminReturnTo} from '@/lib/admin/return-context';

export function OverviewHealth({health}:{health:SystemHealthOverview|null|undefined}){
 if(health===undefined)return null;
 if(health===null)return <section aria-label="Health observations" className="rounded-xl border bg-card p-4"><output className="block">System health is unknown: current observations could not be read.</output><Link href={withAdminReturnTo('/admin/system-health','/admin')} className="section-link inline-flex min-h-11 items-center">Open System health</Link></section>;
 const incidents=health.incidents.filter(item=>['critical','high'].includes(item.severity)),affectedServices=health.services.filter(item=>['degraded','outage','action_needed','unavailable'].includes(item.state)),affectedForms=health.forms.filter(item=>['degraded','action_needed'].includes(item.state)),unknown=health.services.some(item=>item.state==='unknown')||health.forms.some(item=>item.state==='unknown')||health.environment==='unknown';
 if(!incidents.length&&!affectedServices.length&&!affectedForms.length&&!unknown)return null;
 return <section aria-labelledby="urgent-work-heading" className="space-y-3 rounded-xl border bg-card p-4">
  <h2 id="urgent-work-heading" className="font-semibold">{incidents.length||affectedServices.length||affectedForms.length?'Service issues needing attention':'Health observations'}</h2>
  {unknown?<output className="block text-sm">Some current health observations are unknown. This does not establish that services are healthy.</output>:null}
  {incidents.length?<ul className="grid gap-3 md:grid-cols-2">{incidents.slice(0,4).map(item=><li key={item.id} className="min-w-0 space-y-1 rounded border p-3 text-sm [overflow-wrap:anywhere]"><p className="font-semibold">{item.severity} incident · {item.state.replaceAll('_',' ')}</p><p>{item.ownerId?`Owner: ${item.ownerId}`:'Unassigned — technical coverage needed'}</p><p>Next: {item.nextAction??'Open the original incident for current recovery and follow-up.'}</p><Link className="section-link inline-flex min-h-11 items-center" href={withAdminReturnTo('/admin/system-health/incidents?incident='+encodeURIComponent(item.id),'/admin')}>Open issue</Link></li>)}</ul>:null}
  {affectedServices.length||affectedForms.length?<p className="text-sm">{affectedServices.length} observed service issues · {affectedForms.length} affected form journeys. Automatic recovery and business decisions remain separate.</p>:null}
  <Link className="section-link inline-flex min-h-11 items-center" href={withAdminReturnTo('/admin/system-health','/admin')}>Open current health and recovery</Link>
 </section>;
}

