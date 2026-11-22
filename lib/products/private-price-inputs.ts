import type {CommandContext} from '../workflows/contracts';
import {digestFormRequest} from '../forms/submission';
import {offerGuard} from './offer-support';
export interface PricingSubject{kind:'product'|'intake';id:string;offerId:string}
export class PrivatePricingError extends Error{constructor(message:string,readonly status=409){super(message);}}
const identifier=(value:unknown)=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
export function pricingSubject(raw:unknown):PricingSubject{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new PrivatePricingError('Choose a saved owner draft or product.',400);const s=raw as PricingSubject;
 if(Object.keys(s).some(key=>!['kind','id','offerId'].includes(key))||!['product','intake'].includes(s.kind)||!identifier(s.id)||!identifier(s.offerId))throw new PrivatePricingError('Use a valid private pricing reference.',400);return {kind:s.kind,id:s.id,offerId:s.offerId};
}
export async function pricingSubjectAuthority(db:D1Database,actorId:string,raw:unknown,authSubject?:string){
 const subject=pricingSubject(raw),bound=authSubject!==undefined,maria=(db as D1Database&{dialect?:string}).dialect==='mariadb',exact=(left:string,right:string)=>maria?`BINARY ${left}=BINARY ${right}`:`${left} COLLATE BINARY=${right}`;
 if(bound&&(typeof authSubject!=='string'||!authSubject))throw new PrivatePricingError('Current owner identity is required.',403);
 const predicate=`EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id ${bound?'AND '+exact('u.id','s.user_id'):''} WHERE u.id=? ${bound?'AND '+exact('u.id','?')+' AND '+exact('u.auth_subject','?'):''} AND ${bound?exact('u.status',"'active'"):"u.status='active'"} AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND ${bound?'('+exact('r.role',"'customer'")+' OR '+exact('r.role',"'seller'")+')':"r.role IN ('customer','seller')"}) AND ((?='product' AND EXISTS(SELECT 1 FROM products p WHERE p.id=? AND p.seller_id=s.id)) OR (?='intake' AND EXISTS(SELECT 1 FROM product_intake_drafts d WHERE d.id=? AND d.seller_id=s.id AND d.owner_id=u.id ${bound?'AND '+exact('d.owner_id','u.id'):''}))))`,values=[actorId,...(bound?[actorId,authSubject]:[]),subject.kind,subject.id,subject.kind,subject.id];
 if(!await db.prepare(`SELECT 1 WHERE ${predicate}`).bind(...values).first())throw new PrivatePricingError('Only the current owner may open this private pricing helper.',403);
 return {subject,predicate,values,statements:offerGuard(db,predicate,values)};
}

const where='owner_id=? AND subject_kind=? AND subject_id=? AND offer_key=?';
const identity=(actor:string,s:PricingSubject)=>[actor,s.kind,s.id,s.offerId];
export async function getPrivatePriceInputs(db:D1Database,actorId:string,subject:PricingSubject){
 const authority=await pricingSubjectAuthority(db,actorId,subject);const row=await db.prepare(`SELECT revision,cost_text AS cost,target_text AS target,updated_at AS updatedAt FROM product_private_price_inputs WHERE ${where} AND ${authority.predicate}`).bind(...identity(actorId,authority.subject),...authority.values).first<{revision:number;cost:string;target:string;updatedAt:number}>();
 return row??{revision:null,cost:'',target:'',updatedAt:null};
}
export async function savePrivatePriceInputs(db:D1Database,ctx:CommandContext&{authSubject?:string},input:{subject:PricingSubject;cost:string;target:string}){
 const authority=await pricingSubjectAuthority(db,ctx.actorId,input.subject,ctx.authSubject),subject=authority.subject;
 if(!identifier(ctx.requestId)||!Number.isSafeInteger(ctx.now)||ctx.now<0||![input.cost,input.target].every(value=>typeof value==='string'&&value.length<=100))throw new PrivatePricingError('Keep bounded private inputs and a stable save reference.',400);
 const digest=await digestFormRequest({subject,cost:input.cost,target:input.target,expectedRevision:ctx.expectedRevision});
 const replay=async()=>{const prior=await db.prepare('SELECT payload_digest AS digest,revision FROM product_private_price_requests WHERE owner_id=? AND request_id=?').bind(ctx.actorId,ctx.requestId).first<{digest:string;revision:number}>();if(prior&&prior.digest!==digest)throw new PrivatePricingError('This request was used for different private inputs.');return prior?{revision:prior.revision}:null;};
 const prior=await replay();if(prior)return prior;
 const old=await db.prepare(`SELECT id,revision FROM product_private_price_inputs WHERE ${where}`).bind(...identity(ctx.actorId,subject)).first<{id:string;revision:number}>();
 if(ctx.expectedRevision!==(old?String(old.revision):null))throw new PrivatePricingError('Private inputs changed. Keep your entries and compare the saved revision.');
 const revision=old?old.revision+1:0;
 const changes=old?offerGuard(db,'EXISTS(SELECT 1 FROM product_private_price_inputs WHERE id=? AND revision=?)',[old.id,old.revision]):offerGuard(db,'(SELECT COUNT(*) FROM product_private_price_inputs WHERE owner_id=? AND subject_kind=? AND subject_id=?)<500',[ctx.actorId,subject.kind,subject.id]);
 try{await db.batch([...authority.statements,...changes,old?db.prepare('UPDATE product_private_price_inputs SET revision=?,cost_text=?,target_text=?,updated_at=? WHERE id=?').bind(revision,input.cost,input.target,ctx.now,old.id):db.prepare('INSERT INTO product_private_price_inputs(id,owner_id,subject_kind,subject_id,offer_key,revision,cost_text,target_text,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),...identity(ctx.actorId,subject),revision,input.cost,input.target,ctx.now),db.prepare('INSERT INTO product_private_price_requests(owner_id,request_id,payload_digest,revision,created_at) VALUES(?,?,?,?,?)').bind(ctx.actorId,ctx.requestId,digest,revision,ctx.now)]);}
 catch{await pricingSubjectAuthority(db,ctx.actorId,subject,ctx.authSubject);const recovered=await replay();if(recovered)return recovered;throw new PrivatePricingError('Private save was not confirmed. Retain and retry this same request, or compare the saved version.',503);}
 return {revision};
}
