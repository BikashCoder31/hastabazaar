import type { PayoutOperation } from '@/lib/db/repositories/payouts';

/** Presentation only. The API and repository independently enforce these controls. */
export function availablePayoutActions(
  status: string,
  access: { canApprove: boolean; canProcess: boolean; isPreparer: boolean },
): readonly PayoutOperation[] {
  if (status === 'prepared' || status === 'scheduled')
    return access.canApprove ? ['approve', 'reject'] : [];
  if (!access.canProcess) return [];
  if (status === 'approved' || status === 'failed') return ['start_processing'];
  if (status === 'processing') return ['mark_paid', 'mark_failed'];
  return [];
}
