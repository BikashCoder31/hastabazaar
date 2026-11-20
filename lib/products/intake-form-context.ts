import {productIntakeCustomFields} from './intake-form-fields';
import type {ConfiguredField} from '../forms/types';
import {FORM_REGISTRY} from '../forms/registry';
import {decodePublishedForm} from '../forms/runtime';
import {validateAnswersForDefinition} from '../forms/validation';
import {CategoryContractError} from './category-contracts';
import {offerGuard} from './offer-support';

const formId='seller.product-submission';
export type IntakeFormContextInput={version:number;publishedAt:number;answers:{fieldId:string;value:unknown}[]};
export interface IntakeFormContext extends IntakeFormContextInput {
 fields:ConfiguredField[];
 issues:{fieldId:string;message:string}[];
}
/** Stored presentation metadata is server-owned; browsers send only a source version and raw values. */
export function intakeFormContextInput(context:IntakeFormContext|null|undefined):IntakeFormContextInput|null {
 return context?{version:context.version,publishedAt:context.publishedAt,answers:context.answers}:null;
}
export async function retainProductFormContext(db:D1Database,raw:unknown){
 if(raw===undefined||raw===null)return {context:null,statements:[] as D1PreparedStatement[]};
 if(typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(key=>!['version','publishedAt','answers'].includes(key)))throw new CategoryContractError('Use the shown question version and ordinary answer values only.',400);
 const input=raw as IntakeFormContextInput;
 if(!Number.isSafeInteger(input.version)||input.version<1||!Number.isSafeInteger(input.publishedAt)||input.publishedAt<0||!Array.isArray(input.answers)||input.answers.length>64||new TextEncoder().encode(JSON.stringify(input)).length>65536)throw new CategoryContractError('Keep a bounded copy of the shown additional questions and answers.',400);
 const row=await db.prepare("SELECT version,config_json,published_at FROM form_config_versions WHERE form_id=? AND version=? AND status='published'").bind(formId,input.version).first<{version:number;config_json:string;published_at:number}>();
 // The historical core contract has no extra questions. Never relabel an old core copy as a later publication.
 const config=input.publishedAt===0&&input.version===1?decodePublishedForm(formId,null):row&&row.published_at===input.publishedAt?decodePublishedForm(formId,row):null;
 if(!config)throw new CategoryContractError('The shown additional question version could not be verified. Keep your entries and compare the published questions.',409);
 const fields=productIntakeCustomFields(config),byId=new Map(fields.map(field=>[field.id,field])),seen=new Set<string>(),answers:IntakeFormContext['answers']=[],issues:IntakeFormContext['issues']=[];
 for(const entry of input.answers){
  if(!entry||typeof entry!=='object'||Array.isArray(entry)||Object.keys(entry).some(key=>!['fieldId','value'].includes(key))||typeof entry.fieldId!=='string'||seen.has(entry.fieldId)||!byId.has(entry.fieldId))throw new CategoryContractError('An additional answer is unknown, duplicated or belongs to a separate protected control.',400);
  const value=entry.value;
  if(value!==null&&typeof value!=='string'&&typeof value!=='boolean'&&!(typeof value==='number'&&Number.isFinite(value))&&!(Array.isArray(value)&&value.length<=64&&value.every(item=>typeof item==='string'&&item.length<=12000))||typeof value==='string'&&value.length>12000)throw new CategoryContractError('Keep ordinary bounded text, numbers or choices in additional answers.',400);
  seen.add(entry.fieldId);answers.push({fieldId:entry.fieldId,value:structuredClone(value)});
  const field=byId.get(entry.fieldId)!;
  // Preserve the raw draft string; parsing is only advisory and never changes the entered value.
  const checked=field.type==='number'&&typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):value;
  try{validateAnswersForDefinition(FORM_REGISTRY[formId],{...config,fields:[field]},[{fieldId:entry.fieldId,value:checked}]);}
  catch{issues.push({fieldId:entry.fieldId,message:'This additional answer needs clarification before it can be confirmed.'});}
 }
 const context:IntakeFormContext={version:config.version,publishedAt:config.publishedAt,fields,answers,issues};
 const statements=config.publishedAt===0?[]:offerGuard(db,"EXISTS(SELECT 1 FROM form_config_versions WHERE form_id=? AND version=? AND status='published' AND config_json=? AND published_at=?)",[formId,config.version,row!.config_json,config.publishedAt]);
 return {context,statements};
}
