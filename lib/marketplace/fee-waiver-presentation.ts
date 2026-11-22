import { selectFeeWaiver, type FeeWaiverCampaign } from './fee-waivers';

export function feeWaiverDisplayState(
  campaign: FeeWaiverCampaign,
  now: number,
) {
  if (campaign.state === 'ended' || campaign.endsAt <= now) return 'ended';
  if (campaign.state !== 'published') return campaign.state;
  return campaign.startsAt > now ? 'scheduled' : 'active';
}
export function presentFeeWaiverState(
  state: { revision: number; campaigns: FeeWaiverCampaign[] },
  evaluatedAt: number,
) {
  return {
    ...state,
    evaluatedAt,
    selectedCampaignId:
      selectFeeWaiver(state.campaigns, evaluatedAt)?.id ?? null,
    campaigns: state.campaigns.map((c) => ({
      ...c,
      displayState: feeWaiverDisplayState(c, evaluatedAt),
    })),
  };
}
