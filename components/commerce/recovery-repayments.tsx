'use client';
import type {SellerRecoveryStatement,RecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {RecoveryAction,recoveryMoney as money,recoveryDate as date} from './recovery-action';

export function SellerRepaymentClaims({statement:s,actorId}:{statement:SellerRecoveryStatement;actorId:string}){
 const receiving=s.repayment.instructions;
 return <section className="space-y-4"><h2 className="text-xl">Repayment instructions and reports</h2>
  {receiving?<div className="space-y-2 rounded-lg border p-4"><p>Verified company receiving account · checked {date(receiving.checkedAt)}</p>
   <dl className="grid gap-2 sm:grid-cols-2"><div><dt>Account holder</dt><dd>{receiving.account.holder}</dd></div><div><dt>Bank and branch</dt><dd>{receiving.account.bank} · {receiving.account.branch}</dd></div><div><dt>Account number</dt><dd className="break-all font-semibold">{receiving.account.accountNumber}</dd></div><div><dt>Currency</dt><dd>{receiving.account.currency}</dd></div></dl>
   <p className="break-all">Case reference: <strong>{receiving.reference}</strong></p><p>Current collectible balance: {money(receiving.maximumCollectiblePaisa)}. Follow any approved installment arrangement. Refresh these verified company details before making a new transfer.</p></div>
   :<p>Current verified repayment instructions are unavailable for this statement. You can still report an earlier payment for Finance review.</p>}
  <p>A payment report or screenshot does not settle the balance. Finance must match the actual bank credit, and an eligible Super Admin must approve its allocation. Unallocated excess remains separately owned for review.</p>
  <RecoveryAction actorId={actorId} mode="seller" scope={s.id} action="claim" label="Report a repayment" revision={String(s.revision)} input={{caseId:s.id}} fields={[
   {name:'amountPaisa',label:'Reported amount (NPR)',type:'money'},{name:'paymentReference',label:'Reported payment reference or identifying description'},
   {name:'claimedAt',label:'Reported payment time (Nepal)',type:'date'},
   {name:'accountVersionId',label:'Company account used — leave empty for an older, different or unknown account',type:'select',optional:true,options:receiving?[{value:receiving.accountVersionId,label:receiving.account.bank+' · '+receiving.account.accountNumber}]:[]},
   {name:'evidenceReference',label:'Supporting evidence reference',optional:true},{name:'note',label:'Payment details for review',type:'textarea'}]}/>
  {s.repayment.claims.map(q=><article key={q.id} className="space-y-2 rounded-lg border p-4"><h3 className="font-semibold">Reported {money(q.amountPaisa)} · {q.status.replaceAll('_',' ')}</h3>
   <p className="break-all">{q.paymentReference} · reported payment time {date(q.claimedAt)}</p>{q.nextReviewAt?<p>Next Finance review: {date(q.nextReviewAt)}</p>:null}{q.publicMessage?<p>{q.publicMessage}</p>:null}
   {q.status==='receipt_verified'?<p>The credit was matched. Only actual approved allocations are included in the statement balance above.</p>:null}
   {q.history.length?<details><summary>Claim review history</summary>{q.history.map((event,index)=><p key={index}>{date(event.createdAt)} · {event.message}</p>)}</details>:null}
   {['submitted','needs_evidence'].includes(q.status)?<RecoveryAction actorId={actorId} mode="seller" scope={q.id} action="claim_evidence" label="Add repayment information" revision={String(q.revision)} input={{caseId:s.id,claimId:q.id}} fields={[{name:'evidenceReference',label:'Additional evidence reference',optional:true},{name:'note',label:'Additional information',type:'textarea'}]}/>:null}
  </article>)}
 </section>;
}

export function FinanceRepaymentClaims({item,actorId,canVerify}:{item:RecoveryFinanceWorkspace['cases'][number];actorId:string;canVerify:boolean}){
 const c=item.review.case;
 return <section className="space-y-4"><h3 className="text-xl">Seller repayment claims</h3><p>Claims are private reports. Matching an actual receipt records no settlement; use the separate approved allocation action. Unknown or unmatched credits and unused excess remain owned exceptions. A third-party receipt requires retained case-specific attribution before matching.</p>
 {item.claims.map(q=>{const receipts=item.claimReceipts.filter(r=>(r.amountPaisa===q.amountPaisa||r.amountPaisa>=q.amountPaisa)&&(!q.accountVersionId||q.accountVersionId===r.accountVersionId)),base={caseId:c.id,claimId:q.id,reviewDigest:item.review.reviewDigest},reviewFields=[{name:'evidenceReference',label:'Independent review evidence reference'},{name:'reason',label:'Private review reason',type:'textarea' as const},{name:'publicMessage',label:'Explanation for the seller',type:'textarea' as const}];return <article key={q.id} className="space-y-3 rounded-lg border p-4">
  <h4 className="font-semibold">{money(q.amountPaisa)} · {q.status==='receipt_verified'&&!q.receiptCurrent?'receipt reconciliation':q.status.replaceAll('_',' ')}</h4><p className="break-all">{q.paymentReference} · {date(q.claimedAt)}</p><p>{q.note}</p>{q.evidenceReference?<p className="break-all">Original evidence reference: {q.evidenceReference}</p>:null}
  {q.nextReviewAt?<p>Next review: {date(q.nextReviewAt)}</p>:null}<details><summary>Private claim history</summary>{q.history.map((event,index)=><div key={index} className="my-2"><p>{date(event.createdAt)} · {event.action.replaceAll('_',' ')} · {event.reason}</p>{event.details.evidenceReference?<p className="break-all">Evidence: {event.details.evidenceReference}</p>:null}</div>)}</details>
  {canVerify&&receipts.length>0?<RecoveryAction actorId={actorId} mode="staff" scope={q.id+':credit'} action="review_claim" label="Match actual repayment credit" revision={String(q.revision)} input={{...base,decision:'receipt_verified',receiptRevision:0,nextReviewAt:null}} receipts={receipts} fields={[{name:'receiptId',label:'Verified original payer or reviewed case-attributed receipt',type:'select',options:receipts.map(r=>({value:r.id,label:r.id+' · '+money(r.amountPaisa)+' · unallocated '+money(r.remainingPaisa)}))},...reviewFields]}/>:null}
  <RecoveryAction actorId={actorId} mode="staff" scope={q.id+':information'} action="review_claim" label="Request repayment information" revision={String(q.revision)} input={{...base,decision:'needs_evidence',receiptId:null,receiptRevision:null}} fields={[...reviewFields,{name:'nextReviewAt',label:'Next owned Finance review (Nepal)',type:'date'}]}/>
  <RecoveryAction actorId={actorId} mode="staff" scope={q.id+':no-credit'} action="review_claim" label="Record no matching credit" revision={String(q.revision)} input={{...base,decision:'not_received',receiptId:null,receiptRevision:null,nextReviewAt:null}} fields={reviewFields}/>
 </article>;})}</section>;
}
