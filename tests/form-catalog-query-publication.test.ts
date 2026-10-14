import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import test from 'node:test';
import { saveFormDraft, publishFormDraft } from '../lib/db/repositories/form-catalog';
import { FORM_REGISTRY, IMPLEMENTED_FORM_ADAPTERS } from '../lib/forms/registry';
import { validateFormDraft } from '../lib/forms/validation';
import { resolvePublishedForm } from '../lib/forms/runtime';
import { loadShopQueryConfig, parseShopQueryCriteria, queryFieldPresentation } from '../lib/catalog/shop-query';
import type { ConfiguredField } from '../lib/forms/types';
import { scanFormSites } from './helpers/form-policy';

const fields: Record<string, readonly [string, ConfiguredField['type']][]> = {
  'catalog.header-search': [['q','short_text']],
  'catalog.filters': [['q','short_text'],['sort','single_choice'],['category','short_text'],['occasion','short_text']],
  'commerce.order-tracking': [['orderNumber','short_text'],['email','email']],
  'seller.product-filter': [['q','short_text']],
  'staff.seller-registry-filter': [['q','short_text'],['status','single_choice']],
  'staff.order-queue-filter': [['q','short_text'],['status','single_choice']],
  'staff.homepage-filter': [['q','short_text'],['visibility','single_choice']],
  'staff.activity-filter': [['action','short_text'],['actor','short_text'],['type','short_text'],['from','date'],['to','date']],
  'staff.recorded-progress-filter': [['from','date'],['to','date'],['action','short_text']],
};
function config(formId: string) {
  return {formId,fields:fields[formId].map(([key,type],order):ConfiguredField=>({id:key,key,type,
    label:'Edited '+key,helpText:'Help '+key,placeholder:'Hint '+key,required:formId==='commerce.order-tracking',order,status:'active',
    ...(key==='sort'?{choices:[{value:'newest',label:'Newest'},{value:'price-low',label:'Price: low to high'},
      {value:'price-high',label:'Price: high to low'},{value:'name',label:'Name'}]}:
      key==='status'?{choices: [{value:'all',label:'All statuses'},...(formId==='staff.seller-registry-filter'?['draft','submitted','under_review','needs_changes','approved','rejected','suspended','awaiting_review']:['pending_payment','awaiting_cod_confirmation','confirmed','packing','ready_for_pickup','dispatched','delivered','cancelled','return_requested','return_in_transit','returned','refund_processing','refunded']).map(value=>({value,label:value.replaceAll('_',' ')}))]}:
      key==='visibility'?{choices:[{value:'all',label:'All products'},{value:'visible',label:'Homepage eligible'},
        {value:'hidden',label:'Hidden from homepage'}]}:{})}))};
}
class Statement {
  values:SQLInputValue[]=[];
  constructor(readonly statement:StatementSync){}
  bind(...values:SQLInputValue[]){this.values=values;return this;}
  async first<T>(){return (this.statement.get(...this.values) as T|undefined)??null;}
  async all<T>(){return {results:this.statement.all(...this.values) as T[]};}
  async run(){const result=this.statement.run(...this.values);return {success:true,meta:{changes:Number(result.changes)},results:[]};}
}
async function fixture(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(`PRAGMA foreign_keys=ON;CREATE TABLE users(id TEXT PRIMARY KEY,status TEXT);
    CREATE TABLE user_roles(user_id TEXT,role TEXT);INSERT INTO users VALUES('admin','active');
    INSERT INTO user_roles VALUES('admin','super_admin');CREATE TABLE audit_logs(id TEXT PRIMARY KEY,
    actor_id TEXT,action TEXT,subject_type TEXT,subject_id TEXT,reason TEXT,previous_json TEXT,next_json TEXT,
    request_id TEXT,ip_hash TEXT,created_at INTEGER);`);
  for(const sql of (await readFile(new URL('../drizzle/0056_form_catalog.sql',import.meta.url),'utf8')).split('--> statement-breakpoint'))if(sql.trim())sqlite.exec(sql);
  const db={prepare(sql:string){return new Statement(sqlite.prepare(sql));},async batch(statements:Statement[]){
    sqlite.exec('BEGIN');try{const result=[];for(const statement of statements)result.push(await statement.run());sqlite.exec('COMMIT');return result;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}}} as unknown as D1Database;
  return {sqlite,db};
}

