import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {positiveOriginalPaidSql} from '../lib/payments/recovery-partial-paid-source';
import {mariaOriginalSourcePoolView,patchMariaOriginalSourcePoolView,retainedOriginalSourcePoolView,retained0138OriginalSourcePoolView} from '../scripts/mariadb-original-source-pool-view';
void test('Maria view conversion preserves every canonical historical predicate except the exact proven paid fragments',async()=>{
 for(const name of ['0138_recovery_partial_paid.sql','0139_recovery_receipt_dispositions.sql']){
  const raw=await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8'),original=retainedOriginalSourcePoolView(raw).replaceAll('\r\n','\n');let restored=mariaOriginalSourcePoolView(raw);
  for(const model of ['registered','managed'] as const){const translated=positiveOriginalPaidSql(model,'native_source.scopeId','native_source.sellerId','mariadb');assert.equal(restored.split(translated).length,2);restored=restored.replace(translated,positiveOriginalPaidSql(model,'native_source.scopeId','native_source.sellerId'));}
  assert.equal(restored,original);
  const prefix='-- Preserve preceding native guards exactly.\r\n',suffix='\r\n-- Preserve following native guards exactly.\r\n';assert.equal(patchMariaOriginalSourcePoolView(raw,prefix+original+suffix),prefix+mariaOriginalSourcePoolView(raw)+suffix);
 }
});
void test('retained0138 generation rejects later0139 dependencies and all view conversions reject ambiguity',async()=>{
 const source=await readFile(new URL('../drizzle/0138_recovery_partial_paid.sql',import.meta.url),'utf8'),view=retained0138OriginalSourcePoolView(source);
 assert.doesNotMatch(view,/recovery_receipt_reversal/i);
 assert.throws(()=>retained0138OriginalSourcePoolView(view.replace(' AS ',' AS /* recovery_receipt_reversal */ ')),/Keep0138/);
 assert.throws(()=>mariaOriginalSourcePoolView(view+'\n'+view),/one retained/);
 const fragment=positiveOriginalPaidSql('registered','native_source.scopeId','native_source.sellerId');assert.throws(()=>mariaOriginalSourcePoolView(view.replace(fragment,fragment.replace('native_source.sellerId','unexpected.sellerId'))),/exact registered/);
});
