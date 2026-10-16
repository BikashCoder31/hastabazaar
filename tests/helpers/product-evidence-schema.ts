import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
let canonical:DatabaseSync|undefined;
/** Extend narrow legacy query fixtures with the actual new acceptance schema. */
export function addProductEvidenceSchema(sqlite:DatabaseSync) {
 if(!canonical){canonical=new DatabaseSync(':memory:');for(const name of readdirSync('drizzle').filter(name=>/^\d{4}_.*\.sql$/.test(name)).sort())canonical.exec(readFileSync('drizzle/'+name,'utf8'));}
 for(const name of ['managed_maker_application_details','seller_documents','business_setting_versions'])
  if(!sqlite.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name))sqlite.exec(String(canonical.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(name)?.sql));
 if(!sqlite.prepare('PRAGMA table_info(seller_profiles)').all().some(row=>row.name==='legal_name'))sqlite.exec('ALTER TABLE seller_profiles ADD COLUMN legal_name TEXT');
}
