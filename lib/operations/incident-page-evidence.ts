import type {requireStaffPage} from '../auth/staff';
import {can} from '../marketplace/permissions';
import {readEmailHealthRuntimeConfig} from './email-delivery-overview';
import {listIncidents,readIncident,listLegacyIncidentMappings,incidentResponderOptions} from './incident-review';
import {teamUserAvailable} from './team-governance';

/** Read one request-time snapshot before rendering the incident page. */
export async function readIncidentPageEvidence(db:D1Database,actor:Awaited<ReturnType<typeof requireStaffPage>>,runtime:Parameters<typeof readEmailHealthRuntimeConfig>[0],incidentId?:string){
 const now=Date.now(),scope=readEmailHealthRuntimeConfig(runtime,now);
 if(!scope.environment)return{available:false as const};
 const manage=can(actor,'system.incidents.manage');
 const [rows,detail,legacy,responders]=await Promise.all([
  listIncidents(db,actor.id,scope.environment,now),
  incidentId?readIncident(db,actor.id,incidentId,scope.environment,now):Promise.resolve(null),
  listLegacyIncidentMappings(db,actor.id),
  manage?incidentResponderOptions(db,actor.id):Promise.resolve([]),
 ]);
 const canAct=manage&&(actor.role==='super_admin'||!!detail&&(detail.ownerId===actor.id||detail.backupId===actor.id||detail.ownerId===null)&&await teamUserAvailable(db,actor.id,now));
 return{available:true as const,environment:scope.environment,rows,detail,legacy,responders,manage,canAct};
}
