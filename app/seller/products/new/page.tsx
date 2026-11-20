import { env } from 'cloudflare:workers';
import Link from 'next/link';
import { ProductIntakeWorkspace } from '@/components/seller/product-intake-workspace';
import { requireSellerCenterPage } from '@/lib/auth/seller-center';
import { requireDatabase } from '@/lib/db/d1';
import { getProductWorkspace } from '@/lib/products/intake-workspace';
import { getCategoryDetailGroups } from '@/lib/products/category-contracts';
import { listActiveCategories, listActiveOccasions } from '@/lib/db/repositories/products';
import { getSellerCommissionTerms } from '@/lib/db/repositories/commission-rates';
import { CommissionRateUnavailableError } from '@/lib/db/repositories/business-settings';
import { getManagedTermsOffers } from '@/lib/managed-commerce/accepted-terms';
import { getProductMaterialSuggestions } from '@/lib/products/material-settings';
import type { PriceScenario } from '@/lib/products/price-guidance';

export const dynamic = 'force-dynamic';

async function currentPricing(database: D1Database, sellerId: string): Promise<PriceScenario | null> {
  const now = Date.now();
  const participation = await database.prepare('SELECT participation_route AS route, commercial_model AS model FROM seller_participation_profiles WHERE seller_id=?')
    .bind(sellerId).first<{ route: string; model: string }>();
  try {
    if (participation?.route === 'managed_maker') {
      if (participation.model !== 'managed_sale_linked_percentage_v1') return null;
      const { current } = await getManagedTermsOffers(database, sellerId, now);
      return { route: 'sale_linked', versionId: current.id, basisPoints: current.retentionBps, effectiveAt: current.effectiveFrom, observedAt: now, accepted: !!current.accepted };
    }
    const current = await getSellerCommissionTerms(database, sellerId, now);
    return { route: 'registered', versionId: current.version, basisPoints: current.basisPoints, effectiveAt: current.effectiveAt ?? 0, observedAt: now, accepted: current.acceptedAt !== null };
  } catch (error) {
    if (error instanceof CommissionRateUnavailableError) return null;
    throw error;
  }
}

export default async function NewProductPage({ searchParams }: {
  searchParams: Promise<{ draftId?: string; offer?: string }>;
}) {
  const owner = await requireSellerCenterPage('/seller/products/new');
  if (!owner.sellerId) return <div className="space-y-4">
    <h1 className="font-heading text-3xl">Start with the registration information you have</h1>
    <p>Save your registration reference, even with incomplete information, then prepare this private product draft.</p>
    <Link href="/seller/registration" className="section-link">Open registration</Link>
  </div>;
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const { draftId, offer } = await searchParams;
  const [initial, categories, occasions, materialSuggestions, pricing] = await Promise.all([
    draftId ? getProductWorkspace(database, owner.userId, draftId) : null,
    listActiveCategories(database),
    listActiveOccasions(database),
    getProductMaterialSuggestions(database),
    currentPricing(database, owner.sellerId),
  ]);
  const initialCategoryModel = initial?.category ?? await getCategoryDetailGroups(database, null);
  return <ProductIntakeWorkspace actorId={owner.userId} key={owner.userId + ':' + (initial?.id ?? 'new')}
    categories={categories} occasions={occasions} materialSuggestions={materialSuggestions} initial={initial}
    initialOfferId={offer} initialCategoryModel={initialCategoryModel} studio
    pricing={pricing} tradingName={owner.tradingName} />;
}
