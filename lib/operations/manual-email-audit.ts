export class EmailDeliveryAuthorizationError extends Error {
 readonly status=403;
 constructor(){super('Current active Super Admin authority is required for email delivery recovery.');}
}
/** A request trace, not a transaction around an external mail server or exactly-once delivery. */
export async function auditManualEmailProcessing<T extends {pending?:boolean;failed:number}>(db:D1Database,actorId:string,process:()=>Promise<T>,requestId=crypto.randomUUID(),clock=Date.now,queue:'order'|'business'='order'):Promise<T>{
 const record=(action:string)=>db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) VALUES (?,?,?,'notification_queue',?,'Manual email processing request',?,?)").bind(crypto.randomUUID(),actorId,queue+'.email.processing.'+action,queue,requestId+':'+action,clock()).run();
 const attempted=await db.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,request_id,created_at) SELECT ?,?,?, 'notification_queue',?,'Manual email processing request',?,? WHERE EXISTS(SELECT 1 FROM users u JOIN user_roles r ON r.user_id=u.id WHERE u.id=? AND u.status='active' AND r.role='super_admin')")
  .bind(crypto.randomUUID(),actorId,queue+'.email.processing.attempted',queue,requestId+':attempted',clock(),actorId).run();
 if(attempted.meta.changes!==1)throw new EmailDeliveryAuthorizationError();
 let result:T;
 try{result=await process();}catch(error){await record('failed');throw error;}
 await record(result.pending?'pending':result.failed>0?'finished_with_failures':'finished');
 return result;
}

export const auditManualOrderEmailProcessing = auditManualEmailProcessing;
