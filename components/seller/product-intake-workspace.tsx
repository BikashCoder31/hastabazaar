'use client';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Eye, Lightbulb, Minus, Plus, TriangleAlert, Upload } from 'lucide-react';
import { StepLine } from '@/components/ui/step-line';
import { WhoseTurn } from '@/components/ui/whose-turn';
import { calculatePriceGuidance, type PriceScenario } from '@/lib/products/price-guidance';
import { offerMoney, type OfferDraft } from '@/lib/products/offer-contracts';
import { productPreviewPath } from '@/lib/products/preview-path';
import { sellerDate, sellerMoney } from '@/lib/seller/presentation';
import { phaseOneMarketplacePolicy } from '@/lib/marketplace/policy';
import { ProductReviewReadiness, productReadinessIssues, readinessChecks } from './product-review-readiness';
import { firstProductStep, groupProductStepIssues, stepForProductField } from '@/lib/products/guided-product-steps';
import { GuidedBottomBar, GuidedCheck, GuidedReadiness, GuidedStepBar } from './product-guided-layout';
import {ProductScopeBoundary} from '@/components/products/product-scope-boundary';
import {ProductReadAccessNotice} from '@/components/products/product-access-notice';
import {ProductLegacySource} from './product-legacy-source';
import {ProductPublicationOwner} from './product-publication-owner';
import {publicPublicationSnapshot} from '@/lib/products/publication-view';
import {ProductIntakeHistory} from './product-intake-history';
import {ProductIntakeQuestions,ProductIntakeQuestionSummary} from './product-intake-questions';
import {usePublishedFormConfig} from '@/components/forms/form-config-client';
import {fieldDisplay} from '@/components/forms/configured-fields';
import {useEffect,useRef,useState} from 'react';
import {CategoryDetailGroups} from './category-detail-groups';
import {VariantEditor} from './variant-editor';
import {PriceProfitPreview} from './price-profit-preview';
import {ProductIntakePreview} from './product-intake-preview';
import {ProductHelpRequest} from './product-help-request';
import {useProductIntake,type ProductWorkspace} from './use-product-intake';
import {detailText,productDetailGroups,type CategoryDetailModel,type ProductDetailKey} from '@/lib/products/category-fields';
import type {IntakeSnapshot} from '@/lib/products/intake-workspace';
import {PackedProductWeightInput} from './packed-weight-input';

