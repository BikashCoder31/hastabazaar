import { digestFormRequest } from '../forms/submission';
import { isPackedWeightGrams } from '../shipping/packed-weight';
import { packedWeightSchemaAvailable } from '../shipping/packed-weight-storage';
import { commandReceipt, type CommandContext } from '../workflows/contracts';
import { CategoryContractError } from './category-contracts';
import { detailText, type ProductDetailAnswers } from './category-fields';
import { saveProductWorkspace, type IntakeSnapshot } from './intake-workspace';
import { offerGuard, productReadGuardConflict } from './offer-support';
import { currentProductMediaOrder, currentProductMediaSql } from './publication-media';

export interface RecentIntakeProduct {
  id: string;
  name: string;
  categoryName: string;
  pricePaisa: number;
  coverMediaId: string | null;
}

export interface UnfinishedIntakeDraft {
  id: string;
  title: string;
  updatedAt: number;
}

const activeOwner = `s.id=? AND u.id=? AND u.status='active'
  AND EXISTS(SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('customer','seller'))`;
const productOwner = `FROM products p JOIN seller_profiles s ON s.id=p.seller_id JOIN users u ON u.id=s.user_id`;
const copyable = `${activeOwner} AND p.status='published'
  AND NOT EXISTS(SELECT 1 FROM product_deletions deletion WHERE deletion.product_id=p.id)`;

export async function listSellerIntakeStarter(db: D1Database, actorId: string, sellerId: string) {
  const [recent, drafts] = await Promise.all([
    db.prepare(`SELECT p.id,p.name_en AS name,c.name_en AS categoryName,p.price_paisa AS pricePaisa,
      (SELECT m.id FROM product_media m WHERE m.product_id=p.id AND ${currentProductMediaSql('m')}
        AND m.mime_type IN ('image/jpeg','image/png','image/webp')
        ORDER BY ${currentProductMediaOrder('m')},m.id LIMIT 1) AS coverMediaId
      ${productOwner} JOIN categories c ON c.id=p.category_id
      WHERE ${copyable} ORDER BY p.updated_at DESC,p.id DESC LIMIT 8`)
      .bind(sellerId, actorId).all<RecentIntakeProduct>(),
    db.prepare(`SELECT d.id,d.answers_json AS answers,d.updated_at AS updatedAt
      FROM product_intake_drafts d JOIN seller_profiles s ON s.id=d.seller_id AND s.user_id=d.owner_id
      JOIN users u ON u.id=d.owner_id WHERE ${activeOwner}
        AND NOT EXISTS(SELECT 1 FROM product_publication_links l WHERE l.draft_id=d.id)
        AND NOT EXISTS(SELECT 1 FROM product_intake_cases c WHERE c.draft_id=d.id)
      ORDER BY d.updated_at DESC,d.id DESC LIMIT 20`)
      .bind(sellerId, actorId).all<Omit<UnfinishedIntakeDraft, 'title'> & { answers: string }>(),
  ]);
  return {
    recentProducts: recent.results,
    unfinishedDrafts: drafts.results.map(({ id, answers, updatedAt }): UnfinishedIntakeDraft => ({
      id, title: detailText(JSON.parse(answers) as ProductDetailAnswers, 'nameEn') || 'Untitled draft', updatedAt,
    })),
  };
}

interface CopySource {
  categoryId: string;
  descriptionEn: string;
  descriptionNe: string | null;
  materials: string;
  materialsJson: string;
  size: string | null;
  careInstructions: string | null;
  countryOfOrigin: string;
  preparationDays: number;
  packedWeightGrams: number | null;
  pricePaisa: number;
  updatedAt: number;
  approvedSnapshot: string | null;
  currentVersionId: string | null;
}

function productMaterials(json: string, text: string) {
  try {
    const values: unknown = JSON.parse(json);
    if (Array.isArray(values) && values.length > 0 && values.every(value => typeof value === 'string')) {
      return values as string[];
    }
  } catch {
    // Older catalog rows may only have the original materials text.
  }
  return text;
}

