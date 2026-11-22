import {protectedAdminCasePreflight} from './protected-admin-recovery';
import {staffMutationGuard} from '../db/repositories/staff-mutation-guard';
import {assertSimulationAllowed,type RuntimeEnvironment} from '../staging/environment';
import {ProtectedChangeError,protectedGuard} from './protected-change-policy';
import {protectedCommand,protectedChangeEvent,protectedChangeNotice} from './protected-change-requests';
type Model='registered'|'managed'|'fixed';
const models={registered:{table:'payouts',seller:'p.seller_id',join:'',terminal:'rejected',unsent:'p.provider_reference IS NULL AND p.processed_at IS NULL'},
  managed:{table:'managed_payouts',seller:'p.seller_id',join:'',terminal:'rejected',unsent:'p.provider_reference IS NULL'},
  fixed:{table:'managed_supplier_payments',seller:'o.seller_id',join:'JOIN managed_supplier_obligations o ON o.id=p.obligation_id',terminal:'cancelled',unsent:'1=1'}} as const;
export async function retireProtectedPayout(db:D1Database,input:{caseId:string;payoutId:string;model:Model;actorId:string;actorAuthSubject?:string|null;expectedVersion:number;notExecutedConfirmed:boolean;evidenceReference:string;reason:string;requestId:string;now:number;environment?:RuntimeEnvironment}):Promise<void>{
  if(!Object.hasOwn(models,input.model)||input.notExecutedConfirmed!==true||input.reason.trim().length<10||input.reason.trim().length>1000||input.evidenceReference.trim().length<4||input.evidenceReference.trim().length>191)
    throw new ProtectedChangeError('Confirm from actual instruction evidence that no transfer was initiated, and record the reference and reason.',400);
  if(input.model!=='registered'){if(!input.environment)throw new ProtectedChangeError('The managed simulation environment must be established.',400);assertSimulationAllowed(input.environment);}
  const authority=await staffMutationGuard(db,input.actorId,'payout.approve',ProtectedChangeError,'super_admin'),source=models[input.model];
  const command=await protectedCommand(db,input,'packet_retired',input.caseId,String(input.expectedVersion),{model:input.model,payoutId:input.payoutId,notExecutedConfirmed:true,reason:input.reason.trim(),reference:input.evidenceReference.trim()});
  if(command.receipt.replayed)return;
  await protectedAdminCasePreflight(db,input);
  const current=await db.prepare(`SELECT c.seller_id AS sellerId,c.source_request_id AS sourceRequestId,p.status,p.amount_paisa AS amount,p.destination_reference AS destination,p.updated_at AS updatedAt
    FROM ${source.table} p ${source.join} JOIN seller_protected_change_cases c ON c.seller_id=${source.seller} WHERE c.id=? AND p.id=?`)
    .bind(input.caseId,input.payoutId).first<{sellerId:string;sourceRequestId:string|null;status:string;amount:number;destination:string;updatedAt:number}>();
  if(!current||!['prepared','scheduled','approved'].includes(current.status))throw new ProtectedChangeError('Only a reliably unexecuted invalidated packet can be retired. Processing and uncertain failures require outcome reconciliation.');
  const id=crypto.randomUUID(),eventId=crypto.randomUUID(),reason=input.reason.trim(),reference=input.evidenceReference.trim();
  const statements=[...authority.statements,...protectedGuard(db,`EXISTS(SELECT 1 FROM ${source.table} p ${source.join}
    JOIN seller_profiles s ON s.id=${source.seller} JOIN seller_protected_change_cases c ON c.seller_id=s.id
    JOIN seller_payout_review_blocks b ON b.case_id=c.id AND b.payout_id=p.id AND b.payout_model=?
    WHERE c.id=? AND c.version=? AND s.user_id<>? AND p.id=? AND p.status=? AND p.updated_at=? AND p.paid_at IS NULL AND ${source.unsent}
      AND b.disposition='reprepare' AND p.status=b.original_status AND p.amount_paisa=b.original_amount_paisa AND p.destination_reference=b.original_destination)`,
    [input.model,input.caseId,input.expectedVersion,input.actorId,input.payoutId,current.status,current.updatedAt]),
    db.prepare(`INSERT INTO seller_payout_packet_dispositions(id,case_id,seller_id,payout_model,old_payout_id,original_status,original_destination,original_amount_paisa,evidence_reference,reason,actor_id,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id,input.caseId,current.sellerId,input.model,input.payoutId,current.status,current.destination,current.amount,reference,reason,input.actorId,input.now),
    db.prepare(`UPDATE ${source.table} SET status=?,updated_at=? WHERE id=?`).bind(source.terminal,input.now,input.payoutId)];
  if(input.model==='registered')statements.push(db.prepare("UPDATE payout_entries SET released_at=?,release_reason='protected_packet_retired' WHERE payout_id=? AND released_at IS NULL").bind(input.now,input.payoutId),
    db.prepare(`INSERT INTO payout_events(id,payout_id,from_status,to_status,action,actor_id,actor_type,note,request_id,created_at) VALUES(?,?,?,'rejected','protected_packet_retired',?,'super_admin',?,?,?)`)
      .bind(eventId,input.payoutId,current.status,input.actorId,reason,input.requestId,input.now),
    db.prepare('UPDATE payouts SET operation_request_id=? WHERE id=?').bind(input.requestId,input.payoutId));
  if(input.model==='managed')statements.push(db.prepare("UPDATE managed_payout_allocations SET disposition='released',terminal_at=? WHERE payout_id=? AND disposition='reserved'").bind(input.now,input.payoutId));
  statements.push(db.prepare('UPDATE seller_protected_change_cases SET version=version+1,operation_request_id=?,updated_at=? WHERE id=?').bind(eventId,input.now,input.caseId),
    protectedChangeEvent(db,input,input.caseId,'packet_retired',reason,{dispositionId:id,payoutId:input.payoutId,model:input.model,originalStatus:current.status,amountPaisa:current.amount,evidenceReference:reference}),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) VALUES(?,?,'payout.protected_packet_retired','seller_protected_change',?,?,?,?)`)
      .bind(crypto.randomUUID(),input.actorId,input.caseId,reason,JSON.stringify({model:input.model,payoutId:input.payoutId,dispositionId:id,reference}),input.now),
    ...await protectedChangeNotice(db,input.caseId,current.sourceRequestId,eventId,input));
  await command.commit(statements,{dispositionId:id});
}

