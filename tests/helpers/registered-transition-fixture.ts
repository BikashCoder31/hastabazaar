import type { DatabaseSync } from 'node:sqlite';
import { incentiveReportDatabase } from './incentive-report-database';
import { getRegisteredSellerTerms } from '../../lib/db/repositories/marketplace-settings';
import { historicalCommissionFixture } from './historical-commission-fixture';
import { submitRegisteredSellerTransition as submit, type RegisteredTransitionInput } from '../../lib/managed-commerce/route-transition';

// Older catalogue tests deliberately use small schemas. Extend only their missing
// contract from the real schema, then call the real transition domain. The complete
// lifecycle tests separately enforce all native constraints without this adapter.
const fixtures=new WeakMap<D1Database,DatabaseSync>();
let reference:ReturnType<typeof incentiveReportDatabase>|undefined;
export function registerTransitionFixture(db:D1Database,sqlite:DatabaseSync){
  if(sqlite.prepare('PRAGMA database_list').all().some(row=>row.file))throw new Error('Transition fixtures require an in-memory database.');
  fixtures.set(db,sqlite);
}
export async function registeredTransitionFixtureInput(db:D1Database,input:RegisteredTransitionInput) {
  const sqlite=fixtures.get(db);if(!sqlite)throw new Error('Register the isolated transition fixture first.');
  reference??=incentiveReportDatabase();const canonical=(await reference).sqlite;
  for(const table of ['seller_profiles','user_roles','seller_participation_profiles','seller_route_transition_applications','seller_restrictions','seller_documents',
    'operation_transaction_guards','staff_permission_guards','staff_permission_profiles','business_setting_versions','seller_agreement_acceptance_history']) {
    const exists=sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
    if(!exists)sqlite.exec(String(canonical.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(table)?.sql));
    else {
      const present=new Set(sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row=>row.name));
      for(const column of canonical.prepare(`PRAGMA table_info(${table})`).all())if(!present.has(column.name))sqlite.exec(`ALTER TABLE ${table} ADD COLUMN "${String(column.name)}" ${String(column.type)}`);
    }
  }
  sqlite.prepare("INSERT OR IGNORE INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',?)").run(input.actorId,input.now);
  sqlite.prepare("UPDATE seller_profiles SET status=COALESCE(status,'approved') WHERE id=?").run(input.sellerId);
  const ids=[];
  for(const kind of ['bank_verification',...(input.taxMode==='PAN'?['business_registration','pan_certificate']:input.taxMode==='VAT'?['business_registration','vat_certificate']:['business_registration','pan_certificate','vat_certificate'])]) {
    const id=`fixture-${input.sellerId}-${kind}`;ids.push(id);
    sqlite.prepare(`INSERT OR IGNORE INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at)
      VALUES(?,?,?,?,?,'application/pdf',100,'pending',?)`).run(id,input.sellerId,kind,`private/seller-documents/${input.sellerId}/transition-${id}`,'SIMULATED-business-certificate.pdf',input.now);
  }
  historicalCommissionFixture(sqlite, input.actorId);
  const terms=await getRegisteredSellerTerms(db,input.now);
  return {...input,payoutAccountReference:'SIM-VERIFIED-REGISTERED-RECEIVING',evidenceReferences:ids,registeredTermsContext:terms.context,agreementVersion:terms.agreementVersion,agreementLanguage:'en' as const,agreementAcceptedAt:input.now};
}
export async function submitRegisteredTransitionFixture(db:D1Database,input:RegisteredTransitionInput){return submit(db,await registeredTransitionFixtureInput(db,input));}
