import { validateSellerDocumentContent } from '@/lib/uploads/document-content';
import { env } from 'cloudflare:workers';
import { requireCustomerApi,CustomerAuthorizationError } from '@/lib/auth/customer';
import { getManagedMakerAuthority,ManagedMakerAuthorizationError } from '@/lib/managed-commerce/maker-authority';
import { requireDatabase,requireMediaBucket } from '@/lib/db/d1';
import { getRegisteredSellerTerms } from '@/lib/db/repositories/marketplace-settings';
import { isTrustedMutationRequest } from '@/lib/http/request-security';
import { readBoundedForm,formText,BodyTooLargeError } from '@/lib/http/bounded-body';
import { digestMultipartRequest,digestFormRequest,configuredMultipartAnswers,validateSellerFormSubmission,formRequestReplay,FormRequestConflictError,isValidatedFormVersionStale } from '@/lib/forms/submission';
import { resolvePublishedForm,FormRuntimeError } from '@/lib/forms/runtime';
import { FormValidationError } from '@/lib/forms/validation';
import { registeredTransitionFormId,registeredTransitionKeys } from '@/lib/managed-commerce/transition-contract';
import { submitRegisteredSellerTransition,resubmitRegisteredSellerTransition,validateRegisteredTransitionInput,RouteTransitionError } from '@/lib/managed-commerce/route-transition';
import { resolveRuntimeEnvironment,assertSimulationAllowed } from '@/lib/staging/environment';
import { validateSellerDocument,type SellerApplicationDocument } from '@/lib/sellers/application';

