import assert from 'node:assert/strict';
import test from 'node:test';
import {registerHooks} from 'node:module';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {createIncident} from '../lib/operations/incident-review';
import {ensureReviewTask} from '../lib/workflows/review-tasks';
declare global{var assignmentRouteDb:D1Database;var assignmentRouteActor:string|null;}
registerHooks({resolve(specifier,context,next){
 if(specifier==='cloudflare:workers')return{url:'data:text/javascript,export const env={get DB(){return globalThis.assignmentRouteDb}}',shortCircuit:true};
 if(specifier==='next/navigation')return{url:'data:text/javascript,export function redirect(){throw new Error("Page navigation must not run in this API fixture")}',shortCircuit:true};
 // Session identity is the external boundary. Staff role/profile, domain and transaction authority are real.
 if(specifier==='@/app/auth')return{url:'data:text/javascript,export async function getAuthenticatedUser(){return globalThis.assignmentRouteActor?{userId:globalThis.assignmentRouteActor}:null};export const requireAuthenticatedUser=getAuthenticatedUser',shortCircuit:true};
 return next(specifier,context);
}});
void test('actual assignment route accepts scoped incident manager and retained191-character task IDs, with replay and current authority',async()=>{
 const f=await completeVersionFixture(Date.now());try{globalThis.assignmentRouteDb=f.db;globalThis.assignmentRouteActor='delegate';f.sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?').run('["system.incidents.manage"]','delegate');const incident=await createIncident(f.db,{actorId:'reviewer',requestId:'route-incident-open',expectedRevision:null,now:f.now},{environment:'test',serviceKey:'fixture.assignment.route',failureSignature:'route-test',title:'Fictional route incident',impactSummary:'An actual protected fixture requires an assigned responder',impactClass:'ordinary',severity:'high'});const original=await ensureReviewTask(f.db,{sourceType:'system_incident',sourceId:incident.incidentId,now:f.now}),taskId='retained-'+ 'r'.repeat(182);assert.equal(taskId.length,191);f.sqlite.prepare('UPDATE review_tasks SET id=? WHERE id=?').run(taskId,original);const api=await import('../app/api/admin/review-tasks/route'),body={taskId,ownerId:'delegate',expectedRevision:'0',requestId:'actual-route-assignment',reason:'Claim this actual scoped incident as its authorized current responder'},request=(value:unknown=body,origin='https://assignment.test')=>new Request('https://assignment.test/api/admin/review-tasks',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(value)});
 assert.equal((await api.POST(request())).status,200);assert.equal((await api.POST(request())).status,200);assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.assigned' AND subject_id=?").get(taskId)?.n,1);assert.equal(f.sqlite.prepare('SELECT owner_id ownerId FROM service_incident_governance WHERE incident_id=?').get(incident.incidentId)?.ownerId,'delegate');assert.equal((await api.POST(request({...body,taskId:taskId+'x'}))).status,400);assert.equal((await api.POST(request(body,'https://foreign.test'))).status,403);
 const staleActor=request({...body,requestId:'old-actor-intent',expectedRevision:'1',ownerId:null});staleActor.headers.set('X-Hastabazaar-Actor','reviewer');assert.equal((await api.POST(staleActor)).status,403,'Two eligible staff identities do not make an old actor intent interchangeable.');assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM audit_logs WHERE action='review_task.assigned' AND subject_id=?").get(taskId)?.n,1);
 const sameActor=request();sameActor.headers.set('X-Hastabazaar-Actor','delegate');assert.equal((await api.POST(sameActor)).status,200);
 f.sqlite.prepare('UPDATE staff_permission_profiles SET permissions_json=? WHERE user_id=?').run('[]','delegate');assert.equal((await api.POST(request())).status,409,'A stale tab cannot replay through revoked domain authority.');f.sqlite.prepare("UPDATE users SET status='suspended' WHERE id='delegate'").run();assert.equal((await api.POST(request())).status,403);globalThis.assignmentRouteActor=null;assert.equal((await api.POST(request())).status,401);
 }finally{globalThis.assignmentRouteActor=null;f.dispose();}
});
