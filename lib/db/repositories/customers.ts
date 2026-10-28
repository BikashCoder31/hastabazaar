import { publicProductName } from '@/lib/products/truthful-presentation';
import { payableOrderTotalSql } from './platform-service-fee';
import {normalizeProvince,normalizeDistrict,districtBelongsToProvince,validWard} from '@/lib/checkout/nepal-address';
import {normalizeNepalMobile} from '@/lib/auth/nepal-phone';
import { publicProductEligibility } from '@/lib/products/eligibility';
import {parseLocation} from '@/lib/delivery/validation';
import { buildFormAnswerInsert, getFormAnswerById, type StoredFormAnswer } from './form-answers';
import { authorizeFormAnswerRead } from '@/lib/forms/access';
import { FORM_REGISTRY } from '@/lib/forms/registry';
import type { FormAnswerSnapshot, PublishedFormConfig } from '@/lib/forms/types';
import { FormRuntimeError, resolvePublishedForm } from '@/lib/forms/runtime';
import { canonicalKey, digestFormRequest } from '@/lib/forms/submission';
import { FormValidationError, validateAnswersForDefinition, validateFormDraft } from '@/lib/forms/validation';
import { staffMutationGuard } from './staff-mutation-guard';
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
  return result.results.map(item => ({...item,nameEn:publicProductName(item.nameEn)}));
}

