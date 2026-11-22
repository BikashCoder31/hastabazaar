import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {digestFormRequest} from '../forms/submission';
import {publicProfileTaskInsert} from '../workflows/review-tasks';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {publicProfileEligibility,profileWorkflowInternals as workflow} from './public-profile-workflow';
import {PublicProfileError,PublicProfileAuthorityError,type PublicProfileValues,type ProfileCommand} from './public-profile-types';

const fields=['publicName','publicCity','about','specialties','craftExperience','socialLinks','media'] as const;
const empty:PublicProfileValues={publicName:'',publicCity:'',about:'',specialties:'',craftExperience:[],socialLinks:{},media:[]};
function scoped(current:PublicProfileValues,scope:readonly string[],desired:unknown){
 if(!scope.length||scope.length>fields.length||new Set(scope).size!==scope.length||scope.some(field=>!fields.includes(field as typeof fields[number]))
  ||!desired||typeof desired!=='object'||Array.isArray(desired)||Object.keys(desired).length!==scope.length||Object.keys(desired).some(field=>!scope.includes(field)))
  throw new PublicProfileError('Provide only the exact requested public correction fields.',400);
 const supplied=desired as Record<string,unknown>,result={...current};
 for(const field of scope as Array<keyof PublicProfileValues>){const checked=workflow.values({...empty,[field]:supplied[field]},true,true);Object.assign(result,{[field]:checked[field]});}
 return result;
}
function event(db:D1Database,input:ProfileCommand,caseId:string,action:string,reason:string,payload:unknown){return db.prepare(`INSERT INTO seller_public_profile_events(id,seller_id,correction_id,actor_id,action,reason,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)`)
 .bind(crypto.randomUUID(),input.sellerId,caseId,input.actorId,action,reason,JSON.stringify(payload),input.now);}
function notice(db:D1Database,input:ProfileCommand,id:string,status:string){return operationalBusinessNotificationStatements(db,{kind:'seller.profile_correction',sourceId:id,eventId:input.requestId,actorId:input.actorId,now:input.now,status,
 detail:status==='applied'?'The scoped correction was applied. Your normal publication deadline and separate private draft are unchanged. Any older proposal now needs a fresh comparison.':'Your scoped profile correction has an update. Open the profile for the exact request, feedback and recorded next update. The normal draft and publication deadline are unchanged.'});}
