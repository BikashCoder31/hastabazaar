import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
const generator=await readFile(new URL('../scripts/generate-email-delivery-schema.mjs',import.meta.url),'utf8');
const functionSource=generator.slice(generator.indexOf('export function mariaEmailSchema'),generator.indexOf('\nfor(const [source,target]'));
const {mariaEmailSchema}=await import('data:text/javascript;base64,'+Buffer.from(functionSource).toString('base64'));
for(const [sqlite,maria]of [['0147_durable_email_delivery.sql','mariadb-durable-email-delivery.sql'],['0148_email_service_health.sql','mariadb-email-service-health.sql']]) {
 void test('retained Maria parity and newline equivalence: '+sqlite,async()=>{
  const source=await readFile(new URL('../drizzle/'+sqlite,import.meta.url),'utf8');
  const expected=await readFile(new URL('../deployment/babal/'+maria,import.meta.url),'utf8');
  assert.equal(mariaEmailSchema(source),expected);
  assert.equal(mariaEmailSchema(source.replace(/\r?\n/g,'\r\n')),expected);
  assert.doesNotMatch(expected,/RAISE\s*\(|\bIS NOT OLD\./);
  if(sqlite.startsWith('0147'))assert.match(expected,/`cursor` TEXT NOT NULL DEFAULT ''/);
  else {assert.match(expected,/functional_success BIGINT NOT NULL DEFAULT 0 CHECK\(functional_success IN\(0,1\)\)/);assert.match(expected,/CASE WHEN state<>'resolved'/);}
 });
}
void test('unsupported trigger conversion fails closed',()=>assert.throws(()=>mariaEmailSchema("CREATE TRIGGER unknown AFTER INSERT ON x BEGIN SELECT RAISE(ABORT,'stop'); END;"),/Unconverted/));
