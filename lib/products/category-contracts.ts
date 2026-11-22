import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {commandReceipt,type CommandContext} from '../workflows/contracts';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
import {productDetailGroups,productDetailKeys,evaluateCategoryReadiness,type CategoryContract,type CategoryDetailModel,type CategoryRule,type ProductDetailAnswers} from './category-fields';
export {evaluateCategoryReadiness} from './category-fields';
export class CategoryContractError extends Error {constructor(message:string,readonly status=409){super(message);}}
class CategoryAuthorityError extends CategoryContractError {constructor(message:string){super(message,403);}}
function text(value:unknown,min:number,max:number){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[<>\p{Cc}]/u.test(value))throw new CategoryContractError('Use a bounded, plain category label or explanation.',400);return value.trim();}
function record(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw new CategoryContractError('A structured category contract is required.',400);return value as Record<string,unknown>;}
function keys(value:Record<string,unknown>,allowed:readonly string[]){if(Object.keys(value).some(key=>!allowed.includes(key)))throw new CategoryContractError('This category contract contains an unsupported field.',400);}
function parseRules(value:unknown):CategoryRule[]{if(!Array.isArray(value)||value.length>40)throw new CategoryContractError('Choose at most 40 supported category rules.',400);return value.map(raw=>{const row=record(raw);keys(row,['field','reason','when']);if(typeof row.field!=='string'||!productDetailKeys.has(row.field))throw new CategoryContractError('Only supported public product fields may be category requirements.',400);const result:CategoryRule={field:row.field as CategoryRule['field'],reason:text(row.reason,10,300)};if(row.when!==undefined){const when=record(row.when);keys(when,['field','equals']);if(typeof when.field!=='string'||!productDetailKeys.has(when.field))throw new CategoryContractError('Choose a supported conditional product fact.',400);result.when={field:when.field as CategoryRule['field'],equals:text(when.equals,1,100)};}return result;});}
export function parseCategoryContract(raw:unknown):CategoryContract{
 const value=record(raw);keys(value,['recommendedGroups','publicationRules','orderingRules','eligibilityRequirements','labels']);
 if(!Array.isArray(value.recommendedGroups)||value.recommendedGroups.some(id=>!productDetailGroups.some(group=>group.id===id))||value.recommendedGroups.length>productDetailGroups.length)throw new CategoryContractError('Choose supported recommended detail groups.',400);
 if(!Array.isArray(value.eligibilityRequirements)||value.eligibilityRequirements.length>20||value.eligibilityRequirements.some(item=>typeof item!=='string'||!/^[a-z][a-z0-9_-]{1,79}$/.test(item)))throw new CategoryContractError('Use reviewed stable category eligibility references.',400);
 const labels=record(value.labels);for(const [key,label]of Object.entries(labels)){if(!productDetailKeys.has(key))throw new CategoryContractError('Private or unsupported fields cannot be exposed by a category label.',400);labels[key]=text(label,2,120);}
 return {recommendedGroups:[...new Set(value.recommendedGroups)] as CategoryContract['recommendedGroups'],publicationRules:parseRules(value.publicationRules),orderingRules:parseRules(value.orderingRules),eligibilityRequirements:[...new Set(value.eligibilityRequirements)],labels};
}
function guard(db:D1Database,predicate:string,values:unknown[]){const id=crypto.randomUUID();return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${predicate} THEN 1 ELSE 0 END`).bind(id,...values),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];}
export async function getCategoryDetailGroups(db:D1Database,categoryId:string|null):Promise<CategoryDetailModel>{
 const row=categoryId?await db.prepare('SELECT c.id,c.parent_id AS parentId,c.name_en AS name,c.is_active AS active,s.version_id AS versionId,s.revision,v.contract_json AS contract FROM categories c LEFT JOIN category_template_states s ON s.category_id=c.id LEFT JOIN category_template_versions v ON v.id=s.version_id AND v.category_id=c.id WHERE c.id=?').bind(categoryId).first<{id:string;parentId:string|null;name:string;active:number;versionId:string|null;revision:number|null;contract:string|null}>():null;
 if(row?.versionId&&!row.contract)throw new CategoryContractError('The category policy history is unavailable.',503);
 const contract=row?.contract?parseCategoryContract(JSON.parse(row.contract)):null;
 return {categoryId,name:row?.name??null,parentId:row?.parentId??null,status:!row?'unknown':!row.active?'disabled':!contract?'unmapped':'available',versionId:row?.versionId??null,revision:row?.revision??null,contract,
  groups:productDetailGroups.map(group=>({...group,recommended:contract?.recommendedGroups.includes(group.id)??false,fields:group.fields.map(field=>({...field,label:contract?.labels[field.key]??field.label}))}))};
}
export async function publishCategoryContract(db:D1Database,context:CommandContext,input:{categoryId:string;contract:unknown;reason:string}){
 const authority=await staffMutationGuard(db,context.actorId,'catalog.manage',CategoryAuthorityError,'super_admin'),contract=parseCategoryContract(input.contract),reason=text(input.reason,10,1000);
 const payload={...input,contract,reason},source={action:'category.contract.published',subjectType:'category',subjectId:input.categoryId},receipt=await commandReceipt(db,context,source,payload);
 if(receipt.replayed)return receipt.result as {versionId:string;revision:number};
 const category=await db.prepare('SELECT id,updated_at AS updatedAt FROM categories WHERE id=?').bind(input.categoryId).first<{id:string;updatedAt:number}>();if(!category)throw new CategoryContractError('Create the actual category before reviewing its contract.');
 const current=await db.prepare('SELECT revision FROM category_template_states WHERE category_id=?').bind(input.categoryId).first<{revision:number}>();if(context.expectedRevision!==(current?String(current.revision):null))throw new CategoryContractError('The category contract changed. Compare the current version before publishing.');
 const versionId=crypto.randomUUID(),revision=(current?.revision??-1)+1;
 try{await db.batch([...authority.statements,...guard(db,'EXISTS(SELECT 1 FROM categories WHERE id=? AND updated_at=?)',[category.id,category.updatedAt]),...guard(db,current?'EXISTS(SELECT 1 FROM category_template_states WHERE category_id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM category_template_states WHERE category_id=?)',current?[category.id,current.revision]:[category.id]),
  db.prepare('INSERT INTO category_template_versions(id,category_id,version,contract_json,created_by,created_at,reason) VALUES(?,?,?,?,?,?,?)').bind(versionId,category.id,revision+1,JSON.stringify(contract),context.actorId,context.now,reason),
  current?db.prepare('UPDATE category_template_states SET version_id=?,revision=?,last_event_id=?,updated_by=?,updated_at=? WHERE category_id=?').bind(versionId,revision,versionId,context.actorId,context.now,category.id):db.prepare('INSERT INTO category_template_states(category_id,version_id,revision,last_event_id,updated_by,updated_at) VALUES(?,?,?,?,?,?)').bind(category.id,versionId,revision,versionId,context.actorId,context.now),
  ...await operationalBusinessNotificationStatements(db,{kind:'category.policy',sourceId:category.id,eventId:versionId,actorId:context.actorId,now:context.now,status:'published'}),receipt.insert({versionId,revision})]);}
 catch(error){const retry=await commandReceipt(db,context,source,payload);if(retry.replayed)return retry.result as {versionId:string;revision:number};throw new CategoryContractError(/constraint|conflict/i.test(String(error))?'Category policy or authority changed. Keep this draft and refresh.':'The saved policy outcome could not be confirmed. Retry this exact request.',/constraint|conflict/i.test(String(error))?409:503);}
 return {versionId,revision};
}
export async function getCategoryContractWorkspace(db:D1Database,categoryId:string){
 const model=await getCategoryDetailGroups(db,categoryId);
 const [products,drafts,history]=await Promise.all([
  db.prepare('SELECT COUNT(*) AS count FROM products WHERE category_id=?').bind(categoryId).first<{count:number}>(),
  db.prepare('SELECT COUNT(*) AS count FROM product_intake_drafts WHERE category_id=?').bind(categoryId).first<{count:number}>(),
  db.prepare('SELECT id,version,created_at AS createdAt,reason FROM category_template_versions WHERE category_id=? ORDER BY version DESC').bind(categoryId).all<{id:string;version:number;createdAt:number;reason:string}>()
 ]);
 return {model,productCount:products?.count??0,draftCount:drafts?.count??0,history:history.results};
}
const ownerSql="EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('customer','seller')))";
function parseAnswers(raw:unknown):ProductDetailAnswers{const answers=record(raw);if(JSON.stringify(answers).length>100000)throw new CategoryContractError('The saved details exceed the safe draft size. Keep your entries and request assistance.',413);for(const [key,value]of Object.entries(answers)){if(!productDetailKeys.has(key)||!(typeof value==='string'||Array.isArray(value)&&value.length<=100&&value.every(item=>typeof item==='string'))||JSON.stringify(value).length>12000)throw new CategoryContractError('Only bounded supported product details belong in this draft; private costs and evidence use their own controls.',400);}return structuredClone(answers) as ProductDetailAnswers;}
export interface ProductIntakeDraftInput{draftId:string|null;sellerId:string;categoryId:string|null;answers:unknown}
export {parseAnswers as retainProductDetailAnswers};
/** Native prepared save lets the full workspace retain details, offers and completed uploads atomically. */
export async function prepareProductIntakeDraft(db:D1Database,context:CommandContext,input:ProductIntakeDraftInput){
 if(input.categoryId!==null&&(typeof input.categoryId!=='string'||input.categoryId.length>160))throw new CategoryContractError('Keep the category reference within its supported size.',400);
 if(!await db.prepare(`SELECT 1 WHERE ${ownerSql}`).bind(input.sellerId,context.actorId).first())throw new CategoryAuthorityError('This private product draft requires its current owner account.');
 const answers=parseAnswers(input.answers),payload={...input,answers},source={action:'product.intake.saved',subjectType:'product_intake',subjectId:input.draftId??'new'},receipt=await commandReceipt(db,context,source,payload);
 if(receipt.replayed)return {replayed:true,result:receipt.result as {id:string;revision:number},statements:[] as D1PreparedStatement[],source,payload};
 const old=input.draftId?await db.prepare('SELECT revision,category_id AS categoryId,category_change_json AS categoryChange FROM product_intake_drafts WHERE id=? AND owner_id=? AND seller_id=?').bind(input.draftId,context.actorId,input.sellerId).first<{revision:number;categoryId:string|null;categoryChange:string|null}>():null;
 if(input.draftId&&!old||context.expectedRevision!==(old?String(old.revision):null))throw new CategoryContractError('This product draft changed. Keep your entries and compare its saved revision.');
 const id=input.draftId??crypto.randomUUID(),revision=old?old.revision+1:0,categoryChange=old&&old.categoryId!==input.categoryId?JSON.stringify({from:old.categoryId,to:input.categoryId,changedAt:context.now}):old?.categoryChange??null;
 const category=await getCategoryDetailGroups(db,input.categoryId),json=JSON.stringify(answers);
 const statements=[...guard(db,ownerSql,[input.sellerId,context.actorId]),...(old?guard(db,'EXISTS(SELECT 1 FROM product_intake_drafts WHERE id=? AND owner_id=? AND revision=?)',[id,context.actorId,old.revision]):[]),
  old?db.prepare('UPDATE product_intake_drafts SET revision=?,category_id=?,answers_json=?,category_change_json=?,updated_at=? WHERE id=?').bind(revision,input.categoryId,json,categoryChange,context.now,id):db.prepare('INSERT INTO product_intake_drafts(id,owner_id,seller_id,revision,category_id,answers_json,category_change_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,context.actorId,input.sellerId,revision,input.categoryId,json,categoryChange,context.now,context.now),
  db.prepare('INSERT INTO product_intake_versions(id,draft_id,revision,category_id,answers_json,category_contract_version_id,created_at,request_id) VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),id,revision,input.categoryId,json,category.versionId,context.now,context.requestId),receipt.insert({id,revision})];
 return {replayed:false,result:{id,revision},statements,source,payload};
}
export async function saveProductIntakeDraft(db:D1Database,context:CommandContext,input:ProductIntakeDraftInput){
 const prepared=await prepareProductIntakeDraft(db,context,input);if(prepared.replayed)return prepared.result;
 try{await db.batch(prepared.statements);}catch(error){const retry=await commandReceipt(db,context,prepared.source,prepared.payload);if(retry.replayed)return retry.result as {id:string;revision:number};throw new CategoryContractError(/constraint|conflict/i.test(String(error))?'The draft or account changed before saving. Compare the saved revision.':'This draft save is uncertain. Retry the same request before editing again.',/constraint|conflict/i.test(String(error))?409:503);}
 return prepared.result;
}
export async function getProductIntakeDraft(db:D1Database,actorId:string,id:string){
 const row=await db.prepare(`SELECT d.id,d.owner_id AS ownerId,d.seller_id AS sellerId,d.revision,d.category_id AS categoryId,d.answers_json AS answersJson,d.category_change_json AS categoryChange FROM product_intake_drafts d WHERE d.id=? AND d.owner_id=? AND ${ownerSql.replace('s.id=?','s.id=d.seller_id')}`).bind(id,actorId,actorId).first<{id:string;ownerId:string;sellerId:string;revision:number;categoryId:string|null;answersJson:string;categoryChange:string|null}>();
 if(!row)throw new CategoryAuthorityError('This private product draft is not available to the current account.');const answers=parseAnswers(JSON.parse(row.answersJson)),category=await getCategoryDetailGroups(db,row.categoryId);
 if(!await db.prepare(`SELECT 1 WHERE ${ownerSql}`).bind(row.sellerId,actorId).first())throw new CategoryAuthorityError('Current owner access changed.');
 return {id:row.id,sellerId:row.sellerId,revision:row.revision,categoryId:row.categoryId,answers,categoryChange:row.categoryChange?JSON.parse(row.categoryChange) as {from:string|null;to:string|null;changedAt:number}:null,category,guidance:evaluateCategoryReadiness(category,answers)};
}
