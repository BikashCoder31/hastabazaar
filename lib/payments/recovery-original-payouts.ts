import type {PayoutModel} from './payout-transfer-types';

export interface OriginalRecoveryPayoutProof {
 model:PayoutModel;payoutId:string;packetId:string;scopeId:string;
 originalPayoutPaisa:number;scopePaisa:number;bankAt:number;
}
export interface OriginalRecoveryPayoutSource extends OriginalRecoveryPayoutProof {
 principalUsedPaisa:number;scopeUsedPaisa:number;availablePaisa:number;
}
/** Read-only historical proof. These amounts do not grant current allocation capacity.
 * Incoming receipt use, prior returns, independent authority and restitution must
 * be guarded together by the eventual reviewed money command.
 * caseId is an internal SQL expression; request values must be bound parameters.
 */
export function originalRecoveryPayoutProofSql(model:PayoutModel,caseId:string,dialect:'sqlite'|'mariadb'='sqlite'){
 const column=model==='registered'?'registered_payout_id':model==='managed'?'managed_payout_id':'supplier_payment_id';
 const ids="json_extract(c.original_source_json,'$.originalPayoutIds')";
 const retained=dialect==='mariadb'?`JSON_TYPE(${ids})='ARRAY' AND JSON_CONTAINS(${ids},JSON_QUOTE(p.id))=1`:`json_type(${ids})='array' AND EXISTS(SELECT 1 FROM json_each(${ids}) original_ids WHERE original_ids.value=p.id)`;
 const common=`c.id=${caseId} AND c.payout_model='${model}' AND p.status='paid' AND ${retained}
  AND json_extract(c.original_source_json,'$.model')='${model}'
  AND json_extract(t.source_snapshot_json,'$.ownerId')=seller.user_id
  AND json_extract(t.source_snapshot_json,'$.ownerId')=json_extract(c.original_source_json,'$.ownerId')
  AND json_extract(t.source_snapshot_json,'$.sellerId')=c.seller_id
  AND json_extract(t.source_snapshot_json,'$.model')='${model}' AND json_extract(t.source_snapshot_json,'$.id')=p.id
  AND json_extract(t.source_snapshot_json,'$.amountPaisa')=p.amount_paisa
  AND json_extract(t.source_snapshot_json,'$.destination')=p.destination_reference
  AND t.state='paid' AND t.payout_model='${model}' AND t.seller_id=c.seller_id AND t.amount_paisa=p.amount_paisa
  AND t.amount_paisa>0 AND t.amount_paisa<=9007199254740991
  AND bank.bank_at=t.bank_at AND bank.transaction_identity=t.transaction_identity
  AND (SELECT COUNT(*) FROM payout_transfer_packets other WHERE other.${column}=p.id AND other.state='paid')=1`;
 const bank=`JOIN seller_profiles seller ON seller.id=c.seller_id
  JOIN payout_transfer_packets t ON t.${column}=p.id
  JOIN company_outgoing_bank_identities bank ON bank.packet_kind='payout' AND bank.packet_id=t.id
   AND bank.identity_hash=t.transaction_identity_hash AND bank.amount_paisa=t.amount_paisa AND bank.account_version_id=t.account_version_id`;
 const columns=`'${model}' AS model,p.id AS payoutId,t.id AS packetId,p.amount_paisa AS originalPayoutPaisa,t.bank_at AS bankAt`;
 const refund=`JOIN refunds r ON c.source_kind='refund' AND r.id=c.source_id
  JOIN return_requests original_return ON original_return.id=r.return_request_id
  JOIN order_items item ON item.id=original_return.order_item_id AND item.seller_id=c.seller_id`;
 let sql:string;
 if(model==='registered')sql=`SELECT ${columns},item.id AS scopeId,
  (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.order_item_id=item.id AND entry.seller_id=c.seller_id AND entry.type<>'payout') AS scopePaisa
  FROM seller_recovery_cases c ${refund} JOIN payouts p ON p.seller_id=c.seller_id ${bank} WHERE ${common}
  AND (SELECT SUM(entry.amount_paisa) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type<>'payout')=p.amount_paisa
  AND (SELECT COUNT(*) FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout')=1
  AND EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.type='payout' AND entry.payout_id=p.id AND entry.amount_paisa=-p.amount_paisa)
  AND NOT EXISTS(SELECT 1 FROM payout_entries included JOIN seller_ledger_entries entry ON entry.id=included.ledger_entry_id
   WHERE included.payout_id=p.id AND included.released_at IS NULL AND entry.seller_id<>c.seller_id)`;
 else if(model==='managed')sql=`SELECT ${columns},entitlement.id AS scopeId,
  COALESCE((SELECT allocation.amount_paisa FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entitlement.id AND allocation.disposition='paid'),
   (SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND entry.entitlement_id=entitlement.id)) AS scopePaisa
  FROM seller_recovery_cases c ${refund} JOIN managed_commercial_snapshots snapshot ON snapshot.order_item_id=item.id
  JOIN managed_entitlements entitlement ON entitlement.snapshot_id=snapshot.id AND entitlement.seller_id=c.seller_id
  JOIN managed_payouts p ON p.seller_id=c.seller_id ${bank} WHERE ${common}
  AND COALESCE((SELECT SUM(allocation.amount_paisa) FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.disposition='paid'),0)
   +COALESCE((SELECT SUM(entry.amount_paisa) FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
    WHERE included.payout_id=p.id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations allocation WHERE allocation.payout_id=p.id AND allocation.entitlement_id=entry.entitlement_id AND allocation.disposition='paid')),0)=p.amount_paisa
  AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations allocation JOIN managed_entitlements e ON e.id=allocation.entitlement_id
   WHERE allocation.payout_id=p.id AND allocation.disposition='paid' AND e.seller_id<>c.seller_id)
  AND NOT EXISTS(SELECT 1 FROM managed_payout_entries included JOIN managed_settlement_entries entry ON entry.id=included.settlement_entry_id
   JOIN managed_entitlements e ON e.id=entry.entitlement_id WHERE included.payout_id=p.id AND e.seller_id<>c.seller_id)`;
 else sql=`SELECT ${columns},obligation.id AS scopeId,p.amount_paisa AS scopePaisa FROM seller_recovery_cases c
  JOIN managed_supplier_adjustments adjustment ON c.source_kind='supplier_adjustment' AND adjustment.id=c.source_id
  JOIN managed_supplier_obligations obligation ON obligation.id=adjustment.obligation_id AND obligation.seller_id=c.seller_id
  JOIN managed_supplier_payments p ON p.obligation_id=obligation.id ${bank} WHERE ${common}
  AND json_extract(t.source_snapshot_json,'$.obligationId')=obligation.id`;
 return `SELECT * FROM (${sql}) original_paid_source WHERE scopePaisa>0 AND scopePaisa<=9007199254740991`;
}