type Choice={id:string;nameEn:string};
type UploadJob={requestId:string;file:File;cover:boolean;draftId:string|null;state:'waiting'|'uploading'|'ready'|'failed';message:string};
const inputClass='min-h-11 min-w-0 w-full rounded-lg border border-[#D7C4A9] bg-white px-3 py-2';
const buttonClass='min-h-11 rounded-lg border border-[#D7C4A9] px-4 py-2 text-sm font-semibold disabled:opacity-50';
const panelClass='min-w-0 space-y-4 rounded-[0.9rem] border border-[#E4DACA] bg-white p-4 sm:p-5';
const isPhoto = (file: { mimeType: string }) => file.mimeType.startsWith('image/');
function photoCount(snapshot: IntakeSnapshot, files: ProductWorkspace['uploads']) {
  return files.filter(file=>file.state==='ready'&&isPhoto(file)&&snapshot.mediaIds.includes(file.id)).length;
}
function initialProductStep(initial: ProductWorkspace | null, category: CategoryDetailModel, guided: boolean) {
  if (!guided || !initial) return 0;
  return firstProductStep(groupProductStepIssues(productReadinessIssues(initial, category, initial, true),
    photoCount(initial, initial.uploads), initial.offers.offers.find(offer => offer.included)?.stockIntent ?? ''));
}
function display(value:unknown){if(value===undefined||value===null||value==='')return 'Not provided';return typeof value==='string'?value:JSON.stringify(value,null,2);}
function SnapshotComparison({before,after,categories=[],uploads=[],proposed=false}:{before:IntakeSnapshot;after:IntakeSnapshot;categories?:readonly Choice[];uploads?:readonly {id:string;originalName:string}[];proposed?:boolean}){
 const entries=[...new Set([...Object.keys(before.answers),...Object.keys(after.answers)])].filter(key=>JSON.stringify(before.answers[key as ProductDetailKey])!==JSON.stringify(after.answers[key as ProductDetailKey]));
 const label=(key:string)=>productDetailGroups.flatMap(group=>group.fields).find(field=>field.key===key)?.label??'Product detail',heading=proposed?'Proposed changes':'Your entries';
 const offers=(value:IntakeSnapshot)=>value.offers.offers.map((row,index)=><li key={row.id} className="space-y-1 rounded border p-2"><p className="font-medium">Offer {index+1} · {value.offers.axes.map(axis=>axis.values.find(choice=>choice.id===row.selection[axis.id])?.label??'Choice not provided').join(' · ')||'No options'}</p><p>Entered selling price: {row.price||'Not provided'} · Original price: {row.compareAt||'Not provided'}</p><p>Physical amount: {row.unitsPerOffer||'Not provided'} {row.baseUnit} · Draft quantity: {row.stockIntent||'Not provided'}</p><p>Seller stock code: {row.sku||'Not provided'} · {row.included?'Included':'Excluded'}{row.browseOnly?' · Browse only':''}</p></li>);
 return <div className="space-y-3 text-sm">{before.categoryId!==after.categoryId&&<p>Category: {categories.find(item=>item.id===before.categoryId)?.nameEn??'Not established'} → {categories.find(item=>item.id===after.categoryId)?.nameEn??'Not established'}</p>}{entries.map(key=><div key={key} className="grid gap-2 rounded border p-3 sm:grid-cols-2"><div><p className="font-medium">{proposed?'Current draft':'Saved'} · {label(key)}</p><p className="whitespace-pre-wrap break-words">{display(before.answers[key as ProductDetailKey])}</p></div><div><p className="font-medium">{heading} · {label(key)}</p><p className="whitespace-pre-wrap break-words">{display(after.answers[key as ProductDetailKey])}</p></div></div>)}{JSON.stringify(before.offers)!==JSON.stringify(after.offers)&&<details className="rounded border p-3"><summary>Compare offers and prices</summary><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><p className="mb-2 font-medium">{proposed?'Current draft':'Saved'}</p><ul className="space-y-2">{offers(before)}</ul></div><div><p className="mb-2 font-medium">{heading}</p><ul className="space-y-2">{offers(after)}</ul></div></div></details>}{JSON.stringify(before.mediaIds)!==JSON.stringify(after.mediaIds)&&<div className="rounded border p-3"><p>Saved attachments: {before.mediaIds.map(id=>uploads.find(file=>file.id===id)?.originalName??'Earlier uploaded file').join(', ')||'None'}</p><p>{heading}: {after.mediaIds.map(id=>uploads.find(file=>file.id===id)?.originalName??'Uploaded file').join(', ')||'None'}</p></div>}{JSON.stringify(before.formContext)!==JSON.stringify(after.formContext)&&<div className="space-y-2 rounded border p-3"><p>Saved additional answers</p><ProductIntakeQuestionSummary context={before.formContext}/><p>{heading}</p><ProductIntakeQuestionSummary context={after.formContext}/></div>}{(['originEvidenceReference','licenceReference','note'] as const).filter(key=>before.privateReview[key]!==after.privateReview[key]).map(key=><div key={key} className="rounded border p-3"><p className="font-medium">{key==='originEvidenceReference'?'Origin evidence reference':key==='licenceReference'?'Product licence reference':'Product-review note'}</p><p className="whitespace-pre-wrap break-words">Saved: {before.privateReview[key]||'Not provided'}</p><p className="whitespace-pre-wrap break-words">{heading}: {after.privateReview[key]||'Not provided'}</p></div>)}</div>;
}
export function ProductIntakeWorkspace(props:Parameters<typeof ProductIntakeWorkspaceBody>[0]){return <ProductScopeBoundary workspace="seller" key={JSON.stringify([props.actorId??props.initial?.actorId??'current',props.initial?.id??'new'])} actorId={props.actorId??props.initial?.actorId??null}><ProductIntakeWorkspaceBody {...props}/></ProductScopeBoundary>;}
function ProductIntakeWorkspaceBody({categories,occasions,materialSuggestions=[],initial=null,initialCategoryModel,initialOfferId,actorId,studio=false,pricing,tradingName,packedWeightAvailable=false,guided=false,returnWindowDays=phaseOneMarketplacePolicy.value.returns.generalRequestWindowDays,returnPolicyEnabled=phaseOneMarketplacePolicy.value.returns.changeOfMindEnabled}:{categories:readonly Choice[];occasions:readonly Choice[];materialSuggestions?:readonly string[];initial?:ProductWorkspace|null;initialCategoryModel:CategoryDetailModel;initialOfferId?:string;actorId?:string;studio?:boolean;pricing?:PriceScenario|null;tradingName?:string|null;packedWeightAvailable?:boolean;guided?:boolean;returnWindowDays?:number;returnPolicyEnabled?:boolean}){
 const publishedForm=usePublishedFormConfig('seller.product-submission'),nameDisplay=fieldDisplay(publishedForm.config,'nameEn'),descriptionDisplay=fieldDisplay(publishedForm.config,'descriptionEn');
 const actor=actorId??initial?.actorId,actorHeaders:Record<string,string>=actor?{'X-Hastabazaar-Actor':actor}:{};
 const editor=useProductIntake(initial,actorId??initial?.actorId),[step,setStep]=useState(()=>initialProductStep(initial,initialCategoryModel,guided)),[requestedField,setRequestedField]=useState<{key:ProductDetailKey;token:number}|null>(null),[category,setCategory]=useState(initialCategoryModel),[categoryMessage,setCategoryMessage]=useState(''),[selectedOffer,setSelectedOffer]=useState(initialOfferId??initial?.offers.offers[0]?.id??''),[photoOffer,setPhotoOffer]=useState<string|null>(null),[uploads,setUploads]=useState<UploadJob[]>([]),[help,setHelp]=useState<ProductWorkspace|null>(null),[message,setMessage]=useState(''),[operating,setOperating]=useState(false),[pendingAction,setPendingAction]=useState<Record<string,unknown>|null>(null);
 const [furthest,setFurthest]=useState(step),[stepError,setStepError]=useState<string|null>(null);
 const guidedHeading=useRef<HTMLHeadingElement>(null);
 const guidedPhotoInput=useRef<HTMLInputElement>(null);
 const coverIntent=useRef<string|null>(null),uploading=useRef(new Set<string>()),actionFlight=useRef(false),helpSection=useRef<HTMLDivElement>(null),photosSection=useRef<HTMLElement>(null),offersSection=useRef<HTMLDivElement>(null);
 const draft=editor.draft,offer=draft.offers.offers.find(row=>row.id===selectedOffer)??draft.offers.offers.find(row=>row.included)??draft.offers.offers[0],serverUploads=editor.saved?.uploads??[];
 const categoryModel=category.categoryId===draft.categoryId?category:{...category,categoryId:draft.categoryId,status:'unknown' as const,contract:null,groups:productDetailGroups.map(group=>({...group,recommended:false}))};
 const checks=readinessChecks(draft,categoryModel,editor.saved,!editor.dirty);
 const photos=photoCount(draft,serverUploads);
 const stepIssues=guided?groupProductStepIssues(productReadinessIssues(draft,categoryModel,editor.saved,!editor.dirty),photos,offer?.stockIntent??''):[];
 const sellingPaisa=offer?offerMoney(offer.price):null;
 const estimate=sellingPaisa&&pricing?calculatePriceGuidance({sellingPaisa,scenario:pricing,costPaisa:null,targetPaisa:null,deductions:[]}):null;
 const latestReview=editor.saved?.case?.state==='waiting_seller'?editor.saved.activity.find(event=>event.note&&event.kind!=='received'):undefined;
 const observed=editor.saved?.legacy?.observed;
 const legacyNote=!editor.saved?.case&&observed&&['needs_changes','rejected'].includes(String(observed.status))&&typeof observed.review_note==='string'?observed.review_note:null;
 const changeNote=editor.saved?.proposal?.sourceNote||latestReview?.note||legacyNote;
 const changeDate=editor.saved?.proposal?.createdAt??latestReview?.createdAt??(legacyNote&&typeof observed?.updated_at==='number'?observed.updated_at:null);
 const targetField=changeNote?productDetailGroups.flatMap(group=>group.fields).find(field=>changeNote.toLocaleLowerCase().includes(field.label.toLocaleLowerCase()))?.key:undefined;
 const caseState=editor.saved?.case?.state;
 const inReview=caseState==='submitted'||caseState==='in_review'||caseState==='ready_for_decision';
 const reviewedVersionInShop=!!editor.saved?.publication?.currentVersionId&&caseState==='resolved'&&!editor.dirty;
 const sent=inReview&&!editor.dirty&&editor.saved?.case?.versionId===editor.saved?.versionId;
 const offerId=offer?.id;useEffect(()=>{if(!offerId)return;const url=new URL(window.location.href);url.searchParams.set('offer',offerId);window.history.replaceState(window.history.state,'',url);},[offerId]);
 const updateAnswer=(key:ProductDetailKey,value:string|readonly string[])=>{
  if(guided)setStepError(null);
  editor.change(old=>({...old,answers:{...old.answers,[key]:value}}));
 };
 function updateOffer(key: 'price'|'compareAt'|'stockIntent', value: string) {
  if(guided)setStepError(null);
  editor.change(old=>{
   if(offer)return {...old,offers:{...old.offers,offers:old.offers.offers.map(row=>row.id===offer.id?{...row,[key]:value}:row)}};
   const first:OfferDraft={id:crypto.randomUUID(),selection:{},price:'',compareAt:'',sku:'',mediaId:null,stockFamilyKey:crypto.randomUUID(),
     baseUnit:'piece',unitsPerOffer:'1',included:true,browseOnly:false,stockIntent:'',[key]:value};
   return {...old,offers:{...old.offers,offers:[first]}};
  });
 }
 useEffect(()=>{let alive=true;const controller=new AbortController();async function load(){try{const response=await fetch('/api/seller/product-intakes/workspace?categoryId='+encodeURIComponent(draft.categoryId??''),{cache:'no-store',signal:controller.signal}),data=await response.json() as CategoryDetailModel&{error?:string};if(!response.ok)throw new Error(data.error??'Category guidance is unavailable.');if(alive){setCategory(data);setCategoryMessage('');}}catch(error){if(alive&&!(error instanceof Error&&error.name==='AbortError'))setCategoryMessage('Category guidance is unavailable. Your details remain intact; you can still ask for help.');}}void load();const refresh=()=>void load();window.addEventListener('focus',refresh);return()=>{alive=false;controller.abort();window.removeEventListener('focus',refresh);};},[draft.categoryId]);
 function showPhotos(offerId?:string){setPhotoOffer(offerId??null);if(guided)moveGuided(0);else setStep(1);requestAnimationFrame(()=>photosSection.current?.scrollIntoView({block:'start'}));}
 function showOffers(){if(guided)moveGuided(2);else setStep(0);requestAnimationFrame(()=>{
  const field=studio?document.getElementById('studio-offer-price'):null;
  if(field){field.scrollIntoView({block:'center'});field.focus({preventScroll:true});}
  else offersSection.current?.scrollIntoView({block:'start',behavior:'smooth'});
 });}
 async function openPreview(){
  const work=await editor.flush();
  if(work?.versionId)window.location.assign(productPreviewPath(work.id,'draft',offer?.included?offer.id:undefined));
 }
 async function openHelp(){
  if(pendingAction){setMessage('Retry or reconcile the existing action before preparing another request.');return;}
  const work=await editor.flush();if(!work)return;
  setHelp(work);if(!guided)setStep(2);setMessage('');requestAnimationFrame(()=>helpSection.current?.scrollIntoView({block:'start'}));
 }
 function showDetail(field:string){if(field==='publicBase'){document.querySelector('[aria-label="Publication and price requests"]')?.scrollIntoView({block:'start'});return;}if(guided){moveGuided(stepForProductField(field),{field,reason:''});return;}if(field==='coverImage'){showPhotos();return;}if(['offers','price','compareAtPrice','inventoryQuantity','sellerSku'].includes(field)){showOffers();return;}if(['category','categoryId','nameEn','nameNe','descriptionEn','descriptionNe','condition'].includes(field)){setStep(0);requestAnimationFrame(()=>document.getElementById('intake-'+(field==='category'?'categoryId':field))?.focus());return;}if(studio&&['materials','countryOfOrigin','size','careInstructions','preparationDays','returnEligible','packageSize','unitContents','packQuantity'].includes(field)){
   setStep(1);requestAnimationFrame(()=>{const input=document.getElementById('studio-'+field);input?.scrollIntoView({block:'center'});input?.focus({preventScroll:true});});return;
  }if(productDetailGroups.some(group=>group.fields.some(item=>item.key===field))){setStep(1);setRequestedField(old=>({key:field as ProductDetailKey,token:(old?.token??0)+1}));}else void openHelp();}
 async function runAction(payload:Record<string,unknown>,replaceDraft=false){
  if(actionFlight.current)return;actionFlight.current=true;setOperating(true);setPendingAction(payload);const starting=editor.getCurrent();
  try{const response=await fetch('/api/seller/product-intakes/workspace',{method:'POST',headers:{'Content-Type':'application/json',...actorHeaders},body:JSON.stringify(payload)}),result=await response.json() as {error?:string;state?:string};if(!response.ok){if([401,403].includes(response.status))editor.denyAccess();if(response.status===409||response.status===400){setPendingAction(null);if(response.status===409){setHelp(null);await editor.refresh();}}throw new Error(result.error??'The action is not confirmed. Retry this same request.');}
   setPendingAction(null);setHelp(null);const work=await editor.refresh();if(replaceDraft&&work&&editor.getCurrent().generation===starting.generation)editor.applyConfirmed(work);
   setMessage(payload.action==='proposal'?payload.decision==='accept'?'The proposed changes are saved in your private draft. Review and explicitly send it when you are ready.':'Your response is recorded for the team.':result.state==='details_needed'?'Your information was received for assistance. Keep this reference while the team helps with the missing details.':'Your saved candidate was received for review. Further private edits will not change it.');
  }catch(error){setMessage(error instanceof Error?error.message:'The action is not confirmed. Your draft is retained.');}
  finally{actionFlight.current=false;setOperating(false);}
 }
 async function sendSaved(work: ProductWorkspace, intent:'help'|'review', note: string) {
  const current=editor.getCurrent();
  if(current.dirty||current.saved?.versionId!==work.versionId){setMessage('Your draft changed. Save and check the latest version before sending.');return;}
  await runAction({action:'send',requestId:crypto.randomUUID(),expectedRevision:String(work.revision),draftId:work.id,versionId:work.versionId,intent,note,...(work.case?{expectedCaseRevision:String(work.case.revision),expectedCaseId:work.case.caseId}:{}),...(work.case&&(work.case.state==='resolved'||work.case.versionId!==work.versionId)?{replaceVersionId:work.case.versionId}:{})});
 }
 async function sendForReview() {
  if(operating||pendingAction||sent)return;
  const work=await editor.flush();
  if(!work)return;
  if(!work.guidance.reviewReady) {
   const issue=work.guidance.publication.find(problem=>problem.code!=='eligibility');
   if(guided&&issue)moveGuided(stepForProductField(issue.field),issue);
   else setMessage(issue?.reason??'Check the saved product requirements before sending for review.');
   return;
  }
  await sendSaved(work,'review','');
 }
 function moveGuided(next: number, issue?: { field: string; reason: string }) {
  setStep(next);
  setStepError(issue?.reason??null);
  requestAnimationFrame(()=>{
   const controls: Record<string,string>={coverImage:'guided-add-photos',category:'intake-categoryId',categoryId:'intake-categoryId',
    price:'studio-offer-price',offers:'studio-offer-price',compareAtPrice:'studio-offer-compareAt',inventoryQuantity:'studio-offer-stockIntent',
    materials:'studio-materials',countryOfOrigin:'studio-countryOfOrigin',size:'studio-size',careInstructions:'studio-careInstructions',
    preparationDays:'studio-preparationDays',returnEligible:'studio-returnEligible',packageSize:'studio-packageSize',
    packQuantity:'studio-packQuantity',unitContents:'studio-unitContents'};
   const field=issue?.field;
   if(field&&next===3&&!controls[field]&&productDetailGroups.some(group=>group.fields.some(detail=>detail.key===field))){
    setRequestedField(old=>({key:field as ProductDetailKey,token:(old?.token??0)+1}));
    return;
   }
   const control=field?document.getElementById(controls[field]??'intake-'+field):null;
   const target=control??(next===4?document.getElementById('product-check-title'):guidedHeading.current);
   target?.focus({preventScroll:true});
   target?.scrollIntoView({block:'center'});
  });
 }
 function nextGuided() {
  const next=step===4?firstProductStep(stepIssues):step;
  const issue=stepIssues[next]?.[0];
  if(issue){moveGuided(next,issue);return;}
  if(step===4){void sendForReview();return;}
  setFurthest(current=>Math.max(current,step+1));
  moveGuided(step+1);
 }
 async function proposalDecision(decision:'accept'|'decline'){
  const proposal=editor.saved?.proposal,caseRevision=editor.saved?.case?.revision;if(!proposal||pendingAction)return;const work=await editor.flush();if(!work||!work.case||work.proposal?.id!==proposal.id||work.case.revision!==caseRevision){setMessage('The proposal changed. Compare the current proposal before choosing.');return;}
  await runAction({action:'proposal',requestId:crypto.randomUUID(),expectedRevision:String(work.case.revision),caseId:work.case.caseId,proposalId:proposal.id,expectedDraftRevision:String(work.revision),decision},decision==='accept');
 }
 async function upload(job:UploadJob){
  if(uploading.current.has(job.requestId))return;uploading.current.add(job.requestId);setUploads(rows=>rows.map(row=>row.requestId===job.requestId?{...row,state:'uploading',message:'Uploading…'}:row));
  try{const work=job.draftId?editor.getCurrent().saved:await editor.flush();if(!work)throw new Error('Save the private draft first; the selected file is retained for retry.');const draftId=job.draftId??work.id;setUploads(rows=>rows.map(row=>row.requestId===job.requestId?{...row,draftId}:row));
   const body=new FormData();body.set('draftId',draftId);body.set('requestId',job.requestId);body.set('file',job.file);const response=await fetch('/api/seller/product-intakes/media',{method:'POST',body}),result=await response.json() as {id:string;error?:string};if(!response.ok){if([401,403].includes(response.status))editor.denyAccess();throw new Error(result.error??'Upload not confirmed. Retry the same selected file.');}
   editor.change(old=>({...old,mediaIds:coverIntent.current===job.requestId?[result.id,...old.mediaIds.filter(id=>id!==result.id)]:[...old.mediaIds.filter(id=>id!==result.id),result.id]}));setUploads(rows=>rows.map(row=>row.requestId===job.requestId?{...row,state:'ready',message:'Uploaded; saving its draft attachment.'}:row));await editor.refresh();
  }catch(error){setUploads(rows=>rows.map(row=>row.requestId===job.requestId?{...row,state:'failed',message:error instanceof Error?error.message:'Upload not confirmed. The selected file is retained.'}:row));}
  finally{uploading.current.delete(job.requestId);}
 }
 function selectFiles(files:FileList|null,cover:boolean,photosOnly=false){
  if(!files?.length)return;
  if(guided)setStepError(null);
  const selected=Array.from(files).filter(file=>!photosOnly||file.type.startsWith('image/'));
  const pendingPhotos=uploads.filter(job=>job.file.type.startsWith('image/')&&['waiting','uploading'].includes(job.state)).length;
  const remaining=guided?Math.max(0,8-photos-pendingPhotos):selected.length;
  const chosen=photosOnly?selected.slice(0,remaining):selected;
  if(photosOnly&&chosen.length<selected.length)setStepError('You can attach up to 8 product photos.');
  if(!chosen.length)return;
  const jobs=chosen.map((file,index):UploadJob=>({requestId:crypto.randomUUID(),file,cover:cover&&index===0,draftId:editor.saved?.id??null,state:'waiting',message:'Selected; not uploaded yet'}));
  if(cover)coverIntent.current=jobs[0].requestId;setUploads(old=>[...old,...jobs]);for(const job of jobs)void upload(job);
 }
 async function backToStart() {
  const current=editor.getCurrent();
  if(current.dirty||editor.pendingSave) {
   if(!await editor.flush())return;
  }
  window.location.assign('/seller/products/new');
 }
 function movePhoto(id:string, direction:number) {
  coverIntent.current=null;
  editor.change(old=>{
   const images=old.mediaIds.filter(mediaId=>serverUploads.some(file=>file.id===mediaId&&isPhoto(file)));
   const index=images.indexOf(id);
   const other=images[index+direction];
   if(index<0||!other)return old;
   const mediaIds=old.mediaIds.map(mediaId=>mediaId===id?other:mediaId===other?id:mediaId);
   return {...old,mediaIds};
  });
 }
 const proposal=editor.saved?.proposal,proposed=proposal?{...draft,...proposal.patch,answers:{...draft.answers,...proposal.patch.answers}}:null;
 const preparation=detailText(draft.answers,'preparationDays');
 const occasionNames=occasions.filter(item=>Array.isArray(draft.answers.occasionIds)&&draft.answers.occasionIds.includes(item.id)).map(item=>item.nameEn);
 const summaries=[
  photos ? `${photos} ${photos===1?'photo':'photos'} attached` : 'No photos added',
  [detailText(draft.answers,'nameEn'),categories.find(item=>item.id===draft.categoryId)?.nameEn,...occasionNames].filter(Boolean).join(' · ')||'Product name, category and description',
  [sellingPaisa?sellerMoney(sellingPaisa):null,offer?.stockIntent?`${offer.stockIntent} in stock`:null,
    estimate?.state==='estimated'?`you receive ${sellerMoney(estimate.afterFeePaisa)} per sale`:null].filter(Boolean).join(' · ')||'Price and stock still to add',
  [detailText(draft.answers,'materials'),detailText(draft.answers,'size'),detailText(draft.answers,'countryOfOrigin'),
   preparation?`${preparation} ${preparation==='1'?'day':'days'} to send`:null].filter(Boolean).join(' · ')||'Materials, size and delivery',
 ];
 const completeSteps=stepIssues.filter(issues=>!issues.length).length;
 const occasionFields=<section className="space-y-3" aria-label="Gift occasions"><h2 className="font-semibold">Gift occasions</h2><p className="text-sm text-muted-foreground">Choose occasions only when they fit. None is fine.</p><div className="flex flex-wrap gap-x-4 gap-y-1">{occasions.map(item=>{const chosen=Array.isArray(draft.answers.occasionIds)?draft.answers.occasionIds:[];return <label key={item.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={chosen.includes(item.id)} onChange={event=>updateAnswer('occasionIds',event.target.checked?[...chosen,item.id]:chosen.filter(id=>id!==item.id))}/>{item.nameEn}</label>;})}</div></section>;
 const offerEditor=<div ref={offersSection} className="scroll-mt-24"><VariantEditor value={draft.offers} onChange={value=>{if(value.offers.length>draft.offers.offers.length)setSelectedOffer(value.offers.at(-1)!.id);editor.change(old=>({...old,offers:value}));}} onHelp={()=>void openHelp()} onPhoto={showPhotos} studio={studio}/></div>;
 const files = guided ? [...serverUploads].sort((a,b)=>{
   const aOrder=draft.mediaIds.indexOf(a.id),bOrder=draft.mediaIds.indexOf(b.id);
   return (aOrder<0?Number.MAX_SAFE_INTEGER:aOrder)-(bOrder<0?Number.MAX_SAFE_INTEGER:bOrder);
 }) : serverUploads;
 const attachedPhotos=draft.mediaIds.filter(id=>serverUploads.some(file=>file.id===id&&isPhoto(file)));
 const guidedPhotoControl=guided?<>
   <button type="button" id="guided-add-photos" onClick={()=>guidedPhotoInput.current?.click()}
    onDragOver={event=>event.preventDefault()} onDrop={event=>{event.preventDefault();selectFiles(event.dataTransfer.files,photos===0,true);}}
    className="flex aspect-square min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D7C4A9] bg-[#FAF7F1] px-2 py-3 text-center text-sm font-semibold focus-visible:ring-2 focus-visible:ring-[#14213D]">
    <Upload className="size-5 text-[#A8232E]" aria-hidden="true" /> Add photos
    <span className="text-xs font-normal text-[#46536F]">or drop them here</span>
   </button>
   <input ref={guidedPhotoInput} type="file" multiple aria-label="Product photo files" accept="image/jpeg,image/png,image/webp" hidden
    onChange={event=>{selectFiles(event.target.files,photos===0,true);event.target.value='';}} />
 </>:null;
 if(editor.accessDenied)return <ProductReadAccessNotice status={editor.status||message} busy={editor.busy||operating} onCheck={editor.checkAccess}/>;
 return <div className="min-w-0 space-y-5 text-[#14213D]" aria-label="Optional product workspace">
  {studio?<header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4DACA] pb-3">
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {guided?<button type="button" aria-label="Back to new product choices" disabled={operating||!!pendingAction}
        onClick={()=>void backToStart()} className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-[#EBE2D0] disabled:opacity-50"><ArrowLeft className="size-5" aria-hidden="true" /></button>:
        <Link href="/seller/products" aria-label="Back to products" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-[#EBE2D0]"><ArrowLeft className="size-5" aria-hidden="true" /></Link>}
      <h1 className="min-w-0 break-words font-heading text-[1.65rem] font-semibold">{guided?'New product':detailText(draft.answers,'nameEn')||'Add product'}</h1>
      {!guided||inReview?<WhoseTurn status={changeNote||!inReview&&!reviewedVersionInShop?'your-turn':inReview?'with-hastabazaar':'done'} label={changeNote?'Needs changes':inReview?'In review':reviewedVersionInShop?'Published':'Private draft'} />:null}
      {guided&&editor.saved&&!editor.dirty?<span className="text-sm font-medium text-[#236548]">Draft saved</span>:null}
    </div>
    {!guided?<div className="flex min-w-0 flex-wrap items-center gap-2"><span className="text-sm text-[#46536F]">{editor.saved&&!editor.dirty?'Saved as you type':editor.status}</span><button type="button" onClick={()=>void openPreview()} disabled={editor.busy||operating||!!pendingAction} className={buttonClass+' inline-flex items-center gap-2'}><Eye className="size-4" aria-hidden="true" /> Preview</button></div>:null}
  </header>:null}
  {guided?<GuidedStepBar step={step} furthest={furthest} summaries={summaries} onChange={moveGuided}/>:null}
  <div className={studio?'grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(0,1.9fr)_minmax(17.5rem,1fr)]':''}>
  <div className="min-w-0 space-y-5">
  {changeNote?<section className="flex flex-wrap items-center gap-3 rounded-[0.9rem] bg-[#F7DFDE] p-4 text-[#791C23]" aria-label="Requested product change">
    <TriangleAlert className="size-5 shrink-0" aria-hidden="true" />
    <div className="min-w-0 flex-1 basis-48"><h2 className="font-bold text-[#14213D]">Hastabazaar asked for changes</h2><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{changeNote}{changeDate?' · '+sellerDate(changeDate):''}</p></div>
    <button type="button" className="min-h-11 rounded-lg bg-white px-4 py-2 text-sm font-bold" onClick={()=>showDetail(targetField??checks.find(check=>check.issue)?.issue?.field??'descriptionEn')}>Go to the field</button>
  </section>:null}
  {editor.saved?.legacy&&<ProductLegacySource work={editor.saved} mediaIds={draft.mediaIds} onAttach={async id=>{editor.change(old=>({...old,mediaIds:[...old.mediaIds.filter(value=>value!==id),id]}));if(!await editor.flush())throw new Error('The verified copy is retained. Resolve the saved-draft comparison before retrying its attachment.');await editor.refresh();}} onRecorded={async()=>{await editor.refresh();}}/>}
  {!guided||editor.pendingSave&&!editor.busy||editor.comparison?<div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><div><output className="block font-medium">{editor.status}</output>{editor.saved?.savedAt!==null&&editor.saved?.savedAt!==undefined&&<p className="text-xs text-muted-foreground">Last confirmed save <time dateTime={new Date(editor.saved.savedAt).toISOString()}>{new Date(editor.saved.savedAt).toLocaleString('en-NP')}</time></p>}{editor.saved?<p className="break-all text-xs text-muted-foreground">Saved reference {editor.saved.id}</p>:<p className="text-sm text-muted-foreground">Start with whatever information you have.</p>}</div><div className="flex flex-wrap gap-2"><button type="button" className={buttonClass} disabled={editor.busy||operating} onClick={()=>void editor.flush()}>{editor.pendingSave?'Retry same save':'Save progress'}</button>{editor.saved&&<button type="button" className={buttonClass} disabled={editor.busy||operating} onClick={()=>void editor.compare()}>Compare saved version</button>}</div></div>:null}
  {editor.comparison&&<section className="space-y-4 rounded-xl border border-amber-400 bg-amber-50/50 p-5" aria-label="Compare saved draft"><h2 className="font-semibold">Your entries are retained</h2><SnapshotComparison before={editor.comparison} after={draft} categories={categories} uploads={serverUploads}/><div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={editor.busy} onClick={()=>editor.resolveComparison(true)}>Keep my entries on the current version</button><button type="button" className={buttonClass} disabled={editor.busy} onClick={()=>editor.resolveComparison(false)}>Use saved details</button></div></section>}
  {editor.saved?.case&&<section className="space-y-2 rounded-xl border bg-card p-4" aria-label="Assistance progress"><p className="font-medium">{editor.saved.case.state==='waiting_seller'?'The team is waiting for your response':editor.saved.case.state==='details_needed'?'Product assistance is open':editor.saved.case.state.replaceAll('_',' ')}</p><p className="text-sm">First assistance response due {new Date(editor.saved.case.triageDueAt).toLocaleString('en-NP')}{editor.saved.case.triagedAt?' · First response recorded':''}</p>{editor.saved.case.reviewDueAt!==null&&<p className="text-sm">First complete-candidate review due {new Date(editor.saved.case.reviewDueAt).toLocaleString('en-NP')}</p>}{editor.saved.activity[0]?.note&&<p className="whitespace-pre-wrap text-sm">{editor.saved.activity[0].note}</p>}<details className="text-sm"><summary>Activity on this reference</summary><ol className="mt-3 space-y-2">{editor.saved.activity.map(event=><li key={event.id}>{new Date(event.createdAt).toLocaleString('en-NP')} · {event.kind.replaceAll('_',' ')}{event.note?': '+event.note:''}</li>)}</ol></details></section>}
  {proposal&&proposed&&<section aria-label="Proposed product changes" className="space-y-4 rounded-xl border border-primary/40 bg-card p-5"><h2 className="font-heading text-2xl">The team has proposed changes</h2><p className="text-sm">{proposal.sourceNote}</p><SnapshotComparison before={draft} after={proposed} categories={categories} uploads={serverUploads} proposed/><p className="text-sm">Using these changes updates your private draft. You will still review and send the candidate separately.</p><div className="flex flex-wrap gap-3"><button type="button" className={buttonClass} disabled={operating||!!pendingAction} onClick={()=>void proposalDecision('accept')}>Use proposed changes in my draft</button><button type="button" className={buttonClass} disabled={operating||!!pendingAction} onClick={()=>void proposalDecision('decline')}>Decline proposed changes</button></div></section>}
  {editor.saved?.publication&&<ProductPublicationOwner work={editor.saved} blocked={operating||!!pendingAction||editor.pendingSave} onRefresh={editor.refresh} onFlush={editor.flush} comparison={editor.saved.publication.current?<SnapshotComparison before={publicPublicationSnapshot(editor.saved.publication.current)} after={draft} categories={categories} uploads={serverUploads}/>:null}/>}
  <nav aria-label="Product entry steps" hidden={studio} className="grid grid-cols-3 gap-2">{['Basics','Photos & details','Review'].map((label,index)=><button key={label} type="button" aria-current={step===index?'step':undefined} onClick={()=>setStep(index)} className={`min-h-12 rounded-lg border px-2 py-3 text-sm ${step===index?'border-primary bg-primary text-primary-foreground':'bg-card'}`}>{index+1}. {label}</button>)}</nav>
  {!studio?<p className="text-sm text-muted-foreground">Every intake field is optional. Save or ask for help at any stage. Publication and ordering depend on separately confirmed product facts.</p>:null}
  <fieldset disabled={operating} className="flex min-w-0 flex-col gap-5">
  <section hidden={guided?step!==1:!studio&&step!==0} aria-label={guided?"About it":"Product basics"} className={(studio?panelClass+' order-2':'space-y-5')}><h2 ref={guided&&step===1?guidedHeading:undefined} tabIndex={guided?-1:undefined} className="text-lg font-bold">{guided?"About it":"Basics"}</h2><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-sm">{nameDisplay?.label??'Product name'}<input id="intake-nameEn" aria-label={nameDisplay?.label??'Product name'} placeholder={nameDisplay?.placeholder} className={inputClass} value={typeof draft.answers.nameEn==='string'?draft.answers.nameEn:''} maxLength={guided?80:12000} onChange={event=>updateAnswer('nameEn',event.target.value)}/>{guided?<span className="text-xs text-[#46536F]">{(draft.answers.nameEn??'').length} / 80</span>:null}</label><label className="grid gap-2 text-sm">Product name in Nepali<input id="intake-nameNe" className={inputClass} value={detailText(draft.answers,'nameNe')} maxLength={12000} onChange={event=>updateAnswer('nameNe',event.target.value)}/></label>
  <label className="grid gap-2 text-sm">Category<select id="intake-categoryId" aria-label="Category" className={inputClass} value={draft.categoryId??''} onChange={event=>editor.change(old=>({...old,categoryId:event.target.value||null}))}><option value="">Not chosen yet</option>{categories.map(item=><option key={item.id} value={item.id}>{item.nameEn}</option>)}{draft.categoryId&&!categories.some(item=>item.id===draft.categoryId)&&<option value={draft.categoryId}>Saved category needs review</option>}</select></label>
  <label className="grid gap-2 text-sm">Condition<select id="intake-condition" aria-label="Condition" className={inputClass} value={detailText(draft.answers,'condition')} onChange={event=>updateAnswer('condition',event.target.value)}><option value="">Not provided</option><option value="new">Unused new goods</option>{detailText(draft.answers,'condition')&&!['new'].includes(detailText(draft.answers,'condition'))&&<option value={detailText(draft.answers,'condition')}>Saved condition needs review</option>}</select></label></div>
  {guided?<div className="rounded-xl bg-[#F4EFE6] p-3.5 text-sm text-[#46536F]"><p className="font-semibold text-[#14213D]">Customers want to know</p><ul className="mt-1 list-inside list-disc"><li>What is it?</li><li>How is it made?</li><li>What will they receive?</li></ul></div>:null}
  <label className="grid gap-2 text-sm">{descriptionDisplay?.label??'Description'}<textarea id="intake-descriptionEn" aria-label={descriptionDisplay?.label??'Description'} placeholder={descriptionDisplay?.placeholder} className={inputClass} value={typeof draft.answers.descriptionEn==='string'?draft.answers.descriptionEn:''} rows={4} maxLength={12000} onChange={event=>updateAnswer('descriptionEn',event.target.value)}/></label><label className="grid gap-2 text-sm">Description in Nepali<textarea id="intake-descriptionNe" className={inputClass} value={detailText(draft.answers,'descriptionNe')} rows={3} maxLength={12000} onChange={event=>updateAnswer('descriptionNe',event.target.value)}/></label>
  {guided?occasionFields:null}
  </section>
  <section className={studio?panelClass+' order-3':'space-y-4'} hidden={guided?step!==2:!studio&&step!==0} aria-label="Price and stock">
  {studio?<h2 ref={guided&&step===2?guidedHeading:undefined} tabIndex={guided?-1:undefined} className="text-lg font-bold">Price &amp; stock</h2>:null}
  {studio&&(offer||guided)?<div className="grid min-w-0 gap-3 sm:grid-cols-3">
    {([['price','Selling price (NPR)'],['compareAt','Price before discount (optional)']] as const).map(([key,label])=><label key={key} className="grid min-w-0 content-start gap-2 text-sm font-semibold">{label}
      <input id={'studio-offer-'+key} inputMode="decimal" maxLength={200} value={offer?.[key]??''} className={inputClass+' font-normal'} onChange={event=>updateOffer(key,event.target.value)} />
    </label>)}
    {guided?<div className="min-w-0 space-y-2 text-sm font-semibold">
      <label htmlFor="studio-offer-stockIntent">Stock</label>
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-1">
        <button type="button" aria-label="Decrease stock" className="grid size-11 place-items-center rounded-lg border border-[#D7C4A9]" disabled={!offer?.stockIntent||!/^\d+$/.test(offer.stockIntent)||!Number.isSafeInteger(Number(offer.stockIntent))||Number(offer.stockIntent)<=0} onClick={()=>updateOffer('stockIntent',String(Number(offer?.stockIntent??0)-1))}><Minus className="size-4" aria-hidden="true" /></button>
        <input id="studio-offer-stockIntent" inputMode="numeric" maxLength={16} value={offer?.stockIntent??''} className={inputClass+' px-1 text-center font-normal'} onChange={event=>updateOffer('stockIntent',event.target.value)} />
        <button type="button" aria-label="Increase stock" className="grid size-11 place-items-center rounded-lg border border-[#D7C4A9]" disabled={!!offer?.stockIntent&&(!/^\d+$/.test(offer.stockIntent)||!Number.isSafeInteger(Number(offer.stockIntent)+1))} onClick={()=>updateOffer('stockIntent',String(Number(offer?.stockIntent??0)+1))}><Plus className="size-4" aria-hidden="true" /></button>
      </div>
    </div>:<label className="grid min-w-0 content-start gap-2 text-sm font-semibold">Draft stock
      <input id="studio-offer-stockIntent" inputMode="numeric" value={offer?.stockIntent??''} className={inputClass+' font-normal'} onChange={event=>updateOffer('stockIntent',event.target.value)} />
    </label>}
  </div>:null}
  {guided?<details className="rounded-xl border px-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Options and pack sizes</summary>{offerEditor}</details>:offerEditor}
  {offer&&<div className="space-y-3">{!guided||draft.offers.offers.length>1?<label className="grid gap-2 text-sm">Offer for preview and price helper<select aria-label="Offer for preview and price helper" className={inputClass} value={offer.id} onChange={event=>setSelectedOffer(event.target.value)}>{draft.offers.offers.map((row,index)=><option key={row.id} value={row.id}>Offer {index+1}{row.sku?' · '+row.sku:''}{row.included?'':' · Excluded'}</option>)}</select></label>:null}{editor.saved?<details className="rounded-lg border px-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Optional private cost and profit helper</summary><PriceProfitPreview actorId={editor.saved.actorId} subject={{kind:'intake',id:editor.saved.id,offerId:offer.id}} sellingPrice={offer.price} onUsePrice={paisa=>editor.change(old=>({...old,offers:{...old.offers,offers:old.offers.offers.map(row=>row.id===offer.id?{...row,price:String(paisa/100)}:row)}}))}/></details>:<p className="text-sm text-muted-foreground">Save progress to open the optional private cost and target-profit helper for this offer.</p>}</div>}
  {studio&&estimate?.state==='estimated'&&pricing&&'basisPoints' in pricing?<div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl bg-[#F7F3EC] p-3.5 text-sm">
    <span>Customer pays <strong>{sellerMoney(sellingPaisa!)}</strong></span>
    <span>{pricing.route==='registered'?'Commission':'Platform retention'} {pricing.basisPoints/100}% <strong>− {sellerMoney(estimate.feePaisa)}</strong></span>
    <span>You receive <strong className="text-[#236548]">{sellerMoney(estimate.afterFeePaisa)}</strong> per sale</span>
  </div>:null}
  </section>
  <section hidden={guided?step!==0:!studio&&step!==1} ref={photosSection} className={panelClass+' order-1 scroll-mt-24'} aria-label="Product photos"><h2 ref={guided&&step===0?guidedHeading:undefined} tabIndex={guided?-1:undefined} className="text-lg font-bold">Photos</h2><p className="text-sm text-[#665B4C]">{guided?'Add 3 to 8 photos. The first one is the cover. You can take them with your phone.':'The first photo is the cover. Daylight and a plain background work best. JPG, PNG or WebP, up to 5 MB each.'}</p>
  {studio&&guided?null:studio?<div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3">
    <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D7C4A9] bg-[#FAF7F1] px-2 py-3 text-center text-sm font-semibold focus-within:ring-2 focus-within:ring-[#14213D]">
      <Upload className="size-5 text-[#A8232E]" aria-hidden="true" /> Add photos
      <input type="file" multiple aria-label="Add photos" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={event=>{selectFiles(event.target.files,!draft.mediaIds.some(id=>serverUploads.some(file=>file.id===id&&file.mimeType.startsWith('image/'))));event.target.value='';}} />
    </label>
    <p className="grid min-h-24 place-items-center rounded-xl border border-[#EEE5D5] bg-[#FAF7F1] px-2 py-3 text-center text-xs leading-relaxed text-[#665B4C]">Show the whole product and a close-up of the details.</p>
    <p className="hidden min-h-24 place-items-center rounded-xl border border-[#EEE5D5] bg-[#FAF7F1] px-2 py-3 text-center text-xs leading-relaxed text-[#665B4C] sm:grid">Photograph it next to an everyday item to show its size.</p>
    <details className="col-span-full"><summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold">Add a video</summary>
      <label className="grid gap-2 text-sm">Product video<input type="file" accept="video/mp4" className={inputClass} onChange={event=>{selectFiles(event.target.files,false);event.target.value='';}}/><span className="text-muted-foreground">One MP4, up to 20 MB and 60 seconds. Keep attached product media within 47 MB.</span></label>
    </details>
  </div>:<>
  <label className="grid gap-2 text-sm">Cover photo<input type="file" accept="image/jpeg,image/png,image/webp" className={inputClass} onChange={event=>{selectFiles(event.target.files,true);event.target.value='';}}/></label><label className="grid gap-2 text-sm">Additional product photos<input type="file" multiple accept="image/jpeg,image/png,image/webp" className={inputClass} onChange={event=>{selectFiles(event.target.files,false);event.target.value='';}}/></label><label className="grid gap-2 text-sm">Product video<input type="file" accept="video/mp4" className={inputClass} onChange={event=>{selectFiles(event.target.files,false);event.target.value='';}}/><span className="text-muted-foreground">One MP4, up to 20 MB and 60 seconds. Keep attached product media within 47 MB.</span></label>
  </>}
  {(uploads.some(job=>job.state==='waiting'||job.state==='uploading')||serverUploads.some(file=>file.state==='uploading'))&&<output className="block text-sm">Some uploads are not confirmed yet. Saved draft entries remain available; an upload must finish before its attachment can be saved.</output>}
  {uploads.filter(job=>!guided||job.state!=='ready').map(job=><div key={job.requestId} className="rounded-lg border p-3 text-sm"><p className="break-all font-medium">{job.file.name}</p><p>{job.state==='ready'?'Upload completed. Its attachment is saved when the workspace status says Saved.':job.message}</p>{job.state==='failed'&&<div className="mt-2 space-y-2"><button type="button" className="min-h-11 underline" onClick={()=>void upload(job)}>Retry this file</button><label className="grid gap-2">Choose original file again<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={event=>{const file=event.target.files?.[0];if(!file)return;const retry={...job,file};setUploads(rows=>rows.map(row=>row.requestId===job.requestId?retry:row));void upload(retry);event.target.value='';}}/></label></div>}</div>)}
  <div className={guided?'grid grid-cols-2 gap-2 xl:grid-cols-4':'grid gap-3 sm:grid-cols-2'}>{files.map(file=>{const attached=draft.mediaIds.includes(file.id),cover=attachedPhotos[0]===file.id,index=attachedPhotos.indexOf(file.id);return <div key={file.id} className={guided?'relative min-w-0 space-y-1.5 rounded-lg border border-[#EEE5D5] p-1.5 text-sm':'min-w-0 space-y-2 rounded-lg border p-3 text-sm'}>{file.state==='uploading'&&!uploads.some(job=>job.requestId===file.requestId)&&<label className="grid gap-2">Retry original file: {file.originalName}<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={event=>{const selected=event.target.files?.[0];if(!selected||!editor.saved)return;const job:UploadJob={requestId:file.requestId,file:selected,cover:false,draftId:editor.saved.id,state:'waiting',message:'Original file selected for recovery.'};setUploads(rows=>[...rows,job]);void upload(job);event.target.value='';}}/></label>}{file.state==='ready'&&file.mimeType.startsWith('image/')?<Image data-media-mode="contain" unoptimized width={640} height={480} src={'/api/seller/product-intakes/media/'+encodeURIComponent(file.id)} alt={file.originalName} className={guided?'aspect-square w-full rounded-lg border border-[#EEE5D5] object-contain':studio?'h-24 w-full rounded object-contain':'h-36 w-full rounded object-contain'}/>:null}{!guided||!attached?<><p className="break-all">{file.originalName}</p><p>{file.state==='ready'?attached?cover?'Cover photo · attached':'Attached to draft':'Uploaded · not attached to this version':'Upload not yet confirmed; retry the original file'}</p></>:null}{guided&&cover?<span className="absolute left-2 top-2 rounded-full bg-[#14213D] px-2 py-0.5 text-xs font-semibold text-white">Cover</span>:null}{file.state==='ready'&&<details open={!guided?true:undefined} className="min-w-0"><summary className={guided?'min-h-11 cursor-pointer rounded-md px-1 py-2.5 text-sm font-semibold text-[#46536F]':'hidden'}>Photo options</summary><div className="flex flex-wrap gap-x-3 gap-y-1">{attached?<button type="button" className="min-h-11 underline" onClick={()=>editor.change(old=>({...old,mediaIds:old.mediaIds.filter(id=>id!==file.id),offers:{...old.offers,offers:old.offers.offers.map(row=>row.mediaId===file.id?{...row,mediaId:null}:row)}}))}>Remove from this draft</button>:<button type="button" className="min-h-11 underline" onClick={()=>editor.change(old=>({...old,mediaIds:[...old.mediaIds,file.id]}))}>Add to this draft</button>}{file.mimeType.startsWith('image/')&&<button type="button" className="min-h-11 underline" onClick={()=>{coverIntent.current=null;editor.change(old=>({...old,mediaIds:[file.id,...old.mediaIds.filter(id=>id!==file.id)]}));}}>Use as cover</button>}{guided&&attached&&index>=0?<><button type="button" className={buttonClass+' px-2'} aria-label={'Move '+file.originalName+' earlier'} disabled={index===0} onClick={()=>movePhoto(file.id,-1)}>Earlier</button><button type="button" className={buttonClass+' px-2'} aria-label={'Move '+file.originalName+' later'} disabled={index===attachedPhotos.length-1} onClick={()=>movePhoto(file.id,1)}>Later</button></>:null}{photoOffer&&file.mimeType.startsWith('image/')&&<button type="button" className="min-h-11 underline" onClick={()=>{editor.change(old=>({...old,mediaIds:old.mediaIds.includes(file.id)?old.mediaIds:[...old.mediaIds,file.id],offers:{...old.offers,offers:old.offers.offers.map(row=>row.id===photoOffer?{...row,mediaId:file.id}:row)}}));setPhotoOffer(null);showOffers();}}>Use for selected offer</button>}</div></details>}</div>;})}{guidedPhotoControl}</div>
  {guided?<><div className="flex gap-2 rounded-xl bg-[#E2E8F4] p-3.5 text-sm text-[#284779]">
    <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><p><strong>Photos that sell:</strong> use daylight and a plain background. Include a close-up and a photo that shows the size. JPG, PNG or WebP up to 5 MB each.</p>
  </div><details className="rounded-xl border px-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Add a video</summary>
    <label className="grid gap-2 pb-3 text-sm">Product video<input type="file" accept="video/mp4" className={inputClass} onChange={event=>{selectFiles(event.target.files,false);event.target.value='';}}/><span className="text-muted-foreground">One MP4, up to 20 MB and 60 seconds. Keep attached product media within 47 MB.</span></label>
  </details></>:null}
  </section>
  <section hidden={guided?step!==3:!studio&&step!==1} className={studio?panelClass+' order-4':'space-y-5'} aria-label="Product details">
  {guided?<h2 ref={step===3?guidedHeading:undefined} tabIndex={-1} className="text-lg font-bold">Details &amp; delivery</h2>:occasionFields}
  {studio?<div className="space-y-3 border-t border-[#E4DACA] pt-4">
    <div><h2 className="text-lg font-bold">How it’s made</h2><p className="text-sm text-[#665B4C]">Shown on the product page under the details.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">{([['materials','Materials'],['countryOfOrigin',guided?'Made in':'Country of origin'],['size','Size'],['careInstructions','Care']] as const).map(([key,label])=><label key={key} className="grid min-w-0 gap-2 text-sm font-semibold">{label}<input id={'studio-'+key} value={detailText(draft.answers,key)} aria-invalid={!!(changeNote&&targetField===key&&!detailText(draft.answers,key))} className={inputClass+' font-normal aria-invalid:border-[#A8232E]'} onChange={event=>updateAnswer(key,event.target.value)} /></label>)}</div>
  </div>:null}
  {guided&&materialSuggestions.length?<div className="flex flex-wrap gap-2" aria-label="Material suggestions">{materialSuggestions.map(material=>{
   const values=detailText(draft.answers,'materials').split(',').map(value=>value.trim()).filter(Boolean),selected=values.includes(material);
   return <button key={material} type="button" aria-pressed={selected} className={buttonClass+' rounded-full aria-pressed:border-[#14213D] aria-pressed:bg-[#14213D] aria-pressed:text-white'}
     onClick={()=>updateAnswer('materials',(selected?values.filter(value=>value!==material):[...values,material]).join(', '))}>{material}</button>;
  })}</div>:null}
  {guided?<div className="grid gap-3 sm:grid-cols-2">
    <label className="grid gap-2 text-sm font-semibold">What comes in one purchase?
      <input id="studio-unitContents" className={inputClass+' font-normal'} value={typeof draft.answers.unitContents==='string'?draft.answers.unitContents:''}
        onChange={event=>updateAnswer('unitContents',event.target.value)} />
    </label>
    <label className="grid gap-2 text-sm font-semibold">Pieces in one sales unit
      <input id="studio-packQuantity" inputMode="numeric" className={inputClass+' font-normal'} value={detailText(draft.answers,'packQuantity')}
        onChange={event=>updateAnswer('packQuantity',event.target.value)} />
    </label>
  </div>:null}
  {categoryMessage&&<output className="block text-sm">{categoryMessage}</output>}<CategoryDetailGroups requestedField={requestedField} model={categoryModel} answers={draft.answers} onChange={updateAnswer} onHelp={()=>void openHelp()} onPhotos={()=>showPhotos()} onDiscovery={()=>setStep(1)} onOffers={showOffers}/>
  <ProductIntakeQuestions published={publishedForm} context={draft.formContext} onChange={formContext=>editor.change(old=>({...old,formContext}))}/>
  {!guided&&materialSuggestions.length>0&&<details className="rounded-xl border p-4"><summary>Material suggestions</summary><p className="mt-2 text-sm text-muted-foreground">Use a suggestion only if it describes the actual product.</p><div className="mt-3 flex flex-wrap gap-2">{materialSuggestions.map(material=><button key={material} type="button" className={buttonClass} onClick={()=>{const current=detailText(draft.answers,'materials');updateAnswer('materials',current?current+', '+material:material);}}>{material}</button>)}</div></details>}
  <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer font-medium">Private product-review references</summary><p className="my-3 text-sm text-muted-foreground">For permitted product reviewers. Keep bank, identity documents and private cost calculations in their separate account controls.</p>{([['originEvidenceReference','Product origin evidence reference'],['licenceReference','Applicable product licence reference'],['note','Product-review note']] as const).map(([key,label])=><label key={key} className="my-3 grid gap-2 text-sm">{label}<textarea value={draft.privateReview[key]??''} maxLength={4000} rows={2} className={inputClass} onChange={event=>editor.change(old=>({...old,privateReview:{...old.privateReview,[key]:event.target.value}}))}/></label>)}</details>
  </section>
  {studio?<section hidden={guided&&step!==3} className={panelClass+' order-5'} aria-labelledby="delivery-returns"><h2 id="delivery-returns" className="text-lg font-bold">Delivery &amp; returns</h2>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold">Ready to send in (days)<input id="studio-preparationDays" inputMode="numeric" value={detailText(draft.answers,'preparationDays')} onChange={event=>updateAnswer('preparationDays',event.target.value)} className={inputClass+' font-normal'} /></label>
      {packedWeightAvailable?<PackedProductWeightInput grams={draft.packedWeightGrams} onChange={packedWeightGrams=>{if(packedWeightGrams!==(draft.packedWeightGrams??null))editor.change(old=>({...old,packedWeightGrams}));}}/>:null}
      <label className="grid gap-2 text-sm font-semibold">Package size <span className="text-xs font-normal text-[#46536F]">Length × width × height with units</span>
        <input id="studio-packageSize" className={inputClass+' font-normal'} value={typeof draft.answers.packageSize==='string'?draft.answers.packageSize:''} onChange={event=>updateAnswer('packageSize',event.target.value)} />
      </label>
      <label className="grid gap-2 text-sm font-semibold">Return eligibility<select id="studio-returnEligible" value={detailText(draft.answers,'returnEligible')} onChange={event=>updateAnswer('returnEligible',event.target.value)} className={inputClass+' font-normal'}><option value="">Not provided</option><option value="yes">Eligible for returns</option><option value="no">Not eligible for change-of-mind returns</option></select></label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#E4DACA] px-3 py-2">
      <p className="min-w-0 flex-1 basis-44 text-sm">{returnPolicyEnabled?<>For eligible products, customers can request a change-of-mind return within <strong>{returnWindowDays} days of delivery</strong>.</>:'See the current return policy for eligible requests.'}</p>
      <Link className="section-link inline-flex min-h-11 items-center" href="/returns">Return policy</Link>
    </div>
  </section>:null}
  </fieldset>
  {guided&&step===4?<GuidedCheck summaries={summaries} incomplete={stepIssues.map(issues=>issues.length>0)} onChange={moveGuided}/>:null}
  {guided?<GuidedBottomBar step={step} busy={operating||!!pendingAction||!!editor.comparison} sent={step===4&&sent} saved={!!editor.saved&&!editor.dirty&&!editor.pendingSave}
    status={editor.status} error={stepError} onBack={()=>moveGuided(step-1)} onNext={nextGuided}/>:null}
  {guided?<p className="text-center text-sm text-[#46536F]">Stuck? <button type="button" className="min-h-11 text-left font-semibold text-[#A8232E] underline underline-offset-4"
    disabled={editor.busy||operating||!!pendingAction} onClick={()=>void openHelp()}>Ask Hastabazaar to help finish it</button></p>:null}
  {!studio?<div className="flex flex-wrap items-center justify-between gap-3 border-t pt-5"><button type="button" className={buttonClass} disabled={editor.busy||operating||!!pendingAction} onClick={()=>void openHelp()}>Get help with this product</button><div className="flex gap-2">{step>0&&<button type="button" className={buttonClass} onClick={()=>setStep(step-1)}>Back</button>}{step<2&&<button type="button" className={buttonClass} onClick={()=>setStep(step+1)}>Continue</button>}</div></div>:null}
  </div>
  {guided?<aside className="hidden min-w-0 space-y-4 xl:block" aria-label="Product preview and progress">
    <section className={panelClass} aria-labelledby="guided-preview-title"><h2 id="guided-preview-title" className="font-bold">How customers will see it</h2>
      <ProductIntakePreview compact snapshot={draft} offer={offer} uploads={serverUploads} tradingName={tradingName} />
    </section><GuidedReadiness complete={completeSteps}/>
  </aside>:<aside className="min-w-0 space-y-4" hidden={!studio&&step!==2} aria-label="Review product information">
    <ProductReviewReadiness checks={checks} busy={editor.busy||operating||editor.pendingSave||!!pendingAction||!!editor.comparison} onFocus={showDetail} onReview={()=>void sendForReview()} />
    <section className={panelClass} aria-labelledby="after-you-send">
      <h2 id="after-you-send" className="font-bold">What happens after you send</h2>
      <StepLine label="Product review progress" className="grid-cols-2 xl:!grid-cols-1" steps={[
        {id:'send',label:'You send it',state:inReview||reviewedVersionInShop?'complete':'current',detail:'When all checks are done'},
        {id:'review',label:'Hastabazaar checks it',state:reviewedVersionInShop?'complete':inReview?'current':'upcoming',detail:'Photos, details and price'},
        {id:'live',label:'It goes live',state:reviewedVersionInShop?'complete':'upcoming',detail:'Or we tell you what to change'},
      ]} />
      <button id="product-help" type="button" className="min-h-11 scroll-mt-24 text-left text-sm font-semibold text-[#A8232E] underline underline-offset-4 disabled:opacity-50" disabled={editor.busy||operating||!!pendingAction} onClick={()=>void openHelp()}>Stuck? Ask Hastabazaar to help fill this in</button>
    </section>
    <section className={panelClass} aria-labelledby="customer-preview-heading">
      <h2 id="customer-preview-heading" className="font-bold">How customers will see it</h2>
      <ProductIntakePreview snapshot={draft} offer={offer} uploads={serverUploads} tradingName={tradingName} compact={studio} showProposedPricing={!studio} />
    </section>
    {editor.saved?.guidance.ordering.length?<details className={panelClass}><summary className="min-h-11 cursor-pointer">Facts to establish before ordering</summary><ul className="space-y-2 text-sm">{editor.saved.guidance.ordering.map((issue,index)=><li key={issue.field+index}>{issue.reason} <button type="button" onClick={()=>showDetail(issue.field)} className="min-h-11 underline">Open the relevant detail</button></li>)}</ul></details>:null}
  </aside>}
  </div>
  {studio&&!guided?<Link href="/seller/products/intakes" className="section-link inline-flex min-h-11 items-center">Saved product workspaces</Link>:null}
  {message&&<div className="rounded-xl border bg-card p-4 text-sm"><output className="block">{message}</output>{pendingAction&&<button type="button" disabled={operating} className="mt-3 min-h-11 underline" onClick={()=>void runAction(pendingAction,pendingAction.action==='proposal'&&pendingAction.decision==='accept')}>Retry same action</button>}</div>}
  <div ref={helpSection}>{help&&<><ProductHelpRequest workspace={help} selectedOfferId={offer?.id} busy={operating} onSend={note=>void sendSaved(help,'help',note)} onCancel={()=>setHelp(null)}/>{(editor.dirty||editor.saved?.versionId!==help.versionId)&&<button type="button" className={buttonClass} disabled={operating} onClick={()=>void openHelp()}>Refresh assistance details</button>}</>}</div>
 {editor.saved&&<ProductIntakeHistory draftId={editor.saved.id} uploads={serverUploads}/>}</div>;
}
