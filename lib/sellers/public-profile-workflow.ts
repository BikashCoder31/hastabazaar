import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt} from '../workflows/contracts';
import {nativeCommandProvenance,withNativeFormLoad} from '../operations/native-form-health';
import {digestFormRequest,validateSellerFormSubmission} from '../forms/submission';
import {buildFormAnswerInsert} from '../db/repositories/form-answers';
import {publicProfileTaskInsert} from '../workflows/review-tasks';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {parseCraftExperience,parseMakerSocialLinks,type MakerSocialLinks} from './participation';
import {PublicProfileError,PublicProfileAuthorityError,publicProfileCooldownMs,type PublicProfileValues,type ProfileCommand} from './public-profile-types';

const ownerSql=`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active'
 AND EXISTS(SELECT 1 FROM user_roles WHERE user_id=u.id AND role IN ('customer','seller')))`;
function guard(db:D1Database,predicate:string,values:unknown[]){const id=crypto.randomUUID();return[
 db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),
 db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
async function owner(db:D1Database,sellerId:string,actorId:string){if(!await db.prepare(`SELECT 1 WHERE ${ownerSql}`).bind(sellerId,actorId).first())throw new PublicProfileError('Your current seller account is required.',403);}
async function command(db:D1Database,input:{actorId:string;requestId:string;now:number},action:string,subjectId:string,expectedRevision:string|null,payload:unknown){
 const context={...input,expectedRevision},source={action:`seller.public_profile.${action}`,subjectType:'seller_public_profile',subjectId};
 const provenance=await nativeCommandProvenance(db,source.action,expectedRevision);
 let receipt;try{receipt=await commandReceipt(db,context,source,payload,provenance);}catch(error){throw new PublicProfileError(error instanceof Error?error.message:'Invalid profile request.');}
 return{receipt,async commit(statements:D1PreparedStatement[],result:unknown){if(receipt.replayed)return receipt.result;
  try{await db.batch([...statements,receipt.insert(result)]);return result;}catch(error){const saved=await commandReceipt(db,context,source,payload);if(saved.replayed)return saved.result;
   if(/constraint|guard|immutable/i.test(error instanceof Error?error.message:String(error)))throw new PublicProfileError('The profile, draft, authority or publication conditions changed. Keep your work and compare the current version.');throw error;}}};
}
function values(input:unknown,complete=false,allowHidden=false):PublicProfileValues{
 if(!input||typeof input!=='object'||Array.isArray(input))throw new PublicProfileError('Provide the public presentation fields.',400);
 const row=input as Record<string,unknown>,allowed=['publicName','publicCity','about','specialties','craftExperience','socialLinks','media'];
 if(Object.keys(row).some(key=>!allowed.includes(key)))throw new PublicProfileError('Private identity, contact and operational fields have their own workflows.',400);
 const text=(key:string,limit:number)=>{if(typeof row[key]!=='string'||row[key].length>(complete?limit:8000))throw new PublicProfileError(`Check the ${key} field.`,400);return complete?row[key].trim():row[key];};
 const result:PublicProfileValues={publicName:text('publicName',160),publicCity:text('publicCity',120),about:text('about',2000),specialties:text('specialties',1000),craftExperience:[],socialLinks:{},media:[]};
 if(complete&&!allowHidden&&(!result.publicName||!result.publicCity))throw new PublicProfileError('A meaningful public name and city are required for normal publication.',400);
 if(!Array.isArray(row.craftExperience)||row.craftExperience.length>10||!row.socialLinks||typeof row.socialLinks!=='object'||Array.isArray(row.socialLinks)||!Array.isArray(row.media)||row.media.length>2)
  throw new PublicProfileError('Check the optional experience, supported links and media.',400);
 const experience=row.craftExperience.map(entry=>{if(!entry||typeof entry!=='object'||typeof entry.craft!=='string'||typeof entry.band!=='string'||Object.keys(entry).some(key=>!['craft','band'].includes(key))||entry.craft.length>240||entry.band.length>80)throw new PublicProfileError('Check the craft experience entry.',400);return{craft:entry.craft,band:entry.band};});
 const social=row.socialLinks as Record<string,unknown>;
 if(Object.keys(social).some(key=>!['facebook','instagram','linkedin','tiktok','x','youtube'].includes(key)||typeof social[key]!=='string'||(social[key] as string).length>2000))throw new PublicProfileError('Use only the supported public social links.',400);
 try{result.craftExperience=complete?experience.flatMap(entry=>parseCraftExperience(entry.craft,entry.band)):experience as PublicProfileValues['craftExperience'];
 result.socialLinks=complete?parseMakerSocialLinks(social as MakerSocialLinks):social as MakerSocialLinks;}catch(error){throw new PublicProfileError(error instanceof Error?error.message:'Check the optional public details.',400);}
 result.media=row.media.map(item=>{if(!item||typeof item!=='object'||Object.keys(item).some(key=>!['mediaId','caption'].includes(key))||typeof item.mediaId!=='string'||!/^[A-Za-z0-9_-]{1,191}$/.test(item.mediaId)||typeof item.caption!=='string'||item.caption.length>(complete?300:2000))throw new PublicProfileError('Select owned profile media and a public caption.',400);return{mediaId:item.mediaId,caption:complete?item.caption.trim():item.caption};});
 return result;
}
type StateRow={version:number;json:string;legacySources:string;provenance:string;legacySavedAt:number|null;legacyClockReviewedAt:number|null;legacyClockValue:number|null;lastNormalPublicationAt:number|null;currentRevisionId:string|null};
async function state(db:D1Database,sellerId:string,now:number){
 const row=await db.prepare(`SELECT version,current_json AS json,legacy_sources_json AS legacySources,provenance,legacy_saved_at AS legacySavedAt,
 legacy_clock_reviewed_at AS legacyClockReviewedAt,legacy_clock_value AS legacyClockValue,last_normal_publication_at AS lastNormalPublicationAt,current_revision_id AS currentRevisionId FROM seller_public_profile_states WHERE seller_id=?`).bind(sellerId).first<StateRow>();
 if(!row)throw new PublicProfileError('The reviewed public-profile workflow is not ready for this seller.',503);
 const recorded=row.lastNormalPublicationAt??(row.legacyClockReviewedAt!==null?row.legacyClockValue:row.legacySavedAt),valid=recorded!==null&&Number.isSafeInteger(recorded)&&recorded>=0&&recorded<=now;
 return{...row,current:JSON.parse(row.json) as PublicProfileValues,nextNormalSubmissionAt:valid?recorded+publicProfileCooldownMs:0,historyNeedsReview:recorded!==null&&!valid||recorded===null&&row.provenance==='legacy_baseline'&&row.legacyClockReviewedAt===null};
}
async function getPublicProfileWorkspaceSource(db:D1Database,sellerId:string,actorId:string,audience:'owner'|'staff',now:number=Date.now()){
 if(audience==='owner')await owner(db,sellerId,actorId);else await staffMutationGuard(db,actorId,'seller.application.review',PublicProfileAuthorityError);
 const ownerRow=await db.prepare('SELECT user_id AS ownerId FROM seller_profiles WHERE id=?').bind(sellerId).first<{ownerId:string}>();
 if(!ownerRow)throw new PublicProfileError('Seller not found.',404);
 const [current,draft,candidate,history,corrections,media]=await Promise.all([state(db,sellerId,now),
  db.prepare('SELECT revision,base_version AS baseVersion,values_json AS json,updated_at AS updatedAt FROM seller_public_profile_drafts WHERE seller_id=? AND owner_id=(SELECT user_id FROM seller_profiles WHERE id=?)').bind(sellerId,sellerId).first<{revision:string;baseVersion:number;json:string;updatedAt:number}>(),
  db.prepare(`SELECT id,case_id AS caseId,version,status,base_version AS baseVersion,values_json AS json,first_submitted_at AS firstSubmittedAt,submitted_at AS submittedAt,review_reason AS reviewReason
   FROM seller_public_profile_revisions WHERE seller_id=? AND kind='normal' ORDER BY sequence DESC LIMIT 1`).bind(sellerId).first<{id:string;caseId:string;version:number;status:string;baseVersion:number;json:string;firstSubmittedAt:number;submittedAt:number;reviewReason:string|null}>(),
  db.prepare('SELECT id,action,reason,created_at AS createdAt FROM seller_public_profile_events WHERE seller_id=? ORDER BY created_at DESC,id DESC LIMIT 100').bind(sellerId).all<{id:string;action:string;reason:string;createdAt:number}>(),
  db.prepare(`SELECT id,category,fields_json AS fields,desired_json AS desired,status,version,base_version AS baseVersion,reason,review_reason AS reviewReason,requested_at AS requestedAt,next_update_at AS nextUpdateAt
    FROM seller_public_profile_corrections WHERE seller_id=? ORDER BY requested_at DESC,id DESC LIMIT 100`).bind(sellerId).all<{id:string;category:string;fields:string;desired:string|null;status:string;version:number;baseVersion:number;reason:string;reviewReason:string|null;requestedAt:number;nextUpdateAt:number|null}>(),
  db.prepare(`SELECT id,kind,original_name AS name,moderation_status AS status FROM seller_profile_media WHERE seller_id=? ORDER BY uploaded_at DESC,id DESC LIMIT 100`).bind(sellerId).all<{id:string;kind:string;name:string;status:string}>()]);
 // Private projections cannot outlive the authority and exact owner used to load them.
 if(audience==='owner')await owner(db,sellerId,actorId);else await staffMutationGuard(db,actorId,'seller.application.review',PublicProfileAuthorityError);
 return{ownerId:ownerRow.ownerId,observedAt:now,state:current,draft:draft?{...draft,values:JSON.parse(draft.json) as PublicProfileValues}:null,candidate:candidate?{...candidate,values:JSON.parse(candidate.json) as PublicProfileValues}:null,history:history.results,
  corrections:corrections.results.map(row=>({...row,fields:JSON.parse(row.fields) as (keyof PublicProfileValues)[],desired:row.desired?JSON.parse(row.desired) as Partial<PublicProfileValues>:null})),media:media.results};
}
export async function savePublicProfileDraft(db:D1Database,input:ProfileCommand&{expectedDraftRevision:string|null;baseVersion:number;values:unknown}):Promise<{revision:string}>{
 await owner(db,input.sellerId,input.actorId);const content=values(input.values),intent=await command(db,input,'draft_saved',input.sellerId,input.expectedDraftRevision,{baseVersion:input.baseVersion,values:content});
 if(intent.receipt.replayed)return intent.receipt.result as {revision:string};const revision=crypto.randomUUID();
 await intent.commit([...mediaGuards(db,input.sellerId,content),...guard(db,`${ownerSql} AND EXISTS(SELECT 1 FROM seller_public_profile_states WHERE seller_id=? AND version=?)
 AND COALESCE((SELECT revision FROM seller_public_profile_drafts WHERE seller_id=?),'')=COALESCE(?,'')`,[input.sellerId,input.actorId,input.sellerId,input.baseVersion,input.sellerId,input.expectedDraftRevision]),
 db.prepare(`INSERT INTO seller_public_profile_drafts(seller_id,owner_id,revision,base_version,values_json,updated_at) VALUES(?,?,?,?,?,?)
 ON CONFLICT(seller_id) DO UPDATE SET owner_id=excluded.owner_id,revision=excluded.revision,base_version=excluded.base_version,values_json=excluded.values_json,updated_at=excluded.updated_at`)
 .bind(input.sellerId,input.actorId,revision,input.baseVersion,JSON.stringify(content),input.now)],{revision});return{revision};
}
export async function submitPublicProfileRevision(db:D1Database,input:ProfileCommand&{draftRevision:string;baseVersion:number;form?:{version:number;answers:unknown[]}}):Promise<{candidateId:string|null;noop:boolean}>{
 await owner(db,input.sellerId,input.actorId);const intent=await command(db,input,'submitted',input.sellerId,input.draftRevision,{baseVersion:input.baseVersion,...(input.form?{form:input.form}:{})});
 if(intent.receipt.replayed)return intent.receipt.result as {candidateId:string|null;noop:boolean};
 const current=await state(db,input.sellerId,input.now),draft=await db.prepare('SELECT values_json AS json,revision,base_version AS baseVersion FROM seller_public_profile_drafts WHERE seller_id=? AND owner_id=?').bind(input.sellerId,input.actorId).first<{json:string;revision:string;baseVersion:number}>();
 if(!draft||draft.revision!==input.draftRevision||draft.baseVersion!==input.baseVersion||current.version!==input.baseVersion)throw new PublicProfileError('Compare your retained draft with the current public version before submitting.');
 const content=values(JSON.parse(draft.json),true),hash=await digestFormRequest(content),same=hash===await digestFormRequest(current.current);
 if(!same&&current.historyNeedsReview)throw new PublicProfileError('Recorded legacy history needs scoped reconciliation before a normal submission. Your private draft is retained.');
 const form=input.form?await validateSellerFormSubmission(db,'seller.maker-profile',input.form.version,input.form.answers,input.requestId,{publicName:content.publicName,publicCity:content.publicCity}):null;
 if(!same&&input.now<current.nextNormalSubmissionAt)throw new PublicProfileError('The 168-hour cooldown is still active. Keep preparing your draft until the next normal submission time.');
 const id=crypto.randomUUID(),statements=[...guard(db,`${ownerSql} AND EXISTS(SELECT 1 FROM seller_public_profile_states WHERE seller_id=? AND version=?)
 AND EXISTS(SELECT 1 FROM seller_public_profile_drafts WHERE seller_id=? AND owner_id=? AND revision=? AND base_version=?)`,[input.sellerId,input.actorId,input.sellerId,input.baseVersion,input.sellerId,input.actorId,input.draftRevision,input.baseVersion])];
 if(form)statements.push(buildFormAnswerInsert(db,{formId:'seller.maker-profile',requestId:input.requestId,versionId:form.versionId,answers:form.answers,subjectType:'seller',subjectId:input.sellerId,actorId:input.actorId,now:input.now}));
 if(same){await intent.commit(statements,{candidateId:null,noop:true});return{candidateId:null,noop:true};}
 const previous=await db.prepare("SELECT id,case_id AS caseId,status,first_submitted_at AS firstSubmittedAt FROM seller_public_profile_revisions WHERE seller_id=? AND kind='normal' ORDER BY sequence DESC LIMIT 1")
 .bind(input.sellerId).first<{id:string;caseId:string;status:string;firstSubmittedAt:number}>();
 if(previous&&['submitted','approved'].includes(previous.status))throw new PublicProfileError('Withdraw the current frozen candidate before submitting its replacement. Your next private draft is retained.');
 const supersedes=previous&&previous.status!=='published'?previous:null,caseId=supersedes?.caseId??id;
 statements.push(...guard(db,"COALESCE((SELECT id FROM seller_public_profile_revisions WHERE seller_id=? AND kind='normal' ORDER BY sequence DESC LIMIT 1),'')=COALESCE(?,'')",[input.sellerId,previous?.id??null]));
 statements.push(...mediaGuards(db,input.sellerId,content));
 statements.push(db.prepare(`INSERT INTO seller_public_profile_revisions(id,seller_id,sequence,case_id,supersedes_id,base_version,base_json,values_json,content_hash,draft_revision,submitted_by,owner_id,submitted_at,first_submitted_at,operation_request_id)
 VALUES(?,?,(SELECT COALESCE(MAX(sequence),0)+1 FROM seller_public_profile_revisions WHERE seller_id=?),?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,input.sellerId,input.sellerId,caseId,supersedes?.id??null,input.baseVersion,current.json,JSON.stringify(content),hash,input.draftRevision,input.actorId,input.actorId,input.now,supersedes?.firstSubmittedAt??input.now,input.requestId));
 for(const item of content.media)statements.push(db.prepare(`INSERT INTO seller_public_profile_revision_media(revision_id,media_id,kind,caption) SELECT ?,id,kind,? FROM seller_profile_media WHERE id=? AND seller_id=?`).bind(id,item.caption,item.mediaId,input.sellerId));
 statements.push(event(db,input,id,'submitted','Public presentation submitted for review.',{baseVersion:input.baseVersion}),publicProfileTaskInsert(db,caseId,supersedes?.firstSubmittedAt??input.now,input.now),
  ...await operationalBusinessNotificationStatements(db,{kind:'seller.public_profile',sourceId:input.sellerId,eventId:input.requestId,actorId:input.actorId,now:input.now,status:'submitted',detail:'Your submitted presentation stays private while the current public profile remains visible. Open the profile workspace for the review progress.'}));
 await intent.commit(statements,{candidateId:id,noop:false});return{candidateId:id,noop:false};
}
function event(db:D1Database,input:ProfileCommand,revisionId:string,action:string,reason:string,payload:unknown){return db.prepare(`INSERT INTO seller_public_profile_events(id,seller_id,revision_id,actor_id,action,reason,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
 .bind(crypto.randomUUID(),input.sellerId,revisionId,input.actorId,action,reason,JSON.stringify(payload),input.now);}
function mediaGuards(db:D1Database,sellerId:string,content:PublicProfileValues){return content.media.flatMap(item=>guard(db,
 "EXISTS(SELECT 1 FROM seller_profile_media WHERE id=? AND seller_id=? AND moderation_status<>'rejected' AND instr(object_key,?)=1)",[item.mediaId,sellerId,`private/seller-profile/${sellerId}/`]));}
export function publicProfileEligibility(sellerExpression:string,now:number){if(!/^[a-z_]+\.[a-z_]+$/.test(sellerExpression)||!Number.isSafeInteger(now))throw new Error('Invalid public profile eligibility source.');
 return `EXISTS(SELECT 1 FROM seller_profiles public_seller JOIN users public_owner ON public_owner.id=public_seller.user_id LEFT JOIN seller_participation_profiles public_participation ON public_participation.seller_id=public_seller.id
 WHERE public_seller.id=${sellerExpression} AND public_owner.status='active' AND (public_seller.status='approved' OR public_participation.participation_route='managed_maker' AND (public_participation.application_stage='active'
 OR public_participation.application_stage='approved_for_activation' AND public_seller.status IN ('under_review','approved') AND EXISTS(SELECT 1 FROM products WHERE products.seller_id=public_seller.id AND products.status='published' AND NOT EXISTS(SELECT 1 FROM product_deletions d WHERE d.product_id=products.id))))
 AND NOT EXISTS(SELECT 1 FROM seller_restrictions r WHERE r.seller_id=public_seller.id AND (r.mode='disabled' OR r.mode='suspended' AND r.suspended_until>${now})))`;}
export async function reviewPublicProfileRevision(db:D1Database,input:{candidateId:string;actorId:string;expectedVersion:number;action:'approve_only'|'approve_publish'|'publish'|'request_changes'|'reject';reason:string;requestId:string;now:number}):Promise<void>{
 if(!['approve_only','approve_publish','publish','request_changes','reject'].includes(input.action)||input.reason.trim().length<10||input.reason.length>1000)throw new PublicProfileError('Record the exact review action and a meaningful reason.',400);
 const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',PublicProfileAuthorityError,'super_admin'),intent=await command(db,input,'reviewed',input.candidateId,String(input.expectedVersion),{action:input.action,reason:input.reason.trim()});
 if(intent.receipt.replayed)return;
 const candidate=await db.prepare('SELECT seller_id AS sellerId,base_version AS baseVersion,values_json AS json,status,owner_id AS ownerId FROM seller_public_profile_revisions WHERE id=?').bind(input.candidateId).first<{sellerId:string;baseVersion:number;json:string;status:string;ownerId:string}>();
 if(!candidate)throw new PublicProfileError('Profile revision not found.',404);
 if(candidate.ownerId===input.actorId)throw new PublicProfileAuthorityError('Another eligible Super Admin must review your own seller profile.');
 const current=await state(db,candidate.sellerId,input.now),content=values(JSON.parse(candidate.json),true),publish=input.action==='approve_publish'||input.action==='publish';
 if(publish&&current.historyNeedsReview)throw new PublicProfileError('Reconcile the recorded legacy history before normal publication.');
 if(publish&&input.now<current.nextNormalSubmissionAt)throw new PublicProfileError('The 168-hour normal publication cooldown has not ended.');
 const status=publish?'published':input.action==='approve_only'?'approved':input.action==='reject'?'rejected':'changes_requested',required=input.action==='publish'?'approved':'submitted';
 const statements=[...authority.statements,...(['approve_only','approve_publish','publish'].includes(input.action)?mediaGuards(db,candidate.sellerId,content):[]),...guard(db,`EXISTS(SELECT 1 FROM seller_public_profile_revisions c JOIN seller_public_profile_states p ON p.seller_id=c.seller_id
 JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id WHERE c.id=? AND c.kind='normal' AND c.version=? AND c.status=? AND p.version=c.base_version AND s.user_id=c.owner_id AND s.user_id<>? AND u.status='active'
 ${publish?`AND ${publicProfileEligibility('s.id',input.now)} AND (COALESCE(p.last_normal_publication_at,CASE WHEN p.legacy_clock_reviewed_at IS NOT NULL THEN p.legacy_clock_value ELSE p.legacy_saved_at END) IS NULL OR COALESCE(p.last_normal_publication_at,CASE WHEN p.legacy_clock_reviewed_at IS NOT NULL THEN p.legacy_clock_value ELSE p.legacy_saved_at END)<=?)`:''})`,[input.candidateId,input.expectedVersion,required,input.actorId,...(publish?[input.now-publicProfileCooldownMs]:[])])];
 if(publish)statements.push(db.prepare(`UPDATE seller_public_profile_states SET version=version+1,current_json=?,display_name=?,public_city=?,about=?,specialties=?,provenance='reviewed_publication',last_normal_publication_at=?,current_revision_id=?,updated_at=? WHERE seller_id=? AND version=?`)
 .bind(JSON.stringify(content),content.publicName,content.publicCity,content.about,content.specialties,input.now,input.candidateId,input.now,candidate.sellerId,candidate.baseVersion));
 statements.push(db.prepare(`UPDATE seller_public_profile_revisions SET status=?,version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,published_at=?,operation_request_id=? WHERE id=?`)
 .bind(status,input.actorId,input.now,input.reason.trim(),publish?input.now:null,input.requestId,input.candidateId),event(db,{...input,sellerId:candidate.sellerId},input.candidateId,status,input.reason.trim(),{published:publish,nextNormalSubmissionAt:publish?input.now+publicProfileCooldownMs:current.nextNormalSubmissionAt}));
 statements.push(...await operationalBusinessNotificationStatements(db,{kind:'seller.public_profile',sourceId:candidate.sellerId,eventId:input.requestId,actorId:input.actorId,now:input.now,status,
  detail:publish?`The reviewed profile is now published. Next normal submission: ${new Intl.DateTimeFormat('en-NP',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kathmandu'}).format(input.now+publicProfileCooldownMs)} Nepal time.`:status==='approved'?'Approved, not published. This version stays private until an eligible Super Admin explicitly publishes it.':'A profile review decision is recorded. Open your profile to read the feedback; the current public presentation is retained.'}));
 await intent.commit(statements,{candidateId:input.candidateId,status});
}
export async function withdrawPublicProfileRevision(db:D1Database,input:ProfileCommand&{candidateId:string;expectedVersion:number;reason:string}){
 await owner(db,input.sellerId,input.actorId);if(input.reason.trim().length<10||input.reason.length>1000)throw new PublicProfileError('Explain why this candidate is being withdrawn.',400);
 const intent=await command(db,input,'withdrawn',input.candidateId,String(input.expectedVersion),{sellerId:input.sellerId,reason:input.reason.trim()});if(intent.receipt.replayed)return;
 await intent.commit([...guard(db,`${ownerSql} AND EXISTS(SELECT 1 FROM seller_public_profile_revisions WHERE id=? AND seller_id=? AND submitted_by=? AND version=? AND status IN ('submitted','approved','changes_requested','needs_rebase'))`,
 [input.sellerId,input.actorId,input.candidateId,input.sellerId,input.actorId,input.expectedVersion]),
 db.prepare("UPDATE seller_public_profile_revisions SET status='withdrawn',version=version+1,operation_request_id=? WHERE id=?").bind(input.requestId,input.candidateId),
 event(db,input,input.candidateId,'withdrawn',input.reason.trim(),{}),...await operationalBusinessNotificationStatements(db,{kind:'seller.public_profile',sourceId:input.sellerId,eventId:input.requestId,actorId:input.actorId,now:input.now,status:'withdrawn',detail:'The proposal was withdrawn. Your public presentation, normal deadline and private draft are retained.'})],{candidateId:input.candidateId,status:'withdrawn'});
}
export async function reconcilePublicProfileLegacyClock(db:D1Database,input:ProfileCommand&{expectedVersion:number;reliableSavedAt:number|null;evidenceReference:string;reason:string}){
 if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<0||input.reliableSavedAt!==null&&(!Number.isSafeInteger(input.reliableSavedAt)||input.reliableSavedAt<0||input.reliableSavedAt>input.now)||input.evidenceReference.trim().length<5||input.evidenceReference.length>500||input.reason.trim().length<10||input.reason.length>1000)throw new PublicProfileError('Supply a reviewed source reference, meaningful reason and reliable past timestamp, or explicitly record that no reliable timestamp exists.',400);
 const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',PublicProfileAuthorityError,'super_admin'),intent=await command(db,input,'legacy_history_reconciled',input.sellerId,String(input.expectedVersion),{reliableSavedAt:input.reliableSavedAt,evidenceReference:input.evidenceReference.trim(),reason:input.reason.trim()});if(intent.receipt.replayed)return;
 const current=await state(db,input.sellerId,input.now);if(!current.historyNeedsReview||current.lastNormalPublicationAt!==null)throw new PublicProfileError('There is no unresolved legacy clock to reconcile.');
 await intent.commit([...authority.statements,...guard(db,"EXISTS(SELECT 1 FROM seller_public_profile_states p JOIN seller_profiles s ON s.id=p.seller_id WHERE p.seller_id=? AND p.version=? AND p.last_normal_publication_at IS NULL AND s.user_id<>?)",[input.sellerId,input.expectedVersion,input.actorId]),
  db.prepare('UPDATE seller_public_profile_states SET version=version+1,legacy_clock_reviewed_at=?,legacy_clock_value=?,legacy_clock_evidence=?,updated_at=? WHERE seller_id=?').bind(input.now,input.reliableSavedAt,input.evidenceReference.trim(),input.now,input.sellerId),
  db.prepare("UPDATE seller_public_profile_revisions SET status='needs_rebase',version=version+1,operation_request_id=? WHERE seller_id=? AND kind='normal' AND status IN ('submitted','approved')").bind(input.requestId,input.sellerId),
  db.prepare("INSERT INTO seller_public_profile_events(id,seller_id,actor_id,action,reason,payload_json,created_at) VALUES(?,?,?,'legacy_history_reconciled',?,?,?)").bind(crypto.randomUUID(),input.sellerId,input.actorId,input.reason.trim(),JSON.stringify({legacySavedAt:current.legacySavedAt,reliableSavedAt:input.reliableSavedAt,evidenceReference:input.evidenceReference.trim()}),input.now)
 ],{version:input.expectedVersion+1});
}
/** Shared only by the public-profile repositories; callers still supply their own atomic authority guards. */
export const profileWorkflowInternals=Object.freeze({ownerSql,guard,owner,command,values,state,event});

export async function getPublicProfileWorkspace(db:D1Database,sellerId:string,actorId:string,audience:'owner'|'staff',now:number=Date.now()){
 return withNativeFormLoad(db,audience==='owner'?['seller.public-profile-withdrawal','seller.public-profile-correction','seller.public-profile-media']:['staff.public-profile-review','staff.public-profile-correction-request','staff.public-profile-history-reconciliation'],()=>getPublicProfileWorkspaceSource(db,sellerId,actorId,audience,now));
}
