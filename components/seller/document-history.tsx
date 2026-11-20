import {registrationEvidenceKinds} from '@/lib/sellers/document-policy';
import Link from 'next/link';
import { DocumentChangeRequestForm } from './document-change-request-form';
import type {SellerDocumentWorkspace} from '@/lib/sellers/document-workspace';
import {documentChangeState} from '@/lib/sellers/document-display-state';
import {ProtectedChangeRequestForm} from './protected-change-request-form';
import {protectedIdentityFields} from '@/lib/sellers/protected-change-requests';
const date=(value:number)=>new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(value);
export function SellerDocumentHistory({workspace}:{workspace:SellerDocumentWorkspace}) {
  return <section className="space-y-5" aria-labelledby="document-history-title"><h2 id="document-history-title" className="font-heading text-2xl">Evidence and change requests</h2>
    <p className="text-sm text-muted-foreground">Verified files and their protected identity details are locked. A replacement needs its own review; verification never enables orders or payouts by itself.</p>
    {!workspace.documents.length?<p>No documents have been submitted yet. You can add them when available.</p>:null}
    {workspace.audience==='seller'&&workspace.revisions&&workspace.documents.some(document=>document.currentEvidence&&(registrationEvidenceKinds as readonly string[]).includes(document.kind))?
      <details><summary className="cursor-pointer font-semibold">Request changes to protected identity facts</summary><div className="mt-3"><ProtectedChangeRequestForm kind="identity" fields={protectedIdentityFields} selectableFields accountId={workspace.seller.userId} {...workspace.revisions}/></div></details>:null}
    {workspace.protectedCases.map(record=><article key={record.id} className="space-y-2 rounded-xl border p-4"><p>{record.kind==='bank'?'Bank':'Identity'} change · {record.status}{record.held?' · Hold disposition remains required':''}</p><p>{record.reason}</p>
      <Link className="section-link" href={workspace.audience==='staff'?`/admin/seller-protected-changes/${encodeURIComponent(record.id)}`:`/seller/requests/changes/${encodeURIComponent(record.id)}`}>Open exact case →</Link></article>)}
    {workspace.requests.map(request=>{const permission=workspace.permissions.find(item=>item.requestId===request.id),replacement=workspace.documents.find(item=>item.id===request.replacementId);return <article id={`request-${request.id}`} key={request.id} className="scroll-mt-28 space-y-3 rounded-xl border p-5">
      <h3 className="font-semibold">{documentChangeState(request,workspace.documents)}</h3><p className="text-sm">Reference {request.id} · Submitted {date(request.requestedAt)}</p>
      <p>{request.reason}</p>{request.reviewReason?<p>Review: {request.reviewReason}</p>:null}{replacement?.reviewReason?<p>Replacement review: {replacement.reviewReason}</p>:null}
      {request.protectedCaseId?<Link className="section-link" href={workspace.audience==='staff'?`/admin/seller-protected-changes/${encodeURIComponent(request.protectedCaseId)}`:`/seller/requests/changes/${encodeURIComponent(request.protectedCaseId)}`}>Review this case&apos;s holds and readiness →</Link>:<p>This historical request needs protected-change reconciliation before another decision.</p>}
      {request.status==='submitted'?<p>Next action: Hastabazaar review. {request.dueAt?`First triage due ${date(request.dueAt)}.`:'The review target has not been recorded.'}</p>:null}
      {request.status==='approved'&&!permission?<p>The saved permission needs a current eligible reviewer. Contact Hastabazaar with this reference.</p>:null}
      {permission&&(registrationEvidenceKinds as readonly string[]).includes(permission.kind)?<DocumentChangeRequestForm accountId={workspace.seller.userId} key={permission.id} documentId={permission.documentId} requestId={request.id} permissionId={permission.id}/>:null}
      {request.replacementId?<a className="section-link" href={`#document-${request.replacementId}`}>View replacement evidence ↓</a>:null}
    </article>;})}
    <div className="grid gap-4 lg:grid-cols-2">{workspace.documents.map(document=>{const active=workspace.requests.some(request=>request.documentId===document.id&&['submitted','approved'].includes(request.status));
      const newerPending=workspace.documents.some(other=>other.kind===document.kind&&other.id!==document.id&&other.status==='pending'&&other.uploadedAt>=document.uploadedAt);
      return <article id={`document-${document.id}`} key={document.id} className="scroll-mt-28 space-y-3 rounded-xl border p-5"><h3 className="font-semibold capitalize">{document.kind.replaceAll('_',' ')}</h3>
      <p>{document.originalName}</p><p className="text-sm">{document.status==='verified'?(document.currentEvidence?'Current verified evidence':'Earlier verified evidence, retained'):!document.currentSubmission?'Earlier evidence, retained':document.reviewAction==='seller.document.correction_requested'?'Changes requested':document.status==='rejected'?'Rejected evidence':'Awaiting review'} · Uploaded {date(document.uploadedAt)}</p>
      {document.reviewedAt?<p className="text-sm">Reviewed {date(document.reviewedAt)}{document.reviewer?` by ${document.reviewer}`:''}</p>:null}{document.reviewReason?<p>{document.reviewReason}</p>:null}
      <a className="section-link" href={`/api/seller-applications/documents/${encodeURIComponent(document.id)}`} target="_blank" rel="noreferrer">Open private file ↗</a>
      {document.currentEvidence&&!active&&!newerPending&&(registrationEvidenceKinds as readonly string[]).includes(document.kind)?<DocumentChangeRequestForm accountId={workspace.seller.userId} documentId={document.id}/>:null}
      {document.currentSubmission&&['pending','rejected'].includes(document.status)&&(registrationEvidenceKinds as readonly string[]).includes(document.kind)
        &&!workspace.documents.some(other=>other.kind===document.kind&&other.status==='verified')?<DocumentChangeRequestForm accountId={workspace.seller.userId} documentId={document.id} unverified/>:null}
      {document.kind==='bank_verification'?<p><Link className="section-link" href="/seller/finance">Bank evidence uses its separate beneficiary review →</Link></p>:null}
    </article>;})}</div>
    <details><summary className="cursor-pointer font-semibold">Document decision history</summary><ol className="mt-4 space-y-3">{workspace.history.map(event=><li key={event.id}><p>{event.action.replace('seller.document.','').replaceAll('_',' ')} · {date(event.createdAt)}</p><p>{event.reason}</p>{event.actor?<p className="text-sm">Recorded by {event.actor}</p>:null}</li>)}</ol></details>
  </section>;
}
