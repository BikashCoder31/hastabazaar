import {withNativeFormLoad} from '../operations/native-form-health';
import {digestFormRequest} from '../forms/submission';
import {parseSellerPhone} from './contact-phone';
import {profileWorkflowInternals as workflow} from './public-profile-workflow';
import {PublicProfileError,type ProfileCommand} from './public-profile-types';
import {operationalBusinessNotificationStatements} from '../operations/business-notifications';
type Address={id:string;purpose:string;province:string;district:string;municipality:string;ward:string|null;locality:string;updatedAt:number};
async function read(db:D1Database,sellerId:string){
 const [support,addresses]=await Promise.all([db.prepare('SELECT support_email AS email,support_phone AS phone FROM seller_profiles WHERE id=?').bind(sellerId).first<{email:string;phone:string}>(),
  db.prepare("SELECT id,purpose,province,district,municipality,ward,locality,updated_at AS updatedAt FROM seller_operational_addresses WHERE seller_id=? AND purpose IN ('pickup','returns') ORDER BY purpose").bind(sellerId).all<Address>()]);
 if(!support)throw new PublicProfileError('Seller not found.',404);return{support,addresses:addresses.results};
}
function address(row:Address|undefined){return row?[row.locality,row.ward?`Ward ${row.ward}`:'',row.municipality,row.district,row.province].filter(Boolean).join(', '):'';}
async function getProfileContactLocationsSource(db:D1Database,sellerId:string,actorId:string){
 await workflow.owner(db,sellerId,actorId);const current=await read(db,sellerId);
 return{support:{...current.support,revision:await digestFormRequest(current.support)},locations:{pickupAddress:address(current.addresses.find(row=>row.purpose==='pickup')),returnAddress:address(current.addresses.find(row=>row.purpose==='returns')),revision:await digestFormRequest(current.addresses)}};
}
function event(db:D1Database,input:ProfileCommand,action:string,before:unknown,after:unknown){return db.prepare(`INSERT INTO seller_public_profile_events(id,seller_id,actor_id,action,reason,payload_json,created_at) VALUES(?,?,?,?,?,?,?)`)
 .bind(crypto.randomUUID(),input.sellerId,input.actorId,action,action==='support_updated'?'Seller explicitly saved public support contacts.':'Seller updated private pickup and return destinations for future operations.',JSON.stringify({before,after}),input.now);}
