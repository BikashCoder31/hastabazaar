import assert from 'node:assert/strict';
import test from 'node:test';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
const migration=readFileSync(new URL('../drizzle/0155_product_orderable_price_history.sql',import.meta.url),'utf8');
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of ['products','seller_profiles','product_offer_versions','product_offer_identities','users','product_publication_candidates','product_publication_decisions'])db.exec(`CREATE TABLE ${name}(id TEXT PRIMARY KEY);INSERT INTO ${name} VALUES('source');`);
 db.exec(readFileSync(new URL('../drizzle/0091_product_price_references.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO product_price_reference_reviews VALUES('proof','source','source','source','source',3,'{\"unit\":1}',700,800,'approved','external_offer','retained private evidence',10,20,'Original reviewer basis','source',30);INSERT INTO product_discount_cycles VALUES('cycle','source','source','source','proof',700,800,'7.00','8.00',31,31,44,'sent','pending',4);INSERT INTO product_discount_advisories VALUES('advisory','source',23,32,33);INSERT INTO product_discount_advisory_items VALUES('advisory','cycle');");return db;
}
const tables=['product_price_reference_reviews','product_discount_cycles','product_discount_advisories','product_discount_advisory_items'];
const snapshot=(db:DatabaseSync)=>tables.map(table=>db.prepare('SELECT * FROM '+table+' ORDER BY 1').all().map(row=>({...row})));
void test('0155 preserves every retained review and dependent cycle/link with foreign keys continuously enabled',()=>{
 const db=fixture();try{const before=snapshot(db);db.exec('BEGIN');db.exec(migration);db.exec('COMMIT');
  const after=snapshot(db);delete after[0][0].history_basis;assert.deepEqual(after,before);assert.equal(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  assert.throws(()=>db.exec("UPDATE product_price_reference_reviews SET reason='replacement' WHERE id='proof'"),/immutable/);assert.throws(()=>db.exec("DELETE FROM product_price_reference_reviews WHERE id='proof'"),/retained/);
  assert.throws(()=>db.exec("INSERT INTO product_price_reference_reviews SELECT 'duplicate',product_id,seller_id,offer_id,version_id,review_revision,physical_json,selling_paisa,compare_paisa,decision,evidence_kind,evidence_reference,offered_from,offered_to,reason,actor_id,created_at,history_basis FROM product_price_reference_reviews WHERE id='proof'"),/UNIQUE/);
  assert.throws(()=>db.exec("UPDATE product_discount_cycles SET reference_id='missing'"),/FOREIGN KEY/);assert.throws(()=>db.exec("UPDATE product_discount_advisory_items SET cycle_id='missing'"),/FOREIGN KEY/);
  assert.ok(db.prepare("SELECT name FROM sqlite_master WHERE name='product_discount_pending'").get());
 }finally{db.close();}
});
void test('failed0155 copy rolls the complete schema and all retained bytes back',()=>{
 const db=fixture();try{const before=snapshot(db),schema=db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all();
  const failing=migration.replace('INSERT INTO product_price_reference_reviews_next SELECT','CREATE TRIGGER injected_copy_failure BEFORE INSERT ON product_price_reference_reviews_next BEGIN SELECT RAISE(ABORT,\'injected_copy_failure\'); END;\nINSERT INTO product_price_reference_reviews_next SELECT');
  db.exec('BEGIN');assert.throws(()=>db.exec(failing),/injected_copy_failure/);db.exec('ROLLBACK');assert.deepEqual(snapshot(db),before);assert.deepEqual(db.prepare("SELECT type,name,sql FROM sqlite_master ORDER BY type,name").all(),schema);assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys,1);
 }finally{db.close();}
});
