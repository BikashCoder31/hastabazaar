import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';

/** @deprecated Read-only identifier retained for old audit/test references. */
export const sellerCommissionSettingKey = 'independent_seller_commission_bps';

export interface CommissionSetting {
  basisPoints: number;
  percent: number;
  updatedAt: number | null;
  updatedByName: string | null;
  versionId: string | null;
  effectiveFrom: number | null;
}

export async function getMarketplaceCommissionBps(database:D1Database,at=Date.now()):Promise<number>{
  return (await getEffectiveBusinessSetting(database,'independent_seller_commission_bps',at)).value;
}

export async function getCommissionSetting(database:D1Database,at=Date.now()):Promise<CommissionSetting>{
  const setting=await getEffectiveBusinessSetting(database,'independent_seller_commission_bps',at);
  const actor=setting.approvedBy?await database.prepare('SELECT display_name AS name FROM users WHERE id=?').bind(setting.approvedBy).first<{name:string}>():null;
  return {basisPoints:setting.value,percent:setting.value/100,updatedAt:setting.effectiveFrom,updatedByName:actor?.name??null,versionId:setting.versionId,effectiveFrom:setting.effectiveFrom};
}

export async function setMarketplaceCommission(database:D1Database,options:{basisPoints:number;actorId:string;requestId:string;now:number;reason:string}):Promise<void>{
  void database;void options;
  throw new RangeError('Marketplace commission is managed only through controlled Business Settings.');
}

export async function sellerAcceptedCommissionVersion(database:D1Database,sellerId:string,versionId:string|null):Promise<boolean>{
  if(versionId===null)return true;
  return Boolean(await database.prepare('SELECT 1 FROM seller_agreement_acceptance_history WHERE seller_id=? AND commission_setting_version_id=? LIMIT 1').bind(sellerId,versionId).first());
}
