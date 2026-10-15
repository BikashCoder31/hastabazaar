import {validateLoyaltyTerms,loyaltyInteger} from './loyalty-policy';
import type {LoyaltyTerms,LoyaltyDenomination} from './types';

export interface StoredLoyaltyEffectiveState {
  version:number;currentRevision:number;currentTerms:LoyaltyTerms;paused:boolean;
  scheduledRevision:number|null;scheduledFor:number|null;scheduledTerms:LoyaltyTerms|null;scheduledUnpause:boolean;
  issuedPoints:number;maximumIssuedDayPoints:number;lockedDenomination:LoyaltyDenomination|null;
}
export interface LoyaltyPromotion {
  fromVersion:number;toVersion:number;fromRevision:number;revision:number;scheduledFor:number;unpause:boolean;
}
/** Read-only projection. The next version is reserved until a guarded mutation persists it. */
export function resolveEffectiveLoyaltyState(stored:StoredLoyaltyEffectiveState,now:number) {
  loyaltyInteger(now,0,253402300799999);
  const base={version:stored.version,revision:stored.currentRevision,terms:stored.currentTerms,paused:stored.paused,
    scheduledRevision:stored.scheduledRevision,scheduledFor:stored.scheduledFor,scheduledTerms:stored.scheduledTerms,
    scheduledUnpause:stored.scheduledUnpause,scheduleBlockedReason:null as string|null,promotion:null as LoyaltyPromotion|null};
  if(stored.scheduledRevision===null||stored.scheduledFor===null||now<stored.scheduledFor)return base;
  let reason:string|null=null;
  try {
    if(!stored.scheduledTerms||stored.scheduledTerms.startsAt!==stored.scheduledFor)throw new Error();
    const terms=validateLoyaltyTerms(stored.scheduledTerms);
    if(terms.lifetimeBudgetPoints!<stored.issuedPoints||terms.dailyBudgetPoints!<stored.maximumIssuedDayPoints)
      reason='The scheduled limits are below points already issued. Cancel this change, review the shared limits and publish a new draft.';
    else if(stored.lockedDenomination&&(terms.pointsPerBlock!==stored.lockedDenomination.pointsPerBlock||terms.creditPaisaPerBlock!==stored.lockedDenomination.creditPaisaPerBlock))
      reason='Points were issued after this change was scheduled and locked a different conversion. Cancel this change and keep the locked conversion in a new draft.';
    else loyaltyInteger(stored.version+1,1);
  }catch{reason='The scheduled rules need review before earning can continue. Cancel the scheduled change and review a new draft.';}
  if(reason)return {...base,scheduleBlockedReason:reason};
  const promotion:LoyaltyPromotion={fromVersion:stored.version,toVersion:stored.version+1,fromRevision:stored.currentRevision,
    revision:stored.scheduledRevision,scheduledFor:stored.scheduledFor,unpause:stored.scheduledUnpause};
  return {version:promotion.toVersion,revision:promotion.revision,terms:stored.scheduledTerms!,paused:!promotion.unpause,
    scheduledRevision:null,scheduledFor:null,scheduledTerms:null,scheduledUnpause:false,scheduleBlockedReason:null,promotion};
}
