import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {validateSellerFormSubmission} from '../../lib/forms/submission';

/** Actual supported form publication for an isolated native care fixture. */
export async function publishCareForm(db:D1Database,actorId:string,formId:'staff.return-case-action'|'staff.complaint-case-action',options:{context?:string}={}){
 const published=Number((await db.prepare("SELECT COALESCE(MAX(version),0) AS n FROM form_config_versions WHERE form_id=? AND status='published'").bind(formId).first<{n:number}>())!.n);
 const draft=await saveFormDraft(db,{formId,actorId,actorRole:'super_admin',expectedPublishedVersion:published,config:{formId,fields:options.context?[{id:'staff_context',key:'staff_context',type:'long_text',label:'Recorded staff context',required:false,order:0,status:'active'}]:[]},reason:'Publish the actual supported care contract in an isolated fictional fixture.',requestId:crypto.randomUUID(),now:Date.now()});
 const form=await publishFormDraft(db,{formId,draftId:draft.id,actorId,actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:published,reason:'Review the original care form before a genuine native command captures its context.',requestId:crypto.randomUUID(),now:Date.now()});
 return{...form,validated:await validateSellerFormSubmission(db,formId,form.version,options.context?[{fieldId:'staff_context',value:options.context}]:[])};
}
