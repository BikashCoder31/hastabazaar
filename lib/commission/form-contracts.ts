import type {FormDefinition,FormAudience} from '../forms/types';
const native=(id:string,route:string,audience:FormAudience,fields:string[]):FormDefinition=>Object.freeze({id,adapterId:id,route,mode:'system',audience,baseFields:Object.freeze(fields.map(key=>({key,label:key,type:'existing',capability:'protected' as const,explanation:'Exact current source, actor authority, consent, elapsed clocks and retained command identity are native requirements.'}))),capabilities:Object.freeze({customFieldTypes:Object.freeze([]),answerBehavior:'none',explanation:'Fixed financial/terms control. Native policy, acceptance and follow-up events are authoritative; configurable questions cannot weaken or replace their guards.'})});
export const FEE_FORM_CONTRACTS:Readonly<Record<string,FormDefinition>>=Object.freeze({
 'system.common-fee-policy':native('system.common-fee-policy','/api/admin/common-fee-policy','super_admin',['action','requestId','expectedContext','reason','basisPoints','effectiveAt','replacesId','policyId']),
 'system.fee-terms-acceptance':native('system.fee-terms-acceptance','/api/seller/fee-terms','seller',['requestId','versionId','context','accepted']),
 'system.fee-terms-followup':native('system.fee-terms-followup','/api/admin/fee-terms-followup','staff',['caseId','action','technicalOwnerId','outcome','note','nextAction','nextUpdateAt','requestId','expectedRevision']),
});
