import { adminSections } from '@/components/admin/admin-sections';
import { adminNavigation } from '@/lib/admin/navigation';
import { CURRENT_CUSTOMER_ROLE_SQL } from '@/lib/auth/customer-scope';
import { businessSettingDefinitions } from '@/lib/configuration/definitions';
import { getEffectiveBusinessSetting } from '@/lib/db/repositories/business-settings';
import { formatPaisaExact } from '@/lib/marketplace/money-display';
import { can, type Permission } from '@/lib/marketplace/permissions';
import { payoutFinanceScopeGuards } from '@/lib/payments/payout-workspace';
import { PayoutTransferError, readPayoutSource } from '@/lib/payments/payout-transfer-sources';
import { independentProductStaffSql } from '@/lib/products/party-scope';

export type SearchGroup = 'Actions' | 'Orders' | 'Sellers' | 'Payouts' | 'Customers' | 'Settings' | 'Pages';
export type SearchResult = {
  group: SearchGroup;
  href: string;
  title: string;
  detail?: string;
};
type Staff = { id: string; role: 'admin' | 'super_admin'; permissions?: readonly Permission[] };
type ReferenceKind = 'order' | 'payout' | 'managed-payout' | 'refund';

const limit = 6;
const referenceFormats: readonly [RegExp, ReferenceKind][] = [
  [/^(?:hb|hk)-[a-z0-9-]*$/i, 'order'],
  [/^(?:po|hkp)-[a-z0-9-]*$/i, 'payout'],
  [/^(?:mp|sim-mp)-[a-z0-9-]*$/i, 'managed-payout'],
  [/^rf-[a-z0-9-]*$/i, 'refund'],
];
const actions = [
  { title: 'Book courier pickup', detail: 'Orders › Dispatch', href: '/admin/orders/dispatch', permission: 'order.manage' },
  { title: 'Open payout run', detail: 'Money', href: '/admin/payouts/run', permission: 'payout.approve' },
] as const;
const settingAliases: Readonly<Record<string, string>> = {
  seller_delivery_hold_days: 'hold after delivery',
  independent_seller_commission_bps: 'seller commission',
};

function matches(text: string, query: string) {
  const field = text.toLowerCase();
  return query.split(/\s+/).every(term => field.includes(term));
}

function contains(field: string) {
  return `INSTR(LOWER(COALESCE(${field}, '')), ?) > 0`;
}

function cleanPhone(query: string) {
  return /^[+()\d\s-]+$/.test(query) ? query.replace(/\D/g, '') : '';
}

function phoneMatches(field: string) {
  return `INSTR(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(${field}, ''), '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), ?) > 0`;
}

function recordHref(path: string, id: string) {
  return path + '/' + encodeURIComponent(id);
}

function queryHref(path: string, key: string, value: string) {
  return path + '?' + new URLSearchParams({ [key]: value });
}