/** Appended to fresh preparation. A retired source is linked once and cannot be partially split around a disputed entry. */
export function protectedPayoutReplacementStatements(db:D1Database,input:{model:Model;payoutId:string;sellerId:string;actorId:string;now:number}){
  const open=`d.payout_model=? AND d.seller_id=? AND NOT EXISTS(SELECT 1 FROM seller_payout_packet_replacements prior WHERE prior.disposition_id=d.id)`;
  if(input.model==='fixed')return[db.prepare(`INSERT INTO seller_payout_packet_replacements(disposition_id,new_payout_id,actor_id,created_at)
    SELECT d.id,?,?,? FROM seller_payout_packet_dispositions d JOIN managed_supplier_payments old ON old.id=d.old_payout_id
    JOIN managed_supplier_payments fresh ON fresh.id=? AND fresh.obligation_id=old.obligation_id WHERE ${open}`)
    .bind(input.payoutId,input.actorId,input.now,input.payoutId,input.model,input.sellerId)];
  const allocations=input.model==='registered'?'payout_entries':'managed_payout_allocations',key=input.model==='registered'?'ledger_entry_id':'entitlement_id';
  const directOverlap=`EXISTS(SELECT 1 FROM ${allocations} old JOIN ${allocations} fresh ON fresh.${key}=old.${key} WHERE old.payout_id=d.old_payout_id AND fresh.payout_id=?)`;
  const directIncomplete=`EXISTS(SELECT 1 FROM ${allocations} old WHERE old.payout_id=d.old_payout_id AND NOT EXISTS(SELECT 1 FROM ${allocations} fresh WHERE fresh.payout_id=? AND fresh.${key}=old.${key}))`;
  // Pre-allocation packets reference immutable settlement entries. Match their positive net entitlements
  // without counting a legacy link again when an explicit allocation already represents it.
  const legacy=`FROM managed_payout_entries legacy JOIN managed_settlement_entries entry ON entry.id=legacy.settlement_entry_id
    WHERE legacy.payout_id=d.old_payout_id AND NOT EXISTS(SELECT 1 FROM managed_payout_allocations old WHERE old.payout_id=d.old_payout_id AND old.entitlement_id=entry.entitlement_id)`;
  const match=`EXISTS(SELECT 1 FROM managed_payout_allocations fresh WHERE fresh.payout_id=? AND fresh.entitlement_id=entry.entitlement_id)`;
  const overlaps=input.model==='managed'?`(${directOverlap} OR EXISTS(SELECT 1 ${legacy} AND ${match} GROUP BY entry.entitlement_id HAVING SUM(entry.amount_paisa)>0))`:directOverlap;
  const incomplete=input.model==='managed'?`(${directIncomplete} OR EXISTS(SELECT 1 ${legacy} AND NOT ${match} GROUP BY entry.entitlement_id HAVING SUM(entry.amount_paisa)>0))`:directIncomplete;
  const matchingValues=input.model==='managed'?[input.payoutId,input.payoutId]:[input.payoutId];
  return[...protectedGuard(db,`NOT EXISTS(SELECT 1 FROM seller_payout_packet_dispositions d WHERE ${open} AND ${overlaps} AND ${incomplete})`,[input.model,input.sellerId,...matchingValues,...matchingValues]),
    db.prepare(`INSERT INTO seller_payout_packet_replacements(disposition_id,new_payout_id,actor_id,created_at)
      SELECT d.id,?,?,? FROM seller_payout_packet_dispositions d WHERE ${open} AND ${overlaps}`)
      .bind(input.payoutId,input.actorId,input.now,input.model,input.sellerId,...matchingValues)];
}
