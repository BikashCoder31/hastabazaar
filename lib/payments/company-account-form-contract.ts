import type {FormDefinition} from '../forms/types';
export const COMPANY_BANK_ACCOUNT_FORM:FormDefinition=Object.freeze({
 id:'system.company-bank-account',adapterId:'system.company-bank-account',route:'/api/admin/company-bank-accounts',mode:'system',audience:'super_admin',
 baseFields:Object.freeze(['action','accountId','basedOnVersionId','versionId','expectedRevision','expectedReceivingRevision','requestId','details','holder','bank','branch','accountNumber','currency','purpose','evidenceReference','conflictUserIds','ownershipConfirmed','currencyConfirmed','verificationReference','reason'].map(key=>({key,label:key,type:'existing',capability:'protected' as const,explanation:'Current eligible Super Admin, exact private version, ownership/currency evidence, immutable instructions and command identity are native requirements.'}))),
 capabilities:Object.freeze({customFieldTypes:Object.freeze([]),answerBehavior:'none',explanation:'Fixed private banking control. Typed account versions and restricted evidence history are authoritative; full bank details must not enter general configurable answer history. No configurable custom questions or weakened native checks.'})
});
