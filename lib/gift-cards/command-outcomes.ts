import {CURRENT_CUSTOMER_ROLE_SQL} from '../auth/customer-scope';
import {validGiftRequest,type GiftCardCommandMode,type GiftCardCommandOutcome} from './command-contract';
export class GiftCardOutcomeError extends Error{constructor(message:string,readonly status=400){super(message);}}
/** Original native financial fact only. No code/hash, form answers, replay or provisioning. */
export async function readGiftCardCommandOutcome(db:D1Database,actorId:string,mode:GiftCardCommandMode,requestId:unknown):Promise<GiftCardCommandOutcome>{
 if(!validGiftRequest(requestId)||!['issue','redeem'].includes(mode))throw new GiftCardOutcomeError('Identify the original gift card request.');
 const role=mode==='issue'?"EXISTS(SELECT 1 FROM user_roles gift_role WHERE gift_role.user_id=users.id AND HEX(gift_role.user_id)=HEX(users.id) AND gift_role.role='super_admin' AND HEX(gift_role.role)=HEX('super_admin'))":CURRENT_CUSTOMER_ROLE_SQL;
 const active="users.id=? AND HEX(users.id)=HEX(?) AND users.status='active' AND HEX(users.status)=HEX('active') AND "+role;
 const identity=await db.prepare('SELECT users.id,users.auth_subject authSubject FROM users WHERE '+active).bind(actorId,actorId).first<{id:string;authSubject:string|null}>();
 if(!identity||identity.id!==actorId)throw new GiftCardOutcomeError('Current gift card access is unavailable. Reopen the intended account.',403);
 const owner=mode==='issue'?'issued_by':'redeemed_by',request=mode==='issue'?'issuance_request_id':'redemption_request_id',action='gift_card.'+(mode==='issue'?'issued':'redeemed');
 const row=await db.prepare(`SELECT gift.id,gift.amount_paisa amountPaisa,audit.id auditId,audit.next_json nextJson FROM gift_cards gift JOIN audit_logs audit ON audit.subject_id=gift.id AND HEX(audit.subject_id)=HEX(gift.id) AND audit.subject_type='gift_card' AND HEX(audit.subject_type)=HEX('gift_card') AND audit.action=? AND HEX(audit.action)=HEX(?) AND audit.actor_id=? AND HEX(audit.actor_id)=HEX(?) AND audit.request_id=? AND HEX(audit.request_id)=HEX(?) WHERE gift.${request}=? AND HEX(gift.${request})=HEX(?) AND gift.${owner}=? AND HEX(gift.${owner})=HEX(?) LIMIT 1`).bind(action,action,actorId,actorId,requestId,requestId,requestId,requestId,actorId,actorId).first<{id:string;amountPaisa:number;auditId:string;nextJson:string}>();
 let recorded=!!row&&Number.isSafeInteger(row.amountPaisa)&&row.amountPaisa>0;try{recorded=recorded&&JSON.parse(row!.nextJson)?.amountPaisa===row?.amountPaisa;}catch{recorded=false;}
 let proof='1=1';const proofValues:unknown[]=[];
 if(recorded&&row){proof=`EXISTS(SELECT 1 FROM gift_cards gift JOIN audit_logs audit ON audit.subject_id=gift.id AND HEX(audit.subject_id)=HEX(gift.id) WHERE gift.id=? AND HEX(gift.id)=HEX(?) AND gift.amount_paisa=? AND HEX(gift.${request})=HEX(?) AND HEX(gift.${owner})=HEX(?) AND audit.id=? AND HEX(audit.actor_id)=HEX(?) AND HEX(audit.request_id)=HEX(?) AND HEX(audit.action)=HEX(?) AND HEX(audit.subject_type)=HEX('gift_card') AND HEX(audit.next_json)=HEX(?))`;proofValues.push(row.id,row.id,row.amountPaisa,requestId,actorId,row.auditId,actorId,requestId,action,row.nextJson);
  if(mode==='redeem'){proof+=" AND EXISTS(SELECT 1 FROM wallet_entries original_entry WHERE original_entry.id=? AND HEX(original_entry.user_id)=HEX(?) AND HEX(original_entry.gift_card_id)=HEX(?) AND HEX(original_entry.kind)=HEX('gift_card') AND original_entry.amount_paisa=? AND original_entry.platform_amount_paisa=?)";proofValues.push('gift:'+row.id,actorId,row.id,row.amountPaisa,-row.amountPaisa);}
 }
 const identityProof=identity.authSubject===null?'users.auth_subject IS NULL':'HEX(users.auth_subject)=HEX(?)';
 // Indexed identity + byte-exact current role/source checks are the final data await.
 const final=await db.prepare(`SELECT CASE WHEN ${proof} THEN 1 ELSE 0 END confirmed FROM users WHERE ${active} AND ${identityProof}`).bind(...proofValues,actorId,actorId,...(identity.authSubject===null?[]:[identity.authSubject])).first<{confirmed:number}>();
 if(!final)throw new GiftCardOutcomeError('Current gift card access changed. Reopen the intended account.',403);
 if(!final.confirmed)throw new GiftCardOutcomeError('The original native gift receipt could not be confirmed. Check its saved result again.',409);
 return{requestId,status:recorded?'recorded':'unconfirmed',...(recorded&&row?{record:{id:row.id,amountPaisa:row.amountPaisa}}:{})};
}