export async function readOriginalRecoveryPayoutProofs(db:D1Database,caseId:string):Promise<OriginalRecoveryPayoutProof[]>{
 const source=await db.prepare('SELECT payout_model AS model FROM seller_recovery_cases WHERE id=?').bind(caseId).first<{model:PayoutModel}>();
 if(!source||!['registered','managed','fixed'].includes(source.model))return [];
 const dialect=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite';
 return (await db.prepare(originalRecoveryPayoutProofSql(source.model,'?',dialect)+' ORDER BY payoutId,scopeId').bind(caseId).all<OriginalRecoveryPayoutProof>()).results;
}

export async function readOriginalRecoveryPayoutSources(db:D1Database,caseId:string):Promise<OriginalRecoveryPayoutSource[]>{
 const source=await db.prepare('SELECT payout_model AS model FROM seller_recovery_cases WHERE id=?').bind(caseId).first<{model:PayoutModel}>();
 if(!source||!['registered','managed','fixed'].includes(source.model))return [];
 const dialect=(db as D1Database&{dialect?:string}).dialect==='mariadb'?'mariadb':'sqlite';
 const rows=(await db.prepare(`SELECT original.*,COALESCE(principal.used_paisa,0) AS principalUsedPaisa,COALESCE(scope.used_paisa,0) AS scopeUsedPaisa
  FROM (${originalRecoveryPayoutProofSql(source.model,'?',dialect)}) original
  LEFT JOIN seller_recovery_payout_return_pools principal ON principal.payout_model=original.model AND principal.payout_id=original.payoutId AND principal.scope_id=''
  LEFT JOIN seller_recovery_payout_return_pools scope ON scope.payout_model=original.model AND scope.payout_id=original.payoutId AND scope.scope_id=original.scopeId
  WHERE (principal.principal_paisa IS NULL OR principal.principal_paisa=original.originalPayoutPaisa)
   AND (scope.principal_paisa IS NULL OR scope.principal_paisa=original.scopePaisa) ORDER BY original.payoutId,original.scopeId`).bind(caseId).all<Omit<OriginalRecoveryPayoutSource,'availablePaisa'>>()).results;
 return rows.map(row=>({...row,availablePaisa:Math.min(row.originalPayoutPaisa-row.principalUsedPaisa,row.scopePaisa-row.scopeUsedPaisa)}));
}
