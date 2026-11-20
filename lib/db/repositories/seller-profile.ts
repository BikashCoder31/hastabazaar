import { validWard, wardNumberError } from '@/lib/checkout/nepal-address';
import { buildFormAnswerInsert } from './form-answers';
import type { FormAnswerSnapshot } from '@/lib/forms/types';
import { digestFormRequest, formRequestReplay } from '@/lib/forms/submission';

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
  if (input.ward != null && (typeof input.ward !== 'string' || !validWard(input.ward)))
    throw new SellerProfileConflictError(wardNumberError);
  const required = [input.province, input.district, input.municipality, input.locality];
  if (required.some((value) => !value || value.length > 160)) throw new SellerProfileConflictError('Complete each required field using 160 characters or fewer.');
  if ((input.businessDescription?.length ?? 0) > 2000 || (input.productCategories?.length ?? 0) > 1000) throw new SellerProfileConflictError('Profile description is too long.');
  const current = await database.prepare(`SELECT id, trading_name AS tradingName,business_description AS businessDescription,product_categories AS productCategories,support_email AS supportEmail,support_phone AS supportPhone FROM seller_profiles WHERE id = ? AND user_id = ? AND status = 'approved'`).bind(options.sellerId, options.actorId).first<{ id: string; tradingName: string;businessDescription:string|null;productCategories:string|null;supportEmail:string;supportPhone:string }>();
  if (!current) throw new SellerProfileConflictError('Approved seller profile not found.');
  if(current.tradingName!==input.tradingName||(current.businessDescription??'')!==(input.businessDescription??'')||(current.productCategories??'')!==(input.productCategories??''))
    throw new SellerProfileConflictError('Public presentation changes require a private draft and review. Save support and operational changes separately.');
  if(current.supportEmail!==input.supportEmail||current.supportPhone!==input.supportPhone)throw new SellerProfileConflictError('Use the separate public customer-support contact action and its disclosure.');
  const cooldownGuard = crypto.randomUUID();
  try { await database.batch([
    database.prepare(`INSERT INTO operation_transaction_guards(id,valid) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM seller_profiles s JOIN users u ON u.id=s.user_id
      WHERE s.id=? AND s.user_id=? AND s.status='approved' AND u.status='active' AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role='seller') AND s.trading_name=? AND COALESCE(s.business_description,'')=? AND COALESCE(s.product_categories,'')=?) THEN 1 ELSE 0 END`)
      .bind(cooldownGuard,options.sellerId,options.actorId,input.tradingName,input.businessDescription??'',input.productCategories??''),
    ...(options.form ? [database.prepare(`SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      THEN 1 ELSE json_extract('invalid', '$') END`).bind(options.form.requestId)] : []),
    database.prepare(
      `UPDATE seller_profiles SET province = ?, district = ?, municipality = ?, ward = ?, locality = ?, updated_at = ? WHERE id = ? AND user_id = ? AND status = 'approved'`,
    ).bind(input.province, input.district, input.municipality, input.ward || null, input.locality, options.now, options.sellerId, options.actorId),
    database.prepare(`SELECT CASE WHEN changes() = 1 THEN 1 ELSE json_extract('invalid', '$') END`),
    database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(cooldownGuard),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'seller.profile.updated', 'seller_profile', ?, 'Seller updated private workshop fields; public presentation and support contacts retained', NULL, ?, ?, NULL, ?)`,
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
