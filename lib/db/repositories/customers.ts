import {normalizeProvince,normalizeDistrict,districtBelongsToProvince,validWard} from '@/lib/checkout/nepal-address';
import { publicProductEligibility } from '@/lib/products/eligibility';
import {parseLocation} from '@/lib/delivery/validation';
export class CustomerDataConflictError extends Error {}

export interface CustomerOrderRow {
  orderNumber: string;
  status: string;
  paymentStatus: string;
  grandTotalPaisa: number;
  placedAt: number;
  deliveredAt: number | null;
  itemCount: number;
}

export interface CustomerAddressRow {
  latitude?: number | null;
  longitude?: number | null;
  id: string;
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  municipality: string;
  ward: string | null;
  locality: string;
  landmark: string | null;
  postalCode: string | null;
  isDefault: number;
}

export interface CustomerAddressInput {
  location?: import('@/lib/delivery/validation').DeliveryLocation;
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  municipality: string;
  ward?: string;
  locality: string;
  landmark?: string;
  postalCode?: string;
  isDefault?: boolean;
}

export interface WishlistProductRow {
  id: string;
  slug: string;
  nameEn: string;
  nameNe: string | null;
  pricePaisa: number;
  inventoryQuantity: number;
  tradingName: string;
  primaryMediaId: string | null;
  savedAt: number;
}

export interface PublicReviewRow {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  customerName: string;
  createdAt: number;
}

export interface PublicMakerProfile {
  id: string;
  tradingName: string;
  participationRoute: 'registered_seller' | 'managed_maker' | null;
  publicCity: string;
  businessDescription: string | null;
  productCategories: string | null;
  province: string;
  district: string;
  approvedAt: number | null;
  productCount: number;
}

export async function getPublicMakerProfile(database: D1Database, sellerId: string): Promise<PublicMakerProfile | null> {
  return (await database.prepare(
    `SELECT seller_profiles.id,
      COALESCE(participation.public_name, seller_profiles.trading_name) AS tradingName,
      participation.participation_route AS participationRoute,
      COALESCE(participation.public_city, seller_profiles.municipality) AS publicCity,
      seller_profiles.business_description AS businessDescription,
      seller_profiles.product_categories AS productCategories,
      seller_profiles.province, seller_profiles.district,
      seller_profiles.approved_at AS approvedAt, COUNT(products.id) AS productCount
     FROM seller_profiles
     LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
     LEFT JOIN products ON products.seller_id = seller_profiles.id AND ${publicProductEligibility()}
     WHERE seller_profiles.id = ?
       AND (seller_profiles.status = 'approved' OR (participation.participation_route = 'managed_maker' AND participation.application_stage = 'active'))
       AND EXISTS(SELECT 1 FROM users maker_owner WHERE maker_owner.id=seller_profiles.user_id AND maker_owner.status='active')
     GROUP BY seller_profiles.id LIMIT 1`,
  ).bind(sellerId).first<PublicMakerProfile>()) ?? null;
}

export async function listPublishedProductsByMaker(database: D1Database, sellerId: string): Promise<readonly WishlistProductRow[]> {
  const result = await database.prepare(
    `SELECT products.id, products.slug, products.name_en AS nameEn, products.name_ne AS nameNe,
      products.price_paisa AS pricePaisa, products.inventory_quantity AS inventoryQuantity,
      COALESCE(participation.public_name, seller_profiles.trading_name) AS tradingName, products.published_at AS savedAt,
      (SELECT product_media.id FROM product_media WHERE product_media.product_id = products.id ORDER BY product_media.sort_order LIMIT 1) AS primaryMediaId
     FROM products INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
     LEFT JOIN seller_participation_profiles participation ON participation.seller_id = seller_profiles.id
     WHERE products.seller_id = ? AND ${publicProductEligibility()}
       AND (seller_profiles.status = 'approved' OR (participation.participation_route = 'managed_maker' AND participation.application_stage = 'active'))
     ORDER BY products.published_at DESC`,
  ).bind(sellerId).all<WishlistProductRow>();
  return result.results;
}