void test('all registered query adapters publish and resolve nonempty typed presentation without recording answers',async(t)=>{
  for(const formId of Object.keys(fields))await t.test(formId,async()=>{
    const {sqlite,db}=await fixture();try{
      assert.equal(FORM_REGISTRY[formId].adapterId,formId);
      assert.equal(IMPLEMENTED_FORM_ADAPTERS[formId]?.mode,'query');
      assert.equal(FORM_REGISTRY[formId].capabilities.answerBehavior,'query');
      const draft=await saveFormDraft(db,{formId,actorId:'admin',actorRole:'super_admin',expectedPublishedVersion:0,
        config:config(formId),reason:'Fictional presentation publication',requestId:'query-draft',now:10});
      await publishFormDraft(db,{formId,actorId:'admin',actorRole:'super_admin',draftId:draft.id,
        expectedDraftRevision:1,expectedPublishedVersion:0,reason:'Fictional reviewed presentation',requestId:'query-publish',now:20});
      const published=await resolvePublishedForm(db,formId);
      assert.deepEqual(published.fields,config(formId).fields);
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n,0);
      if(formId==='catalog.header-search')assert.deepEqual(queryFieldPresentation(formId,published,'q',{label:'Search'}),
        {label:'Edited q',helpText:'Help q',placeholder:'Hint q'});
      for(const field of config(formId).fields){
        for(const change of [{type:'long_text'},{required:!field.required},{status:'archived'},{min:1}])
          assert.throws(()=>validateFormDraft(formId,{formId,fields:[{...field,...change}]}));
        if(field.choices)assert.throws(()=>validateFormDraft(formId,{formId,fields:[{...field,choices:[{value:'invented',label:'Invented'},{value:'other',label:'Other'}]}]}));
      }
      for(const key of ['query','status','actorId','customerId','order_number','formVersion','customAnswers'])
        assert.throws(()=>validateFormDraft(formId,{formId,fields:[{id:key,key,type:'short_text',label:'Criterion',required:false,status:'active',order:0}]}));
    }finally{sqlite.close();}
  });
});

void test('only the named minimum-price numeric criterion publishes and reaches the real shop parser',async()=>{
  const {sqlite,db}=await fixture();try{
    const criterion={id:'minimum_price_npr',key:'minimum_price_npr',type:'number' as const,label:'Minimum price',required:true,
      status:'active' as const,order:0,min:2,max:1000};
    const draft=await saveFormDraft(db,{formId:'catalog.filters',actorId:'admin',actorRole:'super_admin',expectedPublishedVersion:0,
      config:{formId:'catalog.filters',fields:[criterion]},reason:'Fictional price criterion',requestId:'criterion-draft',now:10});
    await publishFormDraft(db,{formId:'catalog.filters',actorId:'admin',actorRole:'super_admin',draftId:draft.id,
      expectedDraftRevision:1,expectedPublishedVersion:0,reason:'Reviewed price criterion',requestId:'criterion-publish',now:20});
    const published=await loadShopQueryConfig(db);
    assert.deepEqual(parseShopQueryCriteria(published,{'custom.minimum_price_npr':'250.75'}),{minimumPricePaisa:25075,minimumPriceNpr:'250.75'});
    for(const value of [undefined,'','1','1001','1.001',['3','4']])assert.throws(()=>parseShopQueryCriteria(published,{'custom.minimum_price_npr':value}));
    for(const formId of Object.keys(fields))for(const type of ['number','short_text','long_text','date','email','phone','checkbox','single_choice','multiple_choice']) {
      const candidate={id:'unsupported_criterion',key:'unsupported_criterion',label:'Unsupported criterion',type,
        required:false,status:'active',order:0,...(type==='number'?{min:0,max:1000}:{}),
        ...(type.includes('choice')?{choices:[{value:'one',label:'One'},{value:'two',label:'Two'}]}:{})};
      assert.throws(()=>validateFormDraft(formId,{formId,fields:[candidate]}));
    }
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM form_answer_sets').get()?.n,0);
  }finally{sqlite.close();}
});

void test('local testing adapter remains protected and records no catalog answers',()=>{
  const definition=FORM_REGISTRY['system.local-testing-role'];
  assert.equal(definition.adapterId,definition.id);assert.equal(IMPLEMENTED_FORM_ADAPTERS[definition.id]?.mode,'system');
  assert.equal(definition.capabilities.answerBehavior,'none');
  assert.match(definition.capabilities.explanation,/staging|production/i);
  for(const key of ['role','requestId','custom_context'])assert.throws(()=>validateFormDraft(definition.id,
    {formId:definition.id,fields:[{id:key,key,type:'short_text',label:'Role',required:false,order:0,status:'active'}]}));
});

void test('the eight live query/system source sites need no frozen policy exception',async()=>{
  const paths=new Set(['components/layout/site-header.tsx','components/catalog/catalog-filters.tsx',
    'components/commerce/order-tracker.tsx','app/seller/products/page.tsx','app/admin/homepage/page.tsx',
    'app/admin/activity/page.tsx','components/admin/recorded-progress.tsx','app/local-testing/page.tsx']);
  assert.deepEqual((await scanFormSites(resolve(import.meta.dirname,'..'))).filter(violation=>paths.has(violation.path)),[]);
});
