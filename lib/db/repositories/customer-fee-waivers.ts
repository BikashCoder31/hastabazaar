import { customerServiceFeeCampaignCommands } from './fee-campaign-commands';
import type { FeeWaiverContext } from '../../marketplace/fee-waivers';
export {
  type FeeWaiverCampaign,
  type FeeWaiverCommand,
  type FeeWaiverContext,
} from '../../marketplace/fee-waivers';
export async function getCustomerFeeWaiverState(db: D1Database) {
  return {
    feeTarget: 'customer_service_fee' as const,
    ...(await customerServiceFeeCampaignCommands.getState(db)),
  };
}
export async function getAuthorizedCustomerFeeWaiverState(
  db: D1Database,
  actor: Pick<FeeWaiverContext, 'actorId' | 'authSubject'>,
) {
  return {
    feeTarget: 'customer_service_fee' as const,
    ...(await customerServiceFeeCampaignCommands.getAuthorizedState(db, actor)),
  };
}
export const mutateCustomerFeeWaiver =
  customerServiceFeeCampaignCommands.mutate;
