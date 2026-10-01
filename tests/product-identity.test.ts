import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createProductSku, productPhotoCountError } from '../lib/products/submission';
void test('new SKU uses full random identity and every saved listing retains at least four photos without a maximum', () => {
 const values = new Set(Array.from({length:1000},()=>createProductSku())); assert.equal(values.size,1000);
 for (const value of values) assert.match(value,/^HB-[A-F0-9]{32}$/);
 assert.match(productPhotoCountError(3) ?? '',/four/i); assert.equal(productPhotoCountError(4),null); assert.equal(productPhotoCountError(5),null);
 assert.match(productPhotoCountError(0,1) ?? '',/four/i); assert.equal(productPhotoCountError(0,6),null); assert.equal(productPhotoCountError(50,1),null);
});
void test('additive identity migration preserves old duplicate SKUs and blocks new cross-seller collisions', () => {
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE products(id TEXT PRIMARY KEY,sku TEXT NOT NULL); CREATE TABLE categories(id TEXT PRIMARY KEY,slug TEXT UNIQUE,name_en TEXT,name_ne TEXT,is_active INTEGER,sort_order INTEGER,created_at INTEGER,updated_at INTEGER); CREATE TABLE occasions(id TEXT PRIMARY KEY,slug TEXT UNIQUE,name_en TEXT,name_ne TEXT,is_active INTEGER,sort_order INTEGER,created_at INTEGER,updated_at INTEGER);');
 db.exec("INSERT INTO products VALUES ('old1','OLD'),('old2','OLD');");
 const sql=readFileSync('drizzle/0030_product_identity_taxonomy.sql','utf8'); db.exec(sql); db.exec(sql);
 assert.equal(db.prepare("SELECT count(*) AS n FROM products WHERE sku='OLD'").get()?.n,2);
 assert.throws(()=>db.exec("INSERT INTO products VALUES ('new','OLD')"));
 db.exec("INSERT INTO products VALUES ('new1','NEW')"); assert.throws(()=>db.exec("INSERT INTO products VALUES ('new2','NEW')"));
 assert.equal(db.prepare("SELECT count(*) AS n FROM categories WHERE slug='others'").get()?.n,1);
 assert.equal(db.prepare("SELECT count(*) AS n FROM occasions WHERE slug='others'").get()?.n,1);
 db.close();
});
