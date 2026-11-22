import type { FormDefinition } from '../forms/types';

/** Native query controls: no publication, saved answers or configurable fields. */
export const ACCOUNTING_FILTER_FORM: FormDefinition = Object.freeze({
  id: 'staff.accounting-report-filter',
  adapterId: 'staff.accounting-report-filter',
  route: '/admin/accounting',
  mode: 'query',
  audience: 'super_admin',
  baseFields: Object.freeze(
    ['section', 'period', 'from', 'to', 'pageSize', 'cursor'].map((key) => ({
      key,
      type: 'existing',
      label: key,
      capability: 'protected' as const,
      explanation:
        'The native read-only report validates Nepal dates and current Super Admin access. These controls cannot change financial records or source settings.',
    })),
  ),
  capabilities: Object.freeze({
    explanation:
      'These native filters select existing Accounting records. No answers, financial changes or published form configuration are created.',
    customFieldTypes: Object.freeze([]),
    answerBehavior: 'query',
  }),
});
