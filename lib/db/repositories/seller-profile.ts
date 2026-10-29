import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay } from '@/lib/forms/submission';
import { publicProfileCooldownMs, publicProfileEditableAt } from '@/lib/sellers/public-profile';

export class SellerProfileConflictError extends Error {}

export interface EditableSellerProfile {
  tradingName: string;
  businessDescription: string | null;
  productCategories: string | null;
  supportPhone: string;
  supportEmail: string;
  province: string;
  district: string;
  municipality: string;
  ward: string | null;
  locality: string;
}

export async function getEditableSellerProfile(database: D1Database, sellerId: string): Promise<EditableSellerProfile | null> {
  return (await database.prepare(
    `SELECT trading_name AS tradingName, business_description AS businessDescription,
      product_categories AS productCategories, support_phone AS supportPhone,
      support_email AS supportEmail, province, district, municipality, ward, locality
     FROM seller_profiles WHERE id = ? AND status = 'approved' LIMIT 1`,
  ).bind(sellerId).first<EditableSellerProfile>()) ?? null;
}

export async function updateSellerProfile(database: D1Database, options: { sellerId: string; actorId: string; input: EditableSellerProfile; requestId: string; now: number;
  form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot } }): Promise<void> {
  const input = Object.fromEntries(Object.entries(options.input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as unknown as EditableSellerProfile;
  const catalogDigest = options.form ? await digestFormRequest({ sellerId: options.sellerId,
    input, versionId: options.form.versionId, answers: options.form.answers }) : null;
  if (options.form && await formRequestReplay(database, { formId: 'seller.profile',
    requestId: options.form.requestId, actorId: options.actorId, action: 'seller.profile.updated',
    digest: catalogDigest!, subjectId: options.sellerId })) return;
  if (!options.form && await database.prepare(`SELECT id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`).bind(options.requestId, options.actorId).first()) return;
  const required = [input.tradingName, input.supportPhone, input.supportEmail, input.province, input.district, input.municipality, input.locality];
  if (required.some((value) => !value || value.length > 160)) throw new SellerProfileConflictError('Complete each required field using 160 characters or fewer.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.supportEmail)) throw new SellerProfileConflictError('Enter a valid support email.');
  if (!/^(?:\+?977)?9[678]\d{8}$/.test(input.supportPhone.replace(/[\s-]/g, ''))) throw new SellerProfileConflictError('Enter a valid Nepal support number.');
  if ((input.businessDescription?.length ?? 0) > 2000 || (input.productCategories?.length ?? 0) > 1000) throw new SellerProfileConflictError('Profile description is too long.');
  const current = await database.prepare(`SELECT id, trading_name AS tradingName FROM seller_profiles WHERE id = ? AND user_id = ? AND status = 'approved'`).bind(options.sellerId, options.actorId).first<{ id: string; tradingName: string }>();
  if (!current) throw new SellerProfileConflictError('Approved seller profile not found.');
  const nameChanged = current.tradingName !== input.tradingName;
  if (nameChanged && options.now < await publicProfileEditableAt(database, options.sellerId)) throw new SellerProfileConflictError('Your public maker profile can be changed once every 7 days.');
  const cooldownGuard = crypto.randomUUID();
  try { await database.batch([
    ...(nameChanged ? [database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN NOT EXISTS(
      SELECT 1 FROM audit_logs WHERE subject_type='seller_profile' AND subject_id=? AND action='seller.public_profile.saved' AND created_at>?) THEN 1 ELSE 0 END`)
      .bind(cooldownGuard, options.sellerId, options.now - publicProfileCooldownMs)] : []),
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
    database.prepare(
      `UPDATE seller_profiles SET trading_name = ?, business_description = ?, product_categories = ?, support_phone = ?, support_email = ?, province = ?, district = ?, municipality = ?, ward = ?, locality = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'approved'`,
    ).bind(input.tradingName, input.businessDescription || null, input.productCategories || null, input.supportPhone, input.supportEmail.toLowerCase(), input.province, input.district, input.municipality, input.ward || null, input.locality, options.now, options.sellerId, options.actorId),
    database.prepare(`SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('invalid', '$') END`),
    ...(nameChanged ? [database.prepare(`UPDATE seller_participation_profiles SET public_name=?,version=version+1,updated_at=? WHERE seller_id=?`)
      .bind(input.tradingName, options.now, options.sellerId),
      database.prepare(`INSERT INTO audit_logs(id,actor_id,action,subject_type,subject_id,reason,created_at) VALUES (?,?,'seller.public_profile.saved','seller_profile',?,'Seller updated public shop name',?)`)
        .bind(crypto.randomUUID(), options.actorId, options.sellerId, options.now),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(cooldownGuard)] : []),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'seller.profile.updated', 'seller_profile', ?, 'Seller updated public support and workshop profile fields', NULL, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.actorId, options.sellerId, JSON.stringify({ tradingName: input.tradingName,
      district: input.district, province: input.province, ...(catalogDigest ? { catalogDigest } : {}) }), options.requestId, options.now),
    ...(options.form ? [buildFormAnswerInsert(database, {
      formId: 'seller.profile', requestId: options.form.requestId, versionId: options.form.versionId,
      subjectType: 'seller', subjectId: options.sellerId, actorId: options.actorId,
      answers: options.form.answers, now: options.now,
    })] : []),
  ]); }
  catch (error) {
    if (options.form && await formRequestReplay(database, { formId: 'seller.profile',
      requestId: options.form.requestId, actorId: options.actorId, action: 'seller.profile.updated',
      digest: catalogDigest!, subjectId: options.sellerId })) return;
    throw error;
  }
}
