import type {SellerRecoverySource} from './seller-recovery';

export type HistoricalRecoveryKind='registered_refund_group'|'managed_allocation'|'managed_legacy_group';
export interface HistoricalRecoveryCandidate {
 kind:HistoricalRecoveryKind;payoutId:string;scopeId:string;capacityPaisa:number;nativeProof:boolean;
}
export interface HistoricalRecoveryState {
 candidates:(HistoricalRecoveryCandidate&{attributedPaisa:number;caseAttributedPaisa:number;caseCompanyAttributedPaisa:number})[];
 recognizedPaisa:number;recordedPaisa:number;companyAttributedPaisa:number;complete:boolean;
}

/** Native identities, not a per-refund estimate. A managed allocation is one shared
 * pool even when several original refunds affected its entitlement. These facts
 * alone do not record collection, consent or authority for future deductions.
 * SQL expressions below are internal source aliases, never request input.
 */
export function historicalRecoveryCandidatesSql(model:'registered'|'managed',refund:string,seller:string){
 const bankProof=(column:string)=>`(SELECT COUNT(*) FROM payout_transfer_packets t
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa
   AND bank.account_version_id=t.account_version_id
  WHERE t.${column}=p.id AND t.payout_model='${model}' AND t.seller_id=p.seller_id
   AND t.state='paid' AND t.amount_paisa=p.amount_paisa)=1`;
 if(model==='registered')return `SELECT * FROM (
  SELECT 'registered_refund_group' AS kind,p.id AS payoutId,${refund} AS scopeId,
   -SUM(x.amount_paisa)-COALESCE((SELECT SUM(credit.amount_paisa)
    FROM payout_entries included JOIN seller_ledger_entries credit ON credit.id=included.ledger_entry_id
    WHERE included.payout_id=p.id AND included.released_at IS NULL AND credit.seller_id=p.seller_id
     AND (credit.type='recovery_source_compensation' AND credit.refund_id=${refund} OR EXISTS(SELECT 1 FROM seller_recovery_cases c WHERE c.refund_id=${refund} AND (
      EXISTS(SELECT 1 FROM seller_recovery_allocations a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_reductions a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id)
      OR EXISTS(SELECT 1 FROM seller_recovery_liability_corrections a WHERE a.case_id=c.id AND a.registered_credit_id=credit.id))))),0) AS capacityPaisa,
   (${bankProof('registered_payout_id')}
    AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
    AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
    AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
    AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
      WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>p.seller_id)) AS nativeProof
  FROM seller_ledger_entries x JOIN payout_entries pe ON pe.ledger_entry_id=x.id JOIN payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=${refund} AND x.seller_id=${seller} AND p.seller_id=${seller}
   AND x.type IN('refund','commission_reversal') AND pe.released_at IS NULL AND p.status='paid'
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0`;
 const nativeProof=`(${bankProof('managed_payout_id')}
  AND COALESCE((SELECT SUM(a.amount_paisa) FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=entry.entitlement_id AND a.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a JOIN managed_entitlements e ON e.id=a.entitlement_id
    WHERE a.payout_id=p.id AND a.disposition='paid' AND e.seller_id<>p.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>p.seller_id))`;
 return `SELECT * FROM (
  SELECT 'managed_allocation' AS kind,p.id AS payoutId,a.entitlement_id AS scopeId,-a.amount_paisa AS capacityPaisa,${nativeProof} AS nativeProof
  FROM managed_payout_allocations a JOIN managed_payouts p ON p.id=a.payout_id
  WHERE a.amount_paisa<0 AND a.disposition='paid' AND p.status='paid' AND p.seller_id=${seller}
   AND EXISTS(SELECT 1 FROM managed_settlement_entries x WHERE x.entitlement_id=a.entitlement_id AND x.refund_id=${refund} AND x.amount_paisa<0 AND x.created_at<=p.created_at)
  UNION ALL
  SELECT 'managed_legacy_group' AS kind,p.id AS payoutId,${refund} AS scopeId,-SUM(x.amount_paisa) AS capacityPaisa,${nativeProof} AS nativeProof
  FROM managed_payout_entries pe JOIN managed_settlement_entries x ON x.id=pe.settlement_entry_id JOIN managed_payouts p ON p.id=pe.payout_id
  WHERE x.refund_id=${refund} AND p.seller_id=${seller} AND p.status='paid'
   AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations a WHERE a.payout_id=p.id AND a.entitlement_id=x.entitlement_id AND a.disposition='paid')
  GROUP BY p.id,p.seller_id,p.amount_paisa
 ) historical_candidates WHERE capacityPaisa>0`;
}