export async function saveProfileSupport(db:D1Database,input:ProfileCommand&{expectedRevision:string;email:string;phoneCountry:string;phone:string;publicDisclosureConfirmed:boolean}){
 await workflow.owner(db,input.sellerId,input.actorId);
 if(input.publicDisclosureConfirmed!==true)throw new PublicProfileError('Confirm that these are public customer-support contacts, separate from account and security contacts.',400);
 if(typeof input.email!=='string'||input.email.length>254||input.email.trim()&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))throw new PublicProfileError('Enter a valid public support email or leave it blank.',400);
 let phone:string;try{phone=input.phone?parseSellerPhone(input.phone,input.phoneCountry).phone:'';}catch(error){throw new PublicProfileError(error instanceof Error?error.message:'Check the support phone.',400);}
 const next={email:input.email.trim().toLowerCase(),phone},revision=await digestFormRequest(next),intent=await workflow.command(db,input,'support_saved',input.sellerId,input.expectedRevision,{...next,publicDisclosureConfirmed:true});if(intent.receipt.replayed)return intent.receipt.result as {revision:string};
 const current=await read(db,input.sellerId);if(await digestFormRequest(current.support)!==input.expectedRevision)throw new PublicProfileError('Support contacts changed. Compare the saved contacts and retain your entries.');
 const statements=workflow.guard(db,`${workflow.ownerSql} AND EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND support_email=? AND support_phone=?)`,[input.sellerId,input.actorId,input.sellerId,current.support.email,current.support.phone]);
 if(revision===input.expectedRevision){await intent.commit(statements,{revision,noop:true});return{revision};}
 statements.push(db.prepare('UPDATE seller_profiles SET support_email=?,support_phone=?,updated_at=? WHERE id=?').bind(next.email,next.phone,input.now,input.sellerId),
  db.prepare('UPDATE seller_public_profile_states SET support_request_id=? WHERE seller_id=?').bind(input.requestId,input.sellerId),event(db,input,'support_updated',current.support,next),
  ...await operationalBusinessNotificationStatements(db,{kind:'seller.support_contact',sourceId:input.sellerId,eventId:input.requestId,actorId:input.actorId,now:input.now,detail:'The seller saved public customer-support contact details. This is an immediate recorded update; account, security and notification destinations are unchanged.'}));
 await intent.commit(statements,{revision,noop:false});return{revision};
}
export async function saveProfileLocations(db:D1Database,input:ProfileCommand&{expectedRevision:string;pickupAddress:string;returnAddress:string}){
 await workflow.owner(db,input.sellerId,input.actorId);
 for(const value of [input.pickupAddress,input.returnAddress])if(typeof value!=='string'||value.trim().length<3||value.length>500||/[\p{Cc}<>]/u.test(value))throw new PublicProfileError('Enter each full private pickup and return address using 3–500 characters.',400);
 const next={pickupAddress:input.pickupAddress.trim(),returnAddress:input.returnAddress.trim()},intent=await workflow.command(db,input,'locations_saved',input.sellerId,input.expectedRevision,next);if(intent.receipt.replayed)return intent.receipt.result as {revision:string};
 const current=await read(db,input.sellerId);if(await digestFormRequest(current.addresses)!==input.expectedRevision)throw new PublicProfileError('Private locations changed. Compare the saved addresses and retain your entries.');
 const statements=workflow.guard(db,`${workflow.ownerSql} AND (SELECT COUNT(*) FROM seller_operational_addresses WHERE seller_id=? AND purpose IN ('pickup','returns'))=?`,[input.sellerId,input.actorId,input.sellerId,current.addresses.length]);
 for(const row of current.addresses)statements.push(...workflow.guard(db,`EXISTS(SELECT 1 FROM seller_operational_addresses WHERE id=? AND seller_id=? AND purpose=? AND province=? AND district=? AND municipality=? AND COALESCE(ward,'')=? AND locality=? AND updated_at=?)`,[row.id,input.sellerId,row.purpose,row.province,row.district,row.municipality,row.ward??'',row.locality,row.updatedAt]));
 if(address(current.addresses.find(row=>row.purpose==='pickup'))===next.pickupAddress&&address(current.addresses.find(row=>row.purpose==='returns'))===next.returnAddress){await intent.commit(statements,{revision:input.expectedRevision,noop:true});return{revision:input.expectedRevision};}
 const saved:Address[]=[];
 for(const [purpose,value] of [['pickup',next.pickupAddress],['returns',next.returnAddress]]){
  const row=current.addresses.find(item=>item.purpose===purpose),id=row?.id??crypto.randomUUID();
  saved.push({id,purpose,province:'',district:'',municipality:'',ward:null,locality:value,updatedAt:input.now});
  statements.push(row?db.prepare("UPDATE seller_operational_addresses SET province='',district='',municipality='',ward=NULL,locality=?,same_as_address_id=NULL,updated_at=? WHERE id=?").bind(value,input.now,row.id):
   db.prepare("INSERT INTO seller_operational_addresses(id,seller_id,purpose,province,district,municipality,locality,is_public,created_at,updated_at) VALUES(?,?,?,'','','',?,0,?,?)").bind(id,input.sellerId,purpose,value,input.now,input.now));
 }
 const revision=await digestFormRequest(saved);statements.push(event(db,input,'locations_updated',current.addresses,next));await intent.commit(statements,{revision,noop:false});return{revision};
}

export async function getProfileContactLocations(db:D1Database,sellerId:string,actorId:string){
 return withNativeFormLoad(db,['seller.public-support-contacts','seller.operational-locations'],()=>getProfileContactLocationsSource(db,sellerId,actorId));
}
