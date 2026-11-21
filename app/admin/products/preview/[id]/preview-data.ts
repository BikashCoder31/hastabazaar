import { staffMutationGuard } from '@/lib/db/repositories/staff-mutation-guard';
import type { PublicProductRow } from '@/lib/db/repositories/products';
import { detailText, type ProductDetailKey } from '@/lib/products/category-fields';
import type { IntakeSnapshot } from '@/lib/products/intake-workspace';
import { offerMoney } from '@/lib/products/offer-contracts';
import type { ProductPreviewSource } from '@/lib/products/preview-path';
import { summarizePublicOffers, type PublicOffer } from '@/lib/products/public-offers';
import { publicProductDetails } from '@/lib/products/truthful-presentation';
import { publicProfileFieldSql } from '@/lib/sellers/public-profile-sql';

class PreviewPermissionError extends Error {}

interface PreviewSource {
  draftId: string;
  versionId: string;
  sellerId: string;
  sellerName: string;
  participationRoute: PublicProductRow['participationRoute'];
  snapshot: string;
}

type ProductMedia = { id: string; altEn: string; mimeType: string };

const sourceColumns = `d.id AS draftId, v.id AS versionId, d.seller_id AS sellerId,
  COALESCE(${publicProfileFieldSql('publicName', 's.id')}, NULLIF(s.trading_name,''), 'Seller') AS sellerName,
  participation.participation_route AS participationRoute,
  v.snapshot_json AS snapshot`;
const sellerJoin = `JOIN seller_profiles s ON s.id=d.seller_id AND s.user_id=d.owner_id
  LEFT JOIN seller_participation_profiles participation ON participation.seller_id=d.seller_id`;

export function previewSource(value: unknown): ProductPreviewSource | null {
  if (value === undefined || value === null) return 'draft';
  return value === 'case' || value === 'publication' ? value : null;
}

/** Match the current saved owner version or the exact snapshot shared with staff. */
export async function readProductPreviewSource(
  db: D1Database, authSubject: string | null, id: string, source: ProductPreviewSource,
) {
  if (!authSubject || !/^[A-Za-z0-9_-]{1,160}$/.test(id)) return null;
  const actor = await db.prepare("SELECT id,auth_subject AS subject FROM users WHERE auth_subject=? AND status='active'")
    .bind(authSubject).first<{ id: string; subject: string }>();
  if (!actor || actor.subject !== authSubject) return null;

  if (source === 'draft') {
    const draft = await db.prepare(`SELECT ${sourceColumns}
      FROM product_intake_drafts d
      JOIN product_intake_workspace_heads h ON h.draft_id=d.id
      JOIN product_intake_workspace_versions v ON v.id=h.version_id AND v.draft_id=d.id AND v.revision=d.revision
      ${sellerJoin}
      JOIN users owner ON owner.id=d.owner_id AND owner.status='active'
      WHERE d.id=? AND d.owner_id=? AND owner.auth_subject=?
        AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=d.owner_id AND r.role IN ('seller','customer'))`)
      .bind(id, actor.id, authSubject).first<PreviewSource>();
    return draft ? { ...draft, actorId: actor.id, caseId: null } : null;
  }

  const canReview = async () => {
    try {
      await staffMutationGuard(db, actor.id, 'product.review', PreviewPermissionError);
      return true;
    } catch (error) {
      if (error instanceof PreviewPermissionError) return false;
      throw error;
    }
  };
  if (!await canReview()) return null;
  const candidate = await db.prepare(`SELECT ${sourceColumns}
    FROM product_intake_cases c
    JOIN product_intake_drafts d ON d.id=c.draft_id
    JOIN product_intake_workspace_versions v ON v.id=c.version_id AND v.draft_id=d.id
    ${sellerJoin}
    WHERE c.id=? AND d.owner_id<>?
      AND NOT EXISTS(SELECT 1 FROM product_publication_candidates candidate
        JOIN product_publication_heads head ON head.current_version_id=candidate.id
        WHERE candidate.case_id=c.id AND candidate.workspace_version_id=v.id)`)
    .bind(id, actor.id).first<PreviewSource>();
  if (!candidate || !await canReview()) return null;
  return { ...candidate, actorId: actor.id, caseId: id };
}

async function attachedMedia(db: D1Database, draftId: string, mediaIds: string[], name: string) {
  const media = new Map<string, ProductMedia>();
  for (let offset = 0; offset < mediaIds.length; offset += 90) {
    const ids = mediaIds.slice(offset, offset + 90);
    const { results } = await db.prepare(`SELECT id,mime_type AS mimeType FROM product_intake_media
      WHERE draft_id=? AND state='ready' AND id IN (${ids.map(() => '?').join(',')})`)
      .bind(draftId, ...ids).all<{ id: string; mimeType: string }>();
    for (const file of results) media.set(file.id, { ...file, altEn: name });
  }
  return mediaIds.flatMap(id => media.get(id) ?? []);
}