export async function readHistoricalRecoveryCandidates(db:D1Database,source:Pick<SellerRecoverySource,'kind'|'id'|'sellerId'|'model'>):Promise<HistoricalRecoveryCandidate[]>{
 if(source.kind!=='refund'||source.model==='fixed')return [];
 const sql=historicalRecoveryCandidatesSql(source.model,'(SELECT refundId FROM requested_source)','(SELECT sellerId FROM requested_source)');
 const rows=await db.prepare(`WITH requested_source AS(SELECT ? AS refundId,? AS sellerId) ${sql} ORDER BY kind,payoutId,scopeId`).bind(source.id,source.sellerId).all<Omit<HistoricalRecoveryCandidate,'nativeProof'>&{nativeProof:number}>();
 return rows.results.map(row=>{
  if(!Number.isSafeInteger(row.capacityPaisa)||row.capacityPaisa<=0)throw new Error('The historical native deduction needs exact-amount reconciliation.');
  return {...row,nativeProof:row.nativeProof===1};
 });
}

export async function readHistoricalRecoveryState(db:D1Database,source:SellerRecoverySource):Promise<HistoricalRecoveryState|null>{
 if(source.kind!=='refund'||source.model==='fixed')return null;
 const row=await db.prepare(`SELECT c.id,c.historical_recovered_paisa AS recordedPaisa,
  COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_historical_attributions h WHERE h.case_id=c.id),0) AS recognizedPaisa,
  COALESCE((SELECT SUM(h.amount_paisa) FROM seller_recovery_company_deductions h WHERE h.case_id=c.id),0) AS companyAttributedPaisa,
  COALESCE((SELECT SUM(r.amount_paisa) FROM seller_recovery_source_reviews r WHERE r.case_id=c.id),0) AS compensatedPaisa,
  COALESCE((SELECT json_extract(r.source_json,'$.historicalCandidatePaisa') FROM seller_recovery_source_reviews r WHERE r.case_id=c.id),0) AS compensatedHistoryPaisa
  FROM seller_recovery_cases c WHERE c.source_kind='refund' AND c.source_id=?`).bind(source.id).first<{id:string;recordedPaisa:number;recognizedPaisa:number;companyAttributedPaisa:number;compensatedPaisa:number;compensatedHistoryPaisa:number}>();
 if(source.historicalNettingPaisa===0&&!row?.recordedPaisa&&!row?.recognizedPaisa&&!row?.companyAttributedPaisa)return null;
 const native=await readHistoricalRecoveryCandidates(db,source),candidates:HistoricalRecoveryState['candidates']=[];
 for(const candidate of native){
  const amounts=await db.prepare(`SELECT COALESCE(SUM(amount_paisa),0) AS attributedPaisa,
   COALESCE(SUM(CASE WHEN case_id=? AND use_kind='recovery' THEN amount_paisa ELSE 0 END),0) AS caseAttributedPaisa,
   COALESCE(SUM(CASE WHEN case_id=? AND use_kind='company' THEN amount_paisa ELSE 0 END),0) AS caseCompanyAttributedPaisa
   FROM seller_recovery_all_historical_uses WHERE kind=? AND payout_id=? AND scope_id=?`)
   .bind(row?.id??'',row?.id??'',candidate.kind,candidate.payoutId,candidate.scopeId).first<{attributedPaisa:number;caseAttributedPaisa:number;caseCompanyAttributedPaisa:number}>();
  candidates.push({...candidate,attributedPaisa:amounts?.attributedPaisa??0,caseAttributedPaisa:amounts?.caseAttributedPaisa??0,caseCompanyAttributedPaisa:amounts?.caseCompanyAttributedPaisa??0});
 }
 const recognizedPaisa=row?.recognizedPaisa??0;
 const recoveryComplete=candidates.length>0&&candidates.every(c=>c.nativeProof&&c.attributedPaisa===c.capacityPaisa)
  &&candidates.reduce((sum,c)=>sum+BigInt(c.caseAttributedPaisa),BigInt(0))===BigInt(recognizedPaisa);
 const companyAttributedPaisa=row?.companyAttributedPaisa??0,expectedCompany=row?.compensatedPaisa?row.compensatedHistoryPaisa:Math.min(source.compensationPaisa,source.historicalNettingPaisa);
 const companyComplete=companyAttributedPaisa>0&&companyAttributedPaisa===expectedCompany&&candidates.every(c=>c.nativeProof&&c.attributedPaisa<=c.capacityPaisa)&&candidates.reduce((sum,c)=>sum+BigInt(c.caseCompanyAttributedPaisa),BigInt(0))===BigInt(companyAttributedPaisa);
 return {candidates,recognizedPaisa,recordedPaisa:row?.recordedPaisa??0,companyAttributedPaisa,complete:recoveryComplete||companyComplete};
}
