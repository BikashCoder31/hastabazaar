import {calculateServiceDueAt} from '../workflows/service-clock';

export type PaymentClaimState='submitted'|'clarified'|'needs_information'|'rejected'|'withdrawn'|'matched';
export interface PaymentClaimEvent {at:number;state:PaymentClaimState;}
export interface PaymentAllocationEvent {at:number;amountPaisa:number;}
export interface OriginalPaymentWindow {issuedAt:number;deadlineAt:number;calendarVersion:string;paidAt:number|null;closedAt:number|null;}
const unresolved=new Set<PaymentClaimState>(['submitted','clarified','needs_information']);
function timestamp(value:number){if(!Number.isSafeInteger(value)||value<0)throw new Error('Invalid payment timestamp.');}

/** Pure projection of committed facts. Neither viewing nor editing proof changes a deadline. */
export function evaluatePaymentWindow(input:{window:OriginalPaymentWindow;claims:readonly PaymentClaimEvent[];allocations:readonly PaymentAllocationEvent[];remainingPaisa:number;now:number}) {
 const {window,now}=input;timestamp(now);timestamp(window.issuedAt);timestamp(window.deadlineAt);
 if(window.deadlineAt!==window.issuedAt+24*3_600_000)throw new Error('The original payment deadline is inconsistent.');
 if(!Number.isSafeInteger(input.remainingPaisa)||input.remainingPaisa<0)throw new Error('Invalid remaining payment amount.');
 for(const at of [window.paidAt,window.closedAt])if(at!==null)timestamp(at);
 if(window.paidAt!==null&&window.closedAt!==null)throw new Error('Paid and expired window facts need reconciliation.');
 const bufferEndAt=calculateServiceDueAt({startedAt:window.deadlineAt,amount:4,unit:'staffed_hour',calendarVersion:window.calendarVersion});
 const claims=input.claims.map((claim,index)=>{timestamp(claim.at);if(!['submitted','clarified','needs_information','rejected','withdrawn','matched'].includes(claim.state))throw new Error('Unknown payment claim state.');return {...claim,index};}).filter(claim=>claim.at<=now).sort((a,b)=>a.at-b.at||a.index-b.index);
 const atCutoff=claims.filter(claim=>claim.at<window.deadlineAt).at(-1),current=claims.at(-1);
 let partialAtCutoff=BigInt(0);
 for(const allocation of input.allocations){timestamp(allocation.at);if(!Number.isSafeInteger(allocation.amountPaisa))throw new Error('Invalid payment allocation.');if(allocation.at<window.deadlineAt&&allocation.at<=now)partialAtCutoff+=BigInt(allocation.amountPaisa);}
 if(partialAtCutoff<BigInt(0)||partialAtCutoff>BigInt(Number.MAX_SAFE_INTEGER))throw new Error('Payment allocations need reconciliation.');
 const bufferEligible=now>=window.deadlineAt&&(Boolean(atCutoff&&unresolved.has(atCutoff.state))||partialAtCutoff>BigInt(0));
 const cutoffAt=bufferEligible?bufferEndAt:window.deadlineAt;
 const paid=window.paidAt!==null&&window.paidAt<=now&&window.paidAt<cutoffAt;
 const expired=window.closedAt!==null||!paid&&now>=cutoffAt;
 const underReview=Boolean(current&&unresolved.has(current.state));
 const state=paid?'paid':expired?'expired':underReview?'under_review':'awaiting_payment';
 return {state,cutoffAt,bufferEndAt,bufferEligible,remainingPaisa:input.remainingPaisa,
  reminderEligible:!paid&&!expired&&!underReview&&input.remainingPaisa>0&&now>=window.deadlineAt-6*3_600_000&&now<window.deadlineAt};
}
