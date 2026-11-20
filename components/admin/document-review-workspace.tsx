import {registrationEvidenceKinds} from '@/lib/sellers/document-policy';
import { ReviewWorkspace } from './review-workspace';
import { SellerDocumentReview, DocumentChangeReview } from './seller-document-review';
import type {SellerDocumentWorkspace} from '@/lib/sellers/document-workspace';
import {documentChangeState} from '@/lib/sellers/document-display-state';
import {StaffReviewAccessBoundary} from './staff-review-access-boundary';
import {sellerDocumentLabel} from './seller-document-label';
const date=(value:number)=>new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(value);
export function DocumentReviewWorkspace({workspace,sellerId,documentId,requestId,viewerId}:{workspace:SellerDocumentWorkspace;sellerId:string;documentId?:string;requestId?:string;viewerId:string}) {
  const request=workspace.requests.find(item=>item.id===requestId);
  const selected=workspace.documents.find(item=>item.id===(documentId??request?.replacementId??request?.documentId));
  const original=workspace.documents.find(item=>item.id===request?.documentId);
  const state=request?documentChangeState(request,workspace.documents):selected&&!selected.currentSubmission&&selected.status!=='verified'?'Earlier submission, retained':selected?.reviewAction==='seller.document.correction_requested'?'Changes requested':selected?.status??'Unavailable';
  const personalConflict=workspace.seller.userId===viewerId;
  const permissionAvailable=!!request&&(request.status==='submitted'||request.status==='approved'&&!request.replacementId&&!workspace.permissions.some(permission=>permission.requestId===request.id));
  const evidence=(item:typeof selected)=>item?<div className="min-w-0 space-y-2 rounded-lg border p-4"><p className="break-words">{item.originalName} · {item.status}</p><p className="break-words text-sm">Version {item.id} · Submitted {date(item.uploadedAt)}</p>
    <p className="text-sm">{item.currentSubmission?'Latest submission':'Earlier submission, retained'}{item.currentEvidence?' · Current verified evidence':''}</p>
    {item.reviewedAt?<p className="text-sm">Reviewed {date(item.reviewedAt)}{item.reviewer?` by ${item.reviewer}`:''}</p>:null}{item.reviewReason?<p>{item.reviewReason}</p>:null}
    <a className="section-link inline-flex min-h-11 items-center" href={`/api/admin/seller-documents/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">Open private file ↗</a></div>:<p>No documents yet.</p>;
  const sellerName = workspace.seller.tradingName;
  const title = selected ? sellerDocumentLabel(selected.kind) + ' · ' + sellerName : sellerName;
  return <StaffReviewAccessBoundary actorId={viewerId} sourceId={JSON.stringify([sellerId,documentId,requestId])}><ReviewWorkspace record={{name:title,reference:workspace.seller.reference,type:request?'Protected document change':'Document verification',
    owner:request?.owner??null,version:selected?.id??requestId??'unavailable',status:state,backHref:`/admin/sellers/${encodeURIComponent(sellerId)}`}}
    summary={<div className="space-y-2"><p>{state}. {request?.status==='submitted'?'Super Admin must review the exact replacement scope.':request?.status==='approved'?'The seller must supply the permitted replacement.':selected?.currentSubmission&&selected.status==='pending'?'An eligible Super Admin must inspect this exact evidence version.':'See the recorded outcome and any remaining readiness checks.'}</p>
      {request?<><p>Request {request.id} · Submitted {date(request.requestedAt)}</p><p>{request.reason}</p><p>{request.dueAt?`First triage due ${date(request.dueAt)}. Subsequent corrections do not restart this target.`:'A first-triage target has not been recorded for this historical request.'}</p></>:null}</div>}
    current={<dl className="mt-3 space-y-2"><div><dt>Recorded legal name</dt><dd>{workspace.seller.legalName}</dd></div><div><dt>Representative</dt><dd>{workspace.seller.representativeName||'Not supplied'}</dd></div>
      <div><dt>PAN / tax number</dt><dd>{workspace.identity?.pan||workspace.seller.taxNumber||'Not supplied'}</dd></div><div><dt>Government ID</dt><dd>{workspace.identity?`${workspace.identity.type.replaceAll('_',' ')}: ${workspace.identity.number}`:'See the submitted registration'}</dd></div>{original?<div><dt>Original retained evidence</dt><dd>{evidence(original)}</dd></div>:null}</dl>}
    proposed={<div className="mt-3 space-y-3">{evidence(selected)}<p className="text-sm">This evidence permission does not authorize a different identity, PAN, bank account or unrelated field. Material identity proposals use the protected-change review.</p></div>}
    evidence={<div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">{workspace.documents.filter(item=>item.kind===selected?.kind).map(item=><div key={item.id}>{evidence(item)}</div>)}</div>}
    dependencies={<p className="mt-3">Inspect the actual file and the applicable holder, name, number and authority. Text similarity alone is not verification. Bank review, commercial activation, product publication and payout eligibility remain separate decisions; recorded holds require their own disposition.</p>}
    decision={<>{personalConflict?<p>You cannot review your own seller evidence. Assign an eligible Super Admin.</p>:null}
      {request?<DocumentChangeReview actorId={viewerId} requestId={request.id} expectedOperationId={request.operationId} canDecide={!personalConflict&&permissionAvailable}/>:null}
      {selected?<SellerDocumentReview actorId={viewerId} sellerId={sellerId} documentId={selected.id} expectedReviewId={selected.reviewId} canDecide={!personalConflict&&!permissionAvailable&&!!selected.currentSubmission&&selected.status==='pending'&&(registrationEvidenceKinds as readonly string[]).includes(selected.kind)}/>:<p>No document decision is currently available. The saved status is shown above.</p>}</>}
    history={<ol className="mt-4 space-y-3">{workspace.history.map(event=><li key={event.id}><p>{event.action.replace('seller.document.','').replaceAll('_',' ')} · {date(event.createdAt)}{event.actor?` · ${event.actor}`:''}</p><p>{event.reason}</p></li>)}</ol>}/></StaffReviewAccessBoundary>
}
