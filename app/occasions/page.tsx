import { env } from 'cloudflare:workers';
import { SiteHeader } from '@/components/layout/site-header';
import { SiteFooter } from '@/components/layout/site-footer';
import { TaxonomyDirectory } from '@/components/catalog/taxonomy-directory';
import { requireDatabase } from '@/lib/db/d1';
import { listActiveOccasions } from '@/lib/db/repositories/products';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'All gift occasions | Hastabazaar',
  alternates: { canonical: 'https://hastabazaar.com/occasions' },
};
export default async function OccasionsPage() {
  const entries = await listActiveOccasions(
    requireDatabase(env as unknown as { DB?: D1Database }),
  );
  return (
    <>
      <SiteHeader />
      <main id="main-content" tabIndex={-1}>
        <TaxonomyDirectory kind="occasion" entries={entries} />
      </main>
      <SiteFooter />
    </>
  );
}
