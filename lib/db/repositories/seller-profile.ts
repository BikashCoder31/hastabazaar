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

export async function updateSellerProfile(database: D1Database, options: { sellerId: string; actorId: string; input: EditableSellerProfile; requestId: string; now: number }): Promise<void> {
  if (await database.prepare(`SELECT id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`).bind(options.requestId, options.actorId).first()) return;
  const input = Object.fromEntries(Object.entries(options.input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as unknown as EditableSellerProfile;
  const required = [input.tradingName, input.supportPhone, input.supportEmail, input.province, input.district, input.municipality, input.locality];
  if (required.some((value) => !value || value.length > 160)) throw new SellerProfileConflictError('Complete each required field using 160 characters or fewer.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.supportEmail)) throw new SellerProfileConflictError('Enter a valid support email.');
  if (!/^(?:\+?977)?9[678]\d{8}$/.test(input.supportPhone.replace(/[\s-]/g, ''))) throw new SellerProfileConflictError('Enter a valid Nepal support number.');
  if ((input.businessDescription?.length ?? 0) > 2000 || (input.productCategories?.length ?? 0) > 1000) throw new SellerProfileConflictError('Profile description is too long.');
  const current = await database.prepare(`SELECT id FROM seller_profiles WHERE id = ? AND status = 'approved'`).bind(options.sellerId).first();
  if (!current) throw new SellerProfileConflictError('Approved seller profile not found.');
  await database.batch([
    database.prepare(
      `UPDATE seller_profiles SET trading_name = ?, business_description = ?, product_categories = ?, support_phone = ?, support_email = ?, province = ?, district = ?, municipality = ?, ward = ?, locality = ?, updated_at = ? WHERE id = ? AND status = 'approved'`,
    ).bind(input.tradingName, input.businessDescription || null, input.productCategories || null, input.supportPhone, input.supportEmail.toLowerCase(), input.province, input.district, input.municipality, input.ward || null, input.locality, options.now, options.sellerId),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'seller.profile.updated', 'seller_profile', ?, 'Seller updated public support and workshop profile fields', NULL, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.actorId, options.sellerId, JSON.stringify({ tradingName: input.tradingName, district: input.district, province: input.province }), options.requestId, options.now),
  ]);
}
