import * as recovery from '../../lib/payments/seller-recovery';
import type {CommandContext} from '../../lib/workflows/contracts';

export async function agreeRecovery(db:D1Database,ctx:(key:string,revision?:string|null)=>CommandContext,source:{kind:'refund'|'supplier_adjustment';id:string}){
 const opened=await recovery.openSellerRecovery(db,ctx('model-plan-case'),{...source,reason:'Reconcile the original same-model paid liability before proposing an accepted arrangement.'});
 const review=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
 await recovery.approveSellerRecovery(db,ctx('model-cap','0'),{caseId:opened.id,reviewDigest:review.reviewDigest,evidenceReference:'FICTIONAL-MODEL-EXACT-LIABILITY',reason:'Approve only the confirmed original debt using one eligible Super Admin.'});
 const terms=await recovery.getSellerRecoveryPlanTerms(db,review.source.ownerId,opened.id);
 const proposal=await recovery.proposeSellerRecoveryPlan(db,{...ctx('model-owner-acceptance','1'),actorId:review.source.ownerId},{caseId:opened.id,termsDigest:terms.termsDigest,termsAccepted:true,nettingAuthorized:true,installments:[{amountPaisa:review.source.confirmedPaisa,dueAt:Date.now()+7*86400000}],contactDetails:'Use my verified seller inbox for this exact accepted recovery arrangement.',nextReviewAt:Date.now()+3*86400000});
 const current=await recovery.getSellerRecoveryReview(db,'reviewer',opened.id);
 await recovery.approveSellerRecoveryPlan(db,ctx('model-plan-approved','2'),{caseId:opened.id,proposalId:proposal.id,reviewDigest:current.reviewDigest,reason:'Approve the exact newly accepted original-model earnings authority and installment dates.'});
 return opened.id;
}
