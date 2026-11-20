import assert from 'node:assert/strict';
import {managedRecoveryFixture} from './managed-recovery-fixture';

/** Coherent fictional legacy partial payment, confined to inspected :memory:.
 * Original earned entitlement stays 91000; payout, paid allocation, packet and
 * bank fact are 45500. The snapshot retains its original 91000 eligible balance
 * and explicitly identifies the partial allocation. No tested command runs
 * while historical fixture rows are assembled; every trigger is restored. */
export async function historicalPartialManagedFixture(quantity:1|2=1){
 const f=await managedRecoveryFixture('seller',quantity);try{
  assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
  const packet=f.sqlite.prepare('SELECT id,source_snapshot_json FROM payout_transfer_packets WHERE managed_payout_id=?').get(f.payoutId)!;
  const packetId=String(packet.id),snapshot=JSON.parse(String(packet.source_snapshot_json));
  assert.equal(snapshot.amountPaisa,91000);assert.equal(snapshot.balance,91000);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payout_allocations WHERE payout_id=?').get(f.payoutId)!.n,1);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) n FROM managed_payout_entries WHERE payout_id=?').get(f.payoutId)!.n,0);
  snapshot.amountPaisa=45500;snapshot.legacyUnpaidPaisa=45500;snapshot.legacyPaidAllocations=[{entitlementId:f.entitlementId,amountPaisa:45500}];
  const triggers=f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all() as {name:string;sql:string}[];
  f.sqlite.exec('BEGIN');try{
   for(const t of triggers)f.sqlite.exec('DROP TRIGGER "'+t.name.replaceAll('"','""')+'"');
   f.sqlite.prepare('UPDATE managed_payouts SET amount_paisa=45500 WHERE id=?').run(f.payoutId);
   f.sqlite.prepare('UPDATE managed_payout_allocations SET amount_paisa=45500 WHERE payout_id=? AND entitlement_id=?').run(f.payoutId,f.entitlementId);
   f.sqlite.prepare('UPDATE payout_transfer_packets SET amount_paisa=45500,source_snapshot_json=? WHERE id=?').run(JSON.stringify(snapshot),packetId);
   f.sqlite.prepare("UPDATE company_outgoing_bank_identities SET amount_paisa=45500 WHERE packet_kind='payout' AND packet_id=?").run(packetId);
   f.sqlite.prepare('DELETE FROM audit_logs WHERE subject_id IN(?,?,?)').run(f.payoutId,packetId,'managed:'+f.payoutId);
   f.sqlite.prepare("INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,request_id,created_at) VALUES(?,'reviewer','fixture.legacy_partial_import','managed_payout',?,'Explicit fictional imported partial original entitlement payment',?,'fictional-managed-partial-import',?)").run(crypto.randomUUID(),f.payoutId,JSON.stringify({originalEarnedPaisa:91000,actualPaidPaisa:45500,originalUnpaidPaisa:45500,packetId}),Date.now());
   for(const t of triggers)f.sqlite.exec(t.sql);
   assert.deepEqual(f.sqlite.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' ORDER BY name").all(),triggers);assert.equal(f.sqlite.prepare('PRAGMA foreign_key_check').all().length,0);f.sqlite.exec('COMMIT');
  }catch(error){f.sqlite.exec('ROLLBACK');throw error;}
  const proof=f.sqlite.prepare(`SELECT p.amount_paisa payout,a.amount_paisa allocation,t.amount_paisa packet,json_extract(t.source_snapshot_json,'$.amountPaisa') snapshot,b.amount_paisa bank,e.calculated_paisa earned
   FROM managed_payouts p JOIN managed_payout_allocations a ON a.payout_id=p.id JOIN managed_entitlements e ON e.id=a.entitlement_id JOIN payout_transfer_packets t ON t.managed_payout_id=p.id JOIN company_outgoing_bank_identities b ON b.packet_kind='payout' AND b.packet_id=t.id WHERE p.id=?`).get(f.payoutId)!;
  assert.deepEqual({...proof},{payout:45500,allocation:45500,packet:45500,snapshot:45500,bank:45500,earned:91000});
  return {...f,originalPaidPaisa:45500,originalUnpaidPaisa:45500,originalEarnedPaisa:91000};
 }catch(error){f.dispose();throw error;}
}
