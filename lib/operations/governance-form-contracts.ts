import type {FormDefinition} from '../forms/types';

function protectedOperation(id:string,route:string,keys:readonly string[]):FormDefinition {
  return Object.freeze({
    id,adapterId:id,route,mode:'operation',audience:'staff',
    baseFields:Object.freeze(keys.map(key=>({key,label:key,type:'existing',capability:'protected' as const,
      explanation:'Current authority, original clocks, saved versions and recovery evidence remain server controlled.'}))),
    capabilities:Object.freeze({customFieldTypes:Object.freeze([]),answerBehavior:'none',
      explanation:'These controls cannot grant access through an assignment, alter business decisions or replace recovery evidence.'}),
  });
}

export const TEAM_GOVERNANCE_FORM=protectedOperation('staff.team-governance','/api/admin/team/governance',[
  'action','sourceId','expectedRevision','reason','primaryId','backupIds','startsAt','endsAt','available','toUserId',
  'title','body','userIds','nextAction','permissions','requestId','formVersion','customAnswers',
]);

export const INCIDENT_REVIEW_FORM=protectedOperation('staff.incident-review','/api/admin/system-health/incidents',[
  'action','incidentId','expectedRevision','ownerId','backupId','impactClass','impactSummary','severity','title',
  'serviceKey','failureSignature','releaseReference','configurationReference','plan','nextAction','nextUpdateAt',
  'resolutionCause','reason','sourceType','sourceId','targetIncidentId','legacyId','expectedLegacyUpdatedAt','requestId','formVersion','customAnswers',
]);

export const GOVERNANCE_FORM_CONTRACTS=Object.freeze({
  [TEAM_GOVERNANCE_FORM.id]:TEAM_GOVERNANCE_FORM,
  [INCIDENT_REVIEW_FORM.id]:INCIDENT_REVIEW_FORM,
});
