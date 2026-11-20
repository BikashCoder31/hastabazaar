import {financialNoticeStatements} from '../operations/financial-notices';
import {financeEvidenceReferenceGuards} from './refund-evidence';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';
import {paymentGuard} from './manual-receipts';
import {getRefundObligation,refundCommand,refundEvent,refundIndependence,refundText,RefundObligationError} from './refund-obligations';

export interface RefundBankDetails{holder:string;bank:string;branch:string;accountNumber:string;currency:'NPR';}
export interface RefundDestinationInput{obligationId:string;details:RefundBankDetails;relationship:'original_payer'|'own_account'|'authorized_nominee';authorization:string;evidenceReference:string;reason:string;}
export async function submitRefundDestination(db:D1Database,ctx:CommandContext&{sessionHash:string},input:RefundDestinationInput){
 const row=await getRefundObligation(db,input.obligationId);if(!row||row.customerId!==ctx.actorId||row.state==='completed')throw new RefundObligationError('Open your own unresolved refund through authenticated order access.',403);
 const clock=checkoutCommitClock(db),proof=`EXISTS(SELECT 1 FROM user_sessions s JOIN users u ON u.id=s.user_id JOIN account_email_verifications e ON e.user_id=u.id AND e.email=lower(u.email) WHERE s.token_hash=? AND s.user_id=? AND u.status='active' AND s.expires_at>${clock} AND s.created_at<=${clock} AND s.created_at>${clock}-900000)`;
 if(!await db.prepare('SELECT 1 WHERE '+proof).bind(ctx.sessionHash,ctx.actorId).first())throw new RefundObligationError('Sign in again with your verified contact before saving sensitive refund instructions.',403);
 const details=input.details;if(!details||details.currency!=='NPR'||Object.keys(details).some(key=>!['holder','bank','branch','accountNumber','currency'].includes(key))||!['original_payer','own_account','authorized_nominee'].includes(input.relationship))throw new RefundObligationError('Choose the actual supported NPR beneficiary and payment relationship.',400);
 const bank:RefundBankDetails={holder:refundText(details.holder,'account holder',3,160),bank:refundText(details.bank,'bank',3,160),branch:refundText(details.branch,'branch',2,160),accountNumber:refundText(details.accountNumber,'account number',4,40),currency:'NPR'};
 if(!/^[A-Za-z0-9 -]+$/.test(bank.accountNumber))throw new RefundObligationError('Use the exact bank account number.',400);
 refundText(input.authorization,'explicit customer authorization',20,2000);refundText(input.evidenceReference,'protected ownership evidence');refundText(input.reason,'destination reason',10);
 const receipt=await commandReceipt(db,ctx,{action:'refund.destination.submitted',subjectType:'refund_obligation',subjectId:row.id},input);if(receipt.replayed)return receipt.result as {id:string;revision:number;headRevision:number};
 const head=await db.prepare('SELECT revision FROM refund_destination_heads WHERE obligation_id=?').bind(row.id).first<{revision:number}>();
 if(ctx.expectedRevision!==(head?String(head.revision):null))throw new RefundObligationError('Compare the current refund destination before submitting a replacement.');
 const id=crypto.randomUUID(),revision=(head?.revision??0)+1,session=await db.prepare('SELECT created_at AS at FROM user_sessions WHERE token_hash=? AND user_id=?').bind(ctx.sessionHash,ctx.actorId).first<{at:number}>(),result={id,revision:0,headRevision:revision};
 const statements=[...await financeEvidenceReferenceGuards(db,input.evidenceReference,{kind:'obligation',id:row.id},ctx.actorId),...paymentGuard(db,proof,[ctx.sessionHash,ctx.actorId]),...paymentGuard(db,"EXISTS(SELECT 1 FROM refund_obligations WHERE id=? AND customer_id=? AND state<>'completed')",[row.id,ctx.actorId]),
  ...(head?[db.prepare('UPDATE refund_destination_heads SET version_id=?,revision=revision+1 WHERE obligation_id=? AND revision=?').bind(id,row.id,head.revision),...paymentGuard(db,'changes()=1')]:[db.prepare('INSERT INTO refund_destination_heads(obligation_id,version_id,revision) VALUES(?,?,1)').bind(row.id,id)]),
  db.prepare(`INSERT INTO refund_destination_versions(id,obligation_id,number,details_json,relationship,customer_authorization,evidence_reference,submitted_by,session_hash,authenticated_at,created_at,status) VALUES(?,?,?,?,?,?,?,?,?,?,${clock},'submitted')`).bind(id,row.id,revision,JSON.stringify(bank),input.relationship,input.authorization,input.evidenceReference,ctx.actorId,ctx.sessionHash,session!.at),
  await refundEvent(db,ctx,row.id,'destination_submitted','Your private refund instructions are saved for ownership and relationship verification.',{destinationVersionId:id,reason:input.reason}),...await financialNoticeStatements(db,ctx,{kind:'finance.refund',sourceId:row.id,status:'destination_submitted'}),receipt.insert(result)];
 try{await db.batch(statements);}catch(error){const retry=await commandReceipt(db,ctx,{action:'refund.destination.submitted',subjectType:'refund_obligation',subjectId:row.id},input);if(retry.replayed)return retry.result as typeof result;throw error;}return result;
}
export async function verifyRefundDestination(db:D1Database,ctx:CommandContext,input:{versionId:string;ownershipConfirmed:boolean;relationshipConfirmed:boolean;verificationReference:string;reason:string}){
 const version=await db.prepare('SELECT id,obligation_id AS obligationId,status,revision FROM refund_destination_versions WHERE id=?').bind(input.versionId).first<{id:string;obligationId:string;status:string;revision:number}>();if(!version)throw new RefundObligationError('The retained destination version was not found.');
 const cmd=await refundCommand(db,ctx,'destination_verified',version.obligationId,input,true);if(cmd.receipt.replayed)return cmd.receipt.result as {id:string;revision:number};
 const row=(await getRefundObligation(db,version.obligationId))!;if(ctx.expectedRevision!==String(version.revision)||version.status!=='submitted'||input.ownershipConfirmed!==true||input.relationshipConfirmed!==true)throw new RefundObligationError('Independently check this exact account ownership and authorized payment relationship.');
 refundText(input.verificationReference,'independent beneficiary verification');refundText(input.reason,'verified relationship and decision reason',10);
 return cmd.commit([...await financeEvidenceReferenceGuards(db,input.verificationReference,{kind:'obligation',id:row.id}),...await refundIndependence(db,ctx.actorId,row.customerId,row.orderId,row.receiptId),...paymentGuard(db,'EXISTS(SELECT 1 FROM refund_destination_heads WHERE obligation_id=? AND version_id=?)',[row.id,version.id]),
  db.prepare(`UPDATE refund_destination_versions SET status='verified',revision=revision+1,verified_by=?,verified_at=${checkoutCommitClock(db)},verification_reference=? WHERE id=? AND status='submitted' AND revision=?`).bind(ctx.actorId,input.verificationReference,version.id,version.revision),...paymentGuard(db,'changes()=1'),await refundEvent(db,ctx,row.id,'destination_verified','The saved refund destination has passed the recorded verification.',{versionId:version.id,reason:input.reason,verificationReference:input.verificationReference})],{id:version.id,revision:version.revision+1});
}


