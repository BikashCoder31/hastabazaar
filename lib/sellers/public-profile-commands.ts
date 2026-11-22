import {PublicProfileError,type PublicProfileValues} from './public-profile-types';
import {savePublicProfileDraft,submitPublicProfileRevision,withdrawPublicProfileRevision,reviewPublicProfileRevision,reconcilePublicProfileLegacyClock} from './public-profile-workflow';
import {requestPublicProfileCorrection,respondPublicProfileCorrection,requestStaffPublicProfileCorrection,reviewPublicProfileCorrection} from './public-profile-corrections';
import {saveProfileSupport,saveProfileLocations} from './profile-contact-locations';

function parse(body:Record<string,unknown>,keys:string[]){
 if(Object.keys(body).some(key=>!['action','requestId',...keys].includes(key)))throw new PublicProfileError('Unexpected profile command fields.',400);
 const text=(key:string)=>{const value=body[key];if(typeof value!=='string')throw new PublicProfileError(`Provide ${key}.`,400);return value;};
 const integer=(key:string)=>{const value=body[key];if(!Number.isSafeInteger(value)||Number(value)<0)throw new PublicProfileError(`Provide the current ${key}.`,400);return Number(value);};
 const requestId=text('requestId');if(!/^[A-Za-z0-9_-]{1,100}$/.test(requestId))throw new PublicProfileError('A valid request reference is required.',400);
 const scope=()=>{if(!Array.isArray(body.fields)||body.fields.some(field=>typeof field!=='string'))throw new PublicProfileError('Provide the exact correction fields.',400);return body.fields as string[];};
 return{text,integer,requestId,scope};
}
export async function ownerPublicProfileCommand(db:D1Database,sellerId:string,actorId:string,body:Record<string,unknown>,now:number):Promise<unknown>{
 const action=body.action;
 const keys=action==='save_draft'?['expectedDraftRevision','baseVersion','values']:action==='submit'?['draftRevision','baseVersion','formVersion','customAnswers']:
  action==='withdraw'?['candidateId','expectedVersion','reason']:action==='request_correction'?['baseVersion','fields','desired','category','reason']:
  action==='answer_correction'?['correctionId','expectedVersion','baseVersion','desired','reason']:
  action==='save_support'?['expectedRevision','email','phone','phoneCountry','publicDisclosureConfirmed']:
  action==='save_locations'?['expectedRevision','pickupAddress','returnAddress']:null;
 if(!keys)throw new PublicProfileError('Choose a supported owner profile action.',400);
 const p=parse(body,keys),context={sellerId,actorId,requestId:p.requestId,now};
 if(action==='save_support')return saveProfileSupport(db,{...context,expectedRevision:p.text('expectedRevision'),email:p.text('email'),phone:p.text('phone'),phoneCountry:p.text('phoneCountry'),publicDisclosureConfirmed:body.publicDisclosureConfirmed===true});
 if(action==='save_locations')return saveProfileLocations(db,{...context,expectedRevision:p.text('expectedRevision'),pickupAddress:p.text('pickupAddress'),returnAddress:p.text('returnAddress')});
 if(action==='save_draft'){
  if(body.expectedDraftRevision!==null&&typeof body.expectedDraftRevision!=='string')throw new PublicProfileError('Provide the current draft revision.',400);
  return savePublicProfileDraft(db,{...context,expectedDraftRevision:body.expectedDraftRevision,baseVersion:p.integer('baseVersion'),values:body.values});
 }
 if(action==='submit'){
  if(!Array.isArray(body.customAnswers))throw new PublicProfileError('Review the current supplemental form questions before submitting.',400);
  return submitPublicProfileRevision(db,{...context,draftRevision:p.text('draftRevision'),baseVersion:p.integer('baseVersion'),form:{version:p.integer('formVersion'),answers:body.customAnswers}});
 }
 if(action==='withdraw')return withdrawPublicProfileRevision(db,{...context,candidateId:p.text('candidateId'),expectedVersion:p.integer('expectedVersion'),reason:p.text('reason')});
 if(action==='request_correction')return requestPublicProfileCorrection(db,{...context,baseVersion:p.integer('baseVersion'),fields:p.scope(),desired:body.desired as Partial<PublicProfileValues>,category:p.text('category'),reason:p.text('reason')});
 return respondPublicProfileCorrection(db,{...context,correctionId:p.text('correctionId'),expectedVersion:p.integer('expectedVersion'),baseVersion:p.integer('baseVersion'),desired:body.desired as Partial<PublicProfileValues>,reason:p.text('reason')});
}
export async function staffPublicProfileCommand(db:D1Database,sellerId:string,actorId:string,body:Record<string,unknown>,now:number){
 if(body.action==='reconcile_legacy'){
  const p=parse(body,['expectedVersion','reliableSavedAt','evidenceReference','reason']);
  if(body.reliableSavedAt!==null&&typeof body.reliableSavedAt!=='number')throw new PublicProfileError('Supply a reliable timestamp or explicitly select no reliable timestamp.',400);
  return reconcilePublicProfileLegacyClock(db,{sellerId,actorId,requestId:p.requestId,now,expectedVersion:p.integer('expectedVersion'),reliableSavedAt:body.reliableSavedAt as number|null,evidenceReference:p.text('evidenceReference'),reason:p.text('reason')});
 }
 const action=body.action,normal=['approve_only','approve_publish','publish','request_changes','reject'].includes(String(action)),correction=['apply','hide','decline','clarify'].includes(String(action));
 if(!normal&&!correction&&action!=='request_correction')throw new PublicProfileError('Choose a supported staff profile action.',400);
 const p=parse(body,normal?['candidateId','expectedVersion','reason']:correction?['correctionId','expectedVersion','reason','scopeConfirmed','nextUpdateAt']:['baseVersion','fields','reason','nextUpdateAt']);
 const context={sellerId,actorId,requestId:p.requestId,now};
 if(action==='request_correction')return requestStaffPublicProfileCorrection(db,{...context,baseVersion:p.integer('baseVersion'),fields:p.scope(),reason:p.text('reason'),nextUpdateAt:p.integer('nextUpdateAt')});
 const source=normal?'seller_public_profile_revisions':'seller_public_profile_corrections',id=p.text(normal?'candidateId':'correctionId');
 if(!await db.prepare(`SELECT 1 FROM ${source} WHERE id=? AND seller_id=?`).bind(id,sellerId).first())throw new PublicProfileError('Profile review not found for this seller.',404);
 if(normal)return reviewPublicProfileRevision(db,{...context,candidateId:id,expectedVersion:p.integer('expectedVersion'),action:action as 'approve_only'|'approve_publish'|'publish'|'request_changes'|'reject',reason:p.text('reason')});
 if(typeof body.scopeConfirmed!=='boolean')throw new PublicProfileError('Confirm the exact correction scope.',400);
 return reviewPublicProfileCorrection(db,{...context,correctionId:id,expectedVersion:p.integer('expectedVersion'),action:action as 'apply'|'hide'|'decline'|'clarify',scopeConfirmed:body.scopeConfirmed,reason:p.text('reason'),...(body.nextUpdateAt===undefined?{}:{nextUpdateAt:p.integer('nextUpdateAt')})});
}
