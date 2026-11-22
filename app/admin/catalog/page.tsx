import { AdminPageTitle } from '@/components/admin/page-help';
import { env } from 'cloudflare:workers';

import { CatalogManager } from '@/components/admin/catalog-manager';
import { requireStaffPage } from '@/lib/auth/staff';
import { requireDatabase } from '@/lib/db/d1';
import { listManagedTaxonomy } from '@/lib/db/repositories/catalog-admin';
import {CategoryPolicyManager} from '@/components/admin/category-policy-manager';
import {getCategoryContractWorkspace} from '@/lib/products/category-contracts';

export default async function AdminCatalogPage({searchParams}:{searchParams?:Promise<{category?:string}>}={}) {
 const staff=await requireStaffPage('/admin/catalog','catalog.manage'),db=requireDatabase(env as unknown as {DB?:D1Database}),taxonomy=await listManagedTaxonomy(db),requested=(await searchParams)?.category;
 const category=taxonomy.categories.find(row=>row.id===requested)??taxonomy.categories[0],policy=staff.role==='super_admin'&&category?await getCategoryContractWorkspace(db,category.id).catch(()=>null):null;
 return <div><AdminPageTitle><h1 className="font-heading text-4xl">Categories and occasions</h1></AdminPageTitle><p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">Create, rename, order or retire catalogue filters without deleting historical product relationships.</p><CatalogManager {...taxonomy} canManageParents={staff.role==='super_admin'}/>{staff.role==='super_admin'?<CategoryPolicyManager categories={taxonomy.categories} initial={policy}/>:null}</div>;
}