export async function listCustomerOrders(database: D1Database, userId: string, limit = 100): Promise<readonly CustomerOrderRow[]> {
  const result = await database.prepare(
    `SELECT orders.order_number AS orderNumber, orders.status,
      orders.payment_status AS paymentStatus, COALESCE(orders.current_total_paisa,orders.grand_total_paisa) AS grandTotalPaisa,
      orders.placed_at AS placedAt, orders.delivered_at AS deliveredAt,
      COALESCE(SUM(order_items.quantity), 0) AS itemCount
     FROM orders LEFT JOIN order_items ON order_items.order_id = orders.id
     WHERE orders.customer_id = ? GROUP BY orders.id
     ORDER BY orders.created_at DESC LIMIT ?`,
  ).bind(userId, limit).all<CustomerOrderRow>();
  return result.results;
}

export async function listCustomerAddresses(database: D1Database, userId: string): Promise<readonly CustomerAddressRow[]> {
  const result = await database.prepare(
    `SELECT (SELECT latitude FROM address_locations WHERE address_id=addresses.id) AS latitude, (SELECT longitude FROM address_locations WHERE address_id=addresses.id) AS longitude, id, label, recipient_name AS recipientName, phone, province, district,
      municipality, ward, locality, landmark, postal_code AS postalCode,
      is_default AS isDefault FROM addresses WHERE user_id = ?
     ORDER BY is_default DESC, updated_at DESC`,
  ).bind(userId).all<CustomerAddressRow>();
  return result.results;
}

function normalizedAddress(input: CustomerAddressInput): CustomerAddressInput {
  const normalized = Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? value.trim() : value])) as unknown as CustomerAddressInput;
  const required = [normalized.label, normalized.recipientName, normalized.phone, normalized.province, normalized.district, normalized.municipality, normalized.locality];
  if (required.some((value) => !value || value.length > 120)) throw new CustomerDataConflictError('Complete every required address field using 120 characters or fewer.');
  if (!/^(?:\+?977)?9[678]\d{8}$/.test(normalized.phone.replace(/[\s-]/g, ''))) throw new CustomerDataConflictError('Enter a valid Nepal mobile number.');
  if (!districtBelongsToProvince(normalized.district,normalized.province)) throw new CustomerDataConflictError('Choose a district in your selected province, including East or West where needed.');
  if (!validWard(normalized.ward)) throw new CustomerDataConflictError('Ward must be a number from 1–99.');
  normalized.province=normalizeProvince(normalized.province)!;normalized.district=normalizeDistrict(normalized.district)!;
  if(normalized.ward) normalized.ward=String(Number(normalized.ward));
  try { normalized.location=parseLocation(input.location); } catch { throw new CustomerDataConflictError('Invalid delivery map pin.'); }
  return normalized;
}

