import {can,validateAdminPermissions,type Permission} from '../marketplace/permissions';
import {CURRENT_CUSTOMER_ROLE_SQL} from '../auth/customer-scope';
import {GiftCardOutcomeError} from './command-outcomes';
interface Scope{id:string;authSubject:string|null;role:'admin'|'super_admin'|'customer';profile:string|null}
/** Capture actual page authority before loading private history. */
export async function readGiftCardViewScope(db:D1Database,actorId:string,audience:'staff'|'customer'):Promise<Scope>{
 const roles=audience==='staff'?"(HEX(gift_role.role)=HEX('admin') OR HEX(gift_role.role)=HEX('super_admin'))":"HEX(gift_role.role)=HEX('customer')";
 const row=await db.prepare(`SELECT users.id,users.auth_subject authSubject,gift_role.role,profile.permissions_json profile FROM users JOIN user_roles gift_role ON gift_role.user_id=users.id AND HEX(gift_role.user_id)=HEX(users.id) LEFT JOIN staff_permission_profiles profile ON profile.user_id=users.id WHERE users.id=? AND HEX(users.id)=HEX(?) AND users.status='active' AND HEX(users.status)=HEX('active') AND ${roles} ORDER BY CASE gift_role.role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1`).bind(actorId,actorId).first<Scope>();
 if(!row||row.id!==actorId)throw new GiftCardOutcomeError('Current gift record access is unavailable.',403);
 let permissions:Permission[]|undefined;try{permissions=row.profile===null?undefined:validateAdminPermissions(JSON.parse(row.profile));}catch{permissions=[];}
 if(audience==='staff'&&!can({role:row.role,permissions},'admin.invite'))throw new GiftCardOutcomeError('Current gift record access is unavailable.',403);return row;
}
export async function assertGiftCardViewScope(db:D1Database,scope:Scope,owned?:{id:string;owner:'issued_by'|'redeemed_by'}){
 const profile=scope.role!=='admin'?'1=1':scope.profile===null?'NOT EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=users.id)':'EXISTS(SELECT 1 FROM staff_permission_profiles p WHERE p.user_id=users.id AND HEX(p.permissions_json)=HEX(?))';
 const auth=scope.authSubject===null?'users.auth_subject IS NULL':'HEX(users.auth_subject)=HEX(?)';
 const role=scope.role==='customer'?CURRENT_CUSTOMER_ROLE_SQL:"EXISTS(SELECT 1 FROM user_roles gift_current_role WHERE gift_current_role.user_id=users.id AND HEX(gift_current_role.user_id)=HEX(users.id) AND HEX(gift_current_role.role)=HEX(?))";
 const original=owned?`EXISTS(SELECT 1 FROM gift_cards original_gift WHERE original_gift.id=? AND HEX(original_gift.${owned.owner})=HEX(users.id))`:'1=1';
 if(!await db.prepare(`SELECT 1 /* gift_page_final */ FROM users WHERE users.id=? AND HEX(users.id)=HEX(?) AND users.status='active' AND HEX(users.status)=HEX('active') AND ${auth} AND ${role} AND ${profile} AND ${original}`).bind(scope.id,scope.id,...(scope.authSubject===null?[]:[scope.authSubject]),...(scope.role==='customer'?[]:[scope.role]),...(scope.role==='admin'&&scope.profile!==null?[scope.profile]:[]),...(owned?[owned.id]:[])).first())throw new GiftCardOutcomeError('Gift record access changed. Reopen the intended account.',403);
}