function removal(current:PublicProfileValues,next:PublicProfileValues,scope:readonly string[]){return scope.every(field=>{
 const before=current[field as keyof PublicProfileValues],after=next[field as keyof PublicProfileValues];
 if(typeof after==='string')return after==='';
 if(Array.isArray(after))return after.every(item=>(before as readonly unknown[]).some(old=>JSON.stringify(old)===JSON.stringify(item)));
 return Object.entries(after).every(([key,value])=>(before as Record<string,unknown>)[key]===value);
});}
export async function requestPublicProfileCorrection(db:D1Database,input:ProfileCommand&{baseVersion:number;fields:readonly string[];desired:Partial<PublicProfileValues>;category:string;reason:string}):Promise<string>{
 await workflow.owner(db,input.sellerId,input.actorId);
 if(!['wrong_detail','location_correction','privacy','compromised_link','staff_requested'].includes(input.category)||input.reason.trim().length<10||input.reason.length>1000)
  throw new PublicProfileError('Explain the factual, privacy, compromise or requested correction. A branding preference does not authorize a cooldown exception.',400);
 const scope=[...input.fields].sort(),current=await workflow.state(db,input.sellerId,input.now),content=scoped(current.current,scope,input.desired);
 const desired=Object.fromEntries(scope.map(field=>[field,content[field as keyof PublicProfileValues]])),intent=await workflow.command(db,input,'correction_requested',input.sellerId,String(input.baseVersion),{fields:scope,desired,category:input.category,reason:input.reason.trim()});
 if(intent.receipt.replayed)return intent.receipt.result as string;
 if(await digestFormRequest(content)===await digestFormRequest(current.current))throw new PublicProfileError('This correction has no changed public content.',400);
 const id=crypto.randomUUID();
 await intent.commit([...workflow.guard(db,`${workflow.ownerSql} AND EXISTS(SELECT 1 FROM seller_public_profile_states WHERE seller_id=? AND version=?)`,[input.sellerId,input.actorId,input.sellerId,input.baseVersion]),
  db.prepare(`INSERT INTO seller_public_profile_corrections(id,seller_id,owner_id,category,fields_json,scope_hash,original_base_version,original_json,base_version,desired_json,requested_by,requested_at,reason,operation_request_id)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,input.sellerId,input.actorId,input.category,JSON.stringify(scope),await digestFormRequest(scope),input.baseVersion,current.json,input.baseVersion,JSON.stringify(desired),input.actorId,input.now,input.reason.trim(),input.requestId),
  event(db,input,id,'correction_requested',input.reason.trim(),{fields:scope,desired,baseVersion:input.baseVersion}),publicProfileTaskInsert(db,id,input.now,input.now,true),...await notice(db,input,id,'requested')],id);return id;
}
export async function requestStaffPublicProfileCorrection(db:D1Database,input:ProfileCommand&{baseVersion:number;fields:readonly string[];reason:string;nextUpdateAt:number}):Promise<string>{
 const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',PublicProfileAuthorityError,'super_admin');
 if(input.reason.trim().length<10||input.reason.length>1000||!Number.isSafeInteger(input.nextUpdateAt)||input.nextUpdateAt<=input.now)
  throw new PublicProfileError('Specify the factual correction and the next update time you own.',400);
 const scope=[...input.fields].sort();scoped(empty,scope,Object.fromEntries(scope.map(field=>[field,empty[field as keyof PublicProfileValues]])));
 const intent=await workflow.command(db,input,'staff_correction_requested',input.sellerId,String(input.baseVersion),{fields:scope,reason:input.reason.trim(),nextUpdateAt:input.nextUpdateAt});
 if(intent.receipt.replayed)return intent.receipt.result as string;
 const current=await workflow.state(db,input.sellerId,input.now),seller=await db.prepare('SELECT user_id AS ownerId FROM seller_profiles WHERE id=?').bind(input.sellerId).first<{ownerId:string}>();
 if(!seller)throw new PublicProfileError('Seller not found.',404);
 const id=crypto.randomUUID();
 await intent.commit([...authority.statements,...workflow.guard(db,`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
  JOIN seller_public_profile_states p ON p.seller_id=s.id WHERE s.id=? AND s.user_id=? AND s.user_id<>? AND u.status='active' AND p.version=?)`,[input.sellerId,seller.ownerId,input.actorId,input.baseVersion]),
  db.prepare(`INSERT INTO seller_public_profile_corrections(id,seller_id,owner_id,category,fields_json,scope_hash,original_base_version,original_json,base_version,
   requested_by,requested_at,reason,status,reviewed_by,reviewed_at,review_reason,next_update_at,operation_request_id)
   VALUES(?,?,?,'staff_requested',?,?,?,?,?,?,?,?,'authorized',?,?,?,?,?)`)
   .bind(id,input.sellerId,seller.ownerId,JSON.stringify(scope),await digestFormRequest(scope),input.baseVersion,current.json,input.baseVersion,input.actorId,input.now,input.reason.trim(),input.actorId,input.now,input.reason.trim(),input.nextUpdateAt,input.requestId),
  event(db,input,id,'correction_authorized',input.reason.trim(),{fields:scope,nextUpdateAt:input.nextUpdateAt,baseVersion:input.baseVersion}),publicProfileTaskInsert(db,id,input.now,input.now,true,input.actorId),...await notice(db,input,id,'authorized')],id);return id;
}
export async function respondPublicProfileCorrection(db:D1Database,input:ProfileCommand&{correctionId:string;expectedVersion:number;baseVersion:number;desired:Partial<PublicProfileValues>;reason:string}):Promise<void>{
 await workflow.owner(db,input.sellerId,input.actorId);
 if(input.reason.trim().length<10||input.reason.length>1000)throw new PublicProfileError('Explain the exact correction supplied for review.',400);
 const record=await db.prepare('SELECT fields_json AS fields FROM seller_public_profile_corrections WHERE id=? AND seller_id=? AND owner_id=?').bind(input.correctionId,input.sellerId,input.actorId).first<{fields:string}>();
 if(!record)throw new PublicProfileError('Correction request not found.',404);
 const scope=JSON.parse(record.fields) as string[],current=await workflow.state(db,input.sellerId,input.now),content=scoped(current.current,scope,input.desired),desired=Object.fromEntries(scope.map(field=>[field,content[field as keyof PublicProfileValues]]));
 const intent=await workflow.command(db,input,'correction_answered',input.correctionId,String(input.expectedVersion),{baseVersion:input.baseVersion,desired,reason:input.reason.trim()});
 if(intent.receipt.replayed)return;
 await intent.commit([...workflow.guard(db,`${workflow.ownerSql} AND EXISTS(SELECT 1 FROM seller_public_profile_corrections c JOIN seller_public_profile_states p ON p.seller_id=c.seller_id
  WHERE c.id=? AND c.seller_id=? AND c.owner_id=? AND c.version=? AND c.status IN ('authorized','clarification','requested') AND p.version=?)`,[input.sellerId,input.actorId,input.correctionId,input.sellerId,input.actorId,input.expectedVersion,input.baseVersion]),
  db.prepare("UPDATE seller_public_profile_corrections SET base_version=?,desired_json=?,status='requested',version=version+1,operation_request_id=? WHERE id=?")
   .bind(input.baseVersion,JSON.stringify(desired),input.requestId,input.correctionId),
  event(db,input,input.correctionId,'correction_answered',input.reason.trim(),{fields:scope,desired,baseVersion:input.baseVersion}),...await notice(db,input,input.correctionId,'requested')],{correctionId:input.correctionId,version:input.expectedVersion+1});
}
export async function reviewPublicProfileCorrection(db:D1Database,input:{correctionId:string;actorId:string;expectedVersion:number;action:'apply'|'hide'|'decline'|'clarify';scopeConfirmed:boolean;reason:string;requestId:string;now:number;nextUpdateAt?:number}):Promise<void>{
 if(!['apply','hide','decline','clarify'].includes(input.action)||input.reason.trim().length<10||input.reason.length>1000)
  throw new PublicProfileError('Record a reasoned correction decision.',400);
 const apply=['apply','hide'].includes(input.action);
 if(apply&&input.scopeConfirmed!==true)throw new PublicProfileError('Inspect the exact requested changes and confirm that the exception is justified.',400);
 if(input.action==='clarify'&&(!Number.isSafeInteger(input.nextUpdateAt)||input.nextUpdateAt!<=input.now))throw new PublicProfileError('Record the next update time for the clarification you own.',400);
 const authority=await staffMutationGuard(db,input.actorId,'seller.application.review',PublicProfileAuthorityError,'super_admin'),intent=await workflow.command(db,input,'correction_reviewed',input.correctionId,String(input.expectedVersion),
 {action:input.action,scopeConfirmed:input.scopeConfirmed,reason:input.reason.trim(),nextUpdateAt:input.nextUpdateAt??null});if(intent.receipt.replayed)return;
 const record=await db.prepare(`SELECT seller_id AS sellerId,owner_id AS ownerId,fields_json AS fields,desired_json AS desired,base_version AS baseVersion,requested_by AS requestedBy,requested_at AS requestedAt
  FROM seller_public_profile_corrections WHERE id=?`).bind(input.correctionId).first<{sellerId:string;ownerId:string;fields:string;desired:string|null;baseVersion:number;requestedBy:string;requestedAt:number}>();
 if(!record)throw new PublicProfileError('Profile correction not found.',404);
 if(record.ownerId===input.actorId)throw new PublicProfileAuthorityError('Another eligible Super Admin must review your own seller correction.');
 const current=await workflow.state(db,record.sellerId,input.now),scope=JSON.parse(record.fields) as string[];
 if(apply&&!record.desired)throw new PublicProfileError('The seller must supply the exact requested correction before it can be reviewed.');
 const content=record.desired?scoped(current.current,scope,JSON.parse(record.desired)):current.current;
 if(input.action==='hide'&&!removal(current.current,content,scope))throw new PublicProfileError('Immediate hiding can only remove the exact unsafe material; replacement content needs publication review.',400);
 const status=apply?'applied':input.action==='clarify'?'clarification':'declined',context={...input,sellerId:record.sellerId},revisionId=crypto.randomUUID();
 const statements=[...authority.statements,...workflow.guard(db,`EXISTS(SELECT 1 FROM seller_public_profile_corrections c JOIN seller_profiles s ON s.id=c.seller_id JOIN users u ON u.id=s.user_id
  JOIN seller_public_profile_states p ON p.seller_id=c.seller_id WHERE c.id=? AND c.version=? AND c.status IN ('requested','authorized','clarification') AND c.owner_id=s.user_id AND s.user_id<>? AND u.status='active'
  ${apply?`AND p.version=c.base_version ${input.action==='hide'?'':`AND ${publicProfileEligibility('s.id',input.now)}`}`:''})`,[input.correctionId,input.expectedVersion,input.actorId])];
 if(apply){
  for(const item of content.media)statements.push(...workflow.guard(db,"EXISTS(SELECT 1 FROM seller_profile_media WHERE id=? AND seller_id=? AND moderation_status<>'rejected' AND instr(object_key,?)=1)",[item.mediaId,record.sellerId,`private/seller-profile/${record.sellerId}/`]));
  statements.push(db.prepare(`INSERT INTO seller_public_profile_revisions(id,seller_id,sequence,case_id,kind,correction_case_id,base_version,base_json,values_json,content_hash,draft_revision,submitted_by,owner_id,submitted_at,first_submitted_at,status,reviewed_by,reviewed_at,review_reason,published_at,operation_request_id)
   VALUES(?,?,(SELECT COALESCE(MAX(sequence),0)+1 FROM seller_public_profile_revisions WHERE seller_id=?),?,'correction',?,?,?,?,?,?,?,?,?,?,'published',?,?,?,?,?)`).bind(revisionId,record.sellerId,record.sellerId,revisionId,input.correctionId,record.baseVersion,current.json,JSON.stringify(content),await digestFormRequest(content),input.correctionId,record.requestedBy,record.ownerId,record.requestedAt,record.requestedAt,input.actorId,input.now,input.reason.trim(),input.now,input.requestId));
  for(const item of content.media)statements.push(db.prepare(`INSERT INTO seller_public_profile_revision_media(revision_id,media_id,kind,caption) SELECT ?,id,kind,? FROM seller_profile_media WHERE id=? AND seller_id=?`).bind(revisionId,item.caption,item.mediaId,record.sellerId));
  statements.push(db.prepare(`UPDATE seller_public_profile_states SET version=version+1,current_json=?,display_name=?,public_city=?,about=?,specialties=?,provenance='reviewed_correction',current_revision_id=?,updated_at=? WHERE seller_id=? AND version=?`)
   .bind(JSON.stringify(content),content.publicName,content.publicCity,content.about,content.specialties,revisionId,input.now,record.sellerId,record.baseVersion),
   db.prepare("UPDATE seller_public_profile_revisions SET status='needs_rebase',version=version+1,operation_request_id=? WHERE seller_id=? AND kind='normal' AND status IN ('submitted','approved')").bind(input.requestId,record.sellerId));
 }
 statements.push(db.prepare(`UPDATE seller_public_profile_corrections SET status=?,version=version+1,reviewed_by=?,reviewed_at=?,review_reason=?,next_update_at=?,operation_request_id=? WHERE id=?`)
  .bind(status,input.actorId,input.now,input.reason.trim(),input.action==='clarify'?input.nextUpdateAt!:null,input.requestId,input.correctionId),
  event(db,context,input.correctionId,`correction_${status}`,input.reason.trim(),{fields:scope,desired:record.desired?JSON.parse(record.desired):null,revisionId:apply?revisionId:null,nextNormalSubmissionAt:current.nextNormalSubmissionAt}),...await notice(db,context,input.correctionId,status));
 await intent.commit(statements,{correctionId:input.correctionId,status,revisionId:apply?revisionId:null});
}
