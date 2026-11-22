import {saveFormDraft,publishFormDraft} from '../../lib/db/repositories/form-catalog';
import {managedTermsFormId,getManagedTermsOffers,acceptManagedTerms} from '../../lib/managed-commerce/accepted-terms';
import {requestProtectedChange,reviewProtectedChangePermission,protectedBankFields} from '../../lib/sellers/protected-change-requests';
import {sellerBankState,submitSellerBankDetails,reviewSellerBankDetails} from '../../lib/sellers/bank-details';
type Fixture={db:D1Database;sellerId:string;ownerId:string};
export async function acceptLiveCurrentTerms(f:Fixture,tag='live-current-terms'){
 let form=await f.db.prepare("SELECT id,version FROM form_config_versions WHERE form_id=? AND status='published' ORDER BY version DESC LIMIT 1").bind(managedTermsFormId).first<{id:string;version:number}>();
 if(!form){const common={formId:managedTermsFormId,actorId:'reviewer',actorRole:'super_admin' as const,expectedPublishedVersion:0,reason:'Configure the actual fictional company-store terms acceptance operation.',now:Date.now()};
  const draft=await saveFormDraft(f.db,{...common,requestId:tag+'-form-draft',config:{formId:managedTermsFormId,fields:[]}});
  form=await publishFormDraft(f.db,{...common,draftId:draft.id,expectedDraftRevision:draft.revision,requestId:tag+'-form-publish'});
 }
 const offer=(await getManagedTermsOffers(f.db,f.sellerId,Date.now())).current;
 return acceptManagedTerms(f.db,{sellerId:f.sellerId,actorId:f.ownerId,offerId:offer.id,context:offer.context,language:'en',requestId:tag,now:Date.now(),form:{versionId:form.id,answers:{formId:managedTermsFormId,version:form.version,answers:[]}}});
}
export async function replaceLiveMakerBank(f:Fixture,tag:string,holder:string){
 const current=await sellerBankState(f.db,f.sellerId),caseId=await requestProtectedChange(f.db,{sellerId:f.sellerId,actorId:f.ownerId,kind:'bank',fields:[...protectedBankFields],reason:'Replace only this same owner receiving account with newly inspected routing and bank evidence.',expectedIdentityRevision:current.identityRevision,expectedBankRevision:current.bankRevision,requestId:tag+'-request',now:Date.now()});
 const permissionId=await reviewProtectedChangePermission(f.db,{caseId,actorId:'reviewer',expectedVersion:0,expectedIdentityRevision:current.identityRevision,expectedBankRevision:current.bankRevision,decision:'permit',reason:'Permit only the exact independently reviewed replacement bank source.',requestId:tag+'-permit',now:Date.now()});
 const documentId=tag+'-file';await submitSellerBankDetails(f.db,{sellerId:f.sellerId,actorId:f.ownerId,revision:(await sellerBankState(f.db,f.sellerId)).revision,changeRequestId:caseId,permissionId:permissionId!,commandId:tag+'-upload',now:Date.now(),details:{payoutBeneficiary:holder,bankName:'Another Fictional Bank',bankBranch:'Fictional new branch',bankAccountNumber:'TEST-ROUTING-'+tag},document:{id:documentId,kind:'bank_verification',objectKey:'private/seller-documents/'+f.sellerId+'/'+documentId,originalName:'fictional-replacement.pdf',mimeType:'application/pdf',sizeBytes:100}});
 const pending=await sellerBankState(f.db,f.sellerId);
 await reviewSellerBankDetails(f.db,{sellerId:f.sellerId,actorId:'reviewer',revision:pending.revision,reference:'FICTIONAL-REPLACEMENT-'+tag,reason:'Independently inspect the exact actual fictional beneficiary and new bank routing.',ownershipBasis:'same_person',identityEvidenceConfirmed:true,releaseBankHold:true,commandId:tag+'-verify',now:Date.now()});
 return {caseId,pending,bank:await sellerBankState(f.db,f.sellerId)};
}
