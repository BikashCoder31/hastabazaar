import { digestFormRequest } from '@/lib/forms/submission';
import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import { isPendingPayoutReference, PENDING_PAYOUT_PREFIX } from './onboarding';
import type { SellerApplicationDocument } from './application';

export class SellerBankError extends Error { constructor(message: string, readonly status = 409) { super(message); } }
export type BankDetails = { payoutBeneficiary: string; bankName: string; bankBranch: string; bankAccountNumber: string };
export function parseBankDetails(raw: Record<string, unknown>): BankDetails {
  const result = {} as BankDetails;
  for (const key of ['payoutBeneficiary', 'bankName', 'bankBranch', 'bankAccountNumber'] as const) {
    const value = raw[key];
    if (typeof value !== 'string' || value.trim().length < 3 || value.length > 160 || /[\p{Cc}<>]/u.test(value))
      throw new SellerBankError('Enter the beneficiary, bank, branch and account number.', 400);
    result[key] = value.trim();
  }
  if (!/^[A-Za-z0-9 -]{4,40}$/.test(result.bankAccountNumber)) throw new SellerBankError('Enter a valid bank account number (4–40 characters).', 400);
  return result;
}
export async function sellerBankState(db: D1Database, sellerId: string) {
  const row = await db.prepare('SELECT payout_account_reference AS reference FROM seller_profiles WHERE id=?').bind(sellerId).first<{ reference: string | null }>();
  if (!row) throw new SellerBankError('Seller application not found.', 404);
  return { status: row.reference ? isPendingPayoutReference(row.reference) ? 'pending' as const : 'verified' as const : 'missing' as const,
    revision: await digestFormRequest(row.reference), reference: row.reference };
}
function checked(db: D1Database, condition: string, values: unknown[]) {
  const id = crypto.randomUUID();
  return [db.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN ${condition} THEN 1 ELSE 0 END`).bind(id, ...values),
    db.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(id)];
}
export async function submitSellerBankDetails(db: D1Database, input: { sellerId: string; actorId: string; revision: string;
  details: BankDetails; document: SellerApplicationDocument; now: number }) {
  const current = await sellerBankState(db, input.sellerId);
  if (current.revision !== input.revision) throw new SellerBankError('Bank details changed. Reload before submitting again.');
  if (current.status === 'verified') throw new SellerBankError('Contact support to change a reviewed payout account.');
  const details = parseBankDetails(input.details);
  const doc = input.document;
  if (doc.kind !== 'bank_verification' || !doc.objectKey.startsWith(`private/seller-documents/${input.sellerId}/`)) throw new SellerBankError('Private bank evidence is required.', 400);
  const reference = PENDING_PAYOUT_PREFIX + JSON.stringify({ ...details, documentId: doc.id });
  await db.batch([
    db.prepare(`UPDATE seller_profiles SET payout_account_reference=?,updated_at=? WHERE id=? AND user_id=? AND status NOT IN ('rejected','suspended')
      AND ((payout_account_reference IS NULL AND ? IS NULL) OR payout_account_reference=?)
      AND EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')`)
      .bind(reference, input.now, input.sellerId, input.actorId, current.reference, current.reference, input.actorId),
    ...checked(db, 'EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND user_id=? AND payout_account_reference=?)', [input.sellerId, input.actorId, reference]),
    db.prepare(`INSERT INTO seller_documents(id,seller_id,kind,object_key,original_name,mime_type,size_bytes,status,uploaded_at) VALUES (?,?,'bank_verification',?,?,?,?,'pending',?)`)
      .bind(doc.id, input.sellerId, doc.objectKey, doc.originalName, doc.mimeType, doc.sizeBytes, input.now),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at)
      VALUES (?,?,'seller.bank_details.submitted','seller',?,'Private bank details submitted for independent review',?,?)`)
      .bind(crypto.randomUUID(), input.actorId, input.sellerId, JSON.stringify({ documentId: doc.id }), input.now),
  ]);
}
export async function reviewSellerBankDetails(db: D1Database, input: { sellerId: string; actorId: string; revision: string; reference: string; reason: string; now: number }) {
  const authority = await staffMutationGuard(db, input.actorId, 'seller.application.review', SellerBankError, 'super_admin');
  const current = await sellerBankState(db, input.sellerId);
  if (current.status !== 'pending' || current.revision !== input.revision) throw new SellerBankError('Pending bank details changed. Reload before reviewing.');
  const details = JSON.parse(current.reference!.slice(PENDING_PAYOUT_PREFIX.length)) as BankDetails & { documentId?: string };
  parseBankDetails(details);
  if (!details.documentId || !/^[a-zA-Z0-9_-]{1,100}$/.test(details.documentId)) throw new SellerBankError('Ask the seller to resubmit bank details with current evidence.');
  const reference = input.reference.trim();
  if (reference.length < 4 || reference.length > 200 || isPendingPayoutReference(reference) || input.reason.trim().length < 8 || input.reason.length > 1000)
    throw new SellerBankError('Record an independent verification reference and a review reason.', 400);
  await db.batch([
    ...authority.statements,
    db.prepare(`UPDATE seller_profiles SET payout_account_reference=?,updated_at=? WHERE id=? AND payout_account_reference=? AND status NOT IN ('rejected','suspended')`)
      .bind(reference, input.now, input.sellerId, current.reference),
    ...checked(db, `EXISTS(SELECT 1 FROM seller_profiles WHERE id=? AND payout_account_reference=?)
      AND EXISTS(SELECT 1 FROM seller_documents WHERE id=? AND seller_id=? AND kind='bank_verification' AND status='pending')`, [input.sellerId, reference, details.documentId, input.sellerId]),
    db.prepare(`UPDATE seller_documents SET status='verified',reviewed_at=?,reviewed_by=? WHERE id=? AND seller_id=? AND status='pending'`)
      .bind(input.now, input.actorId, details.documentId, input.sellerId),
    db.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,next_json,created_at) VALUES (?,?,'seller.bank_details.verified','seller',?,?,?,?)`)
      .bind(crypto.randomUUID(), input.actorId, input.sellerId, input.reason, JSON.stringify({ documentId: details.documentId }), input.now),
  ]);
}
