import { env } from 'cloudflare:workers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { TaxonomyDirectory } from '@/components/catalog/taxonomy-directory';
import { loadQueryPresentationConfig } from '@/lib/catalog/shop-query';
import { readDiscoveryCategories } from '@/lib/catalog/taxonomy-discovery';
import { requireDatabase } from '@/lib/db/d1';
import { listActiveOccasions } from '@/lib/db/repositories/products';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'All categories | Hastabazaar',
  alternates: { canonical: 'https://hastabazaar.com/categories' },
};
export default async function CategoriesPage() {
  const database = requireDatabase(env as unknown as { DB?: D1Database });
  const [entries, occasions, search] = await Promise.all([
    readDiscoveryCategories(database),
    listActiveOccasions(database),
    loadQueryPresentationConfig(database, 'catalog.header-search'),
  ]);
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="bg-[#F3EEE3]">
        <TaxonomyDirectory kind="category" entries={entries} occasionLinks={occasions} categorySearch={search} />
      </main>
      <SiteFooter />
    </>
  );
}
