import { validateSellerDocumentContent } from '../lib/documents/document-content';
import { passivePdfFixture } from './helpers/passive-pdf';
import assert from 'node:assert/strict';import test from 'node:test';import {parseSellerApplication,sellerDocumentsForApplication} from '../lib/sellers/application';
function form(type='individual',tax='PAN'){const f=new FormData();for(const [k,v] of Object.entries({applicantType:type,taxMode:tax,legalName:'Synthetic Person',tradingName:'Craft Shop',taxRegistrationNumber:'123456789',email:'person@example.test',phone:'9800000000',province:'Bagmati',district:'Kathmandu',municipality:'Kathmandu',locality:'Local address',businessDescription:'Handmade products',productCategories:'Crafts',acceptedTerms:'yes'}))f.set(k,v);return f;}
void test('individual needs no fake company details; company requires registration and representative',()=>{const individual=parseSellerApplication(form());assert.ok(individual.input);assert.equal(individual.input.registrationNumber,'');assert.equal(individual.input.representativeName,'Synthetic Person');assert.ok(parseSellerApplication(form('company')).errors.some(e=>e.includes('Registration')));for(const type of ['','invalid'])assert.equal(parseSellerApplication(form(type)).input,undefined);assert.equal(parseSellerApplication(form('individual','bad')).input,undefined);});
void test('all six applicant/tax choices require exactly selected certificates and company registration only',()=>{for(const applicantType of ['individual','company'] as const)for(const taxMode of ['PAN','VAT','BOTH'] as const){const definitions=sellerDocumentsForApplication({applicantType,taxMode});const required=definitions.filter(d=>d.required).map(d=>d.kind);assert.deepEqual(required,[...(applicantType==='company'?['business_registration']:[]),...(taxMode!=='VAT'?['pan_certificate']:[]),...(taxMode!=='PAN'?['vat_certificate']:[])]);}});

import {DatabaseSync,type SQLInputValue,type StatementSync} from 'node:sqlite';import {readdir,readFile} from 'node:fs/promises';import {createSellerApplication,getSellerApplicationForReview} from '../lib/db/repositories/seller-applications';
class TestD1PreparedStatement {
  private values: SQLInputValue[] = [];
  constructor(private readonly statement: StatementSync) {}
  bind(...values: SQLInputValue[]) {
    this.values = values;
    return this;
  }
  async first<T>() {
    return (this.statement.get(...this.values) as T | undefined) ?? null;
  }
  async all<T>() {
    return {
      results: this.statement.all(...this.values) as T[],
      success: true,
      meta: {},
    };
  }
  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: { changes: Number(result.changes) },
      results: [],
    };
  }
}

class TestD1Database {
  constructor(private readonly sqlite: DatabaseSync) {}
  prepare(sql: string) {
    return new TestD1PreparedStatement(this.sqlite.prepare(sql));
  }
  async batch(statements: readonly TestD1PreparedStatement[]) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}



void test('transactional applications preserve legacy profiles and allow multiple real individuals without fabricated company IDs',async()=>{
 const sqlite=new DatabaseSync(':memory:');try{
 const names=(await readdir(new URL('../drizzle/',import.meta.url))).filter(n=>/^\d{4}_.+\.sql$/.test(n)).sort();for(const name of names){if(name.startsWith('0037'))break;for(const part of (await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')).split('--> statement-breakpoint'))if(part.trim())sqlite.exec(part);}
 sqlite.exec("INSERT INTO users(id,email,display_name,created_at,updated_at) VALUES ('old-user','old@example.test','Old',1,1);INSERT INTO seller_profiles(id,user_id,legal_name,trading_name,registration_authority,registration_number,tax_mode,tax_registration_number,representative_name,support_phone,support_email,province,district,municipality,locality,status,created_at,updated_at) VALUES ('old','old-user','Legacy','Legacy','Office','OLDREG','VAT','OLDTAX','Old','9800000000','old@example.test','Bagmati','Kathmandu','Kathmandu','Local','approved',1,1)");const before=sqlite.prepare('SELECT * FROM seller_profiles WHERE id=?').get('old');
 sqlite.exec(await readFile(new URL('../drizzle/0037_seller_registration.sql',import.meta.url),'utf8'));const after=sqlite.prepare('SELECT * FROM seller_profiles WHERE id=?').get('old')!;assert.equal(after.applicant_type,null);delete after.applicant_type;assert.deepEqual(after,before);
 for(const name of names.filter(name=>name>'0037_seller_registration.sql'))for(const part of (await readFile(new URL('../drizzle/'+name,import.meta.url),'utf8')).split('--> statement-breakpoint'))if(part.trim())sqlite.exec(part);
 const db=new TestD1Database(sqlite) as unknown as D1Database;
 const {historicalCommissionFixture}=await import('./helpers/historical-commission-fixture');historicalCommissionFixture(sqlite,'old-user');
 for(let i=0;i<6;i++){const applicantType=i<3?'individual':'company',taxMode=['PAN','VAT','BOTH'][i%3];const f=form(applicantType,taxMode);f.set('email','new'+i+'@example.test');f.set('phone','980000000'+i);f.set('taxRegistrationNumber','TAX00'+i);if(applicantType==='company'){f.set('registrationAuthority','Office');f.set('registrationNumber','REG'+i);f.set('representativeName','Representative');}const input=parseSellerApplication(f).input!;assert.ok(input);const sellerId='new-'+i;const documents=sellerDocumentsForApplication(input).filter(d=>d.required).map(d=>({id:crypto.randomUUID(),kind:d.kind,objectKey:'private/seller-documents/'+sellerId+'/'+crypto.randomUUID(),originalName:'synthetic.pdf',mimeType:'application/pdf',sizeBytes:12}));const options={userId:'user-'+i,sellerId,applicationReference:'APP-'+i,input,documents,now:Date.now()};await assert.rejects(()=>createSellerApplication(db,{...options,documents:documents.slice(1)}));assert.equal(sqlite.prepare('SELECT id FROM users WHERE id=?').get(options.userId),undefined);await createSellerApplication(db,options);const saved=await getSellerApplicationForReview(db,sellerId);assert.equal(saved?.applicantType,applicantType);assert.equal(saved?.taxMode,taxMode);assert.equal(saved?.documents.length,documents.length);assert.equal(saved?.registrationNumber,applicantType==='individual'?'':'REG'+i);}
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seller_profiles').get()!.n,7);
 }finally{sqlite.close();}
});

import {validateSellerDocument,maximumDocumentBytes} from '../lib/sellers/application';
void test('private certificate uploads reject wrong file types, oversized files and spoofed content',async()=>{assert.ok(validateSellerDocument(new File(['bad'],'x.html',{type:'text/html'})));assert.ok(validateSellerDocument(new File([new Uint8Array(maximumDocumentBytes+1)],'x.pdf',{type:'application/pdf'})));assert.ok(await validateSellerDocumentContent(new File(['not a PDF'],'x.pdf',{type:'application/pdf'})));assert.equal(await validateSellerDocumentContent(new File([passivePdfFixture()],'x.pdf',{type:'application/pdf'})),null);});
