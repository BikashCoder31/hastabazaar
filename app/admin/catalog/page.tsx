import { env } from 'cloudflare:workers';

import { CatalogManager } from '@/components/admin/catalog-manager';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listManagedTaxonomy } from '@/lib/db/repositories/catalog-admin';

export default async function AdminCatalogPage() { await requireStaffPage('/admin/catalog', 'catalog.manage'); const taxonomy = await listManagedTaxonomy(requireDatabase(env as unknown as { DB?: D1Database })); return <div><p className="eyebrow">Bilingual discovery</p><h1 className="mt-2 font-heading text-4xl">Categories and occasions</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Create, rename, order or retire catalogue filters without deleting historical product relationships.</p><CatalogManager {...taxonomy} /></div>; }
