'use client';
import type {RecoveryFinanceWorkspace} from '@/lib/payments/recovery-workspace';
import {RecoveryAction,recoveryMoney as money} from '@/components/commerce/recovery-action';

export function RecoveryHistoryReview({item,actorId,canReview}:{item:RecoveryFinanceWorkspace['cases'][number];actorId:string;canReview:boolean}){
 const {review}=item,{case:current,source}=review,history=source.historicalReview;
 if(!history)return null;
 const company=source.blockerCode==='company_compensation'&&source.compensationPaisa>0&&current.confirmedPaisa===0;
 const allowed=canReview&&!review.unreconciledReceiptPaisa&&(!source.blocker||source.blockerCode==='historical_netting'||company);
 const canAttribute=company?Math.min(source.compensationPaisa,source.historicalCandidatePaisa??0)>history.companyAttributedPaisa:current.confirmedPaisa>history.recognizedPaisa;
 const fields=[{name:'evidenceReference',label:'Original deduction evidence reference'},
  {name:'reason',label:'Private historical attribution reason',type:'textarea' as const},
  {name:'publicMessage',label:'Historical review explained to the seller',type:'textarea' as const}];
 return <section className="space-y-3 rounded-lg border p-4"><h3 className="text-lg font-semibold">Historical payout deductions</h3>
  <p>Recognize only money already deducted in a confirmed paid payout. Shared capacity includes attribution to other original refunds. This review creates no new debit or authority to deduct future earnings.</p>
  <p>Confirmed seller recovery for this case: {money(history.recognizedPaisa)}.</p>
  <p>Company-owned original deduction identified: {money(history.companyAttributedPaisa)}. Identifying this amount moves no money; correcting the original charge requires its separate recorded decision.</p>
  {history.recordedPaisa!==history.recognizedPaisa?<output className="block">The older case counter needs explicit reconciliation against retained attribution records.</output>:null}
  {history.candidates.map(candidate=><div key={candidate.kind+candidate.payoutId+candidate.scopeId} className="space-y-2 border-t pt-3">
   <p className="break-words">Payout {candidate.payoutId}. Original deduction: {money(candidate.capacityPaisa)}. Already attributed: {money(candidate.attributedPaisa)}. Unassigned: {money(Math.max(0,candidate.capacityPaisa-candidate.attributedPaisa))}.</p>
   <p>{candidate.nativeProof?'The native payout total matches its actual bank record.':'The payout, bank proof or included source amounts need reconciliation.'}</p>
   {allowed&&canAttribute&&candidate.nativeProof&&candidate.attributedPaisa<candidate.capacityPaisa?<RecoveryAction actorId={actorId} mode="staff" scope={current.id+':'+(company?'company:':'')+candidate.kind+':'+candidate.payoutId+':'+candidate.scopeId} action={company?'company_history':'history'} label={company?'Identify original company-cost deduction':'Attribute this original deduction'} revision={String(current.revision)}
    input={{caseId:current.id,reviewDigest:review.reviewDigest,candidate:{kind:candidate.kind,payoutId:candidate.payoutId,scopeId:candidate.scopeId,capacityPaisa:candidate.capacityPaisa,nativeProof:candidate.nativeProof}}}
    fields={[{name:'amountPaisa',label:company?'Original company-cost deduction (NPR)':'Past deduction attributable to this case (NPR)',type:'money'},...fields]}/>:null}
  </div>)}
  {allowed&&!company&&history.complete&&(current.blocker||current.historicalRecoveredPaisa!==history.recognizedPaisa)?<RecoveryAction actorId={actorId} mode="staff" scope={current.id+':history-completion'} action="history" label="Complete historical reconciliation" revision={String(current.revision)} input={{caseId:current.id,reviewDigest:review.reviewDigest,candidate:null,amountPaisa:0}} fields={fields}/>:null}
 </section>;
}
