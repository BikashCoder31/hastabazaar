import {type CommandContext} from '../workflows/contracts';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {retainOfferMatrix,validateOfferMatrix,physicalOfferIdentity,type OfferMatrix} from './offer-contracts';
import {offerAuthority,offerGuard,offerOwnerSql,offerReason,executeOfferCommand,OfferError} from './offer-support';
export {validateOfferMatrix};
export type {OfferMatrix,OfferDraft,OfferAxis} from './offer-contracts';
export interface OfferHead {revision:number;candidateVersionId:string|null;currentVersionId:string|null;inventoryMapped:number}
export async function offerHead(db:D1Database,productId:string){return db.prepare('SELECT revision,candidate_version_id AS candidateVersionId,current_version_id AS currentVersionId,inventory_mapped AS inventoryMapped FROM product_offer_heads WHERE product_id=?').bind(productId).first<OfferHead>();}
export function headGuard(db:D1Database,productId:string,head:OfferHead|null){return [db.prepare('UPDATE products SET updated_at=updated_at WHERE id=?').bind(productId),...offerGuard(db,head?'EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=? AND revision=?)':'NOT EXISTS(SELECT 1 FROM product_offer_heads WHERE product_id=?)',head?[productId,head.revision]:[productId])];}
export async function offerIdentityStatements(db:D1Database,productId:string,matrix:OfferMatrix,now:number,strict:boolean,newProductSku?:string){
 const product=await db.prepare('SELECT sku FROM products WHERE id=?').bind(productId).first<{sku:string}>()??(newProductSku?{sku:newProductSku}:null);if(!product)throw new OfferError('The product identity is unavailable.');
 const identities=(await db.prepare('SELECT id,product_id AS productId,physical_json AS physical FROM product_offer_identities WHERE product_id=?').bind(productId).all<{id:string;productId:string;physical:string}>()).results;
 const statements:D1PreparedStatement[]=[...offerGuard(db,'EXISTS(SELECT 1 FROM products WHERE id=? AND sku=?)',[productId,product.sku])],seen=new Set<string>();for(const row of matrix.offers){if(strict&&!row.included||seen.has(row.id))continue;seen.add(row.id);if(!row.stockFamilyKey.trim()||!['piece','gram','millilitre'].includes(row.baseUnit)||!/^\d+$/.test(row.unitsPerOffer)||!Number.isSafeInteger(Number(row.unitsPerOffer))||Number(row.unitsPerOffer)<1)continue;
  const physical=physicalOfferIdentity(row),old=identities.find(item=>item.id===row.id);
  if(old){if(old.productId!==productId||old.physical!==physical){if(strict)throw new OfferError('A different physical meaning requires a new offer identity; retained history cannot be rewritten.');continue;}statements.push(...offerGuard(db,'EXISTS(SELECT 1 FROM product_offer_identities WHERE id=? AND product_id=? AND physical_json=?)',[row.id,productId,physical]));}
  else statements.push(db.prepare('INSERT INTO product_offer_identities(id,product_id,platform_sku,physical_json,stock_family_key,base_unit,units_per_offer,created_at) VALUES(?,?,?,?,?,?,?,?)').bind(row.id,productId,product.sku+'-'+crypto.randomUUID().slice(0,8).toUpperCase(),physical,row.stockFamilyKey,row.baseUnit,Number(row.unitsPerOffer),now));
 }return statements;
}
export async function saveOfferCandidate(db:D1Database,ctx:CommandContext,input:{productId:string;matrix:unknown}){
 const authority=await offerAuthority(db,ctx.actorId,input.productId),matrix=retainOfferMatrix(input.matrix);
 if(await db.prepare('SELECT 1 FROM product_publication_heads WHERE product_id=?').bind(input.productId).first())throw new OfferError('Save the whole product in its private workspace; its submitted content and offers have one coherent review.');
 return executeOfferCommand(db,ctx,'offer.candidate.saved',input.productId,{...input,matrix},async()=>{
  const head=await offerHead(db,input.productId);if(ctx.expectedRevision!==(head?String(head.revision):null))throw new OfferError('The offer draft changed. Keep your entries and compare the saved version.');const versionId=crypto.randomUUID(),revision=head?head.revision+1:0;
  return {result:{versionId,revision},statements:[...authority,...offerGuard(db,'NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=?)',[input.productId]),...headGuard(db,input.productId,head),db.prepare('INSERT INTO product_offer_versions(id,product_id,matrix_json,created_by,created_at) VALUES(?,?,?,?,?)').bind(versionId,input.productId,JSON.stringify(matrix),ctx.actorId,ctx.now),
   ...await offerIdentityStatements(db,input.productId,matrix,ctx.now,false),head?db.prepare('UPDATE product_offer_heads SET candidate_version_id=?,revision=?,updated_at=? WHERE product_id=?').bind(versionId,revision,ctx.now,input.productId):db.prepare('INSERT INTO product_offer_heads(product_id,revision,candidate_version_id,current_version_id,inventory_mapped,updated_at) VALUES(?,?,?,NULL,0,?)').bind(input.productId,revision,versionId,ctx.now)]};
 });
}
export async function getOfferWorkspace(db:D1Database,actorId:string,productId:string){
 if(!await db.prepare(`SELECT 1 WHERE ${offerOwnerSql}`).bind(productId,actorId).first())await offerAuthority(db,actorId,productId,true);
 const head=await offerHead(db,productId);const read=async(id:string|null)=>{if(!id)return null;const row=await db.prepare('SELECT matrix_json AS matrix FROM product_offer_versions WHERE id=? AND product_id=?').bind(id,productId).first<{matrix:string}>();if(!row)throw new OfferError('The exact offer history is unavailable.',503);return {versionId:id,...validateOfferMatrix(JSON.parse(row.matrix))};};
 return {productId,revision:head?.revision??null,inventoryMapped:!!head?.inventoryMapped,current:await read(head?.currentVersionId??null),candidate:await read(head?.candidateVersionId??null)};
}
/** Offer sub-operation; T18 must include this exact version in its coherent product candidate publication. */
export async function publishOfferCandidate(db:D1Database,ctx:CommandContext,input:{productId:string;versionId:string;reason:string}){
 const authority=await offerAuthority(db,ctx.actorId,input.productId,true),publisher=await staffMutationGuard(db,ctx.actorId,'product.publish',OfferError),reason=offerReason(input.reason);
 if(await db.prepare('SELECT 1 FROM product_publication_heads WHERE product_id=?').bind(input.productId).first())throw new OfferError('Review and publish the complete product candidate; separate offer publication cannot bypass its content review.');
 return executeOfferCommand(db,ctx,'offer.candidate.published',input.productId,{...input,reason},async()=>{
  const head=await offerHead(db,input.productId);if(!head||ctx.expectedRevision!==String(head.revision)||head.candidateVersionId!==input.versionId)throw new OfferError('Review the exact current offer candidate before publishing.');
  const version=await db.prepare('SELECT matrix_json AS matrix FROM product_offer_versions WHERE id=? AND product_id=?').bind(input.versionId,input.productId).first<{matrix:string}>();if(!version)throw new OfferError('The candidate version is unavailable.',503);const checked=validateOfferMatrix(JSON.parse(version.matrix));if(!checked.publishable)throw new OfferError(checked.issues.join(' '));
  const unmapped=await db.prepare('SELECT inventory_quantity AS available,(SELECT COUNT(*) FROM order_items WHERE product_id=products.id) AS orders FROM products WHERE id=?').bind(input.productId).first<{available:number;orders:number}>();if(!unmapped||!head.inventoryMapped&&(unmapped.available!==0||unmapped.orders!==0))throw new OfferError('Review and explicitly map legacy stock and orders before publishing real offers.');
  const included=checked.matrix.offers.filter(row=>row.included),old=(await db.prepare('SELECT offer_id AS id FROM product_offer_current WHERE product_id=?').bind(input.productId).all<{id:string}>()).results,retired=old.filter(row=>!included.some(offer=>offer.id===row.id));const revision=head.revision+1;
  const statements=[...authority,...publisher.statements,...offerGuard(db,'NOT EXISTS(SELECT 1 FROM product_publication_heads WHERE product_id=?)',[input.productId]),...headGuard(db,input.productId,head),...(!head.inventoryMapped?offerGuard(db,'EXISTS(SELECT 1 FROM products WHERE id=? AND inventory_quantity=0) AND NOT EXISTS(SELECT 1 FROM order_items WHERE product_id=?)',[input.productId,input.productId]):[]),...await offerIdentityStatements(db,input.productId,checked.matrix,ctx.now,true)];
  for(const row of retired){statements.push(db.prepare('UPDATE offer_stock SET needs_reconfirmation=1,revision=revision+1,updated_at=? WHERE offer_id=?').bind(ctx.now,row.id));}
  statements.push(db.prepare('DELETE FROM product_offer_current WHERE product_id=?').bind(input.productId));for(const row of included)statements.push(db.prepare('INSERT INTO product_offer_current(offer_id,product_id,version_id,offer_json) VALUES(?,?,?,?)').bind(row.id,input.productId,input.versionId,JSON.stringify(row)));
  statements.push(db.prepare('UPDATE product_offer_heads SET current_version_id=?,inventory_mapped=1,revision=?,updated_at=? WHERE product_id=?').bind(input.versionId,revision,ctx.now,input.productId),db.prepare("INSERT INTO product_offer_decisions(id,product_id,version_id,action,actor_id,reason,created_at) VALUES(?,?,?,'review_and_publish',?,?,?)").bind(crypto.randomUUID(),input.productId,input.versionId,ctx.actorId,reason,ctx.now));return {statements,result:{versionId:input.versionId,revision}};
 });
}
