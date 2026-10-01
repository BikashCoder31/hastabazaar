import {can,validateAdminPermissions,type Permission} from '../../marketplace/permissions';
/** Read current authority, then append these guards to the mutation transaction. Never trust a claimed role alone. */
export async function staffMutationGuard(db:D1Database,actorId:string,permission:Permission,Conflict:new(message:string)=>Error,claimedRole?:'admin'|'super_admin'){
 const row=await db.prepare("SELECT r.role,p.permissions_json AS profile FROM users u JOIN user_roles r ON r.user_id=u.id LEFT JOIN staff_permission_profiles p ON p.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role IN ('admin','super_admin') ORDER BY CASE r.role WHEN 'super_admin' THEN 0 ELSE 1 END LIMIT 1").bind(actorId).first<{role:'admin'|'super_admin';profile:string|null}>();
 let selected:Permission[]|undefined;if(row && row.profile!==null){try{selected=validateAdminPermissions(JSON.parse(row.profile));}catch{selected=[];}}
 if(!row||(claimedRole!==undefined&&claimedRole!==row.role)||!can({role:row.role,permissions:selected},permission))throw new Conflict('Current staff permission is required for this action.');
 const statements:D1PreparedStatement[]=[];
 function guard(predicate:string,values:unknown[]){const id=crypto.randomUUID();statements.push(db.prepare('INSERT INTO staff_permission_guards(id,valid) SELECT ?,CASE WHEN '+predicate+' THEN 1 ELSE 0 END').bind(id,...values),db.prepare('DELETE FROM staff_permission_guards WHERE id=?').bind(id));}
 guard("EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role=?)",[actorId,row.role]);
 if(row.role==='admin')guard(row.profile===null?'NOT EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=?)':'EXISTS(SELECT 1 FROM staff_permission_profiles WHERE user_id=? AND permissions_json=?)',row.profile===null?[actorId]:[actorId,row.profile]);
 return {role:row.role,statements};
}
