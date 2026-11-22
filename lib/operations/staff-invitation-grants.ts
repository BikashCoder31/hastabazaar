import {validateAdminPermissions} from '../marketplace/permissions';
import {teamGuard} from './team-governance';
import {checkoutCommitClock} from '../checkout/commit-policy-guards';

/** Append after any new identity insertion, before returning any staff access. */
export async function staffInvitationAcceptanceStatements(db:D1Database,input:{invitationId:string;userId:string;authSubject:string;email:string;now:number}){
 const invite=await db.prepare("SELECT i.role,i.invited_by AS invitedBy,g.permissions_json AS permissionsJson,g.grant_version AS version,g.created_by AS selectedBy FROM staff_invitations i JOIN staff_invitation_grants g ON g.invitation_id=i.id WHERE i.id=? AND i.status='pending' AND i.email=? AND i.expires_at>?").bind(input.invitationId,input.email.toLowerCase(),input.now).first<{role:string;invitedBy:string;permissionsJson:string;version:number;selectedBy:string}>();
 if(!invite)return null;
 let permissions;try{permissions=validateAdminPermissions(JSON.parse(invite.permissionsJson));}catch{return null;}
 const clock=checkoutCommitClock(db),statements=teamGuard(db,`EXISTS(SELECT 1 FROM staff_invitations i JOIN staff_invitation_grants g ON g.invitation_id=i.id WHERE i.id=? AND i.status='pending' AND i.email=? AND i.expires_at>${clock} AND i.role=? AND g.grant_version=? AND g.permissions_json=?)`,[input.invitationId,input.email.toLowerCase(),invite.role,invite.version,invite.permissionsJson]);
 statements.push(...teamGuard(db,"EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')",[invite.selectedBy]),...teamGuard(db,"EXISTS(SELECT 1 FROM users WHERE id=? AND lower(email)=? AND auth_subject=? AND status='active')",[input.userId,input.email.toLowerCase(),input.authSubject]));
 if(invite.role==='admin'){
  statements.push(...teamGuard(db,"NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=? AND role IN('admin','super_admin'))",[input.userId]));
  statements.push(db.prepare('INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES(?,?,1,?,?) ON CONFLICT(user_id) DO UPDATE SET permissions_json=excluded.permissions_json,version=staff_permission_profiles.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(input.userId,JSON.stringify(permissions),invite.selectedBy,input.now));
 }
 statements.push(db.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_by,assigned_at) SELECT ?,role,invited_by,? FROM staff_invitations WHERE id=? AND status='pending'").bind(input.userId,input.now,input.invitationId),db.prepare("UPDATE staff_invitations SET status='accepted',accepted_by=?,accepted_at=? WHERE id=? AND status='pending'").bind(input.userId,input.now,input.invitationId),db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,?,'staff.invitation.accepted','staff_invitation',?,'Verified invited account accepted its exact reviewed work access',?,?,?)").bind(crypto.randomUUID(),input.userId,input.invitationId,JSON.stringify({role:invite.role,grantVersion:invite.version}),input.invitationId,input.now));
 return statements;
}
