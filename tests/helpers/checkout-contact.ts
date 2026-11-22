import assert from 'node:assert/strict';
import { normalizeNepalMobile } from '../../lib/auth/nepal-phone';
import {verifySellerDocument} from '../../lib/sellers/document-review';
import {getRegisteredSellerTerms,prepareSellerCommissionAcceptance} from '../../lib/db/repositories/marketplace-settings';

/** Explicit fixture evidence and owner acceptance; caller must supply an in-memory fixture. */
export async function readyCheckoutSeller(f:{database:D1Database;sqlite:import('node:sqlite').DatabaseSync},sellerId:string,ownerId:string,reviewerId:string,now=2){
 assert.ok(f.sqlite.prepare('PRAGMA database_list').all().every(row=>row.file===''));
 f.sqlite.prepare("UPDATE seller_profiles SET applicant_type='individual' WHERE id=?").run(sellerId);
 for(const kind of ['representative_identity','pan_certificate']){
  const id=`checkout-${sellerId}-${kind}`;
  await f.database.prepare("INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES(?,?,?,?,'fictional.png','image/png',20,'pending',?)").bind(id,sellerId,kind,'private/fixture/'+id,now).run();
  await verifySellerDocument(f.database,{sellerId,documentId:id,actorId:reviewerId,reason:'Independently review exact fictional checkout seller evidence.',commandId:'verify-'+id,now,expectedReviewId:null});
 }
 const terms=await getRegisteredSellerTerms(f.database,now);
 // A historical fixture may already retain this exact owner's acceptance; do not invent a second one.
 const retained=f.sqlite.prepare("SELECT 1 FROM seller_agreement_acceptance_history WHERE seller_id=? AND agreement_version=? AND commission_setting_version_id=? AND accepted_by=? AND language_presented='en'").get(sellerId,terms.agreementVersion,terms.versionId,ownerId);
 const acceptance=retained?{statements:[]}:await prepareSellerCommissionAcceptance(f.database,{sellerId,actorId:ownerId,context:terms.context,requestId:'checkout-terms-'+sellerId,now,mode:'approved_seller'});
 await f.database.batch([f.database.prepare('UPDATE seller_profiles SET seller_agreement_version=?,seller_agreement_accepted_at=? WHERE id=?').bind(terms.agreementVersion,now,sellerId),...acceptance.statements]);
}

/** Explicit fictional checkout proof; never marks unrelated fixture users verified. */
export async function seedVerifiedCheckoutContact(db: D1Database, userId: string, phone = '9811111111', now = 1) {
  const canonical = normalizeNepalMobile(phone);
  assert.ok(canonical, 'A fictional Nepal mobile is required.');
  const user = await db.prepare('SELECT email FROM users WHERE id=?').bind(userId).first<{ email: string }>();
  assert.ok(user, 'Create the intended fictional customer before verifying contact.');
  const mariaDb = (db as unknown as { dialect?: string }).dialect === 'mariadb';
  const emailUpdate = mariaDb
    ? 'ON DUPLICATE KEY UPDATE email=VALUES(email),verified_at=VALUES(verified_at)'
    : 'ON CONFLICT(user_id) DO UPDATE SET email=excluded.email,verified_at=excluded.verified_at';
  const phoneUpdate = mariaDb
    ? 'ON DUPLICATE KEY UPDATE phone=VALUES(phone),verified_at=VALUES(verified_at)'
    : 'ON CONFLICT(user_id) DO UPDATE SET phone=excluded.phone,verified_at=excluded.verified_at';
  await db.batch([
    db.prepare('UPDATE users SET phone=? WHERE id=?').bind(canonical, userId),
    db.prepare(`INSERT INTO account_email_verifications(user_id,email,verified_at) VALUES (?,?,?) ${emailUpdate}`).bind(userId, user.email.toLowerCase(), now),
    db.prepare(`INSERT INTO account_phone_verifications(user_id,phone,verified_at) VALUES (?,?,?) ${phoneUpdate}`).bind(userId, canonical, now),
  ]);
}

export async function seedCheckoutBuyer(db: D1Database, userId = 'checkout-buyer', email = 'buyer@example.test', phone = '9811111111', now = 1) {
  await db.batch([
    db.prepare("INSERT INTO users(id,auth_subject,email,display_name,locale,status,created_at,updated_at) VALUES (?,?,?,'Fictional checkout buyer','en-NP','active',?,?)").bind(userId, userId, email, now, now),
    db.prepare("INSERT INTO user_roles(user_id,role,assigned_at) VALUES (?,'customer',?)").bind(userId, now),
  ]);
  await seedVerifiedCheckoutContact(db, userId, phone, now);
}
