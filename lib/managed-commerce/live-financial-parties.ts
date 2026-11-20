import {paymentGuard} from '../payments/manual-receipts';
import {ManagedLiveFinancialError} from './live-financial-errors';

import {liveSnapshotPartySql} from './live-financial-party-sql';
export {liveSnapshotPartySql,liveInvoicePartySql,livePayoutPartySql} from './live-financial-party-sql';

/** IDs must be the exact domain-selected sources, never an arbitrary browser selection. */
export async function liveManagedEntitlementPartyAuthority(db:D1Database,input:{sellerId:string;actorId:string;entitlementIds:readonly string[]}){
 const current='EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id<>?)',currentValues=[input.sellerId,input.actorId];
 if(!await db.prepare('SELECT 1 WHERE '+current).bind(...currentValues).first())throw new ManagedLiveFinancialError('An eligible operator without a current seller interest is required.',403);
 const guards=paymentGuard(db,current,currentValues);
 for(const id of new Set(input.entitlementIds)){
  const predicate=`NOT EXISTS(SELECT 1 FROM managed_entitlements e JOIN managed_commercial_snapshots original_party ON original_party.id=e.snapshot_id WHERE e.id=? AND e.seller_id=? AND ${liveSnapshotPartySql('original_party')})`,values=[id,input.sellerId,...Array.from({length:4},()=>input.actorId)];
  if(!await db.prepare('SELECT 1 WHERE '+predicate).bind(...values).first())throw new ManagedLiveFinancialError('An eligible operator without a current or retained maker/customer interest in these exact original earnings is required.',403);
  guards.push(...paymentGuard(db,predicate,values));
 }
 return {guards,entitlementIds:[...input.entitlementIds]};
}