export async function listCustomerOrders(database: D1Database, userId: string, limit = 100): Promise<readonly CustomerOrderRow[]> {
  const result = await database.prepare(
    `SELECT orders.order_number AS orderNumber, orders.status,
      orders.payment_status AS paymentStatus, ${payableOrderTotalSql()} AS grandTotalPaisa,
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

export async function listDeletedCustomerAddressAnswerOwnersPage(database: D1Database, input: {
  userId: string; after?: { deletedAt: number; addressId: string };
}): Promise<{ addresses: readonly { addressId: string; deletedAt: number }[];
  nextCursor: { deletedAt: number; addressId: string } | null }> {
  if (input.after && (!Number.isSafeInteger(input.after.deletedAt) || input.after.deletedAt < 0 ||
    !input.after.addressId || input.after.addressId.length > 191))
    throw new CustomerDataConflictError('Deleted-address cursor is invalid.');
  const rows = await database.prepare(`SELECT t.address_id AS addressId,t.deleted_at AS deletedAt
    FROM address_answer_owner_tombstones t WHERE t.user_id=?
      AND NOT EXISTS(SELECT 1 FROM addresses a WHERE a.id=t.address_id)
      AND EXISTS(SELECT 1 FROM form_answer_sets f WHERE f.subject_type='address' AND f.subject_id=t.address_id)
      AND (? IS NULL OR t.deleted_at>? OR (t.deleted_at=? AND t.address_id>?))
    ORDER BY t.deleted_at,t.address_id LIMIT 51`)
    .bind(input.userId, input.after?.deletedAt ?? null, input.after?.deletedAt ?? 0,
      input.after?.deletedAt ?? 0, input.after?.addressId ?? '')
    .all<{ addressId: string; deletedAt: number }>();
  const addresses = rows.results.slice(0, 50);
  const last = addresses.at(-1);
  return { addresses, nextCursor: rows.results.length > 50 && last ? { ...last } : null };
}

type AddressFormSubmission = { formVersion: number; versionId: string; answers: FormAnswerSnapshot };

function addressCore(input: CustomerAddressInput) {
  return { label: input.label, recipientName: input.recipientName, phone: input.phone,
    province: input.province, district: input.district, municipality: input.municipality,
    ward: input.ward || null, locality: input.locality, landmark: input.landmark || null,
    postalCode: input.postalCode || null, isDefault: Boolean(input.isDefault),
    location: input.location ?? null };
}

async function addressDigest(input: CustomerAddressInput): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(addressCore(input))));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function validateAddressFormSubmission(database: D1Database, input: CustomerAddressInput,
  formVersion: number, customAnswers: unknown): Promise<AddressFormSubmission> {
  const config = await resolvePublishedForm(database, 'account.address');
  if (formVersion !== config.version) throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
  if (!Array.isArray(customAnswers)) throw new FormValidationError('invalid_answer', 'Malformed answer payload');
  const builtIns = new Set(FORM_REGISTRY['account.address'].baseFields.map((field) => canonicalKey(field.key)));
  for (const entry of customAnswers) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && 'fieldId' in entry && typeof entry.fieldId === 'string') {
      const field = config.fields.find((candidate) => candidate.id === entry.fieldId);
      if (field && builtIns.has(canonicalKey(field.key))) throw new FormValidationError('invalid_answer', 'Built-in address values cannot be submitted as custom answers.');
    }
  }
  const landmark = config.fields.find((field) => canonicalKey(field.key) === 'landmark' && field.status === 'active');
  const raw = landmark && input.landmark?.trim() ? [...customAnswers, { fieldId: landmark.id, value: input.landmark.trim() }] : customAnswers;
  const answers = validateAnswersForDefinition(FORM_REGISTRY['account.address'], config, raw);
  const version = await database.prepare(`SELECT id FROM form_config_versions WHERE form_id=? AND version=? AND status='published' LIMIT 1`)
    .bind('account.address', config.version).first<{ id: string }>();
  if (!version) throw new FormRuntimeError('config_unavailable', 'Published form version unavailable');
  return { formVersion: config.version, versionId: version.id, answers };
}

export async function customerAddressRequestStatus(database: D1Database, options: {
  userId: string; addressId?: string; input: CustomerAddressInput; requestId: string;
  formVersion: number; customAnswers: unknown;
}): Promise<{ status: 'new' | 'same' | 'conflict'; id?: string }> {
  const input = normalizedAddress(options.input);
  let row: { id: string; actorId: string; action: string; coreJson: string | null; answersJson: string | null;
    configJson: string | null; savedVersion: number | null; publishedAt: number | null } | null;
  try {
    row = await database.prepare(`SELECT a.subject_id AS id,a.actor_id AS actorId,a.action,a.next_json AS coreJson,
        f.answers_json AS answersJson,v.config_json AS configJson,v.version AS savedVersion,v.published_at AS publishedAt
      FROM audit_logs a LEFT JOIN form_answer_sets f ON f.form_id='account.address' AND f.request_id=a.request_id
      LEFT JOIN form_config_versions v ON v.id=f.config_version_id
      WHERE a.request_id=? LIMIT 1`)
      .bind(options.requestId).first<typeof row & object>();
  } catch { throw new FormRuntimeError('config_unavailable', 'Address replay state unavailable'); }
  if (!row) return { status: 'new' };
  if (row.actorId !== options.userId || row.action !== (options.addressId ? 'account.address.updated' : 'account.address.created') ||
    options.addressId && row.id !== options.addressId || !row.coreJson || !row.answersJson || !row.configJson ||
    row.savedVersion !== options.formVersion || !Number.isSafeInteger(row.publishedAt)) return { status: 'conflict' };
  try {
    const previous = JSON.parse(row.coreJson) as { coreDigest?: unknown };
    const snapshot = JSON.parse(row.answersJson) as FormAnswerSnapshot;
    const draft = validateFormDraft('account.address', JSON.parse(row.configJson) as unknown);
    const builtIns = new Set(FORM_REGISTRY['account.address'].baseFields.map((field) => canonicalKey(field.key)));
    const config: PublishedFormConfig = { ...draft, version: row.savedVersion, publishedAt: row.publishedAt!,
      fields: draft.fields.filter((field) => !builtIns.has(canonicalKey(field.key))) };
    const normalized = validateAnswersForDefinition(FORM_REGISTRY['account.address'], config, options.customAnswers);
    const same = previous.coreDigest === await addressDigest(input) && snapshot.formId === 'account.address' &&
      JSON.stringify(snapshot.answers) === JSON.stringify(normalized.answers);
    return { status: same ? 'same' : 'conflict', ...(same ? { id: row.id } : {}) };
  } catch { return { status: 'conflict' }; }
}

export async function saveCustomerAddress(database: D1Database, options: { userId: string; addressId?: string; input: CustomerAddressInput; requestId: string; now: number; form?: AddressFormSubmission }): Promise<string> {
  const input = normalizedAddress(options.input);
  if (options.form) {
    const replay = await customerAddressRequestStatus(database, { ...options, formVersion: options.form.formVersion,
      customAnswers: options.form.answers.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })) });
    if (replay.status === 'same') return replay.id!;
    if (replay.status === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different address values.');
  } else {
    const duplicate = await database.prepare(`SELECT subject_id AS id FROM audit_logs WHERE request_id = ? AND actor_id = ? LIMIT 1`).bind(options.requestId, options.userId).first<{ id: string }>();
    if (duplicate) return duplicate.id;
  }
  const id = options.addressId ?? crypto.randomUUID();
  const existing = options.addressId ? await database.prepare(`SELECT id FROM addresses WHERE id = ? AND user_id = ?`).bind(id, options.userId).first<{ id: string }>() : null;
  if (options.addressId && !existing) throw new CustomerDataConflictError('Address not found.');
  const statements: D1PreparedStatement[] = [];
  if (options.form) statements.push(database.prepare(`SELECT CASE WHEN
      EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')
      AND (SELECT MAX(version) FROM form_config_versions WHERE form_id='account.address' AND status='published')=?
      AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
      AND NOT EXISTS(SELECT 1 FROM form_answer_sets WHERE form_id='account.address' AND request_id=?)
      AND (? IS NULL OR EXISTS(SELECT 1 FROM addresses WHERE id=? AND user_id=?))
      THEN 1 ELSE json_extract('invalid','$') END AS valid`)
    .bind(options.userId, options.form.formVersion, options.requestId, options.requestId,
      options.addressId ?? null, id, options.userId));
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
  if (options.form) statements.push(buildFormAnswerInsert(database, { formId: 'account.address', requestId: options.requestId,
    versionId: options.form.versionId, subjectType: 'address', subjectId: id, actorId: options.userId,
    answers: options.form.answers, now: options.now }));
  statements.push(database.prepare(
    `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
     VALUES (?, ?, ?, 'address', ?, 'Customer managed own saved delivery address', NULL, ?, ?, NULL, ?)`,
  ).bind(crypto.randomUUID(), options.userId, existing ? 'account.address.updated' : 'account.address.created', id,
    JSON.stringify({ label: input.label, isDefault: Boolean(input.isDefault), ...(options.form ? { coreDigest: await addressDigest(input) } : {}) }), options.requestId, options.now));
  try { await database.batch(statements); }
  catch (error) {
    if (options.form) {
      const replay = await customerAddressRequestStatus(database, { ...options, formVersion: options.form.formVersion,
        customAnswers: options.form.answers.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })) });
      if (replay.status === 'same') return replay.id!;
      if (replay.status === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different address values.');
      const current = await database.prepare(`SELECT MAX(version) AS version FROM form_config_versions WHERE form_id='account.address' AND status='published'`).first<{ version: number | null }>();
      if (current?.version !== options.form.formVersion) throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    }
    throw error;
  }
  return id;
}

async function addressDeletionRequestStatus(database: D1Database, options: { userId: string; addressId: string; requestId: string }): Promise<'new' | 'same' | 'conflict'> {
  const duplicate = await database.prepare(`SELECT actor_id AS actorId,action,subject_type AS subjectType,
    subject_id AS subjectId FROM audit_logs WHERE request_id=? LIMIT 1`)
    .bind(options.requestId).first<{ actorId: string; action: string; subjectType: string; subjectId: string }>();
  if (!duplicate) return 'new';
  return duplicate.actorId === options.userId && duplicate.action === 'account.address.deleted' &&
    duplicate.subjectType === 'address' && duplicate.subjectId === options.addressId ? 'same' : 'conflict';
}

export async function deleteCustomerAddress(database: D1Database, options: { userId: string; addressId: string; requestId: string; now: number }): Promise<void> {
  const replay = await addressDeletionRequestStatus(database, options);
  if (replay === 'same') return;
  if (replay === 'conflict') throw new CustomerDataConflictError('This request ID was already used for a different address action.');
  const existing = await database.prepare(`SELECT id FROM addresses WHERE id = ? AND user_id = ?`).bind(options.addressId, options.userId).first();
  if (!existing) throw new CustomerDataConflictError('Address not found.');
  try {
    await database.batch([
    database.prepare(`INSERT INTO address_answer_owner_tombstones
      (address_id,user_id,deletion_request_id,deleted_at)
      SELECT a.id,a.user_id,?,? FROM addresses a WHERE a.id=? AND a.user_id=?
        AND EXISTS(SELECT 1 FROM form_answer_sets f WHERE f.subject_type='address' AND f.subject_id=a.id)
        AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)`)
      .bind(options.requestId, options.now, options.addressId, options.userId, options.requestId),
    database.prepare(`DELETE FROM addresses WHERE id=? AND user_id=?
      AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)`)
      .bind(options.addressId, options.userId, options.requestId),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'account.address.deleted', 'address',
         CASE WHEN changes()=1 THEN ? ELSE json_extract('invalid address deletion','$') END,
         'Customer deleted own saved delivery address', NULL, NULL, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.userId, options.addressId, options.requestId, options.now),
    ]);
  } catch (error) {
    const committed = await addressDeletionRequestStatus(database, options);
    if (committed === 'same') return;
    if (committed === 'conflict') throw new CustomerDataConflictError('This request ID was already used for a different address action.');
    throw error;
  }
}

export async function customerProfileRequestStatus(database: D1Database, input: {
  userId: string; requestId: string; displayName: string; phone: string; locale: 'en-NP' | 'ne-NP';
  formVersion: number; customAnswers: unknown;
}): Promise<'new' | 'same' | 'conflict'> {
  type ProfileReplayRow = { coreJson: string; answersJson: string | null; configJson: string | null;
    savedVersion: number | null; publishedAt: number | null; versionStatus: string | null };
  let row: ProfileReplayRow | null;
  try { row = await database.prepare(`SELECT a.next_json AS coreJson, f.answers_json AS answersJson,
      v.config_json AS configJson, v.version AS savedVersion, v.published_at AS publishedAt, v.status AS versionStatus
    FROM audit_logs a LEFT JOIN form_answer_sets f
      ON f.form_id = 'account.profile' AND f.request_id = a.request_id
    LEFT JOIN form_config_versions v ON v.id = f.config_version_id
    WHERE a.request_id = ? AND a.actor_id = ? AND a.action = 'account.profile.updated'
      AND a.subject_type = 'user' AND a.subject_id = ? LIMIT 1`)
    .bind(input.requestId, input.userId, input.userId).first<ProfileReplayRow>(); }
  catch { throw new FormRuntimeError('config_unavailable', 'Form configuration read failed'); }
  if (!row) return 'new';
  try {
    const core = JSON.parse(row.coreJson) as { displayName?: unknown; phone?: unknown; locale?: unknown };
    const snapshot = JSON.parse(row.answersJson ?? '') as FormAnswerSnapshot;
    if (row.versionStatus !== 'published' || !row.configJson || typeof row.savedVersion !== 'number' ||
      !Number.isSafeInteger(row.savedVersion) || typeof row.publishedAt !== 'number' || !Number.isSafeInteger(row.publishedAt)) return 'conflict';
    const definition = FORM_REGISTRY['account.profile'];
    const savedConfig = validateFormDraft('account.profile', JSON.parse(row.configJson) as unknown);
    const builtInKeys = new Set(definition.baseFields.map((field) => field.key.replace(/[^a-z0-9]/gi, '').toLowerCase()));
    const config: PublishedFormConfig = { ...savedConfig, version: row.savedVersion, publishedAt: row.publishedAt,
      fields: savedConfig.fields.filter((field) => !builtInKeys.has(field.key.replace(/[^a-z0-9]/gi, '').toLowerCase())) };
    const requested = validateAnswersForDefinition(definition, config, input.customAnswers);
    const previouslySaved = snapshot.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value }));
    const savedPhone=typeof core.phone==='string'?normalizeNepalMobile(core.phone):null;
    const requestedPhone=normalizeNepalMobile(input.phone);
    return core.displayName === input.displayName.trim() && savedPhone===requestedPhone &&
      (requestedPhone!==null || input.phone.trim()==='') &&
      core.locale === input.locale && snapshot.formId === 'account.profile' && snapshot.version === row.savedVersion &&
      snapshot.version === input.formVersion &&
      JSON.stringify(previouslySaved) === JSON.stringify(requested.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value }))) ? 'same' : 'conflict';
  } catch { return 'conflict'; }
}

export async function updateCustomerProfile(database: D1Database, options: { userId: string; displayName: string; phone: string; locale: 'en-NP' | 'ne-NP'; requestId: string; now: number; formVersion: number; versionId: string; answers: FormAnswerSnapshot }): Promise<void> {
  const displayName = options.displayName.trim();
  const enteredPhone=options.phone.trim();
  const canonicalPhone=normalizeNepalMobile(enteredPhone);
  if (displayName.length < 2 || displayName.length > 100) throw new CustomerDataConflictError('Name must be 2â€“100 characters.');
  if (enteredPhone && !canonicalPhone) throw new CustomerDataConflictError('Enter a valid Nepal mobile number.');
  const replay = await customerProfileRequestStatus(database, { ...options,
    customAnswers: options.answers.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })) });
  if (replay === 'same') return;
  if (replay === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different profile values.');
  const current=await database.prepare("SELECT phone FROM users WHERE id=? AND status='active'").bind(options.userId).first<{phone:string|null}>();
  if(!current)throw new CustomerDataConflictError('The customer account is unavailable.');
  // Preserve the stored representation for the same destination, so changing
  // whitespace/country-prefix presentation cannot revoke a valid proof.
  const phone=canonicalPhone && normalizeNepalMobile(current.phone)===canonicalPhone ? current.phone : canonicalPhone;
  const statements = [
    database.prepare(`SELECT CASE WHEN EXISTS (SELECT 1 FROM users WHERE id = ? AND status = 'active'
      AND (phone=? OR (phone IS NULL AND ? IS NULL)))
      AND (SELECT MAX(version) FROM form_config_versions WHERE form_id = 'account.profile' AND status = 'published') = ?
      AND NOT EXISTS (SELECT 1 FROM audit_logs WHERE request_id = ?)
      THEN 1 ELSE json_extract('invalid', '$') END AS valid`)
      .bind(options.userId,current.phone,current.phone,options.formVersion,options.requestId),
    database.prepare(`UPDATE users SET display_name = ?, phone = ?, locale = ?, updated_at = ? WHERE id = ? AND status = 'active'`).bind(displayName, phone || null, options.locale, options.now, options.userId),
    buildFormAnswerInsert(database, { formId: 'account.profile', requestId: options.requestId,
      versionId: options.versionId, subjectType: 'user', subjectId: options.userId,
      actorId: options.userId, answers: options.answers, now: options.now }),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, 'account.profile.updated', 'user', ?, 'Customer updated own profile', NULL, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.userId, options.userId, JSON.stringify({ displayName, phone: phone || null, locale: options.locale }), options.requestId, options.now),
  ];
  try { await database.batch(statements); }
  catch (error) {
    // A concurrent exact replay can lose the pre-batch duplicate check; the
    // unique request ID still aborts its batch and leaves one successful write.
    const concurrent = await customerProfileRequestStatus(database, { ...options,
      customAnswers: options.answers.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })) });
    if (concurrent === 'same') return;
    if (concurrent === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different profile values.');
    const current = await database.prepare(`SELECT MAX(version) AS version FROM form_config_versions
      WHERE form_id = 'account.profile' AND status = 'published'`).first<{ version: number | null }>();
    if (current?.version !== options.formVersion) throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    throw error;
  }
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
  return result.results.map(item => ({...item,nameEn:publicProductName(item.nameEn)}));
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
type ReviewFormSubmission = { formVersion: number; versionId: string; answers: FormAnswerSnapshot };

export async function validateReviewFormSubmission(database: D1Database, formVersion: number, customAnswers: unknown): Promise<ReviewFormSubmission> {
  const config = await resolvePublishedForm(database, 'account.review');
  if (config.version !== formVersion) throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
  const answers = validateAnswersForDefinition(FORM_REGISTRY['account.review'], config, customAnswers);
  const version = await database.prepare(`SELECT id FROM form_config_versions WHERE form_id='account.review' AND status='published' AND version=? LIMIT 1`)
    .bind(config.version).first<{ id: string }>();
  if (!version) throw new FormRuntimeError('config_unavailable', 'Published form version unavailable');
  return { formVersion: config.version, versionId: version.id, answers };
}

export async function listCustomerReviewAnswerHistory(database: D1Database, userId: string,
  after?: { createdAt: number; id: string }): Promise<{ entries: { orderNumber: string; answer: StoredFormAnswer }[];
    nextCursor: { createdAt: number; id: string } | null }> {
  if (after && (!Number.isSafeInteger(after.createdAt) || after.createdAt < 0 || !after.id || after.id.length > 191))
    throw new CustomerDataConflictError('Review history cursor is invalid.');
  const rows = await database.prepare(`SELECT f.id AS answerId,f.created_at AS createdAt,o.order_number AS orderNumber
    FROM form_answer_sets f JOIN product_reviews r ON r.id=f.subject_id AND f.subject_type='product_review'
    JOIN order_items i ON i.id=r.order_item_id JOIN orders o ON o.id=i.order_id
    WHERE f.form_id='account.review' AND r.customer_id=? AND o.customer_id=?
      AND (? IS NULL OR f.created_at<? OR (f.created_at=? AND f.id<?))
    ORDER BY f.created_at DESC,f.id DESC LIMIT 51`)
    .bind(userId, userId, after?.createdAt ?? null, after?.createdAt ?? 0,
      after?.createdAt ?? 0, after?.id ?? '').all<{ answerId: string; createdAt: number; orderNumber: string }>();
  const page = rows.results.slice(0, 50);
  const entries = (await Promise.all(page.map(async (row) => {
    const answer = await getFormAnswerById(database, row.answerId);
    return answer && await authorizeFormAnswerRead(database, { id: userId, role: 'customer' }, answer)
      ? { orderNumber: row.orderNumber, answer } : null;
  }))).filter((entry): entry is { orderNumber: string; answer: StoredFormAnswer } => entry !== null);
  const last = page.at(-1);
  return { entries, nextCursor: rows.results.length > 50 && last ? { createdAt: last.createdAt, id: last.answerId } : null };
}

export async function productReviewRequestStatus(database: D1Database, options: {
  userId: string; productId: string; orderItemId: string; requestId: string;
  formVersion: number; customAnswers: unknown; requestDigest: string;
}): Promise<{ status: 'new' | 'same' | 'conflict'; id?: string }> {
  let row: { id: string; customerId: string; productId: string; orderItemId: string; nextJson: string | null;
    answersJson: string | null; configJson: string | null; savedVersion: number | null; publishedAt: number | null } | null;
  try {
    row = await database.prepare(`SELECT a.subject_id AS id,r.customer_id AS customerId,r.product_id AS productId,
        r.order_item_id AS orderItemId,a.next_json AS nextJson,f.answers_json AS answersJson,
        v.config_json AS configJson,v.version AS savedVersion,v.published_at AS publishedAt
      FROM audit_logs a LEFT JOIN product_reviews r ON r.id=a.subject_id
      LEFT JOIN form_answer_sets f ON f.form_id='account.review' AND f.request_id=a.request_id
      LEFT JOIN form_config_versions v ON v.id=f.config_version_id
      WHERE a.request_id=? AND a.action='review.submitted' AND a.subject_type='product_review' LIMIT 1`)
      .bind(options.requestId).first<typeof row & object>();
  } catch { throw new FormRuntimeError('config_unavailable', 'Review replay state unavailable'); }
  if (!row) {
    const used = await database.prepare(`SELECT 1 AS used FROM audit_logs WHERE request_id=? LIMIT 1`).bind(options.requestId).first();
    return { status: used ? 'conflict' : 'new' };
  }
  if (row.customerId !== options.userId || row.productId !== options.productId || row.orderItemId !== options.orderItemId ||
    row.savedVersion !== options.formVersion || !row.nextJson || !row.answersJson || !row.configJson || !Number.isSafeInteger(row.publishedAt)) return { status: 'conflict' };
  try {
    const previous = JSON.parse(row.nextJson) as { requestDigest?: unknown };
    const snapshot = JSON.parse(row.answersJson) as FormAnswerSnapshot;
    const draft = validateFormDraft('account.review', JSON.parse(row.configJson) as unknown);
    const config: PublishedFormConfig = { ...draft, version: row.savedVersion, publishedAt: row.publishedAt! };
    const requested = validateAnswersForDefinition(FORM_REGISTRY['account.review'], config, options.customAnswers);
    const same = previous.requestDigest === options.requestDigest && snapshot.formId === 'account.review' &&
      JSON.stringify(snapshot.answers) === JSON.stringify(requested.answers);
    return { status: same ? 'same' : 'conflict', ...(same ? { id: row.id } : {}) };
  } catch { return { status: 'conflict' }; }
}

export async function createProductReview(database: D1Database, options: { userId: string; productId: string; orderItemId: string; rating: number; title: string; body: string; requestId: string; now: number;photos?:readonly ReviewPhotoInput[]; form?: ReviewFormSubmission; requestDigest?: string }): Promise<string> {
  const photos=options.photos??[];
  if(photos.length>3 || photos.some((p,i)=>p.sortOrder!==i || !['image/jpeg','image/png','image/webp'].includes(p.mimeType) || p.sizeBytes<1 || p.sizeBytes>5*1024*1024)) throw new CustomerDataConflictError('Add up to three JPG, PNG or WebP photos, each no larger than 5 MB.');
  if (!Number.isInteger(options.rating) || options.rating < 1 || options.rating > 5) throw new CustomerDataConflictError('Choose a rating from 1 to 5.');
  const title = options.title.trim();
  const body = options.body.trim();
  if (title.length > 120 || body.length < 10 || body.length > 2000) throw new CustomerDataConflictError('Review text must be 10â€“2,000 characters and the title at most 120 characters.');
  if (options.form && options.requestDigest) {
    const replay = await productReviewRequestStatus(database, { ...options, formVersion: options.form.formVersion,
      customAnswers: options.form.answers.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })), requestDigest: options.requestDigest });
    if (replay.status === 'same') return replay.id!;
    if (replay.status === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different review values.');
  } else {
    const duplicate = await database.prepare(`SELECT subject_id AS id FROM audit_logs WHERE request_id = ? AND actor_id = ? AND action='review.submitted' AND subject_type='product_review' LIMIT 1`).bind(options.requestId, options.userId).first<{ id: string }>();
    if (duplicate) return duplicate.id;
  }
  const eligible = await database.prepare(
    `SELECT order_items.id FROM order_items INNER JOIN orders ON orders.id = order_items.order_id
     WHERE order_items.id = ? AND order_items.product_id = ? AND orders.customer_id = ?
       AND orders.status = 'delivered' AND order_items.fulfillment_status = 'delivered' LIMIT 1`,
  ).bind(options.orderItemId, options.productId, options.userId).first();
  if (!eligible) throw new CustomerDataConflictError('Only a delivered verified purchase can be reviewed.');
  const id = crypto.randomUUID();
  try {
    await database.batch([
      ...(options.form ? [database.prepare(`SELECT CASE WHEN
        EXISTS(SELECT 1 FROM users WHERE id=? AND status='active')
        AND (SELECT MAX(version) FROM form_config_versions WHERE form_id='account.review' AND status='published')=?
        AND NOT EXISTS(SELECT 1 FROM audit_logs WHERE request_id=?)
        AND NOT EXISTS(SELECT 1 FROM form_answer_sets WHERE form_id='account.review' AND request_id=?)
        AND EXISTS(SELECT 1 FROM order_items i JOIN orders o ON o.id=i.order_id
          WHERE i.id=? AND i.product_id=? AND o.customer_id=? AND o.status='delivered' AND i.fulfillment_status='delivered')
        AND NOT EXISTS(SELECT 1 FROM product_reviews WHERE order_item_id=?)
        THEN 1 ELSE json_extract('invalid','$') END AS valid`)
        .bind(options.userId, options.form.formVersion, options.requestId, options.requestId,
          options.orderItemId, options.productId, options.userId, options.orderItemId)] : []),
      database.prepare(
        `INSERT INTO product_reviews (id, product_id, customer_id, order_item_id, rating, title, body, status, moderation_note, moderated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NULL, NULL, ?, ?)`,
      ).bind(id, options.productId, options.userId, options.orderItemId, options.rating, title || null, body, options.now, options.now),
      ...photos.map(p=>database.prepare('INSERT INTO review_photos(id,review_id,object_key,mime_type,size_bytes,sort_order,created_at) VALUES (?,?,?,?,?,?,?)').bind(p.id,id,p.objectKey,p.mimeType,p.sizeBytes,p.sortOrder,options.now)),
      ...(options.form ? [buildFormAnswerInsert(database, { formId: 'account.review', requestId: options.requestId,
        versionId: options.form.versionId, subjectType: 'product_review', subjectId: id,
        actorId: options.userId, answers: options.form.answers, now: options.now })] : []),
      database.prepare(
        `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
         VALUES (?, ?, 'review.submitted', 'product_review', ?, 'Verified customer submitted a product review', NULL, ?, ?, NULL, ?)`,
      ).bind(crypto.randomUUID(), options.userId, id, JSON.stringify({ status: 'pending', rating: options.rating,
        ...(options.requestDigest ? { requestDigest: options.requestDigest } : {}) }), options.requestId, options.now),
    ]);
  } catch (error) {
    if (options.form && options.requestDigest) {
      const replay = await productReviewRequestStatus(database, { ...options, formVersion: options.form.formVersion,
        customAnswers: options.form.answers.answers.map((answer) => ({ fieldId: answer.fieldId, value: answer.value })), requestDigest: options.requestDigest });
      if (replay.status === 'same') return replay.id!;
      if (replay.status === 'conflict') throw new CustomerDataConflictError('This request ID was already used for different review values.');
      const current = await database.prepare(`SELECT MAX(version) AS version FROM form_config_versions WHERE form_id='account.review' AND status='published'`).first<{ version: number | null }>();
      if (current?.version !== options.form.formVersion) throw new FormRuntimeError('stale_version', 'This form changed. Refresh it and review your answers.');
    }
    const reviewed = await database.prepare(`SELECT id FROM product_reviews WHERE order_item_id=? LIMIT 1`)
      .bind(options.orderItemId).first<{ id: string }>();
    if (reviewed) throw new CustomerDataConflictError('This delivered item has already been reviewed.');
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

export async function moderateProductReview(database: D1Database, options: { reviewId: string; actorId: string; action: 'publish' | 'reject' | 'hide'; note: string; requestId: string; now: number;
  form?: { requestId: string; versionId: string; answers: FormAnswerSnapshot } }): Promise<void> {
  const note = options.note.trim();
  if (note.length < 8 || note.length > 1000) throw new CustomerDataConflictError('Add a moderation note of 8â€“1,000 characters.');
  if (options.form && options.form.requestId !== options.requestId) throw new CustomerDataConflictError('Form request reference does not match the moderation request.');
  const digest = options.form ? await digestFormRequest({ reviewId: options.reviewId, actorId: options.actorId,
    action: options.action, note, versionId: options.form.versionId, answers: options.form.answers }) : null;
  const authority = options.form ? await staffMutationGuard(database, options.actorId, 'product.review', CustomerDataConflictError) : null;
  const prior = await database.prepare(`SELECT actor_id AS actorId,action,subject_type AS subjectType,subject_id AS subjectId,next_json AS nextJson
    FROM audit_logs WHERE request_id=? LIMIT 1`).bind(options.requestId).first<{
      actorId: string; action: string; subjectType: string; subjectId: string; nextJson: string | null }>();
  if (prior) {
    if (!options.form) return;
    let savedDigest: unknown;
    try { savedDigest = JSON.parse(prior.nextJson ?? '').catalogDigest; } catch { /* invalid audit is a conflict */ }
    const answer = await database.prepare(`SELECT actor_id AS actorId,config_version_id AS versionId,subject_type AS subjectType,subject_id AS subjectId
      FROM form_answer_sets WHERE form_id='staff.review-moderation' AND request_id=? LIMIT 1`)
      .bind(options.requestId).first<{ actorId: string; versionId: string; subjectType: string; subjectId: string }>();
    if (prior.actorId !== options.actorId || prior.action !== `review.${options.action}` ||
      prior.subjectType !== 'product_review' || prior.subjectId !== options.reviewId ||
      savedDigest !== digest || answer?.actorId !== options.actorId ||
      answer?.versionId !== options.form.versionId || answer?.subjectType !== 'product_review' ||
      answer?.subjectId !== options.reviewId) throw new CustomerDataConflictError('Request reference already used for different review content.');
    return;
  }
  const current = await database.prepare(`SELECT status FROM product_reviews WHERE id = ? LIMIT 1`).bind(options.reviewId).first<{ status: string }>();
  if (!current) throw new CustomerDataConflictError('Review not found.');
  const next = options.action === 'publish' ? 'published' : options.action === 'reject' ? 'rejected' : 'hidden';
  if ((options.action === 'publish' || options.action === 'reject') && current.status !== 'pending') throw new CustomerDataConflictError('Only a pending review can receive this decision.');
  if (options.action === 'hide' && current.status !== 'published') throw new CustomerDataConflictError('Only a published review can be hidden.');
  const guardId = crypto.randomUUID();
  await database.batch([
    database.prepare(`UPDATE product_reviews SET status = ?, moderation_note = ?, moderated_by = ?, updated_at = ? WHERE id = ? AND status = ?`).bind(next, note, options.actorId, options.now, options.reviewId, current.status),
    ...(options.form ? [database.prepare(`INSERT INTO operation_transaction_guards(id,valid)
      SELECT ?,CASE WHEN changes()=1 AND EXISTS(SELECT 1 FROM product_reviews WHERE id=? AND status=? AND moderated_by=? AND updated_at=? AND moderation_note=?) THEN 1 ELSE 0 END`)
      .bind(guardId, options.reviewId, next, options.actorId, options.now, note),
      database.prepare('DELETE FROM operation_transaction_guards WHERE id=?').bind(guardId)] : []),
    database.prepare(
      `INSERT INTO audit_logs (id, actor_id, action, subject_type, subject_id, reason, previous_json, next_json, request_id, ip_hash, created_at)
       VALUES (?, ?, ?, 'product_review', ?, ?, ?, ?, ?, NULL, ?)`,
    ).bind(crypto.randomUUID(), options.actorId, `review.${options.action}`, options.reviewId, note, JSON.stringify({ status: current.status }), JSON.stringify({ status: next, ...(digest ? { catalogDigest: digest } : {}) }), options.requestId, options.now),
    ...(options.form ? [buildFormAnswerInsert(database, { formId: 'staff.review-moderation', requestId: options.requestId,
      versionId: options.form.versionId, subjectType: 'product_review', subjectId: options.reviewId,
      actorId: options.actorId, answers: options.form.answers, now: options.now }), ...(authority?.statements ?? [])] : []),
  ]);
}
