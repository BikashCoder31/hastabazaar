import assert from 'node:assert/strict';

/** Fictional rows only, inside the caller's fresh owned Maria fixture database. */
export async function verifyT29MariaConstraints(connection) {
 const passed=[];
 const run=(sql)=>connection.query(sql);
 const reject=async(name,sql,pattern)=>{await assert.rejects(run(sql),pattern);passed.push(name);};
 await run("INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at) VALUES('a','order','q','claim',1,'claimed','message',100)");
 await reject('unique claim',"INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at) VALUES('b','order','other','claim',1,'claimed','other',100)",/Duplicate entry/);
 await reject('unique attempt identity',"INSERT INTO email_delivery_attempts(id,queue_kind,queue_id,claim_token,attempt_number,phase,message_id,started_at) VALUES('b','order','q','claim2',1,'claimed','other',100)",/Duplicate entry/);
 await reject('identity immutable',"UPDATE email_delivery_attempts SET message_id='replacement' WHERE id='a'",/delivery_attempt_identity_immutable/);
 await run("UPDATE email_delivery_attempts SET phase='accepted',transport='provider',provider_receipt='fictional-provider-receipt',completed_at=110 WHERE id='a'");
 await reject('accepted phase retained',"UPDATE email_delivery_attempts SET phase='not_accepted' WHERE id='a'",/delivery_acceptance_immutable/);
 await reject('accepted receipt retained',"UPDATE email_delivery_attempts SET provider_receipt=NULL WHERE id='a'",/delivery_acceptance_immutable/);
 await reject('attempt deletion denied',"DELETE FROM email_delivery_attempts WHERE id='a'",/delivery_attempt_retained/);
 await run("INSERT INTO operational_reminder_milestones VALUES('m','family','source','due','revision',100,100)");
 await reject('reminder identity unique',"INSERT INTO operational_reminder_milestones VALUES('m2','family','source','due','revision',100,100)",/Duplicate entry/);
 await reject('reminder immutable',"UPDATE operational_reminder_milestones SET due_at=101 WHERE id='m'",/reminder_milestone_immutable/);
 await run("INSERT INTO service_health_observations(id,environment,service_key,run_key,observed_at,successful,functional_success,eligible_backlog,source_kind) VALUES('ob','test','sender','run',100,1,1,0,'sender')");
 await reject('observation identity unique',"INSERT INTO service_health_observations(id,environment,service_key,run_key,observed_at,successful,eligible_backlog,source_kind) VALUES('ob2','test','sender','run',100,1,0,'sender')",/Duplicate entry/);
 await reject('functional observation immutable',"UPDATE service_health_observations SET functional_success=0 WHERE id='ob'",/service_health_observation_immutable/);
 await reject('functional boolean guard',"INSERT INTO service_health_observations(id,environment,service_key,run_key,observed_at,successful,functional_success,eligible_backlog,source_kind) VALUES('bad','test','sender','bad',100,1,2,0,'sender')",/CONSTRAINT/);
 await reject('atomic health guard',"INSERT INTO service_health_guards VALUES('invalid',0)",/CONSTRAINT/);
 await run("INSERT INTO service_health_guards VALUES('valid',1)");
 await run("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('incident','test','sender',1,'detected',100,100)");
 await reject('one open episode per environment',"INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('incident2','test','sender',2,'detected',100,100)",/Duplicate entry/);
 await run("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('independent','local_staging','sender',1,'detected',100,100)");
 await reject('incident retained identity',"UPDATE service_health_incidents SET environment='development' WHERE id='incident'",/service_health_incident_identity_immutable/);
 await run("UPDATE service_health_incidents SET state='resolved',resolved_at=200 WHERE id='incident'");
 await run("INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('next','test','sender',2,'detected',201,201)");
 await reject('episode history unique',"INSERT INTO service_health_incidents(id,environment,service_key,episode,state,first_seen_at,last_seen_at) VALUES('duplicate-history','test','sender',1,'resolved',100,200)",/Duplicate entry/);
 const [rows]=await run("SELECT phase,transport,provider_receipt FROM email_delivery_attempts WHERE id='a'");
 assert.deepEqual({...rows[0]},{phase:'accepted',transport:'provider',provider_receipt:'fictional-provider-receipt'});
 return {passed:passed.length,assertions:passed,independentEnvironmentAccepted:true,resolvedEpisodeSuccessorAccepted:true,acceptancePreserved:true};
}