export async function saveCustomerAddress(database: D1Database, options: { userId: string; addressId?: string; input: CustomerAddressInput; requestId: string; now: number }): Promise<string> {
  const input = normalizedAddress(options.input);
  const duplicate = await database.prepare(`SELECT subject_id AS id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`).bind(options.requestId, options.userId).first<{ id: string }>();
  if (duplicate) return duplicate.id;
  const id = options.addressId ?? crypto.randomUUID();
  const existing = options.addressId ? await database.prepare(`SELECT id FROM addresses WHERE id = ? AND user_id = ?`).bind(id, options.userId).first<{ id: string }>() : null;
  if (options.addressId && !existing) throw new CustomerDataConflictError('Address not found.');
  const statements: D1PreparedStatement[] = [];
  if (input.isDefault) statements.push(database.prepare(`UPDATE addresses SET is_default = 0, updated_at = ? WHERE user_id = ?`).bind(options.now, options.userId));
  statements.push(existing
    ? database.prepare(
      `UPDATE addresses SET label = ?, recipient_name = ?, phone = ?, province = ?, district = ?, municipality = ?, ward = ?, locality = ?, landmark = ?, postal_code = ?, is_default = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    ).bind(input.label, input.recipientName, input.phone, input.province, input.district, input.municipality, input.ward || null, input.locality, input.landmark || null, input.postalCode || null, input.isDefault ? 1 : 0, options.now, id, options.userId)
    : database.prepare(
      `INSERT INTO addresses (id, user_id, label, recipient_name, phone, province, district, municipality, ward, locality, landmark, postal_code, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, options.userId, input.label, input.recipientName, input.phone, input.province, input.district, input.municipality, input.ward || null, input.locality, input.landmark || null, input.postalCode || null, input.isDefault ? 1 : 0, options.now, options.now));
  statements.push(database.prepare('DELETE FROM address_locations WHERE address_id = ?').bind(id));
  if(input.location) statements.push(database.prepare('INSERT INTO address_locations(address_id,latitude,longitude) VALUES (?,?,?)').bind(id,input.location.latitude,input.location.longitude));
  statements.push(database.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
     VALUES (?, ?, ?, 'address', ?, 'Customer managed own saved delivery address', NULL, ?, ?, NULL, ?)`,
  ).bind(crypto.randomUUID(), options.userId, existing ? 'account.address.updated' : 'account.address.created', id, JSON.stringify({ label: input.label, isDefault: Boolean(input.isDefault) }), options.requestId, options.now));
  await database.batch(statements);
  return id;
}

export async function deleteCustomerAddress(database: D1Database, options: { userId: string; addressId: string; requestId: string; now: number }): Promise<void> {
  const duplicate = await database.prepare(`SELECT id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`).bind(options.requestId, options.userId).first();
  if (duplicate) return;
  const existing = await database.prepare(`SELECT id FROM addresses WHERE id = ? AND user_id = ?`).bind(options.addressId, options.userId).first();
  if (!existing) throw new CustomerDataConflictError('Address not found.');
  await database.batch([
    database.prepare(`DELETE FROM addresses WHERE id = ? AND user_id = ?`).bind(options.addressId, options.userId),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'account.address.deleted', 'address', ?, 'Customer deleted own saved delivery address', NULL, NULL, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.userId, options.addressId, options.requestId, options.now),
  ]);
}

export async function updateCustomerProfile(database: D1Database, options: { userId: string; displayName: string; phone: string; locale: 'en-NP' | 'ne-NP'; requestId: string; now: number }): Promise<void> {
  const displayName = options.displayName.trim();
  const phone = options.phone.trim().replace(/[\s-]/g, '');
  if (displayName.length < 2 || displayName.length > 100) throw new CustomerDataConflictError('Name must be 2â€“100 characters.');
  if (phone && !/^(?:\+?977)?9[678]\d{8}$/.test(phone)) throw new CustomerDataConflictError('Enter a valid Nepal mobile number.');
  const duplicate = await database.prepare(`SELECT id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`).bind(options.requestId, options.userId).first();
  if (duplicate) return;
  await database.batch([
    database.prepare(`UPDATE users SET display_name = ?, phone = ?, locale = ?, updated_at = ? WHERE id = ? AND status = 'active'`).bind(displayName, phone || null, options.locale, options.now, options.userId),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'account.profile.updated', 'user', ?, 'Customer updated own profile', NULL, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.userId, options.userId, JSON.stringify({ displayName, phone: phone || null, locale: options.locale }), options.requestId, options.now),
  ]);
}

export async function listWishlist(database: D1Database, userId: string): Promise<readonly WishlistProductRow[]> {
  const result = await database.prepare(
    `SELECT products.id, products.slug, products.name_en AS nameEn, products.name_ne AS nameNe,
      products.price_paisa AS pricePaisa, products.inventory_quantity AS inventoryQuantity,
      seller_profiles.trading_name AS tradingName, wishlist_items.created_at AS savedAt,
      (SELECT product_media.id FROM product_media WHERE product_media.product_id = products.id ORDER BY product_media.sort_order LIMIT 1) AS primaryMediaId
     FROM wishlist_items INNER JOIN products ON products.id = wishlist_items.product_id
     INNER JOIN seller_profiles ON seller_profiles.id = products.seller_id
     WHERE wishlist_items.user_id = ? AND ${publicProductEligibility()}
     ORDER BY wishlist_items.created_at DESC`,
  ).bind(userId).all<WishlistProductRow>();
  return result.results;
}

export async function isWishlisted(database: D1Database, userId: string, productId: string): Promise<boolean> {
  return Boolean(await database.prepare(`SELECT 1 AS found FROM wishlist_items WHERE user_id = ? AND product_id = ?`).bind(userId, productId).first());
}

export async function setWishlistItem(database: D1Database, options: { userId: string; productId: string; saved: boolean; now: number }): Promise<void> {
  if (options.saved) {
    const product = await database.prepare(`SELECT id FROM products WHERE id = ? AND status = 'published'`).bind(options.productId).first();
    if (!product) throw new CustomerDataConflictError('Product not found.');
    await database.prepare(`INSERT OR IGNORE INTO wishlist_items (user_id, product_id, created_at) VALUES (?, ?, ?)`).bind(options.userId, options.productId, options.now).run();
  } else {
    await database.prepare(`DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?`).bind(options.userId, options.productId).run();
  }
}

export async function listPublishedReviews(database: D1Database, productId: string, limit = 20): Promise<readonly PublicReviewRow[]> {
  const result = await database.prepare(
    `SELECT product_reviews.id, product_reviews.rating, product_reviews.title, product_reviews.body,
      users.display_name AS customerName, product_reviews.created_at AS createdAt
     FROM product_reviews INNER JOIN users ON users.id = product_reviews.customer_id
     WHERE product_reviews.product_id = ? AND product_reviews.status = 'published'
     ORDER BY product_reviews.created_at DESC LIMIT ?`,
  ).bind(productId, limit).all<PublicReviewRow>();
  return result.results;
}

export async function getReviewableOrderItem(database: D1Database, userId: string, productId: string): Promise<{ orderItemId: string; orderNumber: string } | null> {
  return (await database.prepare(
    `SELECT order_items.id AS orderItemId, orders.order_number AS orderNumber
     FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
     LEFT JOIN product_reviews ON product_reviews.order_item_id = order_items.id
     WHERE orders.customer_id = ? AND order_items.product_id = ? AND orders.status = 'delivered'
       AND order_items.fulfillment_status = 'delivered' AND product_reviews.id IS NULL
     ORDER BY orders.delivered_at DESC LIMIT 1`,
  ).bind(userId, productId).first<{ orderItemId: string; orderNumber: string }>()) ?? null;
}

export interface ReviewPhotoInput {id:string;objectKey:string;mimeType:string;sizeBytes:number;sortOrder:number}
export async function createProductReview(database: D1Database, options: { userId: string; productId: string; orderItemId: string; rating: number; title: string; body: string; requestId: string; now: number;photos?:readonly ReviewPhotoInput[] }): Promise<string> {
  const photos=options.photos??[];
  if(photos.length>3 || photos.some((p,i)=>p.sortOrder!==i || !['image/jpeg','image/png','image/webp'].includes(p.mimeType) || p.sizeBytes<1 || p.sizeBytes>5*1024*1024)) throw new CustomerDataConflictError('Add up to three JPG, PNG or WebP photos, each no larger than 5 MB.');
  if (!Number.isInteger(options.rating) || options.rating < 1 || options.rating > 5) throw new CustomerDataConflictError('Choose a rating from 1 to 5.');
  const title = options.title.trim();
  const body = options.body.trim();
  if (title.length > 120 || body.length < 10 || body.length > 2000) throw new CustomerDataConflictError('Review text must be 10â€“2,000 characters and the title at most 120 characters.');
  const duplicate = await database.prepare(`SELECT subject_id AS id FROM audit_logs WHERE request_id = ? AND actor_id = ? AND action='review.submitted' AND subject_type='product_review' LIMIT 1`).bind(options.requestId, options.userId).first<{ id: string }>();
  if (duplicate) return duplicate.id;
  const eligible = await database.prepare(
    `SELECT order_items.id FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
     WHERE order_items.id = ? AND order_items.product_id = ? AND orders.customer_id = ?
       AND orders.status = 'delivered' AND order_items.fulfillment_status = 'delivered' LIMIT 1`,
  ).bind(options.orderItemId, options.productId, options.userId).first();
  if (!eligible) throw new CustomerDataConflictError('Only a delivered verified purchase can be reviewed.');
  const id = crypto.randomUUID();
  try {
    await database.batch([
      database.prepare(
        `INSERT INTO product_reviews (id, product_id, customer_id, order_item_id, rating, title, body, status, moderation_note, moderated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
      ).bind(id, options.productId, options.userId, options.orderItemId, options.rating, title || null, body, options.now, options.now),
      ...photos.map(p=>database.prepare('INSERT INTO review_photos(id,review_id,object_key,mime_type,size_bytes,sort_order,created_at) VALUES (?,?,?,?,?,?,?)').bind(p.id,id,p.objectKey,p.mimeType,p.sizeBytes,p.sortOrder,options.now)),
      database.prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
         VALUES (?, ?, 'review.submitted', 'product_review', ?, 'Verified customer submitted a product review', NULL, ?, ?, NULL, ?)`,
      ).bind(crypto.randomUUID(), options.userId, id, JSON.stringify({ status: 'pending', rating: options.rating }), options.requestId, options.now),
    ]);
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint|Duplicate entry/.test(error.message)) throw new CustomerDataConflictError('This delivered item has already been reviewed.');
    throw error;
  }
  return id;
}

export interface ReviewModerationRow extends PublicReviewRow {
  productName: string;
  productSlug: string;
  orderNumber: string;
  status: string;
}

export async function listReviewsForModeration(database: D1Database, limit = 100): Promise<readonly ReviewModerationRow[]> {
  const result = await database.prepare(
    `SELECT product_reviews.id, product_reviews.rating, product_reviews.title, product_reviews.body,
      product_reviews.status, product_reviews.created_at AS createdAt, users.display_name AS customerName,
      products.name_en AS productName, products.slug AS productSlug, orders.order_number AS orderNumber
     FROM product_reviews INNER JOIN users ON users.id = product_reviews.customer_id
     INNER JOIN products ON products.id = product_reviews.product_id
     INNER JOIN order_items ON order_items.id = product_reviews.order_item_id
     INNER JOIN orders ON orders.id = order_items.order_id
     WHERE product_reviews.status IN ('pending', 'published')
     ORDER BY CASE product_reviews.status WHEN 'pending' THEN 0 ELSE 1 END, product_reviews.created_at DESC LIMIT ?`,
  ).bind(limit).all<ReviewModerationRow>();
  return result.results;
}

export async function moderateProductReview(database: D1Database, options: { reviewId: string; actorId: string; action: 'publish' | 'reject' | 'hide'; note: string; requestId: string; now: number }): Promise<void> {
  if (await database.prepare(`SELECT id FROM audit_logs WHERE request_id = ? LIMIT 1`).bind(options.requestId).first()) return;
  const note = options.note.trim();
  if (note.length < 8 || note.length > 1000) throw new CustomerDataConflictError('Add a moderation note of 8â€“1,000 characters.');
  const current = await database.prepare(`SELECT status FROM product_reviews WHERE id = ? LIMIT 1`).bind(options.reviewId).first<{ status: string }>();
  if (!current) throw new CustomerDataConflictError('Review not found.');
  const next = options.action === 'publish' ? 'published' : options.action === 'reject' ? 'rejected' : 'hidden';
  if ((options.action === 'publish' || options.action === 'reject') && current.status !== 'pending') throw new CustomerDataConflictError('Only a pending review can receive this decision.');
  if (options.action === 'hide' && current.status !== 'published') throw new CustomerDataConflictError('Only a published review can be hidden.');
  await database.batch([
    database.prepare(`UPDATE product_reviews SET status = ?, moderation_note = ?, moderated_by = ?, updated_at = ? WHERE id = ? AND status = ?`).bind(next, note, options.actorId, options.now, options.reviewId, current.status),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, ?, 'product_review', ?, ?, ?, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.actorId, `review.${options.action}`, options.reviewId, note, JSON.stringify({ status: current.status }), JSON.stringify({ status: next }), options.requestId, options.now),
  ]);
}
