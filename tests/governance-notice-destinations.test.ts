import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {executeTeamGovernance} from '../lib/operations/team-governance';
import {createIncident,executeIncidentCommand} from '../lib/operations/incident-review';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {notificationDestination} from '../lib/operations/notification-links';
import {processTeamGovernanceDue} from '../lib/operations/team-governance';
import {getTeamTaskDestination} from '../lib/operations/team-task-destination';

async function resolver(){const path='../lib/operations/governance-notice-destination';const loadedFixtureModule=await import(path).catch(()=>null);assert.equal(typeof loadedFixtureModule?.resolveGovernanceNoticeDestination,'function');return loadedFixtureModule!.resolveGovernanceNoticeDestination;}
void test('native Team work and its shared review identity open the same authorized specific control',async()=>{
 const f=await completeVersionFixture(Date.now());try{
  const result=await processTeamGovernanceDue(f.db,{now:f.now,limit:60});assert.deepEqual(result.failures,[]);
  const task=f.sqlite.prepare("SELECT g.id,r.id AS reviewId FROM team_governance_tasks g JOIN review_tasks r ON r.source_type='team_governance' AND r.source_id=g.id WHERE g.kind='access_review' AND g.subject_user_id='delegate'").get();assert.ok(task);
  const native=await getTeamTaskDestination(f.db,'reviewer',String(task.id)),shared=await getTeamTaskDestination(f.db,'reviewer',String(task.reviewId));assert.deepEqual(shared,native);
  assert.equal(native.href,'/admin/team?tab=people&task='+task.id+'#person-delegate');
  await assert.rejects(getTeamTaskDestination(f.db,'delegate',String(task.id)));
  await assert.rejects(getTeamTaskDestination(f.db,'customer',String(task.id)));
 }finally{f.dispose();}
});
void test('Team links require an issued current native notice and revoke with the actual grant or source',async()=>{
 const resolve=await resolver(),f=await completeVersionFixture(Date.now());try{
 const input={action:'save_duty',sourceId:'products',primaryId:'delegate',backupIds:['reviewer'],reason:'Private fictional roster reason must stay within its authorized record.'};
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'destination-roster',expectedRevision:null,now:f.now},input);
 const event=f.sqlite.prepare("SELECT id FROM team_governance_events WHERE request_id='destination-roster'").get()!;
 const id=String(event.id);
 assert.equal(notificationDestination('staff','staff','team_governance_event',id),'/admin/operational-notices/team_governance_event/'+id);
 assert.equal(await resolve(f.db,'delegate','team_governance_event',id,f.now),'/admin/team?tab=coverage#duty-products');
 assert.equal(await resolve(f.db,'customer','team_governance_event',id,f.now),null);
 assert.equal(await resolve(f.db,'reviewer','team_governance_event','unissued',f.now),null);
 f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[]',version=version+1 WHERE user_id='delegate'").run();
 assert.equal(await resolve(f.db,'delegate','team_governance_event',id,f.now),null);
 await executeTeamGovernance(f.db,{actorId:'reviewer',requestId:'destination-replace',expectedRevision:'0',now:f.now},{...input,primaryId:'reviewer',backupIds:[]});
 assert.equal(await resolve(f.db,'reviewer','team_governance_event',id,f.now),null);
 }finally{f.dispose();}
});
void test('an assigned manage-only responder reaches the incident through its current notice without global health access',async()=>{
 const resolve=await resolver(),f=await completeVersionFixture(Date.now());try{
 captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',NODE_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:'fixture-destination'});
 f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"system.incidents.manage\"]',version=version+1 WHERE user_id='delegate'").run();
 const opened=await createIncident(f.db,{actorId:'reviewer',requestId:'destination-incident',expectedRevision:null,now:f.now},{environment:'test',serviceKey:'application.availability',failureSignature:'fictional-unavailable',title:'Fictional unavailable workflow',impactSummary:'A fictional supported workflow is temporarily unavailable.',impactClass:'ordinary',severity:'high'});
 await executeIncidentCommand(f.db,{actorId:'reviewer',requestId:'destination-assign',expectedRevision:opened.version,now:f.now},{action:'assign',incidentId:opened.incidentId,ownerId:'delegate',reason:'Assign the actual authorized fictional technical responder.'});
 const event=f.sqlite.prepare("SELECT id FROM service_incident_events WHERE incident_id=? AND action='assign'").get(opened.incidentId)!;
 assert.equal(await resolve(f.db,'delegate','service_incident_event',String(event.id),f.now),'/admin/system-health/incidents?incident='+opened.incidentId);
 assert.equal(notificationDestination('staff','staff','email_service_health',opened.incidentId),'/admin/system-health/incidents?incident='+opened.incidentId);
 assert.equal(await resolve(f.db,'customer','service_incident_event',String(event.id),f.now),null);
 f.sqlite.prepare("UPDATE users SET status='disabled' WHERE id='delegate'").run();
 assert.equal(await resolve(f.db,'delegate','service_incident_event',String(event.id),f.now),null);
 }finally{f.dispose();}
});
