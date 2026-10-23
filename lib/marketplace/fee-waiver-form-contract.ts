import type { FormDefinition } from '../forms/types';

export const FEE_WAIVER_FORM: FormDefinition = Object.freeze({
  id: 'staff.fee-waivers',
  adapterId: 'staff.fee-waivers',
  route: '/api/admin/customer-fee-waivers',
  mode: 'system',
  audience: 'super_admin',
  baseFields: Object.freeze(
    [
      'feeTarget',
      'command',
      'name',
      'description',
      'startsAt',
      'endsAt',
      'campaignId',
      'expectedRevision',
      'requestId',
    ].map((key) => ({
      key,
      label: key,
      type: 'existing',
      capability: 'protected' as const,
      explanation:
        'Live Super Admin access, campaign windows, immutable revisions and concurrency checks are enforced by the feature.',
    })),
  ),
  capabilities: Object.freeze({
    customFieldTypes: Object.freeze([]),
    answerBehavior: 'none',
    explanation:
      'Feature-managed customer service fee waivers require no form publication. Typed campaign changes and audit events are saved by the native handler; generic answers and configurable fields are not collected.',
  }),
});
