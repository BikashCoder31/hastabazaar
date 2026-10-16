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

export class SellerCommissionTermsChangedError extends Error {}
export async function getRegisteredSellerTerms(database: D1Database, now=Date.now()) {
  const setting=await getCommissionSetting(database,now);
  const {getLegalPolicyDocument,SELLER_AGREEMENT_VERSION}=await import('../../content/legal-policies');
  const document=getLegalPolicyDocument('seller-agreement',setting.basisPoints);
  const snapshot={agreementVersion:SELLER_AGREEMENT_VERSION,commissionSettingVersionId:setting.versionId,commissionBps:setting.basisPoints,document};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(snapshot)));
  const context=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('');
  return {...setting,document,context,agreementVersion:SELLER_AGREEMENT_VERSION};
}
export type RegisteredSellerTerms = Awaited<ReturnType<typeof getRegisteredSellerTerms>>;
export async function prepareSellerCommissionAcceptance(database: D1Database, options: {sellerId:string;actorId:string;context:string;requestId:string;now:number;language?:'en'|'ne';mode?:'application'|'approved_seller'|'managed_transition';transitionId?:string;acceptedAt?:number}) {
  const terms=await getRegisteredSellerTerms(database,options.now);
  if (options.context!==terms.context) throw new SellerCommissionTermsChangedError('Seller commission terms have changed. Reload and review the current terms before accepting.');
  const guardId=crypto.randomUUID();
  return {terms,statements: [
    database.prepare('/* seller-commission-lock */ SELECT id FROM seller_profiles WHERE user_id=? AND id=?').bind(options.actorId,options.sellerId),
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN COALESCE((SELECT id FROM business_setting_versions WHERE setting_key='independent_seller_commission_bps' AND status='published'
        AND effective_from<=? AND (effective_until IS NULL OR effective_until>?) ORDER BY effective_from DESC,version DESC LIMIT 1),'')=? AND EXISTS(SELECT 1 FROM users u JOIN seller_profiles s ON s.user_id=u.id WHERE u.id=? AND u.status='active' AND s.id=? AND (
          (?='approved_seller' AND s.status='approved' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller'))
          OR (?='application' AND s.status='submitted' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='customer')
            AND EXISTS(SELECT 1 FROM audit_logs a WHERE a.actor_id=u.id AND a.subject_type='user' AND a.subject_id=u.id AND a.action='seller.registration.started'))
          ${options.mode==='managed_transition'?`OR (?='managed_transition' AND s.status='approved' AND EXISTS(SELECT 1 FROM seller_route_transition_applications t
            JOIN seller_participation_profiles p ON p.seller_id=t.seller_id WHERE t.id=? AND t.seller_id=s.id AND t.requested_by=u.id
              AND t.status='applied' AND t.applied_at=? AND t.reviewed_by<>u.id AND p.participation_route='registered_seller'
              AND json_extract(t.registered_terms_snapshot_json,'$.context')=?
              AND json_extract(t.registered_terms_snapshot_json,'$.acceptedAt')=?))`:''}
        )) THEN 1 ELSE 0 END`).bind(guardId,options.now,options.now,terms.versionId??'',options.actorId,options.sellerId,options.mode??'approved_seller',options.mode??'approved_seller',...(options.mode==='managed_transition'?[options.mode,options.transitionId??'',options.now,options.context,options.acceptedAt??options.now]:[])),
    database.prepare(`INSERT INTO seller_agreement_acceptance_history(id,seller_id,agreement_version,language_presented,commission_setting_version_id,commission_bps,acceptance_request_id,accepted_by,accepted_at,simulation_label)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),options.sellerId,terms.agreementVersion,options.language??'en',terms.versionId,terms.basisPoints,options.requestId,options.actorId,options.mode==='managed_transition'?(options.acceptedAt??options.now):options.now,options.mode==='managed_transition'?'SIMULATED — NOT VALID FOR PRODUCTION':null),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId),
  ]};
}

export async function buildSellerCommissionAcceptanceStatements(database: D1Database,options: Parameters<typeof prepareSellerCommissionAcceptance>[1]) {
  return (await prepareSellerCommissionAcceptance(database,options)).statements;
}
