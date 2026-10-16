export const managedFinanceActions = {
  release_eligibility: { formId: 'staff.managed-eligibility-release', permission: 'payout.prepare', keys: ['reason'] },
  prepare_sale_linked_payout: { formId: 'staff.managed-payout-preparation', permission: 'payout.prepare',
    keys: ['reason', 'destinationReference', 'scheduledFor', 'expectedAmountPaisa', 'expectedSnapshot'] },
  approve_sale_linked_payout: { formId: 'staff.managed-payout-action', permission: 'payout.approve', keys: ['reason', 'payoutId', 'expectedStatus'] },
  record_sale_linked_payment: { formId: 'staff.managed-payout-action', permission: 'payout.mark_paid',
    keys: ['reason', 'payoutId', 'expectedStatus', 'providerReference'] },
  cancel_sale_linked_payout: { formId: 'staff.managed-payout-action', permission: 'payout.approve', keys: ['reason', 'payoutId', 'expectedStatus'] },
} as const;
export type ManagedFinanceAction = keyof typeof managedFinanceActions;
export function managedFinanceAction(value: unknown) {
  return typeof value === 'string' && Object.hasOwn(managedFinanceActions, value)
    ? managedFinanceActions[value as ManagedFinanceAction] : null;
}
export const managedFinanceBaseKeys = ['action', 'reason', 'sellerId', 'actorId', 'payoutId', 'expectedStatus',
  'destinationReference', 'scheduledFor', 'expectedAmountPaisa', 'expectedSnapshot', 'providerReference',
  'amountPaisa', 'balancePaisa', 'requestId', 'formVersion', 'customAnswers'] as const;
