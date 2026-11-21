import { env } from 'cloudflare:workers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { TaxonomyDirectory } from '@/components/catalog/taxonomy-directory';
import { readDiscoveryOccasions } from '@/lib/catalog/taxonomy-discovery';
import { requireDatabase } from '@/lib/db/d1';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'All gift occasions | Hastabazaar',
  alternates: { canonical: 'https://hastabazaar.com/occasions' },
};
export default async function OccasionsPage() {
  const { entries, groups, featured, priceCaps } = await readDiscoveryOccasions(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1} className="bg-[#F3EEE3]">
        <TaxonomyDirectory kind="occasion" entries={entries} occasionGroups={groups}
          featuredOccasion={featured} priceCaps={priceCaps} />
      </main>
      <SiteFooter />
    </>
  );
}
