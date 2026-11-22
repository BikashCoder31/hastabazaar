import test from 'node:test';
import assert from 'node:assert/strict';
import {createIncentiveDb} from './helpers/incentive-db';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import {runEmailAutomation} from '../lib/email/automation';
import {readIncident,executeIncidentCommand} from '../lib/operations/incident-review';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';

void test('native D1 default email detector preserves its single notice family and governed owner through response and revocation',async()=>{
 const f=await createIncentiveDb();try{
  let now=Date.now();
  for(const [id,role]of [['governance-sa','super_admin'],['governance-tech','admin']] as const){
   await f.db.prepare("INSERT INTO users(id,auth_subject,email,display_name,status,created_at,updated_at) VALUES(?,?,?,'Fictional governance responder','active',?,?)").bind(id,id,id+'@local.hastabazaar.test',now,now).run();
   await f.db.prepare('INSERT INTO user_roles(user_id,role,assigned_at) VALUES(?,?,?)').bind(id,role,now).run();
  }
  await f.db.prepare("INSERT INTO staff_permission_profiles(user_id,permissions_json,version,updated_by,updated_at) VALUES('governance-tech','[\"system.incidents.manage\"]',1,'governance-sa',?)").bind(now).run();
  captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',NODE_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:'native-governance-v1'});
  await executeTeamGovernance(f.db,{actorId:'governance-sa',requestId:'native-system-roster',expectedRevision:null,now},{action:'save_duty',sourceId:'system_incidents',primaryId:'governance-tech',backupIds:['governance-sa'],reason:'Assign actual eligible fictional technical coverage in this disposable native fixture.'});
  const run=()=>runEmailAutomation(f.db,{environment:'test',expectedSince:now-1},{clock:()=>now,evaluate:async()=>({scanned:1,created:0,cancelled:0,failures:[]}),send:async()=>({processed:1,business:{accepted:0,failed:1,cancelled:0},orders:{sent:0,failed:0,cancelled:0}}),attemptFailures:async()=>['temporary'],queueSnapshot:async()=>({eligibleBacklog:1,oldestEligibleAt:now,backoffCategory:null})});
  assert.equal((await run()).healthRecorded,true);now+=60_000;assert.equal((await run()).healthRecorded,true);
  const original=await f.db.prepare("SELECT h.id,h.first_seen_at firstSeenAt,g.owner_id ownerId FROM service_health_incidents h JOIN service_incident_governance g ON g.incident_id=h.id WHERE h.service_key='email.sender'").first<{id:string;firstSeenAt:number;ownerId:string}>();assert.ok(original);assert.equal(original.ownerId,'governance-tech');
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.email_health' AND related_id=?").bind(original.id).first<{n:number}>())!.n,4);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM notification_messages WHERE template_key='business.system.incident'").first<{n:number}>())!.n,0);
  const dispatch=await processReminderDispatch(f.db,{now,limit:50});assert.deepEqual(dispatch.failures,[]);
  const before=await readIncident(f.db,'governance-tech',original.id,'test',now);
  const result=await executeIncidentCommand(f.db,{actorId:'governance-tech',requestId:'native-incident-ack',expectedRevision:before.version,now},{incidentId:original.id,action:'acknowledge',reason:'The assigned fictional responder acknowledges the original failure.'});assert.notEqual(result.state,'resolved');
  await f.db.prepare("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='governance-tech'").run();
  await assert.rejects(readIncident(f.db,'governance-tech',original.id,'test',now));
  await assert.rejects(executeIncidentCommand(f.db,{actorId:'governance-tech',requestId:'native-revoked-plan',expectedRevision:result.version,now},{incidentId:original.id,action:'plan',plan:'Unauthorized after revocation',nextAction:'Forbidden update',nextUpdateAt:now+60_000,reason:'An old tab cannot retain the removed incident authority.'}));
  assert.equal((await f.db.prepare('SELECT first_seen_at firstSeenAt FROM service_health_incidents WHERE id=?').bind(original.id).first<{firstSeenAt:number}>())!.firstSeenAt,original.firstSeenAt);
  assert.equal((await f.db.prepare("SELECT COUNT(*) n FROM service_incident_events WHERE action='plan'").first<{n:number}>())!.n,0);
 }finally{await f.dispose();}
});
