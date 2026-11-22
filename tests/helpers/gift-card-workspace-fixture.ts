import {completeVersionFixture} from './complete-version-fixture';
import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {resolvePublishedForm} from '../../lib/forms/runtime';
import {validateSellerFormSubmission} from '../../lib/forms/submission';
import {issueGiftCard} from '../../lib/db/repositories/gift-cards';

export async function giftCardWorkspaceFixture(){const f=await completeVersionFixture(Date.now());try{
 f.sqlite.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES('second-staff','second-staff','second-staff@local.hastabazaar.test','Fictional second eligible staff','active',1,1)").run();f.sqlite.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES('second-staff','super_admin',1)").run();
 for(const formId of ['commerce.gift-card-issue','commerce.gift-card-redeem']as const){const draft=await saveFormDraft(f.db,{formId,actorId:'reviewer',actorRole:'super_admin',expectedPublishedVersion:0,config:{formId,fields:[]},reason:'Publish the native gift contract only in this isolated memory fixture.',requestId:formId+'-fixture-draft',now:Date.now()});await publishFormDraft(f.db,{formId,draftId:draft.id,actorId:'reviewer',actorRole:'super_admin',expectedDraftRevision:draft.revision,expectedPublishedVersion:0,reason:'Use the supported gift issue and redemption fields without new financial policy.',requestId:formId+'-fixture-publish',now:Date.now()});}
 const issueConfig=await resolvePublishedForm(f.db,'commerce.gift-card-issue'),redeemConfig=await resolvePublishedForm(f.db,'commerce.gift-card-redeem');
 async function issue(requestId:string,amountPaisa=10000){const form=await validateSellerFormSubmission(f.db,'commerce.gift-card-issue',issueConfig.version,[],requestId);return issueGiftCard(f.db,{actorId:'reviewer',amountPaisa,requestId,now:Date.now(),form:{versionId:form.versionId,answers:form.answers}});}
 return{...f,issueConfig,redeemConfig,issue};
 }catch(error){f.dispose();throw error;}}
