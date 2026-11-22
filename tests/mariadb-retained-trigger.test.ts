import assert from 'node:assert/strict';
import test from 'node:test';
import {mariaRetainedTrigger} from '../scripts/mariadb-retained-trigger';
import {readFile} from 'node:fs/promises';
void test('retained trigger translation preserves the full predicate and message across LF and CRLF',()=>{
 const predicate="NOT EXISTS(SELECT 1 FROM retained r WHERE r.id=NEW.source_id AND r.amount>=NEW.amount)\n OR NEW.kind<>'confirmed'",source=`CREATE TRIGGER retained_guard BEFORE INSERT ON outcomes\nWHEN ${predicate}\nBEGIN SELECT RAISE(ABORT,'retained_source_required'); END;`;
 const expected=`CREATE OR REPLACE TRIGGER retained_guard BEFORE INSERT ON outcomes FOR EACH ROW BEGIN IF (${predicate}) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='retained_source_required'; END IF; END$$`;
 assert.equal(mariaRetainedTrigger(source),expected);assert.equal(mariaRetainedTrigger(source.replaceAll('\n','\r\n')),expected);
 assert.equal(mariaRetainedTrigger(source.replace('BEFORE INSERT','BEFORE UPDATE')),expected.replace('BEFORE INSERT','BEFORE UPDATE'));
});
void test('unrecognized retained guards fail closed instead of leaking SQLite into Maria output',()=>{
 for(const source of ["CREATE TRIGGER changed BEFORE INSERT ON outcomes BEGIN SELECT RAISE(ABORT,'required'); END;",'CREATE TRIGGER changed BEFORE DELETE ON outcomes\nWHEN 1\nBEGIN SELECT RAISE(ABORT,\'required\'); END;',''])assert.throws(()=>mariaRetainedTrigger(source),/Review the retained SQLite trigger/);
});
void test('carrier and payout parity retain their exact SQLite guards as native Maria definitions',async()=>{
 for(const [sqlite,maria,names] of [['0130_recovery_carrier_reimbursements.sql','mariadb-recovery-carrier-reimbursements.sql',['recovery_restoration_source','recovery_correction_projection']],['0133_recovery_payout_returns.sql','mariadb-recovery-payout-returns.sql',['recovery_correction_projection']]] as const){
  const [rawSource,rawParity]=await Promise.all([readFile(new URL('../drizzle/'+sqlite,import.meta.url),'utf8'),readFile(new URL('../deployment/babal/'+maria,import.meta.url),'utf8')]),source=rawSource.replaceAll('\r\n','\n'),parity=rawParity.replaceAll('\r\n','\n');
  for(const name of names){const trigger=source.match(new RegExp('CREATE TRIGGER '+name+" BEFORE [\\s\\S]+?BEGIN SELECT RAISE\\(ABORT,'[^']+'\\); END;"));assert.ok(trigger);assert.ok(parity.includes(mariaRetainedTrigger(trigger[0])),name+' must retain its complete predicate/message in Maria syntax.');}
  assert.doesNotMatch(parity,/^WHEN |SELECT RAISE\(/m);
 }
});