function dateOf(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
}

export async function readProductPreview(
  db: D1Database, authSubject: string | null, id: string, source: ProductPreviewSource,
) {
  const row = await readProductPreviewSource(db, authSubject, id, source);
  if (!row) return null;
  const snapshot = JSON.parse(row.snapshot) as IntakeSnapshot;
  const text = (key: ProductDetailKey) => detailText(snapshot.answers, key);
  const name = text('nameEn') || text('nameNe') || 'Product name not provided';
  const [media, category] = await Promise.all([
    attachedMedia(db, row.draftId, snapshot.mediaIds, name),
    snapshot.categoryId ? db.prepare('SELECT name_en AS name FROM categories WHERE id=?').bind(snapshot.categoryId).first<{ name: string }>() : null,
  ]);
  const mediaIds = new Set(media.filter(file => file.mimeType !== 'video/mp4').map(file => file.id));
  const axes = snapshot.offers.axes.filter(axis => axis.label.trim());
  const offers = snapshot.offers.offers.flatMap((offer): PublicOffer[] => {
    const pricePaisa = offerMoney(offer.price);
    if (!offer.included || pricePaisa === null) return [];
    const selection = axes.flatMap(axis => {
      const value = axis.values.find(item => item.id === offer.selection[axis.id] && item.label.trim());
      return value ? [{ axisId: axis.id, valueId: value.id, name: axis.label, value: value.label }] : [];
    });
    if (selection.length !== axes.length) return [];
    const units = Number(offer.unitsPerOffer);
    return [{
      id: offer.id, versionId: row.versionId, sku: '', selection, pricePaisa,
      compareAtPricePaisa: null, mediaId: offer.mediaId && mediaIds.has(offer.mediaId) ? offer.mediaId : null,
      available: 0, orderable: false, availability: 'unavailable_to_order',
      baseUnit: offer.baseUnit, unitsPerOffer: Number.isSafeInteger(units) && units > 0 ? units : 0,
    }];
  });
  const display = summarizePublicOffers(offers);
  const preparation = text('preparationDays');
  const preparationRecorded = /^\d+$/.test(preparation) && Number.isSafeInteger(Number(preparation));
  const product = publicProductDetails({
    id: row.draftId, sellerId: row.sellerId, slug: '', sku: '', media,
    nameEn: name, nameNe: text('nameNe') || null, descriptionEn: text('descriptionEn') || text('descriptionNe'),
    pricePaisa: display.pricePaisa ?? (snapshot.offers.offers.length ? null : offerMoney(text('price'))),
    compareAtPricePaisa: null, inventoryQuantity: 0, purchasable: false,
    priceFrom: display.from, tradingName: row.sellerName, categoryName: category?.name ?? '',
    participationRoute: row.participationRoute ?? 'registered_seller', primaryMediaId: media[0]?.id ?? null,
    producer: text('producer'), countryOfOrigin: text('countryOfOrigin'), originEvidenceStatus: 'seller_declared',
    materials: text('materials'), originStory: text('originStory') || null,
    dimensions: text('dimensions') || null, size: text('size') || null, colour: text('colour') || null,
    variations: text('variations') || null, specifications: text('specifications') || null,
    careInstructions: text('careInstructions') || null, safetyInformation: text('safetyInformation') || null,
    returnConditions: text('returnConditions') || null, returnEligible: text('returnEligible') === 'no' ? 0 : 1,
    warranty: text('warrantyOffered') === 'yes' ? (['warrantyProvider', 'warrantyDuration', 'warrantyTerms'] as const).map(text).filter(Boolean).join('\n') : null,
    madeToOrder: text('madeToOrder') === 'yes' ? 1 : 0, preparationDays: preparationRecorded ? Number(preparation) : 0,
    manufacturedAt: dateOf(text('manufacturedAt')), expiresAt: dateOf(text('expiresAt')),
    offerSet: offers.length || axes.length ? {
      productId: row.draftId, versionId: row.versionId, publicVersionId: null, orderable: false,
      axes: axes.map(axis => ({ ...axis, values: axis.values.filter(value => value.label.trim()) })),
      offers, display,
      details: Object.fromEntries((['brand', 'model', 'condition', 'unitContents', 'packQuantity', 'sizeGuide',
        'warrantyProvider', 'warrantyDuration', 'warrantyTerms'] as const).map(key => [key, text(key)])),
    } : null,
  });
  return { product, versionId: row.versionId, preparationRecorded };
}
