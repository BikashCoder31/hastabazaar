import type { FormDefinition } from '../forms/types';

/** Fixed financial control. Its record is the lawful refund audit event. */
export const SERVICE_FEE_REFUND_FORM:FormDefinition=Object.freeze({
  id:'system.platform-service-fee-refund',adapterId:'system.platform-service-fee-refund',
  route:'/api/admin/platform-service-fee-refunds',mode:'system',audience:'super_admin',
  baseFields:Object.freeze(['orderId','amountPaisa','legalBasis','caseReference','paymentReference','requestId'].map(key=>({
    key,label:key,type:'existing',capability:'protected' as const,
    explanation:'Current Super Admin, recorded fee capacity, legal basis and completed payment evidence are enforced by the server. These checks cannot be changed in Form Catalog.',
  }))),
  capabilities:Object.freeze({customFieldTypes:Object.freeze([]),answerBehavior:'none',
    explanation:'Fixed Super Admin financial control. The server saves a typed lawful fee refund audit event, not configurable form answers. No publication or arbitrary custom fields are supported; existing refund and wallet guards remain enforced.',
  }),
});
