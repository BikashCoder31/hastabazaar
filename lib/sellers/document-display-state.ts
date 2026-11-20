import type {DocumentChangeCase,DocumentEvidence} from './document-workspace';

export function documentChangeState(request:DocumentChangeCase,documents:readonly DocumentEvidence[]) {
  const replacement=documents.find(document=>document.id===request.replacementId);
  if(request.status==='submitted') return 'Request awaiting review';
  if(request.status==='rejected') return 'Rejected — review the recorded reason';
  if(request.status==='approved') return replacement?'Correction requested — upload the permitted replacement':'Permission granted — upload the replacement';
  return replacement?.status==='verified'?'Replacement verified':replacement?.status==='rejected'?'Replacement rejected':'Replacement awaiting verification';
}
