import test from 'node:test';
import assert from 'node:assert/strict';
import {completeVersionFixture} from './helpers/complete-version-fixture';
import {captureDatabaseHealthScope} from '../lib/db/health-context';
import {createIncident,executeIncidentCommand,readIncident} from '../lib/operations/incident-review';
import {processReminderDispatch} from '../lib/operations/reminder-dispatch';
import {isCurrentReminderNotice,reminderOperationalSource} from '../lib/operations/reminder-notice-sources';
import {resolveReminderDestination} from '../lib/operations/reminder-destination';

void test('bounded incident scan retains original targets, sends each due milestone once and suppresses superseded updates',async()=>{
 const f=await completeVersionFixture(Date.now());let now=f.now;try{
 captureDatabaseHealthScope(f.db,{HASTABAZAAR_RUNTIME_ENV:'test',NODE_ENV:'test',APP_ORIGIN:'http://localhost:3018',HASTABAZAAR_RELEASE_ID:'fixture-reminders'});
 f.sqlite.prepare("UPDATE staff_permission_profiles SET permissions_json='[\"system.incidents.manage\"]',version=version+1 WHERE user_id='delegate'").run();
 f.sqlite.function('strftime',{varargs:true},(...args)=>String(args[0])==='%s'?String(Math.floor(now/1000)):(now%60000/1000).toFixed(3).padStart(6,'0'));
 const opened=await createIncident(f.db,{actorId:'reviewer',requestId:'due-case',expectedRevision:null,now},{environment:'test',serviceKey:'application.availability',failureSignature:'fixture-response',title:'Fictional service unavailable',impactSummary:'The fictional service needs actual investigation.',impactClass:'ordinary',severity:'critical'});
 const scan=async()=>{const result=await processReminderDispatch(f.db,{now,limit:100});assert.deepEqual(result.failures,[]);return result;};
 now+=8*60_000;await scan();await scan();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE family='system_incident' AND milestone='unclaimed_midpoint'").get()!.n,1);
 let row=await readIncident(f.db,'reviewer',opened.incidentId,'test',now);
 await executeIncidentCommand(f.db,{actorId:'reviewer',requestId:'due-assignment',expectedRevision:row.version,now},{incidentId:row.id,action:'assign',ownerId:'delegate',reason:'The eligible fictional responder accepts responsibility.'});
 now=f.now+15*60_000;await scan();await scan();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE family='system_incident' AND milestone='acknowledge_due'").get()!.n,1);
 row=await readIncident(f.db,'reviewer',row.id,'test',now);
 await executeIncidentCommand(f.db,{actorId:'delegate',requestId:'due-ack',expectedRevision:row.version,now},{incidentId:row.id,action:'acknowledge',reason:'The named responder acknowledges the original incident.'});
 now=f.now+60*60_000;await scan();await scan();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE family='system_incident' AND milestone='plan_due'").get()!.n,1);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE family='system_incident' AND milestone='promised_update'").get()!.n,0);
 row=await readIncident(f.db,'reviewer',row.id,'test',now);
 await executeIncidentCommand(f.db,{actorId:'delegate',requestId:'due-first-plan',expectedRevision:row.version,now},{incidentId:row.id,action:'plan',plan:'Contain the affected workflow while preserving the original work.',nextAction:'Verify the current affected function.',nextUpdateAt:now+60*60_000,reason:'Record a real containment plan and the next update target.'});
 now+=60*60_000;await scan();await scan();
 const updates=f.sqlite.prepare("SELECT template_key template,related_id relatedId,related_type relatedType,recipient_user_id userId,audience_role audience,channel,request_id requestId,required_permission requiredPermission FROM notification_messages n JOIN operational_reminder_milestones m ON m.id=n.related_id WHERE m.family='system_incident' AND m.milestone='promised_update' AND n.recipient_user_id='delegate' AND n.channel='in_app'").all();
 assert.equal(updates.length,1);
 assert.equal(await resolveReminderDestination(f.db,'delegate',String(updates[0].relatedId),'staff',now),'/admin/system-health/incidents?incident='+row.id);
 const pending=await reminderOperationalSource(f.db,{kind:'workflow.reminder',sourceId:String(updates[0].relatedId),eventId:String(updates[0].relatedId),now});assert.ok(pending);
 f.sqlite.prepare("INSERT INTO team_availability(id,user_id,starts_at,ends_at,available,reason,actor_id,created_at,revision) VALUES('reminder-absence','delegate',?,?,0,'Fictional absence before routing resumes','reviewer',?,0)").run(now,now+3600000,now);
 assert.equal(await isCurrentReminderNotice(f.db,updates[0] as never,now),false,'Current absence suppresses queued notices before bounded rerouting.');
 assert.equal(await f.db.prepare('SELECT 1 FROM users u WHERE u.id=? AND '+pending.staffGuard).bind('delegate',...pending.staffGuardValues??[]).first(),null,'The already prepared recipient SQL rechecks availability at commit.');
 f.sqlite.prepare("INSERT INTO team_availability(id,user_id,starts_at,ends_at,available,reason,actor_id,created_at,revision) VALUES('reminder-return','delegate',?,?,1,'Fictional early return retains prior absence','reviewer',?,1)").run(now,now+3600000,now);
 row=await readIncident(f.db,'reviewer',row.id,'test',now);
 await executeIncidentCommand(f.db,{actorId:'delegate',requestId:'due-new-plan',expectedRevision:row.version,now},{incidentId:row.id,action:'plan',plan:'Contain the affected workflow while retaining all original requests.',nextAction:'Verify the matching function with actual evidence.',nextUpdateAt:now+60*60_000,reason:'Record the next substantive response and a real future update.'});
 assert.equal(await isCurrentReminderNotice(f.db,updates[0] as never,now),false);
 await scan();
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones WHERE family='system_incident' AND milestone='unclaimed_midpoint'").get()!.n,1);
 assert.equal(f.sqlite.prepare("SELECT started_at FROM review_tasks WHERE source_type='system_incident' AND source_id=?").get(row.id)!.started_at,f.now);
 assert.equal(f.sqlite.prepare("SELECT COUNT(*) n FROM operational_reminder_milestones m JOIN review_tasks r ON r.id=m.source_id WHERE m.family='review_task' AND r.source_type='system_incident'").get()!.n,0);
 }finally{f.dispose();}
});
