import {can,type PermissionSubject} from '@/lib/marketplace/permissions';
import {listExceptionWork,exceptionOwners,exceptionHistory} from '@/lib/operations/exception-work';
import {ExceptionWorkForm} from './exception-work-form';
function evidenceReference(value: string): string {
 try { const parsed: unknown=JSON.parse(value);if(parsed && typeof parsed==='object' && 'reference' in parsed && typeof parsed.reference==='string')return parsed.reference; } catch { /* Legacy source references are plain IDs. */ }
 return value;
}
export async function ExceptionOrderSection({db,orderId,staff}:{db:D1Database;orderId:string;staff:PermissionSubject&{id:string}}){
 const [items,owners,jobs]=await Promise.all([listExceptionWork(db,staff.id,orderId),exceptionOwners(db,staff.id),db.prepare('SELECT id,status FROM shipping_jobs WHERE order_id=?').bind(orderId).all<{id:string;status:string}>()]);
 const histories=await Promise.all(items.map(item=>exceptionHistory(db,staff.id,item.id)));
 return <section id="exceptions" className="mt-6 rounded-xl border bg-card p-5"><h2 className="font-heading text-2xl">Exception follow-up</h2><p className="mt-2 text-sm text-muted-foreground">Assign a reviewer, record the next action and retain evidence. Existing incident governance and financial records remain separate.</p>
 {items.map((item,i)=><article className="mt-4 rounded border p-4" key={item.id}><h3 className="font-semibold capitalize">{item.kind.replaceAll('_',' ')} · {item.status}</h3><p className="mt-2">Responsible: {item.ownerName??'Unassigned operations queue'}</p><p className="mt-1">Next action: {item.nextAction}</p>{item.cashRecordId?<p className="mt-1 text-sm">Posted cash reference: {item.cashRecordId}</p>:null}<details className="mt-3"><summary>Recorded history</summary><ol className="mt-2 space-y-3">{histories[i].map(h=><li key={h.id} className="border-t pt-2 text-sm"><strong>{h.action}</strong> · {h.actorName} · {new Date(h.createdAt).toLocaleString('en-NP',{timeZone:'Asia/Kathmandu'})}<p>Owner: {h.ownerName??'Unassigned operations queue'}</p><p>{h.nextAction}</p><p>{h.note}</p>{h.evidence?<p>Resolution evidence: {evidenceReference(h.evidence)}</p>:null}</li>)}</ol></details>{item.status==='open'?<ExceptionWorkForm key={item.version} work={item} jobs={jobs.results} owners={owners} finance={can(staff,'payout.prepare')}/>:null}</article>)}
 {jobs.results.length?<details className="mt-4"><summary>Report a parcel or posted-cash exception</summary><ExceptionWorkForm jobs={jobs.results} owners={owners} finance={can(staff,'payout.prepare')}/></details>:<p className="mt-3 text-sm">Prepare seller parcels before recording source-linked follow-up.</p>}</section>;
}
