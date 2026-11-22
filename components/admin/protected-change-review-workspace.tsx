import {LegacyProtectedTransitionNote} from '@/components/seller/legacy-protected-transition-note';
import Link from 'next/link';
import {ReviewWorkspace} from '@/components/admin/review-workspace';
import {SellerBankEvidence} from '@/components/admin/seller-bank-evidence';
import {SellerBankReview} from '@/components/admin/seller-bank-review';
import {ProtectedChangePermissionForm} from '@/components/admin/protected-change-permission-form';
import {ProtectedIdentityReview} from '@/components/admin/protected-identity-review';
import {ProtectedChangeDisposition} from '@/components/admin/protected-change-disposition';
import {StaffReviewAccessBoundary} from '@/components/admin/staff-review-access-boundary';
import type {ProtectedChangeWorkspace} from '@/lib/sellers/protected-change-workspace';
const date=(time:number)=>new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(time);
export function ProtectedChangeReviewWorkspace({workspace,actorId}:{workspace:ProtectedChangeWorkspace;actorId:string}){
 const id=workspace.record.id;
  const {record,evidence,bank,capability}=workspace,personalConflict=evidence.seller.userId===actorId,holds=capability.holds.filter(hold=>hold.caseId===id);
  const identityProposal=record.kind==='identity'&&record.proposedJson?JSON.parse(record.proposedJson) as {before:Record<string,string>;values:Record<string,string>}:null;
  return <StaffReviewAccessBoundary actorId={actorId} sourceId={id}><ReviewWorkspace record={{name:evidence.seller.tradingName,reference:record.id,type:record.kind==='bank'?'Bank change':'Protected identity change',owner:record.owner,
    version:String(record.version),status:record.status,backHref:`/admin/sellers/${encodeURIComponent(record.sellerId)}`}}
    summary={<div className="space-y-2"><LegacyProtectedTransitionNote transition={workspace.transition}/><p>{record.reason}</p><p>Submitted {date(record.requestedAt)} · Updated {date(record.updatedAt)}</p><p>{record.dueAt?`First triage target ${date(record.dueAt)}. Replies and replacements do not restart it.`:'No historical first-triage target is recorded.'}</p><p>Classification: {record.classification.replaceAll('_',' ')}</p>{record.reviewReason?<p>Latest review: {record.reviewReason}</p>:null}</div>}
    current={<dl className="mt-3 space-y-2"><div><dt>Legal person</dt><dd>{evidence.seller.legalName}</dd></div><div><dt>Representative</dt><dd>{evidence.seller.representativeName||'Not supplied'}</dd></div>
      <div><dt>Current identity revision</dt><dd>{record.identityRevision}</dd></div><div><dt>Current beneficiary revision</dt><dd>{record.bankRevision}</dd></div><div><dt>Government ID / PAN</dt><dd>{evidence.identity?`${evidence.identity.type}: ${evidence.identity.number}`:'See current private evidence'} · {evidence.identity?.pan||evidence.seller.taxNumber||'PAN not supplied'}</dd></div></dl>}
    proposed={<div className="mt-3 space-y-3"><p>Permitted/requested scope: {workspace.fields.join(', ')}</p>{bank?<SellerBankEvidence workspace={bank}/>:identityProposal?<table className="w-full text-left text-sm"><thead><tr><th>Fact</th><th>Before</th><th>Proposed</th></tr></thead><tbody>{Object.entries(identityProposal.values).map(([field,value])=><tr key={field}><th>{field.replace(/([A-Z])/g,' $1')}</th><td>{identityProposal.before[field]||'Not supplied'}</td><td>{value||'Removed explicitly'}</td></tr>)}</tbody></table>:<p>Awaiting the permitted facts and private evidence.</p>}</div>}
    evidence={<ul className="mt-3 space-y-3">{evidence.documents.map(document=><li key={document.id}><a className="section-link" href={`/api/admin/seller-documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">{document.kind.replaceAll('_',' ')}: {document.originalName} ↗</a><p>{document.status} · {document.currentSubmission?'Latest submission':'Retained earlier version'}</p></li>)}</ul>}
    dependencies={<div className="mt-3 space-y-3"><p>{holds.length?`This case holds ${holds.map(hold=>hold.capability.replaceAll('_',' ')).join(' and ')}.`:'No active hold belongs to this case.'} Other identity, bank, terms, governance and payment checks remain separate.</p>
      {record.kind==='identity'?<SellerBankEvidence workspace={workspace.currentBank}/>:null}
      {workspace.packets.map(packet=><p key={`${packet.model}:${packet.id}`}>{packet.model==='registered'?<Link className="section-link" href={`/admin/payouts/${encodeURIComponent(packet.id)}`}>Payout {packet.id}</Link>:<>Payout {packet.id}</>} · {packet.replacementId?`Retired and linked to fresh packet ${packet.replacementId}`:packet.retiredAt?'Retired; current eligible earnings still need fresh preparation':packet.disposition==='reconcile'?'Confirmation needed; preserve original destination and reservation':'Old execution approval invalidated; requires safe retirement and fresh preparation'}.</p>)}
      {!personalConflict?<a className="section-link" href="#review-readiness-disposition">Record separate readiness or packet disposition ↓</a>:null}</div>}
    decision={<div className="space-y-5">{personalConflict?<p>You cannot review your own seller or beneficiary. An eligible nonconflicted Super Admin must handle this case.</p>:null}
      {record.kind==='bank'?<SellerBankReview actorId={actorId} sellerId={record.sellerId} revision={workspace.currentBank.revision} changeRequestId={id} canDecide={!personalConflict&&record.status==='open'&&!!bank?.proposed}/>:null}
      {record.kind==='identity'?<ProtectedIdentityReview actorId={actorId} caseId={id} version={record.version} identityRevision={record.identityRevision} bankRevision={record.bankRevision} canDecide={!personalConflict&&record.status==='open'&&!!identityProposal}/>:null}
      <ProtectedChangePermissionForm actorId={actorId} caseId={id} version={record.version} identityRevision={record.identityRevision} bankRevision={record.bankRevision} canDecide={!personalConflict&&(record.status==='open'||['rejected','withdrawn','closed'].includes(record.status)&&holds.length>0)}/>
      {record.status!=='open'?<p>The recorded outcome is above. Any remaining capability hold needs its own reviewed disposition.</p>:null}</div>}
    history={<ol className="mt-3 space-y-3">{workspace.history.map(event=><li key={event.id}><p>{event.action.replaceAll('_',' ')} · {date(event.createdAt)}{event.actor?` · ${event.actor}`:''}</p><p>{event.reason}</p></li>)}</ol>}
  ><section id="review-readiness-disposition" className="scroll-mt-48"><ProtectedChangeDisposition actorId={actorId} canDecide={!personalConflict} caseId={id} version={record.version} identityRevision={record.identityRevision} bankRevision={record.bankRevision}
      kind={record.kind} status={record.status} hasProposal={!!record.proposedJson} capabilities={holds.map(hold=>hold.capability)} packets={workspace.packets.filter(packet=>!packet.retiredAt)}/></section></ReviewWorkspace></StaffReviewAccessBoundary>;
}
