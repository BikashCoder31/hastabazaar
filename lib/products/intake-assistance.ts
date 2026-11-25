import {intakeFormContextInput} from './intake-form-context';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {digestFormRequest} from '../forms/submission';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {CategoryContractError,retainProductDetailAnswers,getCategoryDetailGroups} from './category-contracts';
import type {ProductDetailAnswers} from './category-fields';
import {getProductWorkspace,prepareProductWorkspace,mediaGuard,type IntakeSnapshot} from './intake-workspace';
import {retainOfferMatrix,type OfferMatrix} from './offer-contracts';
import {offerGuard,productReadGuardConflict} from './offer-support';
import {pricingSubjectAuthority} from './private-price-inputs';

class AssistanceAuthorityError extends CategoryContractError {
 constructor(message:string){super(message,403);}
}
interface CaseSource {
 id:string;draftId:string;ownerId:string;sellerId:string;versionId:string;revision:number;
 state:string;firstRequestedAt:number;triageDueAt:number;triagedAt:number|null;
 firstCompleteAt:number|null;reviewDueAt:number|null;firstReviewedAt:number|null;
 activeProposalId:string|null;snapshot:string;
}
interface ProposalPatch {answers?:ProductDetailAnswers;categoryId?:string|null;offers?:OfferMatrix;mediaIds?:string[]}
interface ProposalRow {
 id:string;caseId:string;baseVersionId:string;patch:string;sourceNote:string;state:string;
 actorId:string;createdAt:number;decidedAt:number|null;acceptedVersionId:string|null;
}
const proposalColumns='id,case_id AS caseId,base_version_id AS baseVersionId,patch_json AS patch,source_note AS sourceNote,state,actor_id AS actorId,created_at AS createdAt,decided_at AS decidedAt,accepted_version_id AS acceptedVersionId';
async function source(db:D1Database,id:string):Promise<CaseSource>{
 const row=await db.prepare(`SELECT c.id,c.draft_id AS draftId,d.owner_id AS ownerId,d.seller_id AS sellerId,
 c.version_id AS versionId,c.revision,c.state,c.first_requested_at AS firstRequestedAt,
 c.triage_due_at AS triageDueAt,c.triaged_at AS triagedAt,c.first_complete_at AS firstCompleteAt,
 c.review_due_at AS reviewDueAt,c.first_reviewed_at AS firstReviewedAt,c.active_proposal_id AS activeProposalId,v.snapshot_json AS snapshot
 FROM product_intake_cases c JOIN product_intake_drafts d ON d.id=c.draft_id
 JOIN seller_profiles s ON s.id=d.seller_id AND s.user_id=d.owner_id
 JOIN product_intake_workspace_versions v ON v.id=c.version_id AND v.draft_id=d.id WHERE c.id=?`).bind(id).first<CaseSource>();
 if(!row)throw new CategoryContractError('The exact product assistance case is unavailable.',404);return row;
}
async function staffAuthority(db:D1Database,actorId:string,row:CaseSource){
 if(row.ownerId===actorId)throw new AssistanceAuthorityError('An independent permitted staff member must handle this case.');
 let productReview=true,authority;
 try{authority=await staffMutationGuard(db,actorId,'product.review',AssistanceAuthorityError);}
 catch(error){if(!(error instanceof AssistanceAuthorityError))throw error;productReview=false;authority=await staffMutationGuard(db,actorId,'support.manage',AssistanceAuthorityError);}
 return {productReview,statements:[...authority.statements,...offerGuard(db,
 'EXISTS(SELECT 1 FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id WHERE d.id=? AND d.owner_id=? AND s.user_id=d.owner_id AND d.owner_id<>?)',[row.draftId,row.ownerId,actorId])]};
}
function currentCase(db:D1Database,row:CaseSource,ctx:CommandContext,versionId:string){
 if(ctx.expectedRevision!==String(row.revision)||row.versionId!==versionId||row.state==='resolved')throw new CategoryContractError('Compare the current case and exact submitted version before acting.');
 return offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_cases WHERE id=? AND revision=? AND version_id=? AND state=?)',[row.id,row.revision,row.versionId,row.state]);
}
function boundedNote(value:unknown,label:string){
 if(typeof value!=='string'||value.trim().length<4||value.length>4000)throw new CategoryContractError(`Provide the actual ${label} in a bounded note.`,400);return value.trim();
}
function patchInput(raw:unknown):ProposalPatch{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new CategoryContractError('Choose the actual product fields to propose.',400);
 const patch=raw as Record<string,unknown>;
 if(!Object.keys(patch).length||Object.keys(patch).some(key=>!['answers','categoryId','offers','mediaIds'].includes(key)))throw new CategoryContractError('Propose ordinary supported product facts; private pricing and evidence are separate.',400);
 const result:ProposalPatch={};
 if('answers' in patch)result.answers=retainProductDetailAnswers(patch.answers);
 if('categoryId' in patch){if(patch.categoryId!==null&&(typeof patch.categoryId!=='string'||patch.categoryId.length>160))throw new CategoryContractError('Use a bounded category reference.',400);result.categoryId=patch.categoryId as string|null;}
 if('offers' in patch)result.offers=retainOfferMatrix(patch.offers);
 if('mediaIds' in patch){const ids=patch.mediaIds;if(!Array.isArray(ids)||ids.length>500||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(id)))throw new CategoryContractError('Choose completed uploads from this draft.',400);result.mediaIds=[...ids] as string[];}
 return result;
}
async function commit<T>(db:D1Database,ctx:CommandContext,action:string,id:string,payload:unknown,statements:D1PreparedStatement[],result:T){
 try{await db.batch(statements);}catch(error){
  const retry=await commandReceipt(db,ctx,{action,subjectType:'product_intake',subjectId:id},payload);if(retry.replayed)return retry.result as T;
  const conflict=/constraint|conflict|guard|product_intake_/i.test(String(error)),failure=new CategoryContractError(conflict?'The case, saved draft or current authority changed. Keep your entries and compare the current record.':'The outcome is not confirmed. Retain and retry this exact request.',conflict?409:503);failure.cause=error;throw failure;
 }return result;
}
async function eventStatements(db:D1Database,ctx:CommandContext,row:CaseSource,eventId:string,kind:string,detail:unknown){
 return [db.prepare('INSERT INTO product_intake_events(id,case_id,version_id,event_key,kind,actor_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?)')
  .bind(eventId,row.id,row.versionId,await digestFormRequest([kind,ctx.actorId,ctx.requestId]),kind,ctx.actorId,JSON.stringify(detail),ctx.now),
  ...await operationalBusinessNotificationStatements(db,{kind:'product.intake',eventId,sourceId:row.id,actorId:ctx.actorId,now:ctx.now,status:kind})];
}
export async function getProductIntakeReview(db:D1Database,actorId:string,caseId:string){
 const row=await source(db,caseId),authority=await staffAuthority(db,actorId,row),snapshot=JSON.parse(row.snapshot) as IntakeSnapshot;
 const proposals=(await db.prepare(`SELECT ${proposalColumns} FROM product_intake_proposals WHERE case_id=? ORDER BY created_at DESC,id DESC LIMIT 100`).bind(caseId).all<ProposalRow>()).results;
 const events=(await db.prepare('SELECT id,kind,detail_json AS detail,created_at AS createdAt FROM product_intake_events WHERE case_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(caseId).all<{id:string;kind:string;detail:string;createdAt:number}>()).results;
 const uploads:{id:string;mimeType:string;originalName:string}[]=[];
 for(let start=0;start<snapshot.mediaIds.length;start+=90){const ids=snapshot.mediaIds.slice(start,start+90);uploads.push(...(await db.prepare(`SELECT id,mime_type AS mimeType,original_name AS originalName FROM product_intake_media WHERE draft_id=? AND state='ready' AND id IN (${ids.map(()=>'?').join(',')})`).bind(row.draftId,...ids).all<{id:string;mimeType:string;originalName:string}>()).results);}
 const categoryModel=await getCategoryDetailGroups(db,snapshot.categoryId);
 const {snapshot:unused,...facts}=row;void unused;
 const {removedMediaIds:privateRemovedUploads,...submittedSnapshot}=snapshot;void privateRemovedUploads;
 const result={...facts,actorId,categoryModel,snapshot:{...submittedSnapshot,privateReview:authority.productReview?snapshot.privateReview:{}},uploads,canReviewProducts:authority.productReview,
  proposals:proposals.map(proposal=>({...proposal,patch:JSON.parse(proposal.patch) as ProposalPatch})),events:events.map(event=>({...event,detail:JSON.parse(event.detail) as Record<string,unknown>}))};
 try{await db.batch([...authority.statements,...offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_cases WHERE id=? AND draft_id=? AND version_id=? AND revision=?)',[row.id,row.draftId,row.versionId,row.revision])]);}
 catch(error){
  if(!productReadGuardConflict(error))throw new CategoryContractError('Current Product assistance could not be confirmed. Keep your entries and retry.',503);
  let current:CaseSource;try{current=await source(db,caseId);}catch{throw new AssistanceAuthorityError('The original Product source or current access changed.');}
  const currentAuthority=await staffAuthority(db,actorId,current);if(authority.productReview&&!currentAuthority.productReview)throw new AssistanceAuthorityError('Private Product review access changed. Open the currently permitted assistance view.');
  throw new CategoryContractError('The Product assistance case changed. Keep your entries and compare the current source.',409);
 }
 return result;
}
export async function triageProductIntake(db:D1Database,ctx:CommandContext,input:{caseId:string;versionId:string;outcome:'needs_information'|'reviewing';sellerMessage:string}){
 const row=await source(db,input.caseId),authority=await staffAuthority(db,ctx.actorId,row),sellerMessage=boundedNote(input.sellerMessage,'seller-facing triage explanation');
 if(!['needs_information','reviewing'].includes(input.outcome))throw new CategoryContractError('Choose an actual first response or information request.',400);
 if(input.outcome==='reviewing'&&row.firstCompleteAt!==null&&!authority.productReview)throw new AssistanceAuthorityError('Product review permission is required to start the complete candidate review.');
 const action='product.intake.triaged',receipt=await commandReceipt(db,ctx,{action,subjectType:'product_intake',subjectId:row.id},input);
 if(receipt.replayed)return receipt.result as {caseId:string;revision:number};
 const guards=currentCase(db,row,ctx,input.versionId),eventId=crypto.randomUUID(),result={caseId:row.id,revision:row.revision+1};
 const statements=[...authority.statements,...guards,db.prepare(`UPDATE product_intake_cases SET revision=?,state=?,triaged_at=COALESCE(triaged_at,?),first_reviewed_at=COALESCE(first_reviewed_at,?),last_event_id=? WHERE id=?`)
  .bind(result.revision,input.outcome==='needs_information'?'waiting_seller':'in_review',ctx.now,authority.productReview&&row.firstCompleteAt!==null?ctx.now:null,eventId,row.id),
  ...await eventStatements(db,ctx,row,eventId,'triaged',{sellerMessage,outcome:input.outcome}),receipt.insert(result)];
 return commit(db,ctx,action,row.id,input,statements,result);
}
export async function proposeProductIntakeChanges(db:D1Database,ctx:CommandContext,input:{caseId:string;versionId:string;patch:unknown;sourceNote:string;replaceProposalId?:string|null}){
 const row=await source(db,input.caseId),authority=await staffAuthority(db,ctx.actorId,row),patch=patchInput(input.patch),sourceNote=boundedNote(input.sourceNote,'source of these proposed facts');
 const action='product.intake.changes_proposed',receipt=await commandReceipt(db,ctx,{action,subjectType:'product_intake',subjectId:row.id},input);
 if(receipt.replayed)return receipt.result as {caseId:string;proposalId:string;revision:number};
 const guards=currentCase(db,row,ctx,input.versionId),frozen=JSON.parse(row.snapshot) as IntakeSnapshot;
 const changed=Object.entries(patch.answers??{}).some(([key,value])=>JSON.stringify(value)!==JSON.stringify(frozen.answers[key as keyof typeof frozen.answers]))||('categoryId' in patch&&patch.categoryId!==frozen.categoryId)||patch.offers!==undefined&&JSON.stringify(patch.offers)!==JSON.stringify(frozen.offers)||patch.mediaIds!==undefined&&JSON.stringify(patch.mediaIds)!==JSON.stringify(frozen.mediaIds);
 if(!changed)throw new CategoryContractError('Propose an actual changed fact, or use the response controls to explain the next step.',400);
 if(patch.mediaIds?.some(id=>!frozen.mediaIds.includes(id))||patch.offers?.offers.some(offer=>offer.mediaId&&offer.mediaId!==frozen.offers.offers.find(old=>old.id===offer.id)?.mediaId&&!frozen.mediaIds.includes(offer.mediaId)))throw new CategoryContractError('Choose only product photos actually shared with this submitted candidate. Ask the owner to attach any other file.',403);
 if(row.activeProposalId&&input.replaceProposalId!==row.activeProposalId)throw new CategoryContractError('Compare and explicitly supersede the current proposal before proposing a replacement.');
 const proposalId=crypto.randomUUID(),eventId=crypto.randomUUID(),result={caseId:row.id,proposalId,revision:row.revision+1};
 const statements=[...authority.statements,...guards,...(patch.mediaIds?await mediaGuard(db,row.draftId,row.ownerId,patch.mediaIds):[]),
  db.prepare("UPDATE product_intake_proposals SET state='superseded' WHERE case_id=? AND state='pending'").bind(row.id),
  db.prepare("INSERT INTO product_intake_proposals(id,case_id,base_version_id,patch_json,source_note,actor_id,created_at,state) VALUES(?,?,?,?,?,?,?,'pending')").bind(proposalId,row.id,row.versionId,JSON.stringify(patch),sourceNote,ctx.actorId,ctx.now),
  db.prepare("UPDATE product_intake_cases SET revision=?,state='waiting_seller',active_proposal_id=?,triaged_at=COALESCE(triaged_at,?),first_reviewed_at=COALESCE(first_reviewed_at,?),last_event_id=? WHERE id=?")
   .bind(result.revision,proposalId,ctx.now,authority.productReview&&row.firstCompleteAt!==null?ctx.now:null,eventId,row.id),
  ...await eventStatements(db,ctx,row,eventId,'changes_proposed',{proposalId,sourceNote}),receipt.insert(result)];
 return commit(db,ctx,action,row.id,input,statements,result);
}
export async function confirmProductIntakeProposal(db:D1Database,ctx:CommandContext,input:{caseId:string;proposalId:string;expectedDraftRevision:string;decision:'accept'|'decline'}){
 const row=await source(db,input.caseId),workspace=await getProductWorkspace(db,ctx.actorId,row.draftId),authority=await pricingSubjectAuthority(db,ctx.actorId,{kind:'intake',id:row.draftId,offerId:'base'});
 if(!['accept','decline'].includes(input.decision))throw new CategoryContractError('Choose whether to use these proposed changes.',400);
 const action='product.intake.proposal_decided',receipt=await commandReceipt(db,ctx,{action,subjectType:'product_intake',subjectId:row.id},input);
 type Result={caseId:string;revision:number;workspace:{id:string;revision:number;versionId:string}|null};
 if(receipt.replayed)return receipt.result as Result;
 const guards=currentCase(db,row,ctx,row.versionId),proposal=await db.prepare(`SELECT ${proposalColumns} FROM product_intake_proposals WHERE id=? AND case_id=?`).bind(input.proposalId,row.id).first<ProposalRow>();
 if(!proposal||proposal.state!=='pending'||proposal.baseVersionId!==row.versionId||row.activeProposalId!==proposal.id||input.expectedDraftRevision!==String(workspace.revision))throw new CategoryContractError('Compare this proposal with the current draft and submitted candidate before choosing.');
 const patch=patchInput(JSON.parse(proposal.patch)),prepared=input.decision==='accept'?await prepareProductWorkspace(db,{...ctx,requestId:await digestFormRequest(['intake-proposal-accept',ctx.requestId]),expectedRevision:input.expectedDraftRevision},{draftId:row.draftId,sellerId:row.sellerId,
  categoryId:'categoryId' in patch?patch.categoryId!:workspace.categoryId,answers:{...workspace.answers,...patch.answers},offers:patch.offers??workspace.offers,mediaIds:patch.mediaIds??workspace.mediaIds,privateReview:workspace.privateReview,formContext:intakeFormContextInput(workspace.formContext)}):null;
 if(prepared?.replayed)throw new CategoryContractError('The paired confirmation needs reconciliation. Retain and retry the original request.',503);
 const eventId=crypto.randomUUID(),result:Result={caseId:row.id,revision:row.revision+1,workspace:prepared?.result??null};
 const statements=[...authority.statements,...guards,...offerGuard(db,"EXISTS(SELECT 1 FROM product_intake_proposals WHERE id=? AND state='pending' AND base_version_id=?)",[proposal.id,row.versionId]),
  ...offerGuard(db,'EXISTS(SELECT 1 FROM product_intake_drafts WHERE id=? AND revision=?)',[row.draftId,workspace.revision]),...prepared?.statements??[],
  db.prepare('UPDATE product_intake_proposals SET state=?,decided_by=?,decided_at=?,accepted_version_id=? WHERE id=?').bind(input.decision==='accept'?'accepted':'declined',ctx.actorId,ctx.now,prepared?.result.versionId??null,proposal.id),
  db.prepare('UPDATE product_intake_cases SET revision=?,state=?,active_proposal_id=NULL,last_event_id=? WHERE id=?').bind(result.revision,input.decision==='accept'?'waiting_seller':'details_needed',eventId,row.id),
  ...await eventStatements(db,ctx,row,eventId,input.decision==='accept'?'proposal_accepted':'proposal_declined',{proposalId:proposal.id,nextAction:input.decision==='accept'?'Review and explicitly send the saved draft.':'Hastabazaar will review your response.'}),receipt.insert(result)];
 return commit(db,ctx,action,row.id,input,statements,result);
}