function statusLabel(status: string) {
  const text = status.replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function orders(db: D1Database, query: string, reference: boolean): Promise<SearchResult[]> {
  const phone = cleanPhone(query);
  const address = "CASE WHEN json_valid(o.shipping_address_json) THEN o.shipping_address_json ELSE '{}' END";
  const recipient = `json_extract(${address}, '$.recipientName')`;
  const itemMatch = `(${contains('i.product_name_snapshot')} OR ${contains('i.seller_name_snapshot')})`;
  const scope = reference ? 'LOWER(o.order_number) LIKE ?' : [
    contains('o.order_number'), contains('o.customer_email'), contains(recipient),
    `EXISTS(SELECT 1 FROM order_items i WHERE i.order_id=o.id AND ${itemMatch})`,
    ...(phone.length >= 3 ? [phoneMatches('o.customer_phone')] : []),
  ].join(' OR ');
  const args = reference ? [query + '%'] : [query, query, query, query, query, ...(phone.length >= 3 ? [phone] : [])];
  const { results } = await db.prepare(`
    SELECT o.id, o.order_number AS reference, o.status,
      item.product_name_snapshot AS product, item.seller_name_snapshot AS seller
    FROM orders o LEFT JOIN order_items item ON item.id=(
      SELECT i.id FROM order_items i WHERE i.order_id=o.id
      ORDER BY CASE WHEN ${itemMatch} THEN 0 ELSE 1 END, i.id LIMIT 1
    )
    WHERE (${scope})
    ORDER BY CASE WHEN LOWER(o.order_number)=? THEN 0 ELSE 1 END, o.created_at DESC, o.id LIMIT ?
  `).bind(query, query, ...args, query, limit).all<{
    id: string; reference: string; status: string; product: string | null; seller: string | null;
  }>();
  return results.map(row => ({
    group: 'Orders', href: recordHref('/admin/orders', row.id),
    title: [row.reference, row.product].filter(Boolean).join(' · '),
    detail: [row.seller, statusLabel(row.status)].filter(Boolean).join(' · '),
  }));
}

async function sellers(db: D1Database, staff: Staff, query: string): Promise<SearchResult[]> {
  const name = staff.role === 'super_admin'
    ? "COALESCE(NULLIF(public_profile.display_name, ''), NULLIF(s.trading_name, ''), s.application_reference)"
    : `CASE WHEN participation.participation_route='managed_maker' THEN public_profile.display_name
        ELSE COALESCE(NULLIF(public_profile.display_name, ''), NULLIF(s.trading_name, ''), s.application_reference) END`;
  const { results } = await db.prepare(`
    SELECT s.id, ${name} AS name, public_profile.public_city AS city, s.application_reference AS reference
    FROM seller_profiles s
    LEFT JOIN seller_participation_profiles participation ON participation.seller_id=s.id
    LEFT JOIN seller_public_profile_states public_profile ON public_profile.seller_id=s.id
    WHERE COALESCE(${name}, '')<>'' AND (${contains(name)} OR ${contains('s.application_reference')})
    ORDER BY CASE WHEN LOWER(${name})=? THEN 0 ELSE 1 END, s.updated_at DESC, s.id LIMIT ?
  `).bind(query, query, query, limit).all<{ id: string; name: string; city: string | null; reference: string | null }>();
  return results.map(row => ({
    group: 'Sellers', href: recordHref('/admin/sellers', row.id), title: row.name,
    detail: row.city || row.reference || 'Seller record',
  }));
}

type PayoutMatch = { id: string; reference: string; status: string; seller: string; amountPaisa: number };
function payoutMatch(row: PayoutMatch, href: string): SearchResult {
  return {
    group: 'Payouts', href, title: `${row.reference} · ${formatPaisaExact(row.amountPaisa)}`,
    detail: `${row.seller} · ${statusLabel(row.status)}`,
  };
}

async function payouts(db: D1Database, query: string, reference: boolean): Promise<SearchResult[]> {
  const scope = reference ? 'LOWER(p.payout_number) LIKE ?' : `${contains('p.payout_number')} OR ${contains('s.trading_name')}`;
  const { results } = await db.prepare(`
    SELECT p.id, p.payout_number AS reference, p.status, s.trading_name AS seller, p.amount_paisa AS amountPaisa
    FROM payouts p JOIN seller_profiles s ON s.id=p.seller_id
    WHERE (${scope})
    ORDER BY CASE WHEN LOWER(p.payout_number)=? THEN 0 ELSE 1 END, p.created_at DESC, p.id LIMIT ?
  `).bind(...(reference ? [query + '%'] : [query, query]), query, limit).all<PayoutMatch>();
  return results.map(row => payoutMatch(row, recordHref('/admin/payouts', row.id)));
}

async function managedPayouts(db: D1Database, staff: Staff, query: string): Promise<SearchResult[]> {
  const { results } = await db.prepare(`
    SELECT p.id, p.seller_id AS sellerId, p.payout_number AS reference, p.status,
      s.trading_name AS seller, p.amount_paisa AS amountPaisa
    FROM managed_payouts p JOIN seller_profiles s ON s.id=p.seller_id
    WHERE LOWER(p.payout_number) LIKE ? AND s.user_id<>?
    ORDER BY CASE WHEN LOWER(p.payout_number)=? THEN 0 ELSE 1 END, p.created_at DESC, p.id LIMIT ?
  `).bind(query + '%', staff.id, query, limit).all<PayoutMatch & { sellerId: string }>();
  const visible = await Promise.all(results.map(async row => {
    if (!await payoutFinanceScopeGuards(db, staff.id, 'managed', row.id, row.sellerId)) return null;
    const { results: packets } = await db.prepare(`
      SELECT packet.id, packet.state, packet.source_snapshot_json AS snapshot,
        account.id AS accountVersionId,
        CASE WHEN beneficiary.id IS NOT NULL AND account.id IS NOT NULL THEN 1 ELSE 0 END AS visibleRecord
      FROM payout_transfer_packets packet
      LEFT JOIN seller_beneficiary_versions beneficiary
        ON beneficiary.id=packet.beneficiary_version_id AND beneficiary.seller_id=packet.seller_id
      LEFT JOIN company_payment_account_versions account ON account.id=packet.account_version_id
      WHERE packet.payout_model='managed' AND packet.managed_payout_id=?
    `).bind(row.id).all<{ id: string; state: string; snapshot: string; accountVersionId: string | null; visibleRecord: number }>();
    const hasCandidate = ['prepared', 'scheduled', 'approved', 'failed'].includes(row.status) &&
      packets.every(packet => ['failed', 'void'].includes(packet.state));
    const candidates = await Promise.all(packets.filter(packet => packet.visibleRecord && packet.accountVersionId)
      .map(async packet => ({
        packet,
        inScope: Boolean(await payoutFinanceScopeGuards(db, staff.id, 'managed', row.id, row.sellerId, packet.accountVersionId!, packet)),
      })));
    const visiblePackets = candidates.filter(candidate => candidate.inScope);
    if (!hasCandidate && !visiblePackets.length) return null;
    if (hasCandidate || visiblePackets.every(({ packet }) => ['prepared', 'approved'].includes(packet.state))) {
      try {
        await readPayoutSource(db, 'managed', row.id, staff.id, Date.now());
      } catch (error) {
        if (!(error instanceof PayoutTransferError)) throw error;
        if (error.status === 403 && !visiblePackets.some(({ packet }) => !['prepared', 'approved'].includes(packet.state))) return null;
      }
    }
    const params = new URLSearchParams({ model: 'managed', payout: row.id });
    return payoutMatch(row, '/admin/payments/payouts?' + params);
  }));
  return visible.filter(result => result !== null);
}

async function refunds(db: D1Database, query: string, reference: boolean): Promise<SearchResult[]> {
  const comparison = reference ? 'LIKE' : '=';
  const value = reference ? query + '%' : query;
  const { results } = await db.prepare(`
    SELECT refund_match.id, refund_match.sourceId, refund_match.state, refund_match.orderNumber FROM (
      SELECT r.id, r.source_id AS sourceId, r.state, o.order_number AS orderNumber, r.authorized_at AS authorizedAt
      FROM refund_obligations r LEFT JOIN orders o ON o.id=r.order_id
      JOIN users customer ON customer.id=r.customer_id
      JOIN users owner ON owner.id=r.owner_id
      WHERE LOWER(r.id) ${comparison} ? OR LOWER(r.source_id) ${comparison} ?
      UNION ALL
      SELECT NULL, original.id, original.status, o.order_number, original.approved_at
      FROM refunds original JOIN orders o ON o.id=original.order_id
      WHERE LOWER(original.id) ${comparison} ? AND original.status IN ('approved', 'failed')
        AND o.customer_id IS NOT NULL
        AND NOT EXISTS(
          SELECT 1 FROM refund_obligations existing WHERE existing.source_kind='return_refund' AND existing.source_id=original.id
        )
    ) refund_match
    ORDER BY CASE WHEN LOWER(refund_match.id)=? OR LOWER(refund_match.sourceId)=? THEN 0 ELSE 1 END,
      refund_match.authorizedAt DESC, refund_match.sourceId LIMIT ?
  `).bind(value, value, value, query, query, limit).all<{ id: string | null; sourceId: string; state: string; orderNumber: string | null }>();
  return results.map(row => ({
    group: 'Payouts',
    href: row.id ? queryHref('/admin/payments/refunds', 'obligation', row.id)
      : queryHref('/admin/payments/refunds', 'search', row.sourceId) + '#refund-source-' + encodeURIComponent(row.sourceId),
    title: 'Refund ' + (row.id?.toLowerCase().startsWith(query) ? row.id : row.sourceId),
    detail: [row.orderNumber, statusLabel(row.state)].filter(Boolean).join(' · '),
  }));
}

async function customers(db: D1Database, query: string): Promise<SearchResult[]> {
  const phone = cleanPhone(query);
  const contactFields = [contains('users.display_name'), contains('users.email'),
    `EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=users.id AND ${contains('o.customer_email')})`];
  const values = [query, query, query];
  if (phone.length >= 3) {
    contactFields.push(phoneMatches('users.phone'),
      `EXISTS(SELECT 1 FROM orders o WHERE o.customer_id=users.id AND ${phoneMatches('o.customer_phone')})`);
    values.push(phone, phone);
  }
  const { results } = await db.prepare(`
    SELECT users.id, users.display_name AS name, users.status FROM users
    WHERE users.status<>'deleted' AND ${CURRENT_CUSTOMER_ROLE_SQL} AND (${contactFields.join(' OR ')})
    ORDER BY CASE WHEN LOWER(users.display_name)=? THEN 0 ELSE 1 END, users.created_at DESC, users.id LIMIT ?
  `).bind(...values, query, limit).all<{ id: string; name: string; status: string }>();
  return results.map(row => ({
    group: 'Customers', href: queryHref('/admin/customers', 'customer', row.id),
    title: row.name || 'Customer account', detail: statusLabel(row.status),
  }));
}

async function products(db: D1Database, staff: Staff, query: string): Promise<SearchResult[]> {
  const { results } = await db.prepare(`
    SELECT p.id, p.name_en AS name, p.sku, c.id AS caseId
    FROM products p JOIN categories category ON category.id=p.category_id
    LEFT JOIN product_publication_links retained ON retained.product_id=p.id
    LEFT JOIN product_intake_drafts d ON d.id=retained.draft_id
    LEFT JOIN product_intake_cases c ON c.id=(
      SELECT latest.id FROM product_intake_cases latest
      WHERE latest.draft_id=retained.draft_id ORDER BY latest.cycle_number DESC LIMIT 1
    )
    WHERE p.status<>'draft'
      AND ${independentProductStaffSql('p.id', '?').join(' AND ')}
      AND (
        retained.product_id IS NULL OR (c.id IS NULL AND p.status='published')
        OR EXISTS(
          SELECT 1 FROM product_intake_workspace_versions v
          JOIN seller_profiles owner ON owner.id=d.seller_id AND owner.user_id=d.owner_id
          WHERE v.id=c.version_id AND v.draft_id=d.id
        )
      )
      AND (${contains('p.name_en')} OR ${contains('p.name_ne')} OR ${contains('p.sku')})
    ORDER BY CASE WHEN LOWER(p.sku)=? THEN 0 ELSE 1 END, p.updated_at DESC, p.id LIMIT ?
  `).bind(staff.id, staff.id, query, query, query, query, limit).all<{ id: string; name: string; sku: string; caseId: string | null }>();
  return results.map(row => ({
    group: 'Pages',
    href: row.caseId ? recordHref('/admin/products/intakes', row.caseId) : recordHref('/admin/products', row.id),
    title: row.name, detail: 'Product review · ' + row.sku,
  }));
}

async function settings(db: D1Database, staff: Staff, query: string): Promise<SearchResult[]> {
  const matchesQuery = businessSettingDefinitions.filter(({ key, label, description, affectedSurfaces }) =>
    !affectedSurfaces.some(surface => surface === 'rider') &&
    (key !== 'open_box_service_area_codes' || staff.role === 'super_admin') &&
    matches([label, key.replaceAll('_', ' '), settingAliases[key], description].join(' '), query),
  ).slice(0, limit);
  return Promise.all(matchesQuery.map(async ({ key, label }) => {
    let value: string | undefined;
    const now = Date.now();
    if (key === 'seller_delivery_hold_days') {
      const setting = await getEffectiveBusinessSetting(db, key, now);
      if (typeof setting.value === 'number') value = `${setting.value} ${setting.value === 1 ? 'day' : 'days'}`;
    }
    if (key === 'independent_seller_commission_bps') {
      const setting = await getEffectiveBusinessSetting(db, key, now);
      if (typeof setting.value === 'number') value = `${setting.value / 100}%`;
    }
    return {
      group: 'Settings', href: queryHref('/admin/business-settings', 'setting', key),
      title: label, detail: value ? 'Business settings · ' + value : 'Business settings',
    };
  }));
}

function pages(staff: Staff, query: string): SearchResult[] {
  const allowed = (href: string) => href !== '/admin/riders';
  const found = new Map<string, SearchResult>();
  function add(href: string, title: string, detail?: string) {
    if (allowed(href) && !found.has(href)) found.set(href, { group: 'Pages', href, title, detail });
  }
  for (const item of adminNavigation(staff.role, staff.permissions, query)) {
    if (item.href === '/admin/analytics') add(item.href, 'Business report', 'Reports');
    else add(item.href, item.label);
  }
  for (const section of adminSections(staff.role, staff.permissions)) {
    for (const tab of section.tabs.flatMap(tab => [tab, ...tab.related])) {
      if (matches(section.label + ' ' + tab.label, query)) add(tab.href, tab.label, section.label);
    }
  }
  if (can(staff, 'audit_log.view') && matches('Care Customers', query)) add('/admin/customers', 'Customers', 'Care');
  if (can(staff, 'refund.approve.standard') && matches('Money Refunds to customers', query)) {
    add('/admin/payments/refunds', 'Refunds to customers', 'Money');
  }
  return [...found.values()].slice(0, query ? 12 : 8);
}

export async function searchAdminWorkspace(db: D1Database, staff: Staff, rawQuery: string): Promise<SearchResult[]> {
  const query = rawQuery.trim().toLowerCase();
  const reference = referenceFormats.find(([format]) => format.test(query))?.[1];
  if (reference === 'order') {
    const [orderResults, productResults] = await Promise.all([
      can(staff, 'order.manage') ? orders(db, query, true) : [],
      /^hb-[a-f0-9]{32}$/.test(query) && can(staff, 'product.review') ? products(db, staff, query) : [],
    ]);
    return [...orderResults, ...productResults];
  }
  if (reference === 'payout') return can(staff, 'payout.prepare') ? payouts(db, query, true) : [];
  if (reference === 'managed-payout') return can(staff, 'payout.prepare') ? managedPayouts(db, staff, query) : [];
  if (reference === 'refund') return can(staff, 'refund.approve.standard') ? refunds(db, query, true) : [];

  const actionResults: SearchResult[] = actions
    .filter(({ permission, title, detail }) => can(staff, permission) && matches(title + ' ' + detail, query))
    .map(({ title, detail, href }) => ({ group: 'Actions', title, detail, href }));
  const pageResults = pages(staff, query);
  if (query.length < 2) return [...actionResults, ...pageResults];
  const [orderResults, sellerResults, payoutResults, refundResults, customerResults, settingResults, productResults] = await Promise.all([
    can(staff, 'order.manage') ? orders(db, query, false) : [],
    can(staff, 'seller.application.review') ? sellers(db, staff, query) : [],
    can(staff, 'payout.prepare') ? payouts(db, query, false) : [],
    can(staff, 'refund.approve.standard') && /^[a-z\d][a-z\d-]{7,}$/i.test(query) ? refunds(db, query, false) : [],
    can(staff, 'audit_log.view') ? customers(db, query) : [],
    can(staff, 'business_settings.view') ? settings(db, staff, query) : [],
    can(staff, 'product.review') ? products(db, staff, query) : [],
  ]);
  return [...actionResults, ...orderResults, ...sellerResults, ...payoutResults, ...refundResults, ...customerResults, ...settingResults, ...productResults, ...pageResults];
}
