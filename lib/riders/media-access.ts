import {hasStaffPermissionBySubject} from '../db/repositories/staff-permissions';
export async function canViewRiderEvidence(db:D1Database,subject:string,ownerId:string,id:string,isIdentity:boolean){
 if(await hasStaffPermissionBySubject(db,subject,isIdentity?'admin.invite':'order.manage'))return true;
 return !!await db.prepare(isIdentity?"SELECT 1 FROM users u JOIN rider_profiles p ON p.user_id=u.id WHERE u.auth_subject=? AND u.status='active' AND u.id=? AND p.application_id=?":"SELECT 1 FROM users u JOIN rider_profiles p ON p.user_id=u.id JOIN rider_reports r ON r.rider_user_id=u.id JOIN shipping_parcels sp ON sp.shipping_job_id=r.shipping_job_id WHERE u.auth_subject=? AND u.status='active' AND u.id=? AND p.status='approved' AND r.id=? AND sp.rider_user_id=u.id").bind(subject,ownerId,id).first();
}
