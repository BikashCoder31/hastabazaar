import type { PublishedFormConfig } from '../forms/types';
import { resolvePublishedForm } from '../forms/runtime';

export const QUERY_PRESENTATION_KEYS = {
  'catalog.header-search': ['q'],
  'catalog.filters': ['q', 'sort', 'category', 'occasion'],
  'commerce.order-tracking': ['orderNumber', 'email'],
  'seller.product-filter': ['q'],
  'staff.homepage-filter': ['q', 'visibility'],
  'staff.activity-filter': ['action', 'actor', 'type', 'from', 'to'],
  'staff.recorded-progress-filter': ['from', 'to', 'action'],
} as const;
export type QueryPresentationFormId = keyof typeof QUERY_PRESENTATION_KEYS;
export interface QueryFieldPresentation { label: string; helpText?: string; placeholder?: string }

/** A validated publication can change text, never the renderer's query contract. */
export function queryFieldPresentation<F extends QueryPresentationFormId>(
  formId: F, config: PublishedFormConfig | null | undefined,
  key: (typeof QUERY_PRESENTATION_KEYS)[F][number], fallback: QueryFieldPresentation,
): QueryFieldPresentation {
  const field = config?.formId === formId ? config.fields.find((item) => item.key === key && item.status === 'active') : null;
  return field ? { label: field.label, helpText: field.helpText, placeholder: field.placeholder ?? fallback.placeholder } : fallback;
}

/** Absence permits existing built-ins; failed reads are explicit, never an empty publication. */
export async function loadQueryPresentationConfig(db: D1Database | undefined, formId: QueryPresentationFormId):
  Promise<{ config: PublishedFormConfig | null; unavailable: boolean }> {
  try {
    if (!db) throw new Error('Configuration store unavailable.');
    const published = await db.prepare(`SELECT 1 AS found FROM form_config_versions
      WHERE form_id=? AND status='published' LIMIT 1`).bind(formId).first<{found:number}>();
    return { config: published ? await resolvePublishedForm(db, formId) : null, unavailable: false };
  } catch { return { config: null, unavailable: true }; }
}

export async function loadShopQueryConfig(db: D1Database): Promise<PublishedFormConfig> {
  const published = await db.prepare(`SELECT 1 AS found FROM form_config_versions
    WHERE form_id = ? AND status = 'published' LIMIT 1`)
    .bind('catalog.filters').first<{ found: number }>();
  return published ? resolvePublishedForm(db, 'catalog.filters') :
    { formId: 'catalog.filters', version: 0, publishedAt: 0, fields: [] };
}

export function parseShopQueryCriteria(
  config: PublishedFormConfig,
  params: Record<string, string | string[] | undefined>,
): { minimumPricePaisa?: number; minimumPriceNpr?: string } {
  const active = config.fields.filter((field) => field.status === 'active');
  const builtInTypes: Readonly<Record<string, string>> = { q: 'short_text', sort: 'single_choice', category: 'short_text', occasion: 'short_text' };
  if (config.formId !== 'catalog.filters' || active.some((field) =>
    field.key === 'minimum_price_npr' ? field.type !== 'number' : builtInTypes[field.key] !== field.type))
    throw new RangeError('Unsupported shop criterion in published form.');
  const criterion = active.find((field) => field.key === 'minimum_price_npr');
  if (Object.keys(params).some((key) => key.startsWith('custom.') && key !== 'custom.minimum_price_npr'))
    throw new RangeError('Unsupported shop criterion.');
  if (!criterion && Object.hasOwn(params, 'custom.minimum_price_npr'))
    throw new RangeError('Unsupported shop criterion.');
  if (!criterion) return {};
  const raw = params['custom.minimum_price_npr'];
  if (raw === undefined || raw === '') {
    if (criterion.required) throw new RangeError('Minimum price is required.');
    return {};
  }
  if (typeof raw !== 'string' || !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(raw))
    throw new RangeError('Minimum price must be a valid NPR amount.');
  const [rupees, fraction = ''] = raw.split('.');
  const paisa = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(paisa) || paisa > 100_000_000_000 ||
      (criterion.integerOnly === true && paisa % 100 !== 0) ||
      (criterion.min !== undefined && paisa < criterion.min * 100) ||
      (criterion.max !== undefined && paisa > criterion.max * 100))
    throw new RangeError('Minimum price is outside the supported NPR range.');
  return { minimumPricePaisa: paisa, minimumPriceNpr: raw };
}