/** Copies catalog facts into the normal private workspace as one guarded command. */
export async function copySellerIntakeProduct(db: D1Database, ctx: CommandContext, sellerId: string, productId: string) {
  if (ctx.expectedRevision !== null) throw new CategoryContractError('A product copy must start a new draft.', 400);
  const packedWeightAvailable = await packedWeightSchemaAvailable(db);
  const source = await db.prepare(`SELECT p.category_id AS categoryId,p.description_en AS descriptionEn,
    p.description_ne AS descriptionNe,p.materials,p.materials_json AS materialsJson,p.size,
    p.care_instructions AS careInstructions,p.country_of_origin AS countryOfOrigin,p.preparation_days AS preparationDays,
    ${packedWeightAvailable ? 'p.packed_weight_grams' : 'NULL'} AS packedWeightGrams,
    p.price_paisa AS pricePaisa,p.updated_at AS updatedAt,h.current_version_id AS currentVersionId,
    w.snapshot_json AS approvedSnapshot ${productOwner}
    LEFT JOIN product_publication_heads h ON h.product_id=p.id
    LEFT JOIN product_publication_candidates c ON c.id=h.current_version_id AND c.product_id=p.id
    LEFT JOIN product_intake_workspace_versions w ON w.id=c.workspace_version_id
    WHERE ${copyable} AND p.id=?`).bind(sellerId, ctx.actorId, productId).first<CopySource>();
  if (!source) throw new CategoryContractError('Choose a published product from your own shop.', 403);

  const event = { action: 'product.workspace.copied', subjectType: 'product', subjectId: productId };
  const payload = { productId, sellerId };
  const receipt = await commandReceipt(db, ctx, event, payload);
  type CopyResult = Awaited<ReturnType<typeof saveProductWorkspace>>;
  if (receipt.replayed) return receipt.result as CopyResult;

  const approved = source.approvedSnapshot ? JSON.parse(source.approvedSnapshot) as IntakeSnapshot : null;
  const details = {
    descriptionEn: source.descriptionEn,
    descriptionNe: source.descriptionNe,
    materials: productMaterials(source.materialsJson, source.materials),
    size: source.size,
    careInstructions: source.careInstructions,
    countryOfOrigin: source.countryOfOrigin,
    preparationDays: approved ? detailText(approved.answers, 'preparationDays') : String(source.preparationDays),
    packageSize: approved?.answers.packageSize,
  };
  const answers = Object.fromEntries(Object.entries(details).filter(([, value]) => value)) as ProductDetailAnswers;
  const price = `${Math.floor(source.pricePaisa / 100)}.${String(source.pricePaisa % 100).padStart(2, '0')}`;
  const sourceGuard = `EXISTS(SELECT 1 ${productOwner} LEFT JOIN product_publication_heads h ON h.product_id=p.id
    WHERE ${copyable} AND p.id=? AND p.updated_at=? AND COALESCE(h.current_version_id,'')=?)`;
  try {
    return await saveProductWorkspace(db, { ...ctx, requestId: await digestFormRequest(['copy-product-workspace', ctx.requestId]) }, {
      draftId: null, sellerId, categoryId: source.categoryId, answers,
      offers: { axes: [], offers: [{ id: crypto.randomUUID(), selection: {}, price, compareAt: '', sku: '', mediaId: null,
        stockFamilyKey: 'single', baseUnit: 'piece', unitsPerOffer: '1', included: true, browseOnly: false, stockIntent: '' }] },
      mediaIds: [], privateReview: {},
      ...(isPackedWeightGrams(source.packedWeightGrams) ? { packedWeightGrams: source.packedWeightGrams } : {}),
    }, result => [
      ...offerGuard(db, sourceGuard, [sellerId, ctx.actorId, productId, source.updatedAt, source.currentVersionId ?? '']),
      receipt.insert(result),
    ]);
  } catch (error) {
    const retry = await commandReceipt(db, ctx, event, payload);
    if (retry.replayed) return retry.result as CopyResult;
    if ((error instanceof CategoryContractError && error.status === 409) || productReadGuardConflict(error)) {
      throw new CategoryContractError('This product changed before it could be copied. Refresh the list and choose it again.', 409);
    }
    throw error;
  }
}
