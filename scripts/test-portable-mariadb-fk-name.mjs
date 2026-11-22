import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {withPortableMariaFixture,createFixtureDatabase} from './portable-mariadb-fixture.mjs';
assert.equal(process.argv.length,3);const id=process.argv[2];
const result=await withPortableMariaFixture(id,async fixture=>{
 const database=await createFixtureDatabase(fixture,'fk_'+Date.now().toString(36)+'_'+randomUUID().slice(0,6));
 for(const table of ['users','seller_profiles','seller_documents'])await fixture.connection.query(`CREATE TABLE ${table}(id VARCHAR(191) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
 await fixture.connection.query(`CREATE TABLE seller_document_change_requests(id VARCHAR(191) PRIMARY KEY,seller_id VARCHAR(191) NOT NULL,document_id VARCHAR(191) NOT NULL,requested_by VARCHAR(191) NOT NULL,reviewed_by VARCHAR(191),FOREIGN KEY(seller_id) REFERENCES seller_profiles(id),FOREIGN KEY(document_id) REFERENCES seller_documents(id),FOREIGN KEY(requested_by) REFERENCES users(id),FOREIGN KEY(reviewed_by) REFERENCES users(id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
 const[names]=await fixture.connection.query('SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME=? ORDER BY CONSTRAINT_NAME',[database,'seller_document_change_requests']);
 let originalError;try{await fixture.connection.query('ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS replacement_document_id VARCHAR(191) REFERENCES seller_documents(id)');}catch(error){originalError={code:error.code,errno:error.errno,message:error.message};}
 if(!originalError)return {fixture:id,database,version:fixture.facts.version,defaultSessionInlineReproduced:false,originalForeignKeys:names,note:'The minimal default session does not reproduce; the exact frozen-import engine diagnostic remains authoritative.'};
 assert.equal(originalError.code,'ER_FK_FAIL_ADD_SYSTEM');
 const[engine]=await fixture.connection.query('SHOW ENGINE INNODB STATUS'),status=String(engine[0].Status),start=status.indexOf('LATEST FOREIGN KEY ERROR'),end=status.indexOf('TRANSACTIONS',start+1),foreignKeyError=status.slice(start,end>start?end:start+2500).slice(0,2500);
 assert.match(foreignKeyError,/constraint.*already exists|already exists.*constraint/is);
 const namedSql='ALTER TABLE seller_document_change_requests ADD COLUMN IF NOT EXISTS replacement_document_id VARCHAR(191), ADD CONSTRAINT fk_doc_change_replacement_document FOREIGN KEY(replacement_document_id) REFERENCES seller_documents(id)';
 await fixture.connection.query(namedSql);const[confirmed]=await fixture.connection.query("SELECT CONSTRAINT_NAME,COLUMN_NAME,REFERENCED_TABLE_NAME,REFERENCED_COLUMN_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE CONSTRAINT_SCHEMA=? AND TABLE_NAME='seller_document_change_requests' AND COLUMN_NAME='replacement_document_id'",[database]);
 assert.deepEqual(confirmed.map(row=>({...row})),[{CONSTRAINT_NAME:'fk_doc_change_replacement_document',COLUMN_NAME:'replacement_document_id',REFERENCED_TABLE_NAME:'seller_documents',REFERENCED_COLUMN_NAME:'id'}]);
 return {fixture:id,database,version:fixture.facts.version,originalForeignKeys:names,originalError,foreignKeyError,namedSql,confirmed};
});
const path=join('test-artifacts/mariadb',id,'fk-name-reproduction-evidence.json');await writeFile(path,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,evidencePath:path}));