export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'private, no-store',Vary:'Cookie'}});
const database=()=>requireDatabase(env as unknown as {DB?:D1Database});
async function ownedProfile(db:D1Database,userId:string) {
  const row=await db.prepare(`SELECT s.id AS sellerId,p.participation_route AS route,p.application_stage AS stage FROM seller_profiles s
    JOIN seller_participation_profiles p ON p.seller_id=s.id WHERE s.user_id=?`).bind(userId).first<{sellerId:string;route:string;stage:string}>();
  if(!row)throw new ManagedMakerAuthorizationError('Maker account not found.');
  return row;
}
export async function GET() {
  try {
    const user=await requireCustomerApi();const db=database();const profile=await ownedProfile(db,user.userId);
    const [terms,documents,transitions]=await Promise.all([getRegisteredSellerTerms(db),
      db.prepare(`SELECT id,kind,original_name AS name,status FROM seller_documents WHERE seller_id=? AND kind IN ('business_registration','pan_certificate','vat_certificate','bank_verification')
        AND (kind<>'pan_certificate' OR instr(object_key,?)=1) ORDER BY uploaded_at DESC,id`).bind(profile.sellerId,`private/seller-documents/${profile.sellerId}/transition-`).all(),
      db.prepare(`SELECT id,status,version,legal_name AS legalName,registration_authority AS registrationAuthority,registration_number AS registrationNumber,
        tax_mode AS taxMode,tax_registration_number AS taxRegistrationNumber,json_extract(registered_terms_snapshot_json,'$.payoutAccountReference') AS payoutAccountReference,effective_at AS effectiveAt,review_reason AS reviewReason FROM seller_route_transition_applications WHERE seller_id=? ORDER BY created_at DESC,id LIMIT 50`).bind(profile.sellerId).all(),
    ]);
    return reply({...profile,terms,documents:documents.results,transitions:transitions.results});
  } catch(error) {return failure(error);}
}
export async function POST(request:Request) {
  if(!isTrustedMutationRequest(request))return reply({error:'Cross-site requests are not allowed.'},403);
  let validatedVersionId:string|undefined;
  try {
    const user=await requireCustomerApi();const db=database();const profile=await ownedProfile(db,user.userId);
    const bindings=env as unknown as {HASTABAZAAR_RUNTIME_ENV?:string;APP_ORIGIN?:string;MEDIA?:R2Bucket};
    const environment=resolveRuntimeEnvironment({runtimeEnvironment:bindings.HASTABAZAAR_RUNTIME_ENV,nodeEnvironment:process.env.NODE_ENV,appOrigin:bindings.APP_ORIGIN});
    assertSimulationAllowed(environment);
    const data=await readBoundedForm(request,16*1024*1024);
    const seen=new Set<string>();
    for(const [key,value] of data) {
      if(key.startsWith('custom.'))continue;
      if(!registeredTransitionKeys.some(allowed=>allowed===key)||seen.has(key))throw new FormValidationError('invalid_answer','Unexpected or duplicate transition field.');
      seen.add(key);
      if(value instanceof File&&!['businessRegistration','panCertificate','vatCertificate','bankVerification'].includes(key))throw new FormValidationError('invalid_answer','Unexpected file upload.');
    }
    const requestId=formText(data,'requestId');
    const action=formText(data,'action');
    if(!['submit','resubmit'].includes(action)||!/^[a-zA-Z0-9_-]{1,100}$/.test(requestId))throw new RangeError('Reload the transition form and review the requested action.');
    const rawDigest=await digestFormRequest({sellerId:profile.sellerId,actorId:user.userId,multipart:await digestMultipartRequest(data)});
    const auditAction=action==='resubmit'?'seller.route_transition.resubmitted':'seller.route_transition.requested';
    const previous=await formRequestReplay(db,{formId:registeredTransitionFormId,requestId,actorId:user.userId,action:auditAction,digest:rawDigest});
    if(previous) {
      if(!await db.prepare(`SELECT 1 FROM seller_route_transition_applications t JOIN users u ON u.id=t.requested_by
        WHERE t.id=? AND t.seller_id=? AND t.requested_by=? AND u.status='active' AND NOT EXISTS(SELECT 1 FROM seller_restrictions r
          WHERE r.seller_id=t.seller_id AND (r.mode='disabled' OR (r.mode='suspended' AND r.suspended_until>?)))`).bind(previous,profile.sellerId,user.userId,Date.now()).first())throw new ManagedMakerAuthorizationError();
      return reply({ok:true,id:previous,requestId,sellerId:profile.sellerId,simulation:true});
    }
    const maker=await getManagedMakerAuthority(db,user.userId,Date.now());
    if(maker.stage!=='active')throw new RouteTransitionError('Activate the maker account before requesting a Registered Seller transition.');
    const config=await resolvePublishedForm(db,registeredTransitionFormId);
    const submitted=configuredMultipartAnswers(data,config);
    const form=await validateSellerFormSubmission(db,registeredTransitionFormId,submitted.version,submitted.customAnswers,requestId);
    validatedVersionId=form.versionId;
    const now=Date.now();const terms=await getRegisteredSellerTerms(db,now);
    if(formText(data,'acceptedTerms')!=='yes'||formText(data,'registeredTermsContext')!==terms.context||formText(data,'agreementVersion')!==terms.agreementVersion||formText(data,'agreementLanguage')!=='en')throw new RouteTransitionError('Review and accept the displayed current English seller terms.');
    const taxMode=formText(data,'taxMode');
    if(!['PAN','VAT','BOTH'].includes(taxMode))throw new RangeError('Choose PAN, VAT or both.');
    const documents:SellerApplicationDocument[]=[];const references:string[]=[];
    const requiredFiles=['bankVerification',...(taxMode==='PAN'?['businessRegistration','panCertificate']:taxMode==='VAT'?['businessRegistration','vatCertificate']:['businessRegistration','panCertificate','vatCertificate'])];
    const kinds={businessRegistration:'business_registration',panCertificate:'pan_certificate',vatCertificate:'vat_certificate',bankVerification:'bank_verification'} as const;
    const uploads:{file:File;document:SellerApplicationDocument}[]=[];
    for(const [field,kind] of Object.entries(kinds)) {
      const file=data.get(field);const existing=formText(data,`${field}Id`);
      if(!requiredFiles.includes(field)) {if(existing||file instanceof File&&file.size>0)throw new RangeError('Remove certificates that do not match the chosen tax status.');continue;}
      if(file instanceof File&&file.size>0) {
        if(existing)throw new RangeError('Choose an existing certificate or upload a replacement, one at a time.');
        const error=validateSellerDocument(file)??await validateSellerDocumentContent(file);if(error)throw new RangeError(error);
        const id=`transition-${(await digestFormRequest({sellerId:profile.sellerId,requestId,rawDigest,field})).slice(0,48)}`;
        const document={id,kind,objectKey:`private/seller-documents/${profile.sellerId}/${id}`,originalName:file.name.slice(0,180),mimeType:file.type,sizeBytes:file.size};
        documents.push(document);uploads.push({file,document});references.push(id);
      } else if(existing)references.push(existing);
       else throw new RangeError(`Provide the required ${field==='businessRegistration'?'business registration':field==='panCertificate'?'business PAN':field==='bankVerification'?'receiving-account evidence':'VAT'} certificate.`);
    }
    const input={sellerId:profile.sellerId,actorId:user.userId,legalName:formText(data,'legalName'),registrationAuthority:formText(data,'registrationAuthority'),registrationNumber:formText(data,'registrationNumber'),
      taxMode:taxMode as 'PAN'|'VAT'|'BOTH',taxRegistrationNumber:formText(data,'taxRegistrationNumber'),payoutAccountReference:formText(data,'payoutAccountReference'),evidenceReferences:references,documents,agreementVersion:terms.agreementVersion,
      agreementLanguage:'en' as const,agreementAcceptedAt:now,registeredTermsContext:terms.context,requestId,now,environment,form:{requestId,versionId:form.versionId,answers:form.answers,digest:rawDigest}};
    await validateRegisteredTransitionInput(db,input);
    if(action==='resubmit'&&!await db.prepare("SELECT 1 FROM seller_route_transition_applications WHERE id=? AND seller_id=? AND requested_by=? AND version=? AND status='changes_requested'").bind(formText(data,'applicationId'),profile.sellerId,user.userId,Number(formText(data,'expectedVersion'))).first())throw new RouteTransitionError('Reload the requested corrections before uploading replacement certificates.');
    // Validation is complete before private uploads. On an uncertain commit, retain uploads for exact retry.
    for(const {file,document} of uploads)await requireMediaBucket(bindings).put(document.objectKey,file.stream(),{httpMetadata:{contentType:file.type},customMetadata:{sellerId:profile.sellerId,documentKind:document.kind}});
    const id=action==='resubmit'?await resubmitRegisteredSellerTransition(db,{...input,applicationId:formText(data,'applicationId'),expectedVersion:Number(formText(data,'expectedVersion'))}):await submitRegisteredSellerTransition(db,input);
    return reply({ok:true,id,requestId,sellerId:profile.sellerId,simulation:true},201);
  }catch(error){
    if(validatedVersionId&&await isValidatedFormVersionStale(database(),registeredTransitionFormId,validatedVersionId))return reply({error:'This form changed. Refresh it and review your answers.',code:'stale_version'},409);
    return failure(error);
  }
}
function failure(error:unknown) {
  if(error instanceof CustomerAuthorizationError||error instanceof ManagedMakerAuthorizationError)return reply({error:error.message},error.status);
  if(error instanceof BodyTooLargeError)return reply({error:error.message},413);
  if(error instanceof FormRuntimeError)return reply({error:error.message,code:error.code},error.code==='stale_version'?409:503);
  if(error instanceof FormValidationError)return reply({error:error.message,fieldId:error.fieldId},400);
  if(error instanceof FormRequestConflictError||error instanceof RouteTransitionError)return reply({error:error.message},409);
  if(error instanceof RangeError||error instanceof TypeError||error instanceof SyntaxError)return reply({error:error.message},400);
  return reply({error:'The transition result could not be confirmed. Keep the same request reference and retry the original details.'},503);
}
