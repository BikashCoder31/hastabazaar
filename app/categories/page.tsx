import { env } from 'cloudflare:workers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { TaxonomyDirectory } from '@/components/catalog/taxonomy-directory';
import { requireDatabase } from '@/lib/db/d1';
import { listPublicDiscoveryCategories } from '@/lib/db/repositories/products';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'All categories | Hastabazaar',
  alternates: { canonical: 'https://hastabazaar.com/categories' },
};
export default async function CategoriesPage() {
  const entries = await listPublicDiscoveryCategories(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <TaxonomyDirectory kind="category" entries={entries} />
      </main>
      <SiteFooter />
    </>
  );
}
