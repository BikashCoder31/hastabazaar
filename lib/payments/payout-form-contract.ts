import type {FormDefinition} from '../forms/types';
export const PAYOUT_FINANCE_FORM:FormDefinition=Object.freeze({
 id:'system.payout-finance',adapterId:'system.payout-finance',route:'/api/admin/payout-transfers',mode:'system',audience:'staff',
 baseFields:Object.freeze(['sourceFormId','requestId','expectedRevision','action','input','model','payoutId','packetId','accountVersionId','reason','evidenceReference','amountPaisa','bankAt','transactionIdentity','completedTransferConfirmed','exactBeneficiaryConfirmed','failureBasis','noDebitConfirmed','returnedAmountPaisa','returnedDebitConfirmed','notSentConfirmed','outcome'].map(key=>({key,label:key,type:'existing',capability:'protected' as const,explanation:'Original entitlement, verified bank/identity versions, shared funding, current authority, actual outcomes and exact recovery remain native controls.'}))),
 capabilities:Object.freeze({customFieldTypes:Object.freeze([]),answerBehavior:'none',explanation:'Sensitive payout evidence stays in private original source records; system execution controls cannot be weakened through configurable forms.'}),
});
