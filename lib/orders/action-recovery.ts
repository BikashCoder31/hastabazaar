import {commandReceipt} from '../workflows/contracts';
export type ActionReference={actorId:string;sourceId:string;action:string;requestId:string};
export type ActionProof=ActionReference&{recorded:true};
export type AtomicActionProof={statements:D1PreparedStatement[]};
const family='order.native-action';
export async function readActionProof(db:D1Database,reference:ActionReference,authSubject:string):Promise<ActionProof|null>{
 const row=await db.prepare('SELECT command_result_json AS result FROM audit_logs WHERE actor_id=? AND request_id=? AND action=? AND subject_type=? AND subject_id=? AND command_key IS NOT NULL')
 .bind(reference.actorId,reference.requestId+':native-proof',family,'order_action',reference.sourceId).first<{result:string}>();
 if(!row)return null;
 let value:Record<string,unknown>;try{value=JSON.parse(row.result) as Record<string,unknown>;}catch{return null;}
 if(value.recorded!==true||value.authSubject!==authSubject||Object.entries(reference).some(([key,item])=>value[key]!==item))return null;
 return{...reference,recorded:true};
}
export async function prepareActionProof(db:D1Database,reference:ActionReference,authSubject:string,payload:unknown,now:number,owner?:string){
 const receipt=await commandReceipt(db,{actorId:reference.actorId,requestId:reference.requestId+':native-proof',expectedRevision:null,now},{action:family,subjectType:'order_action',subjectId:reference.sourceId},{authSubject,action:reference.action,payload});
 if(receipt.replayed)return{replayed:true as const,proof:await readActionProof(db,reference,authSubject)};
 const id=crypto.randomUUID();
 const ownerSql=owner?" AND EXISTS(SELECT 1 FROM seller_profiles s JOIN user_roles r ON r.user_id=s.user_id AND r.role='seller' WHERE s.id=? AND s.user_id=u.id AND s.status='approved')":'';
 const statements=[db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM users u WHERE HEX(u.id)=HEX(?) AND HEX(u.auth_subject)=HEX(?) AND u.status='active'${ownerSql}) THEN 1 ELSE 0 END`).bind(id,reference.actorId,authSubject,...(owner?[owner]:[])),db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id),receipt.insert({...reference,recorded:true,authSubject})];
 return{replayed:false as const,atomic:{statements}};
}
