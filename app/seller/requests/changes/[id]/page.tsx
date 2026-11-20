import {LegacyProtectedTransitionNote} from '@/components/seller/legacy-protected-transition-note';
import {env} from 'cloudflare:workers';
import Link from 'next/link';
import {notFound} from 'next/navigation';
import {requireSellerCenterPage} from '@/lib/auth/seller-center';
import {requireDatabase} from '@/lib/db/d1';
import {protectedChangeWorkspace} from '@/lib/sellers/protected-change-workspace';
import {ProtectedChangeError} from '@/lib/sellers/protected-change-policy';
import {SellerBankDetailsForm} from '@/components/seller/bank-details-form';
import {SellerDocumentHistory} from '@/components/seller/document-history';
import {ProtectedIdentityForm} from '@/components/seller/protected-identity-form';
import {ProtectedChangeWithdrawal} from '@/components/seller/protected-change-withdrawal';
export const dynamic='force-dynamic';
const date=(time:number)=>new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(time);
export default async function SellerProtectedChangePage({params}:{params:Promise<{id:string}>}){
  const {id}=await params,viewer=await requireSellerCenterPage(`/seller/requests/changes/${id}`),db=requireDatabase(env as unknown as {DB?:D1Database});
  const workspace=await protectedChangeWorkspace(db,id,viewer.userId,'owner').catch(error=>{if(error instanceof ProtectedChangeError&&[403,404].includes(error.status))notFound();throw error;});
  const {record,capability}=workspace,holds=capability.holds.filter(hold=>hold.caseId===id);
  return <div className="space-y-6"><LegacyProtectedTransitionNote transition={workspace.transition}/><Link className="section-link" href="/seller/requests">← All requests</Link><header><p className="eyebrow">Reference {record.id}</p>
    <h1 className="font-heading text-3xl">{record.kind==='bank'?'Bank':'Protected identity'} change</h1><p>{record.status.replaceAll('_',' ')} · Updated {date(record.updatedAt)}</p></header>
    <section className="space-y-3 rounded-xl border p-5"><p>{record.reason}</p><p>Requested scope: {workspace.fields.join(', ')}</p>
      <p>Submitted {date(record.requestedAt)}{record.dueAt?` · First triage target ${date(record.dueAt)}`:''}</p>{record.reviewReason?<p>Review: {record.reviewReason}</p>:null}
      <p>{holds.length?`This case pauses ${holds.map(hold=>hold.capability==='new_orders'?'new orders':'payouts').join(' and ')}.`:'This case has no outstanding capability hold. Other readiness checks and restrictions still apply.'}</p>
      <p>Existing orders keep their original obligations and any separate restrictions. A document decision does not execute a bank transfer.</p>
      <p>Next action: {workspace.permission?'supply only the permitted replacement fields and evidence.':record.status==='open'?'Hastabazaar must review the current scope or replacement.':holds.length?'Hastabazaar must record the remaining hold disposition and readiness outcome.':'see the recorded outcome and any other outstanding requests.'}</p>
    </section>
    {record.kind==='bank'?<SellerBankDetailsForm accountId={viewer.userId} caseId={id} defaults={workspace.bank?.current?.details} allowedFields={workspace.permission?JSON.parse(workspace.permission.scope) as string[]:undefined}/>:null}
    {record.kind==='identity'&&workspace.permission?<ProtectedIdentityForm caseId={id} permissionId={workspace.permission.id} accountId={viewer.userId} fields={workspace.fields} defaults={workspace.identity} evidenceKinds={workspace.possibleEvidence}/>:null}
    {['open','rejected'].includes(record.status)?<ProtectedChangeWithdrawal caseId={id} version={record.version} accountId={viewer.userId}/>:null}
    <section className="space-y-3 rounded-xl border p-5"><h2 className="font-heading text-xl">Case history</h2><ol className="space-y-3">{workspace.history.map(event=><li key={event.id}><p>{event.action.replaceAll('_',' ')} · {date(event.createdAt)}</p><p>{event.reason}</p></li>)}</ol></section>
    <SellerDocumentHistory workspace={workspace.evidence}/>
  </div>;
}
