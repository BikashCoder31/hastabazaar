import assert from 'node:assert/strict';
import {sellerRecoveryFixture} from './seller-recovery-fixture';
/** Fictional historical reserve kept half the original earnings unpaid. Its
 * later release is retained separately. Only inspected memory is reconstructed;
 * all exact native triggers and foreign keys are restored before any test. */
export async function historicalPartialRegisteredFixture(){
 const f=await sellerRecoveryFixture();try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const earned=f.originalPaidPaisa,paid=earned/2;assert.ok(Number.isSafeInteger(paid));
  const packet=f.sqlite.prepare('SELECT id,source_snapshot_json FROM payout_transfer_packets WHERE registered_payout_id=?').get(f.payoutId)!,snapshot=JSON.parse(String(packet.source_snapshot_json));
  const item=String(f.sqlite.prepare("SELECT order_item_id FROM seller_ledger_entries e JOIN payout_entries pe ON pe.ledger_entry_id=e.id WHERE pe.payout_id=? AND e.type='sale'").get(f.payoutId)!.order_item_id);
  const created=Number(f.sqlite.prepare('SELECT created_at FROM payouts WHERE id=?').get(f.payoutId)!.created_at);
  snapshot.amountPaisa=paid;snapshot.entries.push({id:'legacy-partial-reserve-hold',amount:-paid,type:'reserve_hold',availableAt:created-1});
  const triggers=f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all() as {name:string;sql:string}[];
  f.sqlite.exec('BEGIN');try{
   for(const t of triggers)f.sqlite.exec('DROP TRIGGER "'+t.name.replaceAll('"','""')+'"');
   for(const [id,type,amount,time] of [['legacy-partial-reserve-hold','reserve_hold',-paid,created-1],['legacy-partial-reserve-release','reserve_release',paid,created+1]] as const)f.sqlite.prepare('INSERT INTO seller_ledger_entries(id,seller_id,order_item_id,type,amount_paisa,available_at,description,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,'registered',item,type,amount,time,'Fictional historical original reserve component',time);
   f.sqlite.prepare('INSERT INTO payout_entries(payout_id,ledger_entry_id) VALUES(?,?)').run(f.payoutId,'legacy-partial-reserve-hold');
   f.sqlite.prepare('UPDATE payouts SET amount_paisa=? WHERE id=?').run(paid,f.payoutId);
   f.sqlite.prepare("UPDATE seller_ledger_entries SET amount_paisa=? WHERE payout_id=? AND type='payout'").run(-paid,f.payoutId);
   f.sqlite.prepare('UPDATE payout_transfer_packets SET amount_paisa=?,source_snapshot_json=? WHERE id=?').run(paid,JSON.stringify(snapshot),packet.id);
   f.sqlite.prepare("UPDATE company_outgoing_bank_identities SET amount_paisa=? WHERE packet_kind='payout' AND packet_id=?").run(paid,packet.id);
   f.sqlite.prepare('DELETE FROM audit_logs WHERE subject_id IN(?,?,?)').run(f.payoutId,packet.id,'registered:'+f.payoutId);
   f.sqlite.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,'reviewer','fixture.legacy_partial_import','payout',?,'Explicit fictional imported partial original payment with retained reserve release',?,'fictional-registered-partial-import',?)").run(crypto.randomUUID(),f.payoutId,JSON.stringify({originalEarnedPaisa:earned,actualPaidPaisa:paid,originalUnpaidPaisa:paid,packetId:packet.id}),Date.now());
   for(const t of triggers)f.sqlite.exec(t.sql);
   assert.deepEqual(f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all(),triggers);assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);f.sqlite.exec('COMMIT');
  }catch(error){f.sqlite.exec('ROLLBACK');throw error;}
  assert.equal(f.sqlite.prepare('SELECT SUM(e.amount_paisa) n FROM seller_ledger_entries e JOIN payout_entries pe ON pe.ledger_entry_id=e.id WHERE pe.payout_id=? AND e.order_item_id=?').get(f.payoutId,item)!.n,paid);
  return {...f,originalPaidPaisa:paid,originalUnpaidPaisa:paid,originalEarnedPaisa:earned};
 }catch(error){f.dispose();throw error;}
}

export async function historicalPartialRegisteredReviewFixture(){
 const f=await historicalPartialRegisteredFixture();try{
  const recovery=await import('../../lib/payments/seller-recovery');
  const opened=await recovery.openSellerRecovery(f.db,f.ctx('registered-partial-review-open'),{kind:'refund',id:f.refundId,reason:'Review the actual original partial payment and retained release of the original unpaid reserve.'});
  return {...f,caseId:opened.id};
 }catch(error){f.dispose();throw error;}
}
